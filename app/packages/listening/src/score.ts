/**
 * Scoring drafts against a script's expected record: precision and recall by category, and the
 * HVE entries on their own, since they are the signal the engine lives on.
 *
 * A draft matches an expected item when both are the same kind of thing about the same things
 * (the key below) and the draft cites at least one line the expected item cites. Free text (an
 * event's summary, context, intent) is not scored: two right summaries rarely share words. An
 * event matches on its lines and at least one character in common; its entries are then compared
 * character by character. A drafted event that merges two expected moments matches both, the
 * second on a character it carries an entry for. A draft that matches nothing is a false positive, named by the quiet
 * reason when every line it cites is a quiet line.
 */
import type { Action } from "@gradebreaker/record";
import { type Drafted, type Entry, type ExpectedAction, type ExpectedSuggestion, type Script, entriesOf, inLineOrder } from "./script.ts";

export interface Tally {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
}

export interface EntryTally extends Tally {
  /** Matched entries at the expected pole and intensity. */
  exact: number;
  /** Matched entries at a reading the script also accepts. */
  accepted: number;
  /** Matched on the pole, at another intensity or a pole only `also` allows at another intensity. */
  off: { expected: string; characterId: string; wanted: Entry; drafted: Entry }[];
}

export interface Report {
  overall: Tally;
  byCategory: Record<string, Tally>;
  entries: EntryTally;
  falsePositives: { draft: Drafted; why: string }[];
  /** Expected items no draft found (optional ones are left out). */
  missed: string[];
}

type Item = { id?: string; lines: string[]; action?: Action; suggestion?: { kind: string; key: string; characterId?: string } };

export function categoryOf(x: Item): string {
  return x.action ? x.action.type : `suggestion:${x.suggestion!.kind}`;
}

const lower = (s: string) => s.trim().toLowerCase();

/** What an item is about, for matching. Events match on lines and characters instead. */
function keyOf(x: Item, invites: Map<string, string>): string {
  if (x.suggestion) return [x.suggestion.kind, lower(x.suggestion.key), x.suggestion.characterId ?? ""].join("|");
  const a = x.action!;
  switch (a.type) {
    case "event.log":
      return "event.log";
    case "item.move":
      return [a.type, a.from, a.to, lower(a.name)].join("|");
    case "item.remove":
      return [a.type, a.from, lower(a.name)].join("|");
    case "item.give":
      return [a.type, a.to, ...a.items.map((s) => lower(s.name)).sort()].join("|");
    case "party.invite":
      return [a.type, a.fromId, a.toId].join("|");
    case "party.answer":
      return [a.type, invites.get(a.inviteId) ?? a.inviteId, a.accept].join("|");
    case "quest.answer":
    case "quest.share":
      return [a.type, a.questId, a.characterId].join("|");
    case "quest.progress":
    case "quest.complete":
    case "quest.fail":
    case "quest.reveal":
    case "quest.withdraw":
      return [a.type, a.questId].join("|");
    case "combat.move":
      return [a.type, a.combatantId, a.zoneId].join("|");
    case "proficiency.mark":
      return [a.type, a.characterId, a.shape].join("|");
    case "counter.tick":
      return [a.type, a.characterId, a.counter].join("|");
    case "hp.change":
      return [a.type, a.characterId].join("|");
    case "ve.award":
      return [a.type, ...a.awards.map((w) => w.characterId).sort()].join("|");
    case "message.send":
      return [a.type, ...[...a.to].sort()].join("|");
    default:
      return JSON.stringify(a);
  }
}

/** Invites by id, so an answer matches on who invited whom rather than on an id the drafter made up. */
function inviteKeys(items: Item[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const x of items) if (x.id && x.action?.type === "party.invite") out.set(x.id, `${x.action.fromId}>${x.action.toId}`);
  return out;
}

function charactersOf(a: Action): Set<string> {
  return a.type === "event.log" ? new Set([...a.participants, ...(a.entries ?? []).map((e) => e.characterId)]) : new Set();
}

const tally = (tp: number, fp: number, fn: number): Tally => ({
  tp,
  fp,
  fn,
  precision: tp + fp ? tp / (tp + fp) : 1,
  recall: tp + fn ? tp / (tp + fn) : 1,
});

/** Scores drafts against the script. `categories` limits both sides to the kinds a pipeline drafts so far. */
export function score(script: Script, drafts: Drafted[], opts: { categories?: string[] } = {}): Report {
  const inScope = (x: Item) => !opts.categories || opts.categories.includes(categoryOf(x));
  const expected: (Item & { id: string; optional?: boolean; source: ExpectedAction | ExpectedSuggestion })[] = [
    ...inLineOrder(script, script.expected.actions).map((x) => ({ id: x.id, lines: x.lines, action: x.action as Action, optional: x.optional, source: x })),
    ...inLineOrder(script, script.expected.suggestions).map((x) => ({ id: x.id, lines: x.lines, suggestion: x, optional: x.optional, source: x })),
  ].filter(inScope);
  const drafted = drafts.filter(inScope);

  const setupInvites = inviteKeys(script.setup.map((s) => ({ id: s.id, lines: [], action: s.action as Action })));
  const expectedKeys = new Map([...setupInvites, ...inviteKeys(expected)]);
  const draftedKeys = new Map([...setupInvites, ...inviteKeys(drafted)]);

  const used = new Set<number>();
  const match = new Map<string, number>();
  for (const x of expected) {
    const key = keyOf(x, expectedKeys);
    const lines = new Set(x.lines);
    let best = -1;
    let bestOverlap = 0;
    drafted.forEach((d, i) => {
      if (used.has(i) || keyOf(d, draftedKeys) !== key) return;
      const overlap = d.lines.filter((l) => lines.has(l)).length;
      if (!overlap) return;
      if (x.action?.type === "event.log") {
        const theirs = charactersOf(d.action!);
        if (![...charactersOf(x.action)].some((c) => theirs.has(c))) return;
      }
      if (overlap > bestOverlap) [best, bestOverlap] = [i, overlap];
    });
    if (best >= 0) {
      used.add(best);
      match.set(x.id, best);
    }
  }
  // A drafted event may carry two expected moments at once: it also matches a second expected
  // event when it cites one of its lines and has an entry for a character that event is about,
  // one no earlier match has claimed.
  const claimed = new Map<number, Set<string>>();
  const entryChars = (a: Action | undefined) => new Set(a?.type === "event.log" ? (a.entries ?? []).map((e) => e.characterId) : []);
  for (const x of expected) {
    const i = match.get(x.id);
    if (i !== undefined && x.action?.type === "event.log") claimed.set(i, new Set([...(claimed.get(i) ?? []), ...entryChars(x.action)]));
  }
  for (const x of expected) {
    if (match.has(x.id) || x.action?.type !== "event.log") continue;
    const lines = new Set(x.lines);
    const theirs = entryChars(x.action);
    let best = -1;
    let bestOverlap = 0;
    drafted.forEach((d, i) => {
      if (!used.has(i) || d.action?.type !== "event.log") return;
      const overlap = d.lines.filter((l) => lines.has(l)).length;
      const open = [...entryChars(d.action)].filter((c) => theirs.has(c) && !claimed.get(i)?.has(c));
      if (overlap && open.length && overlap > bestOverlap) [best, bestOverlap] = [i, overlap];
    });
    if (best >= 0) {
      match.set(x.id, best);
      claimed.set(best, new Set([...(claimed.get(best) ?? []), ...theirs]));
    }
  }

  const byCategory: Record<string, { tp: number; fp: number; fn: number }> = {};
  const cat = (c: string) => (byCategory[c] ??= { tp: 0, fp: 0, fn: 0 });
  const missed: string[] = [];
  for (const x of expected) {
    if (match.has(x.id)) cat(categoryOf(x)).tp++;
    else if (!x.optional) {
      cat(categoryOf(x)).fn++;
      missed.push(x.id);
    }
  }
  const quiet = new Map<string, string>();
  for (const q of script.expected.quiet) for (const l of q.lines) quiet.set(l, q.why);
  const recorded = new Set(script.recorded.map((r) => keyOf({ lines: [], action: r.action as Action }, setupInvites)));
  const falsePositives: Report["falsePositives"] = [];
  drafted.forEach((d, i) => {
    if (used.has(i)) return;
    cat(categoryOf(d)).fp++;
    const reasons = [...new Set(d.lines.map((l) => quiet.get(l)))];
    const why = d.action && recorded.has(keyOf(d, draftedKeys)) ? "already-recorded" : reasons.every((r) => r) ? reasons.join(", ") : "unexpected";
    falsePositives.push({ draft: d, why });
  });

  const entries = scoreEntries(expected, drafted, match, used);
  const sum = (k: "tp" | "fp" | "fn") => Object.values(byCategory).reduce((n, t) => n + t[k], 0);
  return {
    overall: tally(sum("tp"), sum("fp"), sum("fn")),
    byCategory: Object.fromEntries(Object.entries(byCategory).map(([k, t]) => [k, tally(t.tp, t.fp, t.fn)])),
    entries,
    falsePositives,
    missed,
  };
}

function scoreEntries(
  expected: (Item & { id: string; optional?: boolean; source: ExpectedAction | ExpectedSuggestion })[],
  drafted: Drafted[],
  match: Map<string, number>,
  used: Set<number>,
): EntryTally {
  let tp = 0,
    fp = 0,
    fn = 0,
    exact = 0,
    accepted = 0;
  const off: EntryTally["off"] = [];
  const draftedEntries = (d: Drafted) => (d.action?.type === "event.log" ? (d.action.entries ?? []) : []);
  const wanted = new Map<number, Set<string>>();
  for (const x of expected) {
    if (x.action?.type !== "event.log") continue;
    const { entries, also } = entriesOf(x.source as ExpectedAction);
    const i = match.get(x.id);
    if (i === undefined) {
      if (!x.optional) fn += entries.length;
      continue;
    }
    const theirs = draftedEntries(drafted[i]!);
    for (const want of entries) {
      const got = theirs.find((e) => e.characterId === want.characterId);
      const readings = [want, ...also.filter((a) => a.characterId === want.characterId)];
      if (!got || !readings.some((r) => r.pole === got.pole)) {
        fn++;
        if (got) fp++;
        continue;
      }
      tp++;
      if (got.pole === want.pole && got.intensity === want.intensity) exact++;
      else if (readings.some((r) => r.pole === got.pole && r.intensity === got.intensity)) accepted++;
      else off.push({ expected: x.id, characterId: want.characterId, wanted: want, drafted: got });
    }
    for (const e of entries) (wanted.get(i) ?? wanted.set(i, new Set()).get(i)!).add(e.characterId);
  }
  // A drafted entry no matched expected event wanted is a false one, counted once per draft.
  drafted.forEach((d, i) => {
    const want = wanted.get(i);
    if (!used.has(i)) fp += draftedEntries(d).length;
    else if (want) fp += draftedEntries(d).filter((e) => !want.has(e.characterId)).length;
  });
  return { ...tally(tp, fp, fn), exact, accepted, off };
}
