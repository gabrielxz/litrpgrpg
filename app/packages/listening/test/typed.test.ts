/** Typed table talk read into a scene's speakers and lines (typed.ts). */
import { describe, expect, it } from "vitest";
import { readTypedTalk } from "../src/typed.ts";

const roster = {
  members: [
    { userId: "u-gm", name: "Gabriel", role: "gm" as const },
    { userId: "u-sam", name: "Sam", role: "player" as const },
    { userId: "u-ana", name: "Ana", role: "player" as const },
  ],
  characters: [
    { id: "kara", name: "Kara Voss", playerId: "u-sam" },
    { id: "andre", name: "Andre", playerId: "u-ana" },
    { id: "held", name: "Mira" },
  ],
};

describe("typed table talk", () => {
  it("reads characters, members, the GM, and voiced names", () => {
    const t = readTypedTalk(
      [
        "[00:01:02] GM: The Node hums.",
        "Kara: I take the pill.",
        "Sam: can I do that as a free action?",
        "Grask: You'll pay for that.",
        "12:04 - Andre: Put it back.",
        "Gabriel: Roll it.",
        "Mira: I'll hold the door.",
      ].join("\n"),
      roster,
    );
    expect(t.lines).toEqual([
      { id: "L1", speaker: "u-gm", text: "The Node hums." },
      { id: "L2", speaker: "u-sam", text: "I take the pill.", as: "kara" },
      { id: "L3", speaker: "u-sam", text: "can I do that as a free action?" },
      { id: "L4", speaker: "u-gm", text: "You'll pay for that.", as: "Grask" },
      { id: "L5", speaker: "u-ana", text: "Put it back.", as: "andre" },
      { id: "L6", speaker: "u-gm", text: "Roll it." },
      { id: "L7", speaker: "u-gm", text: "I'll hold the door.", as: "held" },
    ]);
    expect(t.readings.map((r) => [r.name, r.kind])).toEqual([
      ["GM", "gm"],
      ["Kara", "character"],
      ["Sam", "member"],
      ["Grask", "voiced"],
      ["Andre", "character"],
      ["Gabriel", "gm"],
      ["Mira", "character"],
    ]);
  });

  it("continues the last speaker on an unnamed line and ignores a colon mid-sentence", () => {
    const t = readTypedTalk("The shard glows.\nkara voss: Mine.\nand then I pocket it, because honestly: why not", roster);
    expect(t.lines.map((l) => [l.speaker, l.as ?? null, l.text])).toEqual([
      ["u-gm", null, "The shard glows."],
      ["u-sam", "kara", "Mine."],
      ["u-sam", "kara", "and then I pocket it, because honestly: why not"],
    ]);
  });

  it("reads a member by the first word of their name, unless a character claims it", () => {
    const t = readTypedTalk("Ana: brb\nSam: me too", {
      members: [
        { userId: "u-gm", name: "Gabriel", role: "gm" as const },
        { userId: "u-ana", name: "Ana Reyes", role: "player" as const },
        { userId: "u-sam", name: "Sam Cole", role: "player" as const },
      ],
      characters: [{ id: "sam", name: "Sam", playerId: "u-ana" }],
    });
    expect(t.lines.map((l) => [l.speaker, l.as ?? null])).toEqual([
      ["u-ana", null],
      ["u-ana", "sam"],
    ]);
  });

  it("counts lines per reading and skips blank lines", () => {
    const t = readTypedTalk("Kara: one\n\n  \nKara: two\nAna: three", roster);
    expect(t.lines).toHaveLength(3);
    expect(t.readings.map((r) => r.lines)).toEqual([2, 1]);
  });
});
