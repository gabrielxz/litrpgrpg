import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { describe, expect, it } from "vitest";
import { editDistance, matchedWords, scoreTranscript, words } from "../src/transcript-score.ts";
import { vocabulary } from "../src/vocabulary.ts";

const engine = new Engine(loadRules());

describe("transcript scoring", () => {
  it("normalizes words and counts edits", () => {
    expect(words("Kara's Gate-Runner, 30 VE!")).toEqual(["karas", "gate", "runner", "30", "ve"]);
    expect(editDistance(["a", "b", "c"], ["a", "x", "c", "d"])).toBe(2);
    expect(words("Seventy-one, and one hundred and twenty five; level three")).toEqual(["71", "and", "125", "level", "3"]);
    expect(words("twenty twenty")).toEqual(["20", "20"]);
  });

  it("marks which of a line's words came through", () => {
    expect(matchedWords(["hold", "on"], ["on"])).toEqual([false, true]);
    expect(matchedWords(["sure", "why", "not"], ["sure", "why", "not"])).toEqual([true, true, true]);
    expect(matchedWords(["let", "it", "go"], ["let", "is", "go", "now"])).toEqual([true, false, true]);
    expect(matchedWords(["done"], [])).toEqual([false]);
  });

  it("scores word error rate and the terms that came through", () => {
    const v = vocabulary(engine, ["Kara"]);
    const s = scoreTranscript("Kara spends five Aether on the Snarljaw.", "Cara spends five ether on the Snarljaw.", v);
    expect(s.words).toBe(7);
    expect(s.wer).toBeCloseTo(2 / 7);
    expect(s.terms).toEqual([
      { term: "Kara", said: 1, heard: 0 },
      { term: "Aether", said: 1, heard: 0 },
      { term: "Snarljaw", said: 1, heard: 1 },
    ]);
  });

  it("puts the campaign's names first and keeps the rules data's names", () => {
    const v = vocabulary(engine, ["Nemi"]);
    expect(v[0]).toBe("Nemi");
    expect(v).toEqual(expect.arrayContaining(["Aether", "Snarljaw", "Strength", "Impact", "Lesser Healing Pill", "Gate-Runner"]));
  });
});
