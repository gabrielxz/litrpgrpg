/**
 * Drafting while the table talks (app/DESIGN.md, M3, "Event and HVE drafting"): the heard lines
 * are drafted in windows. A window closes at a pause once WINDOW_LINES new lines have arrived, or at
 * WINDOW_MAX_LINES regardless, and carries the EARLIER_LINES before it as context the drafters may
 * cite but never draft from alone (Scene.earlier). A draft that repeats one an earlier window drew
 * (the same kind, a line and a subject in common) is dropped. The server closes the windows; the
 * harness cuts a script the same way to measure what windows cost against drafting it whole.
 */
import { CampaignRecord, type Envelope } from "@gradebreaker/record";
import type { Engine } from "@gradebreaker/engine";
import type { Scene } from "./draft-events.ts";
import { type Drafted, type Script, replay, setupOf } from "./script.ts";

import { EARLIER_LINES, WINDOW_LINES } from "./window-sizes.ts";

export * from "./window-sizes.ts";

/** Lines cut into windows of `size`, each with the `earlier` lines before it. */
export function windowsOf<L>(lines: L[], size = WINDOW_LINES, earlier = EARLIER_LINES): { lines: L[]; earlier: L[] }[] {
  const out: { lines: L[]; earlier: L[] }[] = [];
  for (let i = 0; i < lines.length; i += size) out.push({ lines: lines.slice(i, i + size), earlier: lines.slice(Math.max(0, i - earlier), i) });
  return out;
}

/** What a draft is about, for telling a repeat across windows. */
export interface DraftMark {
  kind: string;
  lines: string[];
  subjects: string[];
}

/** Every string an action carries but its type: the characters, items, and quests it names. */
function leaves(x: unknown, out: string[] = []): string[] {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) for (const v of x) leaves(v, out);
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) if (k !== "type" && k !== "summary" && k !== "outcome" && k !== "note") leaves(v, out);
  return out;
}

/** A draft's kind, lines, and subjects: an event's by the characters with entries, a suggestion's by its character and key. */
export function markOf(d: Drafted): DraftMark {
  if (d.suggestion) return { kind: `suggestion:${d.suggestion.kind}`, lines: d.lines, subjects: [d.suggestion.characterId ?? "", d.suggestion.key ?? ""].filter(Boolean) };
  const a = d.action;
  if (a.type === "event.log") return { kind: a.type, lines: d.lines, subjects: (a.entries ?? []).map((e) => e.characterId) };
  return { kind: a.type, lines: d.lines, subjects: leaves(a) };
}

/** Whether a draft repeats one an earlier window drew: the same kind, a cited line in common, and a subject in common. */
export function repeats(prior: DraftMark[], d: DraftMark): boolean {
  return prior.some((p) => p.kind === d.kind && p.lines.some((l) => d.lines.includes(l)) && p.subjects.some((s) => d.subjects.includes(s)));
}

/**
 * A script's scenes as live play would draft them: each window's lines and the earlier lines
 * before it, with the record as it stood at the window's first line (the setup and what the table
 * recorded before it, the drafts of earlier windows not yet accepted) and what it recorded during.
 */
export function windowScenes(engine: Engine, script: Script, size = WINDOW_LINES, earlier = EARLIER_LINES): Scene[] {
  const full = replay(engine, script);
  const byId = new Map<string, Envelope>(full.log.map((e) => [e.id, e]));
  const setup = new Set(setupOf(engine, script).map((s) => s.id));
  const at = new Map(script.lines.map((l, i) => [l.id, i]));
  const speakers = script.speakers.map(({ id, role, name }) => ({ id, role, name }));
  const line = ({ id, speaker, text, as }: Script["lines"][number]) => (as ? { id, speaker, text, as } : { id, speaker, text });
  let start = 0;
  return windowsOf(script.lines, size, earlier).map((w) => {
    const from = start;
    start += w.lines.length;
    const before = new Set(script.recorded.filter((r) => at.get(r.after)! < from).map((r) => r.id));
    const record = new CampaignRecord(engine);
    for (const e of full.log) {
      if (!setup.has(e.id) && !before.has(e.id)) continue;
      try {
        record.append(e);
      } catch {
        // An action that leaned on an expected one the GM has not accepted yet: the record does without it.
      }
    }
    const ids = new Set([...w.earlier, ...w.lines].map((l) => l.id));
    return {
      record,
      speakers,
      lines: w.lines.map(line),
      earlier: w.earlier.map(line),
      recorded: script.recorded.filter((r) => ids.has(r.after) && byId.has(r.id)).map((r) => ({ after: r.after, action: r.action as never, effects: full.state.effects.get(r.id) ?? [] })),
    };
  });
}

/** A drafter's output over windows in order, each draft renamed by its window and repeats dropped. */
export async function inWindows<T extends { drafts: (Drafted & { id: string })[]; dropped: { draft: unknown; why: string }[]; repaired: string[] }>(
  scenes: Scene[],
  draft: (scene: Scene) => Promise<T>,
): Promise<T> {
  const out = { drafts: [], dropped: [], repaired: [] } as unknown as T;
  const marks: DraftMark[] = [];
  for (const [k, scene] of scenes.entries()) {
    const r = await draft(scene);
    out.repaired.push(...r.repaired.map((x) => `window ${k + 1}, ${x}`));
    out.dropped.push(...r.dropped);
    const drawn: DraftMark[] = [];
    // A draft can name another of its window by id (an answer to a drafted invitation), so the names move together.
    const renamed = new Map(r.drafts.map((d) => [d.id, `w${k + 1}-${d.id}`]));
    const rename = (x: unknown): unknown =>
      typeof x === "string" ? (renamed.get(x) ?? x) : Array.isArray(x) ? x.map(rename) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([key, v]) => [key, rename(v)])) : x;
    for (const d of r.drafts) {
      const m = markOf(d);
      if (repeats(marks, m)) {
        out.dropped.push({ draft: d, why: "repeats a draft from an earlier window" });
        continue;
      }
      drawn.push(m);
      out.drafts.push({ ...d, ...(d.action ? { action: rename(d.action) as typeof d.action } : {}), id: renamed.get(d.id)! } as (typeof out.drafts)[number]);
    }
    marks.push(...drawn);
  }
  return out;
}
