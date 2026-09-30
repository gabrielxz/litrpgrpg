/**
 * Shadow mode's comparison (app/DESIGN.md, M3, "Shadow mode"): what the listener drafted, hidden
 * from the GM, against what the GM recorded by hand in the same session. A draft and a recorded
 * action are the same thing when they are the same kind of action about the same subject (an
 * event with a character in common and its entry, a title for the same character, an item, quest,
 * award, or count naming the same things) and the GM recorded it no earlier than SHADOW_LEAD_MS
 * before the draft's first line was said; each draft takes the nearest such action after it.
 * Pure, so the server and the tests share it.
 */
import type { Action, Envelope } from "@gradebreaker/record";
import { markOf } from "./windows.ts";

/** How long before a moment's first line the GM's record of it may fall: the talk leading into it. */
export const SHADOW_LEAD_MS = 60_000;

/** The action types a draft can be compared on: the ones the three drafters propose. */
export const SHADOW_TYPES = [
  "event.log",
  "item.give",
  "item.move",
  "item.remove",
  "quest.progress",
  "quest.complete",
  "quest.fail",
  "ve.award",
  "party.invite",
  "party.answer",
  "counter.tick",
  "title.grant",
  "memory.grant",
] as const;

export interface ShadowDraft {
  runId: string;
  itemId: string;
  /** The action accepting it would record. */
  action: Action;
  /** When its first cited line was said, in epoch milliseconds. */
  saidAt: number;
}

export interface ShadowMatch {
  draft: ShadowDraft;
  logged: Envelope;
  /** For an event: whether an entry for a shared character is on the same side. */
  sameSide?: boolean;
}

export interface ShadowReport {
  both: ShadowMatch[];
  /** Recorded by the GM, not drafted. */
  gmOnly: Envelope[];
  /** Drafted, not recorded by the GM: a moment the GM let pass, or a false draft. */
  listenerOnly: ShadowDraft[];
  /** Per action type: how many each side had. */
  byType: Record<string, { both: number; gmOnly: number; listenerOnly: number }>;
}

const titleName = (a: Extract<Action, { type: "title.grant" }>) => (a.title.name ?? a.title.catalog ?? "").trim().toLowerCase();

/** Whether a draft and a recorded action are about the same thing. */
export function sameThing(draft: Action, logged: Action): boolean {
  if (draft.type !== logged.type) return false;
  if (draft.type === "event.log" && logged.type === "event.log") {
    const who = (a: typeof draft) => new Set((a.entries ?? []).map((e) => e.characterId).concat(a.entries?.length ? [] : a.participants));
    const theirs = who(logged);
    return [...who(draft)].some((c) => theirs.has(c));
  }
  if (draft.type === "title.grant" && logged.type === "title.grant") return draft.characterId === logged.characterId && titleName(draft) === titleName(logged);
  if (draft.type === "memory.grant" && logged.type === "memory.grant") return draft.characterId === logged.characterId;
  const theirs = new Set(markOf({ lines: [], action: logged }).subjects);
  return markOf({ lines: [], action: draft }).subjects.some((s) => theirs.has(s));
}

const sideOf = (a: Action, characterId: string) => (a.type === "event.log" ? a.entries?.find((e) => e.characterId === characterId)?.pole : undefined);

/** Matches the drafts against the GM's own records, each draft to the nearest unclaimed record at or after its moment. */
export function compareShadow(drafts: ShadowDraft[], logged: Envelope[]): ShadowReport {
  const claimed = new Set<string>();
  const both: ShadowMatch[] = [];
  const listenerOnly: ShadowDraft[] = [];
  for (const d of [...drafts].sort((a, b) => a.saidAt - b.saidAt)) {
    const best = logged
      .filter((e) => !claimed.has(e.id) && Date.parse(e.at) >= d.saidAt - SHADOW_LEAD_MS && sameThing(d.action, e.action))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
    if (!best) {
      listenerOnly.push(d);
      continue;
    }
    claimed.add(best.id);
    const match: ShadowMatch = { draft: d, logged: best };
    if (d.action.type === "event.log") {
      const shared = (d.action.entries ?? []).map((x) => x.characterId).filter((c) => sideOf(best.action, c));
      if (shared.length) match.sameSide = shared.some((c) => sideOf(d.action, c) === sideOf(best.action, c));
    }
    both.push(match);
  }
  const gmOnly = logged.filter((e) => !claimed.has(e.id));
  const byType: ShadowReport["byType"] = {};
  const tally = (type: string, k: "both" | "gmOnly" | "listenerOnly") => ((byType[type] ??= { both: 0, gmOnly: 0, listenerOnly: 0 })[k] += 1);
  for (const m of both) tally(m.draft.action.type, "both");
  for (const e of gmOnly) tally(e.action.type, "gmOnly");
  for (const d of listenerOnly) tally(d.action.type, "listenerOnly");
  return { both, gmOnly, listenerOnly, byType };
}
