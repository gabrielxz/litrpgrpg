/**
 * One campaign, kept current. Opens the live channel, authenticates with the current token,
 * and applies what arrives: the view on every message (a player's carries their notices), and
 * the log for the GM. After the first view it asks for the listening status, which arrives with
 * every change and carries each stream to the GM; `send` puts a capture report or a frame of audio
 * on the same socket. A dropped connection reconnects with backoff and resynchronizes from the state the
 * server sends on connect.
 */
import { Engine } from "@gradebreaker/engine";
import type { Envelope, HeardLine, ListeningStatus, LiveMessage, View } from "@gradebreaker/record";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, currentToken } from "./api.ts";

export type LiveStatus = "connecting" | "live" | "reconnecting";

export function useCampaign(campaignId: string) {
  const [view, setView] = useState<View | null>(null);
  const [log, setLog] = useState<Envelope[]>([]);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState<ListeningStatus | null>(null);
  const [heard, setHeard] = useState<HeardLine[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  /** Sends on the live socket if it is open; a frame sent while reconnecting is dropped. */
  const send = useCallback((data: string | ArrayBuffer) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(data);
  }, []);

  /** Adds envelopes the page learned of directly (a POST's response) ahead of the live echo. */
  const addToLog = useCallback((env: Envelope) => {
    setLog((l) => (l.some((e) => e.id === env.id) ? l : [...l, env].sort((a, b) => a.seq - b.seq)));
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let stopped = false;
    let delay = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = async () => {
      const token = await currentToken();
      if (stopped) return;
      const url = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/campaigns/${campaignId}/live`;
      const ws = new WebSocket(url);
      socket = ws;
      socketRef.current = ws;
      let asked = false;
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
      ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data)) as LiveMessage;
        delay = 1000;
        setStatus("live");
        if (msg.type === "listening") {
          setListening(msg.status);
        } else if (msg.type === "heard") {
          setHeard((h) => {
            const known = new Set(h.map((x) => x.id));
            const added = msg.lines.filter((x) => !known.has(x.id));
            return added.length ? [...h, ...added].sort((a, b) => a.startedAt.localeCompare(b.startedAt)) : h;
          });
        } else if (msg.type === "state") {
          setView(msg.view);
          if (!asked) {
            asked = true;
            ws.send(JSON.stringify({ type: "listen" }));
          }
          if (msg.view.role === "gm") {
            void api<{ log: Envelope[] }>("GET", `/campaigns/${campaignId}/log`).then((r) => setLog(r.log));
          }
        } else if (msg.type === "appended") {
          setView(msg.view);
          addToLog(msg.envelope);
        } else if (msg.type === "update") {
          setView(msg.view);
        }
      };
      ws.onclose = (event) => {
        if (stopped) return;
        if (event.code === 4404) {
          setError("This campaign does not exist, or you are not in it.");
          return;
        }
        setStatus("reconnecting");
        setListening(null);
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 15000);
      };
    };

    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [campaignId, addToLog]);

  return { view, log, status, error, addToLog, listening, send, heard };
}

const engines = new Map<string, Promise<Engine>>();

/** The rules engine for a campaign's pinned version, fetched once per version. */
export function useEngine(version: string | undefined): Engine | null {
  const [engine, setEngine] = useState<Engine | null>(null);
  useEffect(() => {
    if (!version) return;
    let live = true;
    let p = engines.get(version);
    if (!p) {
      p = api<Record<string, unknown>>("GET", `/rules/${version}`).then((snapshot) => new Engine(snapshot));
      engines.set(version, p);
    }
    void p.then((e) => live && setEngine(e));
    return () => {
      live = false;
    };
  }, [version]);
  return engine;
}
