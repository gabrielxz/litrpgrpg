import { describe, expect, it } from "vitest";
import { BOOK_DIR, type Drafter, PLAYER_CHAPTERS, askRules, bookChapters, checkedAnswer, rulesQuestionSystem } from "../src/index.ts";

const chapters = bookChapters(BOOK_DIR);

describe("rules questions", () => {
  it("reads the book's chapters with their titles and headings, without art or table markers", () => {
    expect(chapters.map((c) => c.number)).toContain("10");
    const core = chapters.find((c) => c.number === "10")!;
    expect(core.title).toBe("Core Mechanics");
    expect(core.headings).toContain("The Clash");
    expect(core.text).not.toMatch(/<!--|!\[/);
  });

  it("gives a player the players' chapters alone, and nothing from a campaign", async () => {
    let seen = "";
    const drafter: Drafter = async <T>(req: { system: string; prompt: string }) => {
      seen = `${req.system}\n${req.prompt}`;
      return { answer: "Two Beats.", citations: [{ chapter: "core mechanics", heading: "the clash" }, { chapter: "The Tutorial", heading: "Phase 1" }, { chapter: "Core Mechanics", heading: "Nowhere" }], inBook: true } as T;
    };
    const out = await askRules(drafter as Drafter, chapters, "player", "How many Beats do I get?");
    expect(out.citations).toEqual([{ chapter: "Core Mechanics", heading: "The Clash" }]);
    // The tutorial is played blind: none of its text reaches a player's request.
    expect(seen).not.toContain("Thermal input required");
    for (const c of chapters.filter((x) => PLAYER_CHAPTERS.includes(x.number))) expect(seen).toContain(c.text.slice(0, 200));
    expect(rulesQuestionSystem(chapters, "gm")).toContain("Thermal input required");
  });

  it("keeps a chapter's own title as a citation, and drops repeats", () => {
    const out = checkedAnswer(chapters, { answer: " x ", citations: [{ chapter: "Quick Reference", heading: "Quick Reference" }, { chapter: "Quick Reference", heading: "quick reference" }], inBook: true });
    expect(out).toEqual({ answer: "x", citations: [{ chapter: "Quick Reference", heading: "Quick Reference" }], inBook: true });
  });
});
