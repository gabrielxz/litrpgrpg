/**
 * Prep: fights, quests, System notices, loot, and NPCs the GM prepares before a session and fires
 * live.
 *
 * A prepared item is the GM's alone and changes nothing at the table. Firing it records the real
 * action (a fight's start, a quest's issue, a message, items to the spoils or a character, an NPC
 * joining a fight) with the prepared item as its cause, and the item stays in Prep for another use;
 * the GM removes what is spent. An NPC's line (their condition, and how the party treated them)
 * is kept by saving the item again under its id, which is how any prepared item is edited. A
 * content pack, such as the tutorial's (`rules/tutorial.yaml`) or one loaded from a file in the
 * same shape, loads as one save, so undoing the load removes the pack.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Effect, Rejected, type World } from "./fold.ts";
import type { ForceOption } from "./combat.ts";
import type { QuestSpec } from "./quests.ts";
import type { Stack } from "./inventory.ts";
import type { Action } from "./actions.ts";

/** One kind of creature or NPC in a prepared fight: a Bestiary entry by name, or a block typed in. */
export interface PrepCreature {
  /** A Bestiary entry's name; its stat block fills in the rest. */
  creature?: string;
  /** The name the tracker shows; defaults to the entry's. */
  name?: string;
  /** How many of it; 1 when absent. */
  count?: number;
  kind?: "creature" | "npc";
  grade?: string;
  maxHp?: number;
  beats?: number;
  momentumForce?: number;
  yields?: boolean;
  offense?: ForceOption[];
  defense?: ForceOption[];
}

interface PrepBase {
  /** Unique within the campaign's Prep. */
  id: string;
  title: string;
  /** Where it belongs: "Phase 3", "Session 4". Items list in their group's order. */
  group?: string;
  /** The GM's cue: when to fire it and what to watch. */
  note?: string;
}

/** An NPC the party may meet again: who they are, their line as it stands, and a block for a fight. */
export interface PrepNpc {
  /** Who they are, in a line: "a concussed delivery driver with a nail gun". */
  who: string;
  /** Their condition and how the party treated them, kept current as play goes. */
  line?: string;
  /** Their numbers, for joining a fight; without HP they join none. */
  block?: Omit<PrepCreature, "creature" | "count" | "name">;
}

export type PrepItem =
  | (PrepBase & { kind: "encounter"; encounter: { name: string; zones: string[]; creatures: PrepCreature[] } })
  | (PrepBase & { kind: "quest"; quest: QuestSpec })
  | (PrepBase & { kind: "notice"; text: string })
  | (PrepBase & { kind: "loot"; loot: Stack[] })
  | (PrepBase & { kind: "npc"; npc: PrepNpc });

/** Saves prepared items, replacing any with the same id. GM only. */
export interface SavePrep {
  type: "prep.save";
  items: PrepItem[];
  /** The content pack the items came from, when loaded as one. */
  pack?: string;
}

/** Removes prepared items. GM only. */
export interface RemovePrep {
  type: "prep.remove";
  prepIds: string[];
}

export type PrepAction = SavePrep | RemovePrep;

/** The cause an action fired from Prep carries: `prep:<id>`. */
export const prepCause = (id: string) => `prep:${id}`;

export function clonePrep(p: PrepItem): PrepItem {
  return structuredClone(p);
}

function problems(p: PrepItem): string | null {
  if (!p.id.trim()) return "a prepared item needs an id";
  if (!p.title.trim()) return `${p.id} needs a title`;
  switch (p.kind) {
    case "notice":
      return p.text.trim() ? null : `${p.title} needs the notice's text`;
    case "quest":
      return p.quest.id.trim() && p.quest.title.trim() && p.quest.objective.trim() ? null : `${p.title} needs a quest code, title, and objective`;
    case "loot":
      if (!p.loot.length) return `${p.title} needs at least one item`;
      for (const x of p.loot) if (!x.name.trim() || !Number.isInteger(x.count) || x.count < 1) return `${p.title}: each item needs a name and a count from 1`;
      return null;
    case "npc":
      if (!p.npc.who.trim()) return `${p.title}: say who they are`;
      if (p.npc.block?.maxHp !== undefined && (!Number.isInteger(p.npc.block.maxHp) || p.npc.block.maxHp < 1)) return `${p.title}: HP is a whole number from 1`;
      return null;
    case "encounter":
      if (!p.encounter.creatures.length) return `${p.title} needs at least one creature or NPC`;
      for (const c of p.encounter.creatures) {
        if (!c.creature && !(c.name?.trim() && c.maxHp)) return `${p.title}: a creature not in the Bestiary needs a name and HP`;
        if (c.count !== undefined && (!Number.isInteger(c.count) || c.count < 1 || c.count > 20)) return `${p.title}: a count runs 1 to 20`;
      }
      return null;
  }
}

export function applyPrep(world: World, a: PrepAction): Effect[] {
  if (a.type === "prep.save") {
    if (!a.items.length) throw new Rejected("save at least one prepared item");
    const ids = new Set<string>();
    for (const p of a.items) {
      const bad = problems(p);
      if (bad) throw new Rejected(bad);
      if (ids.has(p.id)) throw new Rejected(`${p.id} is listed twice`);
      ids.add(p.id);
    }
    for (const p of a.items) world.prep.set(p.id, clonePrep(p));
    return [{ kind: "prepared", count: a.items.length, ...(a.pack ? { pack: a.pack } : {}) }];
  }
  if (!a.prepIds.length) throw new Rejected("name a prepared item to remove");
  for (const id of a.prepIds) if (!world.prep.has(id)) throw new Rejected(`nothing prepared as ${id}`);
  for (const id of a.prepIds) world.prep.delete(id);
  return [];
}

/**
 * A content pack as written (`rules/tutorial.yaml` is one): its name, and its notices, quests,
 * fights, loot, and NPCs, each with the group it belongs to. A file the GM loads takes the same shape.
 */
export interface PackData {
  pack: string;
  title?: string;
  notices?: { id: string; group: string; title: string; note?: string; text: string[] | string }[];
  quests?: { group: string; note?: string; quest: QuestSpec }[];
  encounters?: { id: string; group: string; title: string; note?: string; zones: string[]; creatures: PrepCreature[] }[];
  loot?: { id: string; group: string; title: string; note?: string; items: Stack[] }[];
  npcs?: { id: string; group: string; name: string; who: string; line?: string; note?: string; block?: PrepNpc["block"] }[];
  /**
   * The record's own actions that set the table before play (characters, their levels, kit,
   * parties), in order, as a script's setup is written. The GM records them once; each keeps its
   * id, so recording again records nothing twice.
   */
  setup?: { id: string; action: Action }[];
}

/**
 * A pack's items, ids prefixed with the pack's name, in its groups' order. A pack that does not
 * hold together (a missing field, an id twice) is refused with the reason.
 */
export function packItems(data: PackData): PrepItem[] {
  if (!data || typeof data !== "object" || typeof data.pack !== "string" || !/^[a-z0-9-]+$/.test(data.pack))
    throw new Rejected("a pack names itself: `pack:` in lowercase letters, digits, and hyphens");
  const t = data.pack;
  const extra = (x: { group: string; note?: string }) => ({ group: String(x.group ?? "Unsorted"), ...(x.note ? { note: x.note } : {}) });
  const items: PrepItem[] = [
    ...(data.notices ?? []).map((n): PrepItem => ({ id: `${t}-${n.id}`, kind: "notice", title: n.title, ...extra(n), text: Array.isArray(n.text) ? n.text.join("\n\n") : n.text })),
    ...(data.quests ?? []).map((q): PrepItem => ({ id: `${t}-${q.quest.id.toLowerCase()}`, kind: "quest", title: `[${q.quest.id}] ${q.quest.title}`, ...extra(q), quest: q.quest })),
    ...(data.encounters ?? []).map((e): PrepItem => ({ id: `${t}-${e.id}`, kind: "encounter", title: e.title, ...extra(e), encounter: { name: e.title, zones: e.zones, creatures: e.creatures } })),
    ...(data.loot ?? []).map((l): PrepItem => ({ id: `${t}-${l.id}`, kind: "loot", title: l.title, ...extra(l), loot: l.items.map((x) => ({ name: x.name, count: x.count ?? 1 })) })),
    ...(data.npcs ?? []).map(
      (n): PrepItem => ({
        id: `${t}-${n.id}`,
        kind: "npc",
        title: n.name,
        ...extra(n),
        npc: { who: n.who, ...(n.line ? { line: n.line } : {}), ...(n.block ? { block: n.block } : {}) },
      }),
    ),
  ];
  const ids = new Set<string>();
  for (const p of items) {
    const bad = problems(p);
    if (bad) throw new Rejected(bad);
    if (ids.has(p.id)) throw new Rejected(`${p.id} is in the pack twice`);
    ids.add(p.id);
  }
  // Groups are named in order ("Phase 2", "Scene 10"), so they sort as the pack runs, numbers as numbers.
  return items.sort((a, b) => a.group!.localeCompare(b.group!, "en", { numeric: true }));
}

/**
 * A pack's setup as the record's actions, each id prefixed with the pack's name (`rehearsal-kara`)
 * so it cannot meet another action's id, and every reference to a setup id inside an action (an
 * invitation answered) rewritten to match.
 */
export function packSetup(data: PackData): { id: string; action: Action }[] {
  const ids = new Map((data.setup ?? []).map((s) => [s.id, `${data.pack}-${s.id}`]));
  if (ids.size !== (data.setup ?? []).length) throw new Rejected("two setup actions share an id");
  const rewrite = (v: unknown): unknown =>
    typeof v === "string" ? (ids.get(v) ?? v) : Array.isArray(v) ? v.map(rewrite) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "type" ? x : rewrite(x)])) : v;
  return (data.setup ?? []).map((s) => ({ id: ids.get(s.id)!, action: rewrite(s.action) as Action }));
}

/** The tutorial pack (`rules/tutorial.yaml`) as prepared items. */
export function tutorialPack(engine: Engine): PrepItem[] {
  return packItems(engine.rules.tutorial as PackData);
}
