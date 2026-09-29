/**
 * What every speech-to-text adapter shares: a WebSocket to the vendor that holds audio until the
 * vendor is ready for it, and an end that resolves once the vendor has sent its last result (or
 * after a deadline, so a vendor that never says goodbye cannot hang a session's close).
 */
import { WebSocket } from "ws";
import type { TranscriberOptions } from "../listening.ts";

/** How long a close waits for the vendor's last results. */
const CLOSE_DEADLINE_MS = 15_000;

export interface VendorSocket {
  ws: WebSocket;
  /** Sends now if the vendor is ready, or holds it until `ready()`. */
  send(data: Buffer | string): void;
  /** The vendor is ready for audio: held frames go out in order. */
  ready(): void;
  /** Resolves when the vendor finishes; `finished()` or the socket's close settles it. */
  ended: Promise<void>;
  finished(): void;
  /** Starts the end: sends the vendor's end message, then waits for `ended` or the deadline. */
  end(message?: Buffer | string): Promise<void>;
}

export function vendorSocket(url: string, headers: Record<string, string>, opts: TranscriberOptions, vendor: string): VendorSocket {
  const ws = new WebSocket(url, { headers });
  const held: (Buffer | string)[] = [];
  let isReady = false;
  let ending = false;
  let done!: () => void;
  const ended = new Promise<void>((r) => (done = r));

  ws.on("error", (e) => opts.onError(new Error(`${vendor}: ${e.message}`)));
  ws.on("close", (code, reason) => {
    if (!ending && code !== 1000) opts.onError(new Error(`${vendor} closed the stream (${code}${reason.length ? `: ${reason}` : ""})`));
    done();
  });

  const out: VendorSocket = {
    ws,
    send(data) {
      if (isReady && ws.readyState === WebSocket.OPEN) ws.send(data);
      else if (ws.readyState <= WebSocket.OPEN) held.push(data);
    },
    ready() {
      isReady = true;
      for (const d of held.splice(0)) ws.send(d);
    },
    ended,
    finished: () => done(),
    async end(message) {
      ending = true;
      if (message !== undefined) out.send(message);
      const deadline = setTimeout(done, CLOSE_DEADLINE_MS);
      await ended;
      clearTimeout(deadline);
      if (ws.readyState === WebSocket.OPEN) ws.close(1000);
    },
  };
  return out;
}

/** Terms a vendor takes: the first `count`, each at most `chars` long, in the vocabulary's priority order. */
export function trimTerms(terms: string[], count: number, chars: number): string[] {
  return terms.filter((t) => t.length <= chars).slice(0, count);
}
