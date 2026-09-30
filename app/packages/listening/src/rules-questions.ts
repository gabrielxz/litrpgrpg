/**
 * Rules questions (app/DESIGN.md, M2, "Rules questions"): a question about the rules answered from
 * the book, citing chapter and heading. The GM's question reads every chapter; a player's reads
 * the players' chapters alone, and carries nothing from the campaign, so an answer cannot tell a
 * player what they do not already know. The book is the request's standing part, so it caches
 * between questions.
 *
 * Which chapters are the players' waits on the book (99-to-do.md, "Queued for the book"); the app
 * runs the recommendation meanwhile.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { RULES_DIR } from "@gradebreaker/engine/node";
import { z } from "zod";
import type { Drafter, Effort } from "./draft-events.ts";

export const RULES_QUESTION_FEATURE = "rules-question";

/** The book beside the rules data: in the repository, and in the image (the Dockerfile copies both). */
export const BOOK_DIR = resolve(RULES_DIR, "..", "book");

/** The players' chapters, by file: the recommendation queued for the book (Introduction, "Who Reads What"). */
export const PLAYER_CHAPTERS = ["00", "10", "15", "17", "18", "20", "25", "30", "50", "57", "75"];

export interface Chapter {
  /** The file's number: "10" for 10-core-mechanics.md. */
  number: string;
  title: string;
  text: string;
  headings: string[];
}

export interface RulesAnswer {
  answer: string;
  citations: { chapter: string; heading: string }[];
  /** False when the chapters the asker reads do not answer it. */
  inBook: boolean;
}

/** The book's chapters from `book/`, each with its title and headings, stripped of art and table markers. */
export function bookChapters(dir: string): Chapter[] {
  return readdirSync(dir)
    .filter((f) => /^\d{2}-.*\.md$/.test(f))
    .sort()
    .map((f) => {
      const raw = readFileSync(join(dir, f), "utf8");
      const text = raw
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/^!\[[^\]]*\]\([^)]*\)(\{[^}]*\})?\s*$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      const title = text.match(/^# (.+)$/m)?.[1]?.trim() ?? f;
      const headings = [...text.matchAll(/^#{2,4} (.+)$/gm)].map((m) => m[1]!.trim());
      return { number: f.slice(0, 2), title, text, headings };
    });
}

export function rulesQuestionSchema() {
  return z.object({
    answer: z.string().describe("The answer in plain prose, as short as the question allows: the rule, then the numbers it needs."),
    citations: z.array(z.object({ chapter: z.string().describe("The chapter's title, exactly."), heading: z.string().describe("The heading the rule sits under, exactly.") })),
    inBook: z.boolean().describe("False when these chapters do not answer the question."),
  });
}

export function rulesQuestionSystem(chapters: readonly Chapter[], who: "gm" | "player"): string {
  const book = chapters.map((c) => c.text).join("\n\n---\n\n");
  return `You answer rules questions about Gradebreaker, a LitRPG tabletop roleplaying game, from its rulebook. ${
    who === "gm" ? "The asker is the Game Master." : "The asker is a player; you have the chapters players read, and nothing else."
  }

Answer from the chapters below and nothing else. Give the rule and the numbers it needs, and cite the chapter and the heading each part comes from, exactly as they are written. When two rules bear on the question, give both. When the chapters do not answer the question, say so plainly, say which chapter comes closest if one does, and set inBook to false; do not fill the gap from other games. When a question is about a particular table's story rather than the rules, answer the rule and say the rest is the Game Master's call.

Write in plain prose for someone at the table: short sentences, the book's own terms, no preamble.

# The chapters

${book}`;
}

/** Keeps the citations that name a chapter the asker reads and a heading in it; matching ignores case. */
export function checkedAnswer(chapters: readonly Chapter[], out: z.infer<ReturnType<typeof rulesQuestionSchema>>): RulesAnswer {
  const lower = (s: string) => s.trim().toLowerCase();
  const citations = out.citations.flatMap((c) => {
    const ch = chapters.find((x) => lower(x.title) === lower(c.chapter));
    const heading = ch?.headings.find((h) => lower(h) === lower(c.heading)) ?? (ch && lower(c.heading) === lower(ch.title) ? ch.title : undefined);
    return ch && heading ? [{ chapter: ch.title, heading }] : [];
  });
  const seen = new Set<string>();
  return { answer: out.answer.trim(), citations: citations.filter((c) => !seen.has(`${c.chapter}|${c.heading}`) && seen.add(`${c.chapter}|${c.heading}`)), inBook: out.inBook };
}

export async function askRules(drafter: Drafter, chapters: readonly Chapter[], who: "gm" | "player", question: string, opts: { effort?: Effort } = {}): Promise<RulesAnswer> {
  const read = who === "gm" ? chapters : chapters.filter((c) => PLAYER_CHAPTERS.includes(c.number));
  const out = await drafter({ system: rulesQuestionSystem(read, who), prompt: `# The question\n\n${question.trim()}`, schema: rulesQuestionSchema(), effort: opts.effort ?? "low" });
  return checkedAnswer(read, out);
}
