/**
 * Live updates over WebSocket at /api/campaigns/:id/live. The browser opens the socket and
 * sends `{"type":"auth","token":"<Supabase access token>"}` as its first message (a token in
 * the URL would land in logs). The token is checked once, at connect; a client reconnecting
 * after a drop sends its current one. The server answers with the caller's view, then pushes
 * after every append: the GM receives each envelope, its effects, and the new view; a player
 * receives their new view, notices included, and only when something of theirs changed.
 *
 * A tab that sends `{"type":"listen"}` also receives its listening status (and the GM's, what was
 * heard), and while the table listens it reports its capture (`{"type":"capture", ...}`) and its
 * microphone's level (`{"type":"level", ...}`), and sends its speech as binary frames, which go to
 * listening (listening.ts).
 *
 * Every socket is pinged on a heartbeat and closed if it missed the last one: a peer that
 * vanished without closing (a laptop asleep, a dropped network) would otherwise count as
 * connected forever, and the deploy waits for nobody to be connected.
 */
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { type WebSocket, WebSocketServer } from "ws";
import type { Listening, Tab } from "./listening.ts";
import type { Service, ServiceEvent } from "./service.ts";
import type { LiveMessage, PlayerView, Role } from "./views.ts";

const PATH = /^\/api\/campaigns\/([^/]+)\/live$/;
const AUTH_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 30_000;
/** How often the GM's panel is sent each stream's level while a table listens. */
const LEVELS_MS = 250;

interface Subscriber {
  campaignId: string;
  userId: string;
  role: Role;
  socket: WebSocket;
  /** The last view sent to a player, to skip pushes that change nothing for them. */
  lastSent?: string;
  /** Answered the last heartbeat ping. */
  alive: boolean;
  /** Set once the tab asks for listening status. */
  tab?: Tab;
}

export class LiveHub {
  private readonly service: Service;
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly subs = new Set<Subscriber>();
  private readonly log: (msg: string) => void;
  private readonly unsubscribe: () => void;
  private readonly heartbeat: NodeJS.Timeout;
  private readonly listening?: Listening;
  private readonly levels?: NodeJS.Timeout;

  constructor(service: Service, log: (msg: string) => void = () => {}, heartbeatMs = HEARTBEAT_MS, listening?: Listening) {
    this.service = service;
    this.log = log;
    this.unsubscribe = service.on((e) => void this.dispatch(e).catch((err) => this.log(`live: ${err}`)));
    this.heartbeat = setInterval(() => this.beat(), heartbeatMs);
    this.heartbeat.unref();
    if (listening) {
      this.listening = listening;
      this.levels = setInterval(() => listening.tick(), LEVELS_MS);
      this.levels.unref();
    }
  }

  private beat() {
    for (const sub of this.subs) {
      if (!sub.alive) {
        this.subs.delete(sub);
        sub.socket.terminate();
        continue;
      }
      sub.alive = false;
      sub.socket.ping();
    }
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

  /** People connected right now, across campaigns: the deploy waits for zero. */
  get connected(): number {
    return this.subs.size;
  }

  close() {
    clearInterval(this.heartbeat);
    clearInterval(this.levels);
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
        const user = msg?.type === "auth" ? await this.service.authenticate(String(msg.token ?? "")) : null;
        if (!user) return ws.close(4401, "auth required");
        const role = await this.service.roleIn(campaignId, user.id);
        if (!role) return ws.close(4404, "no such campaign");
        const sub: Subscriber = { campaignId, userId: user.id, role, socket: ws, alive: true };
        this.subs.add(sub);
        ws.on("pong", () => (sub.alive = true));
        ws.on("close", () => {
          this.subs.delete(sub);
          if (sub.tab) void this.listening?.leave(sub.tab).catch((err) => this.log(`listening: ${err}`));
        });
        ws.on("message", (data, binary) => this.fromTab(sub, data as Buffer, binary));
        await this.sendState(sub);
      } catch (err) {
        this.log(`live: ${err}`);
        ws.close(1011, "server error");
      }
    });
  }

  /** A message after authentication: the listening subscription, a capture report, or audio. */
  private fromTab(sub: Subscriber, data: Buffer, binary: boolean) {
    const listening = this.listening;
    if (!listening) return;
    if (binary) {
      if (sub.tab) listening.frame(sub.tab, data);
      return;
    }
    let msg: { type?: string; capture?: unknown; muted?: unknown; noMicrophone?: unknown; level?: unknown };
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (msg.type === "listen" && !sub.tab) {
      sub.tab = {
        campaignId: sub.campaignId,
        userId: sub.userId,
        role: sub.role,
        sendListening: (status) => this.send(sub, { type: "listening", status }),
        sendHeard: (lines) => this.send(sub, { type: "heard", lines }),
        sendDrafts: () => this.send(sub, { type: "drafts" }),
      };
      void listening.join(sub.tab).catch((err) => this.log(`listening: ${err}`));
    } else if (msg.type === "level" && sub.tab) {
      listening.reportLevel(sub.tab, Number(msg.level));
    } else if (msg.type === "capture" && sub.tab) {
      listening.control(sub.tab, { capture: msg.capture === true, muted: msg.muted === true, noMicrophone: msg.noMicrophone === true });
    }
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
        const text = JSON.stringify(view);
        if (text === sub.lastSent) return;
        sub.lastSent = text;
        this.send(sub, { type: "update", view: view as PlayerView });
      }),
    );
  }
}
