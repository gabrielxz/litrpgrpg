/**
 * ElevenLabs Scribe v2 realtime (docs read 2026-09-29): the key in `xi-api-key`, the configuration
 * in the query string, audio as JSON with base64 PCM16. Voice activity commits segments; the final
 * one is `committed_transcript_with_timestamps`, whose words carry seconds. Keyterms are at most 50
 * of 20 characters. The docs give no end-of-session message, so the end commits what is held,
 * waits for that commit, and closes.
 */
import type { Segment, Transcriber, TranscriberOptions } from "../listening.ts";
import { trimTerms, vendorSocket } from "./socket.ts";

const URL = "wss://api.us.elevenlabs.io/v1/speech-to-text/realtime";
/** How long the end waits for the last commit before closing anyway. */
const LAST_COMMIT_MS = 5000;

export interface ElevenCommitted {
  message_type: "committed_transcript_with_timestamps";
  text: string;
  words?: { text: string; start: number; end: number; type: string }[];
}

export function elevenSegment(msg: ElevenCommitted): Segment | null {
  const text = msg.text.trim();
  if (!text) return null;
  const words = (msg.words ?? [])
    .filter((w) => w.type === "word")
    .map((w) => ({ text: w.text, startMs: Math.round(w.start * 1000), endMs: Math.round(w.end * 1000) }));
  return { text, startMs: words[0]?.startMs ?? 0, endMs: words.at(-1)?.endMs ?? 0, words };
}

export function elevenLabs(key: string): Transcriber {
  return {
    name: "elevenlabs",
    open(opts: TranscriberOptions) {
      const q = new URLSearchParams({
        model_id: "scribe_v2_realtime",
        audio_format: "pcm_16000",
        language_code: "en",
        include_timestamps: "true",
        commit_strategy: "vad",
        vad_silence_threshold_secs: "1.0",
      });
      for (const t of trimTerms(opts.terms, 50, 20)) q.append("keyterms", t);
      const sock = vendorSocket(`${URL}?${q}`, { "xi-api-key": key }, opts, "ElevenLabs");
      let first = true;
      let committed: (() => void) | null = null;
      sock.ws.on("message", (data) => {
        const msg = JSON.parse(String(data));
        if (msg.message_type === "session_started") sock.ready();
        else if (msg.message_type === "committed_transcript_with_timestamps") {
          const seg = elevenSegment(msg);
          if (seg) opts.onSegment(seg);
          committed?.();
        } else if (msg.error) opts.onError(new Error(`ElevenLabs: ${msg.message_type}: ${msg.error}`));
      });
      const chunk = (pcm: Buffer, commit: boolean) => {
        const m: Record<string, unknown> = { message_type: "input_audio_chunk", audio_base_64: pcm.toString("base64"), commit, sample_rate: 16000 };
        // The docs take a short line of context once, on the first chunk only.
        if (first) m.previous_text = "A tabletop roleplaying game session.";
        first = false;
        return JSON.stringify(m);
      };
      return {
        write: (pcm) => sock.send(chunk(pcm, false)),
        async close() {
          const last = new Promise<void>((r) => {
            committed = r;
            setTimeout(r, LAST_COMMIT_MS);
          });
          sock.send(chunk(Buffer.alloc(3200), true));
          await last;
          sock.finished();
          await sock.end();
        },
      };
    },
  };
}
