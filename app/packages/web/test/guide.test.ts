/**
 * The user guide holds together: every page in the contents exists and every file is in the
 * contents, every GM section and the player's screen has its page, links and screenshots resolve,
 * and the prose keeps the house rules a script can check (no em dashes, only the Markdown the
 * renderer draws).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "../src/guide/markdown.tsx";
import { GROUPS, PAGES, SOURCES, guideFor } from "../src/guide/pages.ts";

const SHOTS = join(import.meta.dirname, "..", "public", "guide-shots");
const SECTIONS = ["party", "suggestions", "prep", "combat", "bestiary", "quests", "principles", "classes", "events", "hve", "log", "rules", "table", "player"];

describe("the user guide", () => {
  it("lists every page it has, and has every page it lists", () => {
    const listed = GROUPS.flatMap((g) => g.ids);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...SOURCES.keys()].sort()).toEqual([...listed].sort());
  });

  it("has a page for every GM section and the player's screen", () => {
    for (const section of SECTIONS) {
      const id = guideFor({ role: "gm", section });
      expect(id, section).toBe(section === "player" ? "gm-player-view" : `gm-${section}`);
    }
    expect(guideFor({ role: "player" })).toBe("player-screen");
    expect(guideFor({})).toBe("start");
  });

  it("links only to its own pages and shows only screenshots it has", () => {
    for (const [id, md] of SOURCES) {
      for (const m of md.matchAll(/\]\(guide:([^)]+)\)/g)) expect(PAGES.has(m[1]!), `${id} links to ${m[1]}`).toBe(true);
      for (const b of parse(md)) if (b.kind === "shot") expect(existsSync(join(SHOTS, b.src)), `${id} shows ${b.src}`).toBe(true);
    }
  });

  it("opens each page with its title and keeps to the Markdown the renderer draws", () => {
    for (const [id, md] of SOURCES) {
      expect(md.startsWith("# "), id).toBe(true);
      expect(md, id).not.toMatch(/[—–]/);
      expect(md, `${id}: a table`).not.toMatch(/^\s*\|/m);
      expect(md, `${id}: HTML`).not.toMatch(/<[a-z]/i);
      expect(md, `${id}: a heading below ###`).not.toMatch(/^####/m);
      expect(md, `${id}: a nested list`).not.toMatch(/^ {2,}(- |\d+\. )/m);
      for (const m of md.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) expect(m[1], `${id}: a link the guide cannot follow`).toMatch(/^(guide:|https?:)/);
    }
  });
});
