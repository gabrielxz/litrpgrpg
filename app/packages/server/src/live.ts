/**
 * Live updates over WebSocket at /api/campaigns/:id/live. The browser opens the socket and
 * sends `{"type":"auth","token":"..."}` as its first message (a token in the URL would land
 * in logs). The server answers with the caller's view, then pushes after every append: the
 * GM receives each envelope, its effects, and the new view; a player receives their notices
 * and their new view, and only when something of theirs changed.
 */
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { type WebSocket, WebSocketServer } from "ws";
import type { Service, ServiceEvent } from "./service.ts";
import { type LiveMessage, type PlayerView, type Role, noticesFor } from "./views.ts";

const PATH = /^\/api\/campaigns\/([^/]+)\/live$/;
const AUTH_TIMEOUT_MS = 5000;

interface Subscriber {
  campaignId: string;
  userId: string;
  role: Role;
  socket: WebSocket;
  /** The last view sent to a player, to skip pushes that change nothing for them. */
  lastSent?: string;
}

export class LiveHub {
  private readonly service: Service;
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly subs = new Set<Subscriber>();
  private readonly log: (msg: string) => void;
  private readonly unsubscribe: () => void;

  constructor(service: Service, log: (msg: string) => void = () => {}) {
    this.service = service;
    this.log = log;
    this.unsubscribe = service.on((e) => void this.dispatch(e).catch((err) => this.log(`live: ${err}`)));
  }

  /** Routes the HTTP server's upgrade requests for live paths here. */
  attach(server: Server) {
    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const m = PATH.exec(new URL(req.url ?? "", "http://x").pathname);
      if (!m) {
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws, decodeURIComponent(m[1]!)));
    });
  }

  close() {
    this.unsubscribe();
    for (const s of this.subs) s.socket.close(1001, "server closing");
    this.wss.close();
  }

  private accept(ws: WebSocket, campaignId: string) {
    const timer = setTimeout(() => ws.close(4401, "auth required"), AUTH_TIMEOUT_MS);
    ws.once("message", async (data) => {
      clearTimeout(timer);
      try {
        const msg = JSON.parse(String(data));
        const user = msg?.type === "auth" ? await this.service.userByToken(String(msg.token ?? "")) : null;
        if (!user) return ws.close(4401, "auth required");
        const role = await this.service.roleIn(campaignId, user.id);
        if (!role) return ws.close(4404, "no such campaign");
        const sub: Subscriber = { campaignId, userId: user.id, role, socket: ws };
        this.subs.add(sub);
        ws.on("close", () => this.subs.delete(sub));
        await this.sendState(sub);
      } catch (err) {
        this.log(`live: ${err}`);
        ws.close(1011, "server error");
      }
    });
  }

  private send(sub: Subscriber, msg: LiveMessage) {
    if (sub.socket.readyState === sub.socket.OPEN) sub.socket.send(JSON.stringify(msg));
  }

  private async sendState(sub: Subscriber) {
    const view = await this.service.view(sub.campaignId, sub);
    if (view.role === "player") sub.lastSent = JSON.stringify(view);
    this.send(sub, { type: "state", view });
  }

  private async dispatch(e: ServiceEvent) {
    const subs = [...this.subs].filter((s) => s.campaignId === e.campaignId);
    if (e.kind === "members") {
      await Promise.all(subs.map((s) => this.sendState(s)));
      return;
    }
    const { envelope, effects } = e.appended;
    await Promise.all(
      subs.map(async (sub) => {
        const view = await this.service.view(sub.campaignId, sub);
        if (view.role === "gm") {
          this.send(sub, { type: "appended", envelope, effects, view });
          return;
        }
        const own = new Set(view.characters.map((c) => c.id));
        const notices = noticesFor(effects, own);
        const text = JSON.stringify(view);
        if (!notices.length && text === sub.lastSent) return;
        sub.lastSent = text;
        this.send(sub, { type: "update", notices, view: view as PlayerView });
      }),
    );
  }
}
