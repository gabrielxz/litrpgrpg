import { describe, expect, it } from "vitest";
import { HANG_MS, PREROLL_FRAMES, SpeechGate, VOICE_LEVEL } from "../src/speech-gate.ts";

describe("the speech gate", () => {
  it("holds silence, leads speech with the half second before it, and hangs after", () => {
    const gate = new SpeechGate<number>();
    const sent: number[] = [];
    const push = (n: number, level: number) => sent.push(...gate.push(n, level, n * 100));
    for (let n = 0; n < 20; n++) push(n, 0);
    expect(sent).toEqual([]);
    push(20, VOICE_LEVEL);
    expect(sent).toEqual([15, 16, 17, 18, 19, 20].slice(-(PREROLL_FRAMES + 1)));
    // Quiet frames inside the hang go out; the first past it is held.
    for (let n = 21; n < 40; n++) push(n, 0);
    expect(sent.at(-1)).toBe(20 + HANG_MS / 100 - 1);
  });
});
