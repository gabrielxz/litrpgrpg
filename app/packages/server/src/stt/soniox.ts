/**
 * Soniox real-time (docs read 2026-09-29): the key and the configuration in the first text frame,
 * then raw PCM16 at real-time pace. Responses carry tokens; a token marked `is_final` is sent once
 * and never revised, so finals accumulate until endpoint detection closes the segment with `<end>`
 * (or `<fin>` after a finalize). An empty text frame ends the stream; `finished` follows the last
 * tokens. The docs allow an empty binary frame too, but Soniox ignores one (probed 2026-09-29): the
 * close then waits out its deadline and the words not yet final are lost.
 */
import { type Segment, StreamLimit, type Transcriber, type TranscriberOptions } from "../listening.ts";
import { vendorSocket } from "./socket.ts";

const URL = "wss://stt-rt.soniox.com/transcribe-websocket";

export interface SonioxToken {
  text: string;
  start_ms?: number;
  end_ms?: number;
  is_final: boolean;
}

/** Collects final tokens and gives back a segment at each endpoint. */
export class SonioxSegments {
  private tokens: SonioxToken[] = [];

  /** Takes a response's tokens; returns the segments they closed. */
  take(tokens: SonioxToken[]): Segment[] {
    const out: Segment[] = [];
    for (const t of tokens) {
      if (!t.is_final) continue;
      if (t.text === "<end>" || t.text === "<fin>") {
        const seg = this.flush();
        if (seg) out.push(seg);
      } else this.tokens.push(t);
    }
    return out;
  }

  /** The segment the held tokens make, if any. Tokens are sub-words; whitespace marks where a word begins. */
  flush(): Segment | null {
    const tokens = this.tokens.filter((t) => t.start_ms !== undefined);
    this.tokens = [];
    const words: { text: string; startMs: number; endMs: number }[] = [];
    let boundary = true;
    for (const t of tokens) {
      if (!t.text.trim()) {
        boundary = true;
        continue;
      }
      const cur = words.at(-1);
      if (boundary || /^\s/.test(t.text) || !cur) words.push({ text: t.text.trim(), startMs: t.start_ms!, endMs: t.end_ms ?? t.start_ms! });
      else {
        cur.text += t.text;
        cur.endMs = t.end_ms ?? cur.endMs;
      }
      boundary = /\s$/.test(t.text);
    }
    const text = tokens.map((t) => t.text).join("").replace(/\s+/g, " ").trim();
    if (!text) return null;
    return { text, startMs: words[0]?.startMs ?? 0, endMs: words.at(-1)?.endMs ?? 0, words };
  }
}

export function soniox(key: string): Transcriber {
  return {
    name: "soniox",
    open(opts: TranscriberOptions) {
      const sock = vendorSocket(URL, {}, opts, "Soniox");
      const segments = new SonioxSegments();
      let accepted = false;
      sock.ws.on("open", () => {
        sock.ws.send(
          JSON.stringify({
            api_key: key,
            model: "stt-rt-v5",
            audio_format: "pcm_s16le",
            sample_rate: 16000,
            num_channels: 1,
            language_hints: ["en"],
            enable_endpoint_detection: true,
            max_endpoint_delay_ms: 2000,
            context: {
              general: [{ key: "domain", value: "Tabletop roleplaying game session" }],
              ...(opts.context ? { text: opts.context } : {}),
              terms: opts.terms,
            },
          }),
        );
        sock.ready();
      });
      sock.ws.on("message", (data) => {
        const msg = JSON.parse(String(data));
        if (msg.error_code) {
          const text = `Soniox: ${msg.error_type ?? msg.error_code}: ${msg.error_message ?? ""}`;
          opts.onError(msg.error_type === "limit_exceeded" ? new StreamLimit(text) : new Error(text));
          return;
        }
        if (!accepted) {
          accepted = true;
          opts.onOpen?.();
        }
        for (const seg of segments.take(msg.tokens ?? [])) opts.onSegment(seg);
        if (msg.finished) {
          const last = segments.flush();
          if (last) opts.onSegment(last);
          sock.finished();
        }
      });
      return {
        write: (pcm) => sock.send(pcm),
        close: () => sock.end(""),
      };
    },
  };
}
