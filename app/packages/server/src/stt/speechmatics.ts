/**
 * Speechmatics real-time (docs read 2026-09-29): a Bearer key, `StartRecognition` as the first
 * message, audio only after `RecognitionStarted`. `AddTranscript` is final (partials are their own
 * message and are off); times are seconds. `EndOfStream` with the count of audio frames sent ends
 * it, and `EndOfTranscript` follows the last results. Vocabulary entries over six words are
 * dropped by the vendor, so they are not sent.
 */
import type { Segment, Transcriber, TranscriberOptions } from "../listening.ts";
import { vendorSocket } from "./socket.ts";

const URL = "wss://us.rt.speechmatics.com/v2";

export interface SpeechmaticsTranscript {
  message: "AddTranscript";
  metadata: { start_time: number; end_time: number; transcript: string };
  results: { type: string; start_time: number; end_time: number; alternatives?: { content: string }[] }[];
}

export function speechmaticsSegment(msg: SpeechmaticsTranscript): Segment | null {
  const text = msg.metadata.transcript.trim();
  if (!text) return null;
  const words = msg.results
    .filter((r) => r.type === "word" && r.alternatives?.[0])
    .map((r) => ({ text: r.alternatives![0]!.content, startMs: Math.round(r.start_time * 1000), endMs: Math.round(r.end_time * 1000) }));
  return { text, startMs: Math.round(msg.metadata.start_time * 1000), endMs: Math.round(msg.metadata.end_time * 1000), words };
}

export function speechmatics(key: string): Transcriber {
  return {
    name: "speechmatics",
    open(opts: TranscriberOptions) {
      const sock = vendorSocket(URL, { Authorization: `Bearer ${key}` }, opts, "Speechmatics");
      let frames = 0;
      sock.ws.on("open", () => {
        sock.ws.send(
          JSON.stringify({
            message: "StartRecognition",
            audio_format: { type: "raw", encoding: "pcm_s16le", sample_rate: 16000 },
            transcription_config: {
              language: "en",
              model: "enhanced",
              max_delay: 2,
              max_delay_mode: "flexible",
              enable_partials: false,
              additional_vocab: opts.terms.filter((t) => t.split(/\s+/).length <= 6),
            },
          }),
        );
      });
      sock.ws.on("message", (data, binary) => {
        if (binary) return;
        const msg = JSON.parse(String(data));
        if (msg.message === "RecognitionStarted") sock.ready();
        else if (msg.message === "AddTranscript") {
          const seg = speechmaticsSegment(msg);
          if (seg) opts.onSegment(seg);
        } else if (msg.message === "Error") opts.onError(new Error(`Speechmatics: ${msg.type}: ${msg.reason}`));
        else if (msg.message === "EndOfTranscript") sock.finished();
      });
      return {
        write: (pcm) => {
          frames++;
          sock.send(pcm);
        },
        close: () => sock.end(JSON.stringify({ message: "EndOfStream", last_seq_no: frames })),
      };
    },
  };
}
