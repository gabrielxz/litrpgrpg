/**
 * AssemblyAI v3 streaming (docs read 2026-09-29): the key in the Authorization header, the whole
 * configuration in the query string, raw PCM16 frames of 50 ms to 1 s at no faster than real time.
 * A `Turn` with `end_of_turn` is final; words carry milliseconds from the stream's start. A session
 * closes at 3 hours, which a table longer than that will need a reconnect for.
 */
import type { Segment, Transcriber, TranscriberOptions } from "../listening.ts";
import { trimTerms, vendorSocket } from "./socket.ts";

const URL = "wss://streaming.us.assemblyai.com/v3/ws";

export interface AssemblyTurn {
  type: "Turn";
  end_of_turn: boolean;
  turn_is_formatted?: boolean;
  transcript: string;
  words: { text: string; start: number; end: number }[];
}

/** A final turn as a segment; null for a partial, or an unformatted turn a formatted one will follow. */
export function assemblySegment(msg: AssemblyTurn, formatted: boolean): Segment | null {
  if (!msg.end_of_turn || (formatted && !msg.turn_is_formatted) || !msg.transcript.trim()) return null;
  const words = msg.words.map((w) => ({ text: w.text, startMs: w.start, endMs: w.end }));
  return { text: msg.transcript.trim(), startMs: words[0]?.startMs ?? 0, endMs: words.at(-1)?.endMs ?? 0, words };
}

export function assemblyAi(model: "universal-3-6-pro" | "universal-streaming-english", key: string): Transcriber {
  const pro = model === "universal-3-6-pro";
  return {
    name: pro ? "assemblyai" : "assemblyai-streaming",
    open(opts: TranscriberOptions) {
      const q = new URLSearchParams({
        speech_model: model,
        encoding: "pcm_s16le",
        sample_rate: "16000",
        filter_profanity: "false",
        keyterms_prompt: JSON.stringify(trimTerms(opts.terms, 100, 50)),
      });
      if (pro) {
        q.set("include_partial_turns", "false");
        q.set("mode", "balanced");
        if (opts.context) q.set("prompt", opts.context.slice(0, 1750));
      } else {
        q.set("format_turns", "true");
      }
      const sock = vendorSocket(`${URL}?${q}`, { Authorization: key }, opts, "AssemblyAI");
      sock.ws.on("open", () => sock.ready());
      sock.ws.on("message", (data) => {
        const msg = JSON.parse(String(data));
        if (msg.type === "Turn") {
          const seg = assemblySegment(msg, !pro);
          if (seg) opts.onSegment(seg);
        } else if (msg.type === "Termination") sock.finished();
      });
      return {
        write: (pcm) => sock.send(pcm),
        close: () => sock.end(JSON.stringify({ type: "Terminate" })),
      };
    },
  };
}
