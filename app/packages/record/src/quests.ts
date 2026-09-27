/**
 * System Quests (System Quests; What Can Be Seen). The GM issues each quest; the quest log on a
 * character's interface shows the ones they hold, as the book's entry shape.
 *
 * Routine, Faction, and Personal Opportunity quests are offered to one character, whose player
 * accepts or refuses (the player-choice rule). A Mandate binds every character it names at once,
 * and any of them may refuse it. A Hidden quest is active from the moment the System detects the
 * action, in one of three modes: fully obscured, a partial reveal, or shown only once complete.
 * A refused Personal Opportunity counts against its flavor: at 3 that flavor comes half as often,
 * at 6 it stops.
 *
 * A holder may share a Routine or Faction quest with their party: every member holds it, and a
 * counted objective multiplies by the number of holders at that moment and stays there. A holder
 * who leaves the party keeps nothing; a joiner takes the quest at its current count. On completion
 * every participating holder collects the quest's VE, and its items go to one holder or the spoils.
 * A time limit in hours falls due on the in-game clock; any other deadline stays text.
 */
import type { Engine } from "@gradebreaker/engine";
import { type CharacterState, type Effect, Rejected, type World, storeVe } from "./fold.ts";
import { SPOILS, type Stack, put } from "./inventory.ts";

export type QuestCategory = "Mandate" | "Personal Opportunity" | "Routine" | "Hidden" | "Faction";
export const QUEST_CATEGORIES: QuestCategory[] = ["Mandate", "Personal Opportunity", "Routine", "Hidden", "Faction"];
export type Flavor = "combat" | "social" | "exploration";
export type HiddenMode = "obscured" | "partial" | "post-completion";

/** The quest as the GM writes it. */
export interface QuestSpec {
  /** The log's code: Q-181, M-04. */
  id: string;
  category: QuestCategory;
  title: string;
  /** Who issued it; the System for every category but Faction. */
  issuer?: string;
  grade?: string;
  difficulty: string;
  objective: string;
  /** A counted objective: "Eliminate Glow-Mote swarms (0/3)". */
  count?: number;
  /** The completion VE; absent, the Reward Reference Table's value. */
  ve?: number;
  /** "Reward proportional to...": the GM sets the payout at completion. */
  scaled?: boolean;
  items?: Stack[];
  /** Titles, standing, access: the reward in words. */
  rewardText?: string;
  time?: string;
  /** A time limit in hours on the in-game clock, from the moment it is issued. */
  hours?: number;
  /** A Personal Opportunity's flavor, for refusal counts. */
  flavor?: Flavor;
  hidden?: HiddenMode;
  /** A partial reveal's suggestive name. */
  hiddenName?: string;
}

/**
 * A quest as issued. `id` is the record's key, the id of the action that issued it; `code` is the
 * log's code (Q-181, M-04), which may repeat: the tutorial's Q-001 goes to each character
 * separately, each their own quest under the same code.
 */
export interface Quest extends Omit<QuestSpec, "count" | "ve"> {
  code: string;
  /** When the time limit runs out, in the clock's minutes since Day 1, 00:00. */
  due?: number;
  issuer: string;
  grade: string;
  count?: { done: number; of: number };
  /** The completion VE per holder, or null for a performance-scaled or unpaid quest. */
  ve: number | null;
  status: "offered" | "active" | "completed" | "failed" | "refused" | "expired";
  /** Characters who hold it (an offered quest: the one it is offered to). */
  holders: string[];
  refusedBy: string[];
  /** The party it was shared with. */
  sharedIn?: string;
}

export interface IssueQuest {
  type: "quest.issue";
  quest: QuestSpec;
  to: string[];
}
export interface AnswerQuest {
  type: "quest.answer";
  questId: string;
  characterId: string;
  accept: boolean;
}
export interface ShareQuest {
  type: "quest.share";
  questId: string;
  characterId: string;
}
export interface ProgressQuest {
  type: "quest.progress";
  questId: string;
  by: number;
}
export interface RevealQuest {
  type: "quest.reveal";
  questId: string;
  name: string;
}
export interface CompleteQuest {
  type: "quest.complete";
  questId: string;
  /** What each participating holder collects. */
  awards: { characterId: string; ve: number }[];
  /** A holder, or the spoils. */
  itemsTo?: string;
}
export interface FailQuest {
  type: "quest.fail";
  questId: string;
}
/** A Routine quest that expires silently, or an offer withdrawn. */
export interface WithdrawQuest {
  type: "quest.withdraw";
  questId: string;
}

export type QuestAction = IssueQuest | AnswerQuest | ShareQuest | ProgressQuest | RevealQuest | CompleteQuest | FailQuest | WithdrawQuest;

const SHARABLE: ReadonlySet<QuestCategory> = new Set(["Routine", "Faction"]);
const OFFERED: ReadonlySet<QuestCategory> = new Set(["Routine", "Faction", "Personal Opportunity"]);

/** The Reward Reference Table's completion VE for a quest, at its Grade; null where the table has none. */
export function questTableVe(engine: Engine, category: QuestCategory, difficulty: string, grade = "F"): number | null {
  const ve = engine.questVe(category, difficulty);
  return ve === null ? null : ve * engine.scale(grade);
}

/** A quest by its key, or by its code where one quest alone carries it (the log before quests had keys). */
function quest(world: World, id: string): Quest {
  const q = world.quests.get(id);
  if (q) return q;
  const byCode = [...world.quests.values()].filter((x) => x.code === id);
  if (byCode.length === 1) return byCode[0]!;
  throw new Rejected(byCode.length ? `${byCode.length} quests carry the code ${id}: name the one meant` : `no quest ${id}`);
}

const log = (q: Quest) => `[${q.code}] ${q.title}`;

/**
 * A notice to each holder carries only what their log shows: a hidden quest's code and line stay
 * obscured, and a post-completion quest says nothing until it is complete.
 */
function notices(q: Quest, kind: QuestNoticeKind, to = q.holders, extra: Record<string, unknown> = {}): Effect[] {
  const shown = questForHolder(q);
  if (!shown) return [];
  return to.map((characterId) => ({ kind, characterId, questId: shown.id, line: `[${shown.code}] ${shown.title}`, ...extra }) as Effect);
}

export type QuestNoticeKind =
  | "quest-offered"
  | "quest-issued"
  | "quest-accepted"
  | "quest-refused"
  | "quest-shared"
  | "quest-progress"
  | "quest-revealed"
  | "quest-completed"
  | "quest-failed";

function issue(engine: Engine, world: World, a: IssueQuest, key: string): Effect[] {
  const s = a.quest;
  const code = s.id.trim();
  if (!code) throw new Rejected("a quest needs its log code");
  if (!s.title.trim()) throw new Rejected("a quest needs a title");
  if (!(s.category in { Mandate: 1, "Personal Opportunity": 1, Routine: 1, Hidden: 1, Faction: 1 })) throw new Rejected(`no quest category ${s.category}`);
  const grade = s.grade ?? "F";
  try {
    engine.grade(grade);
    engine.resistance(s.difficulty);
  } catch {
    throw new Rejected(`${grade}-Grade, ${s.difficulty} is not on the Difficulty Card`);
  }
  if (!a.to.length) throw new Rejected("a quest goes to at least one character");
  if (new Set(a.to).size !== a.to.length) throw new Rejected("a character is listed twice");
  for (const c of a.to) {
    const ch = world.characters.get(c);
    if (!ch) throw new Rejected(`no character ${c}`);
    if (ch.dead) throw new Rejected(`${ch.name} is dead`);
  }
  if (OFFERED.has(s.category) && a.to.length !== 1) throw new Rejected(`a ${s.category} quest is offered to one character; a Routine or Faction quest is then shared with the party`);
  if (s.category === "Personal Opportunity" && !s.flavor) throw new Rejected("a Personal Opportunity names its flavor: combat, social, or exploration");
  if (s.category === "Hidden" && !s.hidden) throw new Rejected("a Hidden quest names how the log shows it");
  if (s.hidden && s.category !== "Hidden") throw new Rejected("only a Hidden quest is shown in a hidden mode");
  if (s.hidden === "partial" && !s.hiddenName?.trim()) throw new Rejected("a partial reveal gives the quest a suggestive name");
  if (s.count !== undefined && (!Number.isInteger(s.count) || s.count < 1)) throw new Rejected("a counted objective counts from 1");
  if (s.ve !== undefined && (!Number.isInteger(s.ve) || s.ve < 0)) throw new Rejected("quest VE is a whole number");
  const q: Quest = {
    id: key,
    code,
    category: s.category,
    title: s.title.trim(),
    issuer: s.category === "Faction" ? s.issuer?.trim() || "an issuer" : "System",
    grade,
    difficulty: s.difficulty,
    objective: s.objective.trim(),
    ve: s.scaled ? null : (s.ve ?? questTableVe(engine, s.category, s.difficulty, grade)),
    status: OFFERED.has(s.category) ? "offered" : "active",
    holders: [...a.to],
    refusedBy: [],
  };
  if (s.count !== undefined) q.count = { done: 0, of: s.count };
  if (s.hours !== undefined) {
    if (!Number.isInteger(s.hours) || s.hours < 1) throw new Rejected("a time limit is a whole number of hours");
    if (!world.clock) throw new Rejected("set the in-game clock before giving a quest a time limit in hours");
    q.hours = s.hours;
    q.due = world.clock.at + s.hours * 60;
    if (!s.time?.trim()) q.time = `${s.hours} hours`;
  }
  if (s.scaled) q.scaled = true;
  for (const k of ["rewardText", "time", "flavor", "hidden"] as const) if (s[k]) (q as unknown as Record<string, unknown>)[k] = typeof s[k] === "string" ? (s[k] as string).trim() : s[k];
  if (s.hidden === "partial") q.hiddenName = s.hiddenName!.trim();
  if (s.items?.length) q.items = s.items.map((x) => ({ name: x.name.trim(), count: x.count }));
  // A post-completion Hidden quest appears only once it is complete.
  if (s.hidden === "post-completion") q.status = "active";
  world.quests.set(key, q);
  if (s.hidden === "post-completion") return [];
  return notices(q, q.status === "offered" ? "quest-offered" : "quest-issued");
}

function answer(world: World, a: AnswerQuest): Effect[] {
  const q = quest(world, a.questId);
  const c = world.characters.get(a.characterId);
  if (!c || !q.holders.includes(c.id)) throw new Rejected(`${log(q)} is not ${c?.name ?? a.characterId}'s`);
  const offered = q.status === "offered";
  if (!offered && !(q.category === "Mandate" && q.status === "active")) throw new Rejected(`${log(q)} is not waiting on an answer`);
  if (a.accept) {
    if (!offered) throw new Rejected("a Mandate binds already");
    q.status = "active";
    return notices(q, "quest-accepted", [c.id]);
  }
  q.holders = q.holders.filter((h) => h !== c.id);
  q.refusedBy.push(c.id);
  if (!q.holders.length) q.status = "refused";
  if (q.category === "Personal Opportunity" && q.flavor) c.refusals = { ...(c.refusals ?? {}), [q.flavor]: (c.refusals?.[q.flavor] ?? 0) + 1 };
  return notices(q, "quest-refused", [c.id]);
}

function partyOf(world: World, characterId: string) {
  return [...world.parties.values()].find((p) => p.members.includes(characterId));
}

function share(world: World, a: ShareQuest): Effect[] {
  const q = quest(world, a.questId);
  if (!SHARABLE.has(q.category)) throw new Rejected(`a ${q.category} quest cannot be shared`);
  if (q.status !== "active") throw new Rejected(`${log(q)} is not active`);
  if (!q.holders.includes(a.characterId)) throw new Rejected(`${log(q)} is not held by ${a.characterId}`);
  if (q.sharedIn) throw new Rejected(`${log(q)} is shared already`);
  const p = partyOf(world, a.characterId);
  if (!p) throw new Rejected("sharing a quest needs a party");
  const joined = p.members.filter((m) => !q.holders.includes(m) && !world.characters.get(m)?.dead);
  q.holders = [...q.holders, ...joined];
  q.sharedIn = p.id;
  // "Eliminate ten" held by three becomes thirty, and stays thirty.
  if (q.count) q.count = { done: q.count.done, of: q.count.of * q.holders.length };
  return notices(q, "quest-shared", q.holders, q.count ? { done: q.count.done, of: q.count.of } : {});
}

/** A member joins a party: they take its shared quests at their current count. */
export function questsOnJoin(world: World, partyId: string, characterId: string): Effect[] {
  const out: Effect[] = [];
  for (const q of world.quests.values()) {
    if (q.sharedIn !== partyId || q.status !== "active" || q.holders.includes(characterId)) continue;
    q.holders.push(characterId);
    out.push(...notices(q, "quest-shared", [characterId], q.count ? { done: q.count.done, of: q.count.of } : {}));
  }
  return out;
}

/** A member leaves a party, by choice or by death: they keep none of its shared quests. */
export function questsOnLeave(world: World, partyId: string, characterId: string) {
  for (const q of world.quests.values()) {
    if (q.sharedIn !== partyId || !q.holders.includes(characterId)) continue;
    q.holders = q.holders.filter((h) => h !== characterId);
  }
}

function progress(world: World, a: ProgressQuest): Effect[] {
  const q = quest(world, a.questId);
  if (q.status !== "active") throw new Rejected(`${log(q)} is not active`);
  if (!q.count) throw new Rejected(`${log(q)} has no counted objective`);
  if (!Number.isInteger(a.by) || a.by === 0) throw new Rejected("progress is a whole number");
  q.count = { done: Math.max(0, Math.min(q.count.of, q.count.done + a.by)), of: q.count.of };
  // A hidden quest's count is not on its holder's log.
  if (q.hidden) return [];
  return notices(q, "quest-progress", q.holders, { done: q.count.done, of: q.count.of });
}

function reveal(world: World, a: RevealQuest): Effect[] {
  const q = quest(world, a.questId);
  if (q.hidden !== "obscured" || q.status !== "active") throw new Rejected("only an active, fully obscured Hidden quest moves to a partial reveal");
  if (!a.name.trim()) throw new Rejected("a partial reveal gives the quest a suggestive name");
  q.hidden = "partial";
  q.hiddenName = a.name.trim();
  return notices(q, "quest-revealed");
}

function complete(engine: Engine, world: World, a: CompleteQuest): Effect[] {
  const q = quest(world, a.questId);
  if (q.status !== "active") throw new Rejected(`${log(q)} is not active`);
  const out: Effect[] = [];
  const paid = new Set<string>();
  for (const w of a.awards) {
    if (!q.holders.includes(w.characterId)) throw new Rejected(`${w.characterId} does not hold ${log(q)}`);
    if (paid.has(w.characterId)) throw new Rejected("a holder is awarded twice");
    paid.add(w.characterId);
    if (!Number.isInteger(w.ve) || w.ve < 0) throw new Rejected(`an award is a whole number of VE, not ${w.ve}`);
  }
  q.status = "completed";
  out.push(...notices(q, "quest-completed"));
  for (const w of a.awards) if (w.ve > 0) out.push(...storeVe(engine, world.characters.get(w.characterId) as CharacterState, w.ve));
  if (q.items?.length) {
    const to = a.itemsTo ?? SPOILS;
    if (to !== SPOILS && !q.holders.includes(to)) throw new Rejected("a quest's items go to a holder or the spoils");
    for (const s of q.items) out.push(...put(world, to, s));
  }
  return out;
}

export function applyQuests(engine: Engine, world: World, a: QuestAction, key: string): Effect[] {
  switch (a.type) {
    case "quest.issue":
      return issue(engine, world, a, key);
    case "quest.answer":
      return answer(world, a);
    case "quest.share":
      return share(world, a);
    case "quest.progress":
      return progress(world, a);
    case "quest.reveal":
      return reveal(world, a);
    case "quest.complete":
      return complete(engine, world, a);
    case "quest.fail": {
      const q = quest(world, a.questId);
      if (q.status !== "active") throw new Rejected(`${log(q)} is not active`);
      q.status = "failed";
      return notices(q, "quest-failed");
    }
    case "quest.withdraw": {
      const q = quest(world, a.questId);
      if (q.status !== "offered" && q.status !== "active") throw new Rejected(`${log(q)} is closed already`);
      q.status = "expired";
      return [];
    }
  }
}

/** A player answers their own character's offer or Mandate, and shares a quest their character holds. */
export function authorizeQuestPlayer(world: World, a: QuestAction, userId: string): void {
  if (a.type !== "quest.answer" && a.type !== "quest.share") throw new Rejected(`only the GM records ${a.type}`);
  if (world.characters.get(a.characterId)?.playerId !== userId) throw new Rejected("a player answers and shares only for their own character");
}

export function cloneQuest(q: Quest): Quest {
  return {
    ...q,
    holders: [...q.holders],
    refusedBy: [...q.refusedBy],
    ...(q.count ? { count: { ...q.count } } : {}),
    ...(q.items ? { items: q.items.map((s) => ({ ...s })) } : {}),
  };
}

/**
 * A quest as its holder's log shows it (System Quests, "Hidden Quest Conventions"): a fully
 * obscured Hidden quest shows no content, a partial reveal its suggestive name, and a
 * post-completion one appears only once complete. Null when the log shows nothing.
 */
export function questForHolder(q: Quest): Quest | null {
  if (q.hidden === "post-completion" && q.status !== "completed") return null;
  if (q.hidden === "obscured" && q.status !== "completed") {
    const { rewardText: _r, items: _i, count: _c, time: _t, hours: _h, due: _d, ...rest } = q;
    return { ...rest, code: "Q-???", title: "Hidden Objective: ???", objective: "", ve: null };
  }
  if (q.hidden === "partial" && q.status !== "completed") {
    const { rewardText: _r, items: _i, count: _c, ...rest } = q;
    return { ...rest, code: "Q-???", title: `Hidden Objective: "${q.hiddenName}"`, objective: "Conditions: Unclear.", ve: null };
  }
  return q;
}
