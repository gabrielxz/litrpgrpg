/**
 * Titles and the counts behind Achievement titles (Titles; What Can Be Seen, "Worn and hidden").
 *
 * The GM grants every title: from the F-Grade catalog, from the tutorial's titles, or written
 * fresh. A flat stat bonus lands on the sheet once, the day the title lands, and points past
 * the Grade's stat cap are lost. A new HVE-Resonant title supersedes an active one on the same
 * axis pair, which is Echoed: it keeps its flat bonus and its other effects stop. A negative
 * title's penalty holds until the GM releases it, and a release may convert it into another
 * title ("Salvaged" becomes "Came Back Whole"). The player makes the choices the book gives the
 * player: a bonus to a stat of their choice, wearing or hiding a Bestowed title, revealing a
 * Hidden Achievement (deliberate and permanent).
 *
 * Achievement counts come from the record where it knows the deed (confirmed kills from the
 * aftermath's finishing blows, fights ended below half HP, Consolidations) and from the GM's
 * ticks where only the fiction knows it (locks picked, oaths kept). A count that reaches a
 * catalog title's trigger puts the title on the GM's due list; nothing is granted until the GM
 * grants it.
 */
import { ATTRIBUTES, type Engine, type Stats } from "@gradebreaker/engine";
import { type CharacterState, type Effect, Rejected, permanentStats } from "./fold.ts";

export type TitleCategory = "Achievement" | "Hidden Achievement" | "HVE-Resonant" | "Bestowed";
const CATEGORIES: TitleCategory[] = ["Achievement", "Hidden Achievement", "HVE-Resonant", "Bestowed"];

/** A title as the GM writes it, or a catalog name the record fills in from the rules. */
export interface TitleSpec {
  catalog?: string;
  name?: string;
  category?: TitleCategory;
  negative?: boolean;
  /** Flat stat points, applied once. */
  bonus?: Stats;
  /** Points the player places in one stat of their choice. */
  choice?: number;
  /** Conditional, triggered, or social effects, as the table reads them. */
  effect?: string;
  /** HVE-Resonant: one pole from each of two axes, "Force + Hunger". */
  axisPair?: string;
  /** A negative title's release condition, written when it is granted. */
  release?: string;
}

export interface Title {
  id: string;
  name: string;
  category: TitleCategory;
  negative?: boolean;
  catalog?: string;
  /** The points that landed; a negative title's penalty returns on release. */
  bonus: Stats;
  /** Points past the stat cap, lost. */
  lost?: Stats;
  /** Points waiting on the player's choice of stat. */
  choice?: number;
  effect?: string;
  axisPair?: string;
  release?: string;
  /** A Bestowed title the holder wears (legible to observers); a negative one cannot be hidden. */
  worn?: boolean;
  /** A Hidden Achievement the holder has revealed. */
  revealed?: boolean;
  status: "active" | "echoed" | "released";
}

export interface GrantTitle {
  type: "title.grant";
  characterId: string;
  title: TitleSpec;
}

export interface ChooseTitleStat {
  type: "title.choose";
  characterId: string;
  titleId: string;
  attribute: string;
}

export interface WearTitle {
  type: "title.wear";
  characterId: string;
  titleId: string;
  worn: boolean;
}

export interface RevealTitle {
  type: "title.reveal";
  characterId: string;
  titleId: string;
}

/** A negative title's release condition met: the penalty returns, and it may convert into another title. */
export interface ReleaseTitle {
  type: "title.release";
  characterId: string;
  titleId: string;
  replacement?: TitleSpec;
}

/** A due catalog title the GM passes on; it leaves the due list. */
export interface DismissTitle {
  type: "title.dismiss";
  characterId: string;
  catalog: string;
}

/** A deed only the fiction knows, counted toward an Achievement title. */
export interface TickCounter {
  type: "counter.tick";
  characterId: string;
  counter: string;
  count: number;
}

export type TitleAction = GrantTitle | ChooseTitleStat | WearTitle | RevealTitle | ReleaseTitle | DismissTitle | TickCounter;

// ------------------------------------------------------------- counters ---

/** Each counted catalog title's count and threshold, from `achievement_catalog`'s `counter` and `at`. */
export function counted(engine: Engine): Record<string, { counter: string; at: number }> {
  const out: Record<string, { counter: string; at: number }> = {};
  for (const r of catalogRows(engine)) if (r.counter !== undefined && r.at !== undefined) out[r.title] = { counter: r.counter, at: r.at };
  return out;
}

/** Counts the record keeps from what it already knows; the GM ticks every other count. */
export const DERIVED_COUNTERS: ReadonlySet<string> = new Set([
  "confirmed-kills",
  "first-blood",
  "most-kills-in-a-fight",
  "severe-or-peak-kills",
  "fights-ended-below-half",
  "survived-downed",
  "consolidations",
]);

/** Counts the GM ticks: every catalog count the record does not keep itself. */
export function tickedCounters(engine: Engine): string[] {
  return [...new Set(Object.values(counted(engine)).map((c) => c.counter))].filter((c) => !DERIVED_COUNTERS.has(c));
}

export function count(c: CharacterState, counter: string, n = 1) {
  c.counters = { ...(c.counters ?? {}), [counter]: (c.counters?.[counter] ?? 0) + n };
}

/** A count that keeps its highest value, such as the most kills in one fight. */
export function countMax(c: CharacterState, counter: string, n: number) {
  if (n > (c.counters?.[counter] ?? 0)) c.counters = { ...(c.counters ?? {}), [counter]: n };
}

/** Catalog titles whose count is met, not yet held, and not passed on. */
export function titlesDue(engine: Engine, c: CharacterState): string[] {
  if (c.dead) return [];
  const held = new Set((c.titles ?? []).map((t) => t.catalog ?? t.name));
  return Object.entries(counted(engine))
    .filter(([name, { counter, at }]) => (c.counters?.[counter] ?? 0) >= at && !held.has(name) && !c.dismissedTitles?.includes(name))
    .map(([name]) => name);
}

// -------------------------------------------------------------- catalog ---

interface CatalogRow {
  title: string;
  trigger?: string;
  bonus?: string;
  category?: string;
  earned_by?: string;
  effect?: string;
  counter?: string;
  at?: number;
}

function catalogRows(engine: Engine): CatalogRow[] {
  const t = engine.rules.titles;
  return [...(Object.values(t.achievement_catalog) as CatalogRow[][]).flat(), ...(t.tutorial_titles as CatalogRow[])];
}

/** The catalog's text read into a title: "+1 STR", "+1 to one stat, player's choice", "−2 Raw HRT until released". */
export function catalogSpec(engine: Engine, name: string): TitleSpec {
  const rows = catalogRows(engine);
  const row = rows.find((r) => r.title.toLowerCase() === name.trim().toLowerCase());
  if (!row) throw new Rejected(`no catalog title ${name}`);
  const text = row.bonus ?? row.effect ?? "";
  const bonus: Stats = {};
  for (const m of text.matchAll(/([+−-])(\d+) (?:Raw )?(STR|DEX|FOR|HRT|POW|PER|CHA)\b/g)) {
    bonus[m[3]!] = (bonus[m[3]!] ?? 0) + (m[1] === "+" ? 1 : -1) * Number(m[2]);
  }
  const choice = /(\+\d+) to one stat, player's choice/.exec(text);
  const cat = row.category ?? "Achievement";
  const spec: TitleSpec = {
    catalog: row.title,
    name: row.title,
    category: (CATEGORIES.find((c) => cat.startsWith(c)) ?? "Achievement") as TitleCategory,
  };
  if (/negative/.test(cat)) spec.negative = true;
  if (Object.keys(bonus).length) spec.bonus = bonus;
  if (choice) spec.choice = Number(choice[1]);
  // Text beyond the stat bonus, such as "Personal Opportunities arrive as tests".
  if (row.effect && !/^[+−-]\d+ [A-Z]{3}$/.test(row.effect)) spec.effect = row.effect;
  // A negative title's release is the deed that releases it, written in its conversion's row.
  const releaser = rows.find((r) => r.earned_by?.startsWith(`Released ${row.title}:`));
  if (spec.negative && releaser) spec.release = releaser.earned_by!.slice(`Released ${row.title}:`.length).trim();
  return spec;
}

// ------------------------------------------------------------ handlers ---

function title(c: CharacterState, id: string): Title {
  const t = (c.titles ?? []).find((x) => x.id === id);
  if (!t) throw new Rejected(`${c.name} holds no such title`);
  return t;
}

/** Points into one stat, up to the Grade's cap; the rest are lost. Returns what landed. */
function applyPoints(engine: Engine, c: CharacterState, attr: string, pts: number): { landed: number; lost: number } {
  if (!(ATTRIBUTES as readonly string[]).includes(attr)) throw new Rejected(`${attr} is not an Attribute`);
  if (!Number.isInteger(pts) || pts === 0) throw new Rejected("a stat bonus is a whole number");
  const now = permanentStats(c)[attr]!;
  const landed = pts > 0 ? Math.min(pts, Math.max(0, engine.statCap(c.grade) - now)) : Math.max(pts, -now);
  return { landed, lost: pts - landed };
}

function normalizePair(engine: Engine, pair: string): string {
  const axes: { poles: { name: string }[] }[] = engine.rules.hve.axes;
  const poles = pair.split("+").map((p) => p.trim());
  const axisOf = (pole: string) => axes.findIndex((a) => a.poles.some((p) => p.name.toLowerCase() === pole.toLowerCase()));
  const found = poles.map(axisOf);
  if (poles.length !== 2 || found.some((i) => i < 0) || found[0] === found[1])
    throw new Rejected("an axis pair is one pole from each of two axes: Force + Hunger");
  const names = poles.map((p, i) => axes[found[i]!]!.poles.find((x) => x.name.toLowerCase() === p.toLowerCase())!.name);
  return found[0]! < found[1]! ? `${names[0]} + ${names[1]}` : `${names[1]} + ${names[0]}`;
}

export function grant(engine: Engine, c: CharacterState, id: string, s: TitleSpec): Effect[] {
  const spec = s.catalog ? { ...catalogSpec(engine, s.catalog), ...stripUndefined({ ...s, catalog: undefined }) } : s;
  const name = spec.name?.trim();
  if (!name) throw new Rejected("a title needs a name");
  const category = spec.category;
  if (!category || !CATEGORIES.includes(category)) throw new Rejected("a title is Achievement, Hidden Achievement, HVE-Resonant, or Bestowed");
  if ((c.titles ?? []).some((t) => t.status !== "released" && t.name.toLowerCase() === name.toLowerCase())) throw new Rejected(`${c.name} holds ${name} already`);
  if (spec.negative && category !== "Bestowed") throw new Rejected("a negative title is Bestowed");
  if (spec.choice !== undefined && (!Number.isInteger(spec.choice) || spec.choice < 1)) throw new Rejected("a stat of the player's choice gets a whole number of points");
  const t: Title = { id, name, category, bonus: {}, status: "active" };
  if (spec.catalog) t.catalog = spec.catalog;
  if (spec.negative) t.negative = true;
  if (spec.effect?.trim()) t.effect = spec.effect.trim();
  if (spec.release?.trim()) t.release = spec.release.trim();
  if (spec.choice) t.choice = spec.choice;
  if (category === "Bestowed") t.worn = true;
  if (category === "Hidden Achievement") t.revealed = false;
  const out: Effect[] = [];
  if (category === "HVE-Resonant") {
    if (!spec.axisPair) throw new Rejected("an HVE-Resonant title names its axis pair");
    t.axisPair = normalizePair(engine, spec.axisPair);
    // One active HVE-Resonant title per axis pair: the new one supersedes, and the old is Echoed.
    for (const old of c.titles ?? []) {
      if (old.category === "HVE-Resonant" && old.status === "active" && old.axisPair === t.axisPair) {
        old.status = "echoed";
        out.push({ kind: "title-echoed", characterId: c.id, titleId: old.id, name: old.name });
      }
    }
  }
  for (const [attr, pts] of Object.entries(spec.bonus ?? {})) {
    if (!pts) continue;
    const { landed, lost } = applyPoints(engine, c, attr, pts);
    t.bonus[attr] = landed;
    if (lost) t.lost = { ...(t.lost ?? {}), [attr]: lost };
  }
  c.titles = [...(c.titles ?? []), t];
  return [{ kind: "title-conferred", characterId: c.id, titleId: id, name, negative: Boolean(t.negative) }, ...out];
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function applyTitles(engine: Engine, c: CharacterState, a: TitleAction, id: string): Effect[] {
  switch (a.type) {
    case "title.grant":
      return grant(engine, c, id, a.title);
    case "title.choose": {
      const t = title(c, a.titleId);
      if (!t.choice) throw new Rejected(`${t.name} has no stat left to choose`);
      const { landed, lost } = applyPoints(engine, c, a.attribute, t.choice);
      t.bonus = { ...t.bonus, [a.attribute]: (t.bonus[a.attribute] ?? 0) + landed };
      if (lost) t.lost = { ...(t.lost ?? {}), [a.attribute]: lost };
      delete t.choice;
      return [];
    }
    case "title.wear": {
      const t = title(c, a.titleId);
      if (t.category !== "Bestowed") throw new Rejected("only a Bestowed title is worn or hidden");
      if (t.negative) throw new Rejected("a negative title cannot be hidden");
      t.worn = a.worn;
      return [];
    }
    case "title.reveal": {
      const t = title(c, a.titleId);
      if (t.category !== "Hidden Achievement") throw new Rejected("only a Hidden Achievement is revealed");
      if (t.revealed) throw new Rejected(`${t.name} is revealed already`);
      t.revealed = true;
      return [];
    }
    case "title.release": {
      const t = title(c, a.titleId);
      if (!t.negative || t.status !== "active") throw new Rejected("only a negative title in force is released");
      // The penalty returns; the title stays in the history as released.
      t.status = "released";
      const out: Effect[] = [{ kind: "title-released", characterId: c.id, titleId: t.id, name: t.name }];
      if (a.replacement) out.push(...grant(engine, c, `${id}:replacement`, a.replacement));
      return out;
    }
    case "title.dismiss":
      if (!counted(engine)[a.catalog]) throw new Rejected(`${a.catalog} is not a counted catalog title`);
      c.dismissedTitles = [...(c.dismissedTitles ?? []), a.catalog];
      return [];
    case "counter.tick":
      if (!tickedCounters(engine).includes(a.counter)) throw new Rejected(DERIVED_COUNTERS.has(a.counter) ? "the record counts that itself" : `no count ${a.counter}`);
      if (!Number.isInteger(a.count) || a.count < 1) throw new Rejected("a tick is a whole number from 1");
      count(c, a.counter, a.count);
      return [];
  }
}

/** Stat points every title adds to the sheet: flat bonuses, including an Echoed title's; a released penalty returns. */
export function titleStats(c: CharacterState): Stats {
  const out: Stats = {};
  for (const t of c.titles ?? []) {
    if (t.status === "released") continue;
    for (const [a, v] of Object.entries(t.bonus)) out[a] = (out[a] ?? 0) + v;
  }
  return out;
}

/** A title as an inspector reads it. */
export interface TitleRead {
  name: string;
  category: TitleCategory;
  negative?: boolean;
}

/**
 * What inspection reads of a target's titles (What Can Be Seen, "What You See of Others"): null
 * when the target does not resolve (it is a Grade or more above the inspector), otherwise the
 * active titles the Grade gap reads. Echoed and released titles are history and read as nothing.
 */
export function titlesRead(engine: Engine, inspectorGrade: string, targetGrade: string, titles: readonly Title[]): TitleRead[] | null {
  if (!engine.inspectionResolves(inspectorGrade, targetGrade)) return null;
  return titles
    .filter((t) => t.status === "active" && engine.titleReadable(inspectorGrade, targetGrade, t.category, Boolean(t.negative), Boolean(t.worn), Boolean(t.revealed)))
    .map((t) => ({ name: t.name, category: t.category, ...(t.negative ? { negative: true } : {}) }));
}
