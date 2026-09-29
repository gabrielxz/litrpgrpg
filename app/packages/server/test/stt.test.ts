/** The adapters' reading of each vendor's final results, on the shapes their docs give. */
import { describe, expect, it } from "vitest";
import { assemblySegment } from "../src/stt/assemblyai.ts";
import { elevenSegment } from "../src/stt/elevenlabs.ts";
import { trimTerms } from "../src/stt/socket.ts";
import { SonioxSegments } from "../src/stt/soniox.ts";
import { speechmaticsSegment } from "../src/stt/speechmatics.ts";

describe("speech-to-text adapters", () => {
  it("AssemblyAI: a turn is final at its end, and formatted when formatting was asked for", () => {
    const turn = {
      type: "Turn" as const,
      end_of_turn: true,
      turn_is_formatted: false,
      transcript: "My name is Sonny.",
      words: [
        { start: 1216, end: 1635, text: "My" },
        { start: 3016, end: 4155, text: "Sonny." },
      ],
    };
    expect(assemblySegment(turn, false)).toEqual({ text: "My name is Sonny.", startMs: 1216, endMs: 4155, words: [{ text: "My", startMs: 1216, endMs: 1635 }, { text: "Sonny.", startMs: 3016, endMs: 4155 }] });
    expect(assemblySegment(turn, true)).toBeNull();
    expect(assemblySegment({ ...turn, end_of_turn: false }, false)).toBeNull();
  });

  it("Soniox: final tokens gather into words and close at the endpoint; partials are ignored", () => {
    const s = new SonioxSegments();
    expect(
      s.take([
        { text: "Ka", start_ms: 600, end_ms: 700, is_final: true },
        { text: "ra", start_ms: 700, end_ms: 760, is_final: true },
        { text: " spends", start_ms: 800, end_ms: 1100, is_final: true },
        { text: " Aeth", start_ms: 1200, end_ms: 1400, is_final: false },
      ]),
    ).toEqual([]);
    const [seg] = s.take([
      { text: " Ae", start_ms: 1200, end_ms: 1300, is_final: true },
      { text: "ther.", start_ms: 1300, end_ms: 1500, is_final: true },
      { text: "<end>", is_final: true },
    ]);
    expect(seg).toEqual({
      text: "Kara spends Aether.",
      startMs: 600,
      endMs: 1500,
      words: [
        { text: "Kara", startMs: 600, endMs: 760 },
        { text: "spends", startMs: 800, endMs: 1100 },
        { text: "Aether.", startMs: 1200, endMs: 1500 },
      ],
    });
    expect(s.flush()).toBeNull();
  });

  it("Speechmatics and ElevenLabs: seconds become milliseconds, and only words are words", () => {
    expect(
      speechmaticsSegment({
        message: "AddTranscript",
        metadata: { start_time: 1.2, end_time: 2.4, transcript: "Kara spends Aether." },
        results: [
          { type: "word", start_time: 1.2, end_time: 1.6, alternatives: [{ content: "Kara" }] },
          { type: "punctuation", start_time: 2.4, end_time: 2.4, alternatives: [{ content: "." }] },
        ],
      }),
    ).toEqual({ text: "Kara spends Aether.", startMs: 1200, endMs: 2400, words: [{ text: "Kara", startMs: 1200, endMs: 1600 }] });
    expect(
      elevenSegment({
        message_type: "committed_transcript_with_timestamps",
        text: "Kara spends Aether",
        words: [
          { text: "Kara", start: 0.5, end: 0.9, type: "word" },
          { text: " ", start: 0.9, end: 0.95, type: "spacing" },
        ],
      }),
    ).toEqual({ text: "Kara spends Aether", startMs: 500, endMs: 900, words: [{ text: "Kara", startMs: 500, endMs: 900 }] });
  });

  it("trims a vocabulary to a vendor's limits in priority order", () => {
    expect(trimTerms(["Kara", "A very long name past twenty", "Aether", "VE"], 2, 20)).toEqual(["Kara", "Aether"]);
  });
});
