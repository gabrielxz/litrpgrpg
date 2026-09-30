/**
 * Text evaluation (app/DESIGN.md, "Testing the listening"): each script goes to a drafting
 * pipeline as typed input several times, since a model's output varies between runs, and the
 * scorer reads every run against the expected record. Prompt changes are judged by these numbers.
 *
 * The harness takes the drafter as a function, so the tests run it against a scripted model and
 * the server's command runs it against a campaign's key (`packages/server/scripts/draft-eval.ts`).
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Engine } from "@gradebreaker/engine";
import { ACTION_CATEGORIES, type ActionDrafts, draftActions } from "./draft-actions.ts";
import { SUGGESTION_CATEGORIES, draftSuggestions } from "./draft-suggestions.ts";
import { type Drafter, type Effort, type EventDrafts, draftEvents, sceneOfScript } from "./draft-events.ts";
import { type Report, type Tally, score } from "./score.ts";
import { type Script, loadScript } from "./script.ts";
import { inWindows, windowScenes } from "./windows.ts";

/** Drafting a script as live play would: windows of `size` lines, each with `earlier` lines of context (windows.ts). */
export interface Windowing {
  size: number;
  earlier: number;
}

export const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../scripts");

export function loadScripts(dir: string = SCRIPTS_DIR): Script[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => loadScript(join(dir, f)));
}

/** The categories the events drafter drafts so far. */
export const EVENT_CATEGORIES = ["event.log"];

export interface Run {
  run: number;
  /** Null when the request failed; `error` says why. */
  drafts: EventDrafts | null;
  report: Report | null;
  error?: string;
}

export interface Summary {
  scriptId: string;
  runs: number;
  failed: number;
  /** Means over the runs that returned. */
  events: { precision: number; recall: number };
  entries: { precision: number; recall: number; exact: number; accepted: number; off: number };
  /** Expected entries whose moment went to the right character, whatever the side, summed over the runs. */
  onCharacter: { found: number; of: number };
  /** How often each expected item was missed, over the runs that returned. */
  missed: Record<string, number>;
  /** False positives by why, summed over the runs. */
  falsePositives: Record<string, number>;
  dropped: number;
}

export interface Evaluation {
  scriptId: string;
  runs: Run[];
  summary: Summary;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarize(scriptId: string, runs: Run[]): Summary {
  const ok = runs.filter((r) => r.report) as (Run & { report: Report; drafts: EventDrafts })[];
  const events = ok.map((r) => r.report.byCategory["event.log"] ?? ({ precision: 1, recall: 1 } as Tally));
  const count = (keys: string[]) => keys.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});
  return {
    scriptId,
    runs: runs.length,
    failed: runs.length - ok.length,
    events: { precision: mean(events.map((t) => t.precision)), recall: mean(events.map((t) => t.recall)) },
    entries: {
      precision: mean(ok.map((r) => r.report.entries.precision)),
      recall: mean(ok.map((r) => r.report.entries.recall)),
      exact: ok.reduce((n, r) => n + r.report.entries.exact, 0),
      accepted: ok.reduce((n, r) => n + r.report.entries.accepted, 0),
      off: ok.reduce((n, r) => n + r.report.entries.off.length, 0),
    },
    onCharacter: {
      found: ok.reduce((n, r) => n + r.report.entries.onCharacter.found, 0),
      of: ok.reduce((n, r) => n + r.report.entries.onCharacter.of, 0),
    },
    missed: count(ok.flatMap((r) => r.report.missed)),
    falsePositives: count(ok.flatMap((r) => r.report.falsePositives.map((f) => f.why))),
    dropped: ok.reduce((n, r) => n + r.drafts.dropped.length, 0),
  };
}

/** Runs one script through the events drafter `runs` times, one request after another so later runs read the cached instructions. */
export async function evaluateEvents(engine: Engine, script: Script, drafter: Drafter, runs: number, opts: { effort?: Effort; window?: Windowing } = {}): Promise<Evaluation> {
  const scene = sceneOfScript(engine, script);
  const scenes = opts.window ? windowScenes(engine, script, opts.window.size, opts.window.earlier) : null;
  const out: Run[] = [];
  for (let run = 1; run <= runs; run++) {
    try {
      const drafts = scenes ? await inWindows(scenes, (s) => draftEvents(engine, drafter, s, opts)) : await draftEvents(engine, drafter, scene, opts);
      out.push({ run, drafts, report: score(script, drafts.drafts, { categories: EVENT_CATEGORIES }) });
    } catch (err) {
      out.push({ run, drafts: null, report: null, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { scriptId: script.id, runs: out, summary: summarize(script.id, out) };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A few lines per script for the terminal. */
export function formatSummary(s: Summary): string {
  // The failures that cost the GM most come first: moments missed or invented, and whose they were.
  const rows = [
    `${s.scriptId}: ${s.runs - s.failed} of ${s.runs} runs returned`,
    `  events   precision ${pct(s.events.precision)}, recall ${pct(s.events.recall)}`,
  ];
  const missed = Object.entries(s.missed);
  if (missed.length) rows.push(`  missed   ${missed.map(([k, n]) => `${k} ×${n}`).join(", ")}`);
  const fps = Object.entries(s.falsePositives);
  if (fps.length) rows.push(`  false    ${fps.map(([k, n]) => `${k} ×${n}`).join(", ")}`);
  rows.push(`  whose    ${s.onCharacter.found} of ${s.onCharacter.of} entries on the right character`);
  rows.push(`  sides    precision ${pct(s.entries.precision)}, recall ${pct(s.entries.recall)}; intensity exact ${s.entries.exact}, accepted ${s.entries.accepted}, off ${s.entries.off}`);
  if (s.dropped) rows.push(`  dropped  ${s.dropped} drafts the record refused`);
  return rows.join("\n");
}

// ------------------------------------------------------------ actions ---

export interface ActionRun {
  run: number;
  drafts: ActionDrafts | null;
  report: Report | null;
  error?: string;
}

export interface ActionSummary {
  scriptId: string;
  runs: number;
  failed: number;
  /** Summed over the runs that returned, by category: found, invented, missed. */
  byCategory: Record<string, { tp: number; fp: number; fn: number }>;
  missed: Record<string, number>;
  falsePositives: Record<string, number>;
  dropped: Record<string, number>;
}

export interface ActionEvaluation {
  scriptId: string;
  runs: ActionRun[];
  summary: ActionSummary;
}

const countOf = (keys: string[]) => keys.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});

/** Runs one script through the actions drafter `runs` times, scoring the categories it drafts. */
export function evaluateActions(engine: Engine, script: Script, drafter: Drafter, runs: number, opts: { effort?: Effort; window?: Windowing } = {}): Promise<ActionEvaluation> {
  return evaluateDrafted(engine, script, runs, (scene) => draftActions(engine, drafter, scene, opts), ACTION_CATEGORIES, opts.window);
}

/** Runs one script through the suggestions drafter `runs` times, scoring the kinds it drafts. */
export function evaluateSuggestions(engine: Engine, script: Script, drafter: Drafter, runs: number, opts: { effort?: Effort; window?: Windowing } = {}): Promise<ActionEvaluation> {
  return evaluateDrafted(engine, script, runs, (scene) => draftSuggestions(engine, drafter, scene, opts), SUGGESTION_CATEGORIES, opts.window);
}

async function evaluateDrafted(
  engine: Engine,
  script: Script,
  runs: number,
  draft: (scene: ReturnType<typeof sceneOfScript>) => Promise<ActionDrafts>,
  categories: string[],
  window?: Windowing,
): Promise<ActionEvaluation> {
  const scene = sceneOfScript(engine, script);
  const scenes = window ? windowScenes(engine, script, window.size, window.earlier) : null;
  const out: ActionRun[] = [];
  for (let run = 1; run <= runs; run++) {
    try {
      const drafts = scenes ? await inWindows(scenes, draft) : await draft(scene);
      out.push({ run, drafts, report: score(script, drafts.drafts, { categories }) });
    } catch (err) {
      out.push({ run, drafts: null, report: null, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const ok = out.filter((r) => r.report) as (ActionRun & { report: Report; drafts: ActionDrafts })[];
  const byCategory: ActionSummary["byCategory"] = {};
  for (const r of ok)
    for (const [k, t] of Object.entries(r.report.byCategory)) {
      const c = (byCategory[k] ??= { tp: 0, fp: 0, fn: 0 });
      c.tp += t.tp;
      c.fp += t.fp;
      c.fn += t.fn;
    }
  const dropWhy = (d: { why: string }) => d.why.replace(/: .*$/, "");
  return {
    scriptId: script.id,
    runs: out,
    summary: {
      scriptId: script.id,
      runs: out.length,
      failed: out.length - ok.length,
      byCategory,
      missed: countOf(ok.flatMap((r) => r.report.missed)),
      falsePositives: countOf(ok.flatMap((r) => r.report.falsePositives.map((f) => `${f.draft.action?.type ?? `suggestion:${f.draft.suggestion?.kind}`} (${f.why})`))),
      dropped: countOf(ok.flatMap((r) => r.drafts.dropped.map(dropWhy))),
    },
  };
}

export function formatActionSummary(s: ActionSummary): string {
  const rows = [`${s.scriptId}: ${s.runs - s.failed} of ${s.runs} runs returned`];
  for (const [k, t] of Object.entries(s.byCategory).sort()) rows.push(`  ${k.padEnd(22)} found ${t.tp}, invented ${t.fp}, missed ${t.fn}`);
  if (!Object.keys(s.byCategory).length) rows.push("  nothing expected, nothing drafted");
  const missed = Object.entries(s.missed);
  if (missed.length) rows.push(`  missed   ${missed.map(([k, n]) => `${k} ×${n}`).join(", ")}`);
  const fps = Object.entries(s.falsePositives);
  if (fps.length) rows.push(`  false    ${fps.map(([k, n]) => `${k} ×${n}`).join(", ")}`);
  const dropped = Object.entries(s.dropped);
  if (dropped.length) rows.push(`  dropped  ${dropped.map(([k, n]) => `${k} ×${n}`).join(", ")}`);
  return rows.join("\n");
}
