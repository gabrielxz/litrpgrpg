/**
 * One campaign, kept current. Opens the live channel, authenticates with the current token,
 * and applies what arrives: the view on every message, the log for the GM, notices for a
 * player. A dropped connection reconnects with backoff and resynchronizes from the state the
 * server sends on connect.
 */
import { Engine } from "@gradebreaker/engine";
import type { Effect, Envelope, LiveMessage, View } from "@gradebreaker/record";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, currentToken } from "./api.ts";

export type LiveStatus = "connecting" | "live" | "reconnecting";

export interface Notice {
  key: string;
  at: number;
  effect: Effect;
}

export function useCampaign(campaignId: string) {
  const [view, setView] = useState<View | null>(null);
  const [log, setLog] = useState<Envelope[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

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
      ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
      ws.onmessage = (event) => {
        const msg = JSON.parse(String(event.data)) as LiveMessage;
        delay = 1000;
        setStatus("live");
        if (msg.type === "state") {
          setView(msg.view);
          if (msg.view.role === "gm") {
            void api<{ log: Envelope[] }>("GET", `/campaigns/${campaignId}/log`).then((r) => setLog(r.log));
          }
        } else if (msg.type === "appended") {
          setView(msg.view);
          addToLog(msg.envelope);
        } else if (msg.type === "update") {
          setView(msg.view);
          const at = Date.now();
          // Newest first: the last effect of an action is the latest thing that happened.
          const fresh = msg.notices.map((effect) => ({ key: `n${++counter.current}`, at, effect })).reverse();
          if (fresh.length) setNotices((n) => [...fresh, ...n].slice(0, 60));
        }
      };
      ws.onclose = (event) => {
        if (stopped) return;
        if (event.code === 4404) {
          setError("This campaign does not exist, or you are not in it.");
          return;
        }
        setStatus("reconnecting");
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

  return { view, log, notices, status, error, addToLog };
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
