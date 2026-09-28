/**
 * Prep: fights, quests, and System notices the GM prepares before a session and fires live.
 *
 * A prepared item is the GM's alone and changes nothing at the table. Firing it records the real
 * action (a fight's start, a quest's issue, a message) with the prepared item as its cause, and
 * the item stays in Prep for another use; the GM removes what is spent. A content pack, such as
 * the tutorial's (`rules/tutorial.yaml`), loads as one save, so undoing the load removes the pack.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Effect, Rejected, type World } from "./fold.ts";
import type { ForceOption } from "./combat.ts";
import type { QuestSpec } from "./quests.ts";

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

export type PrepItem =
  | (PrepBase & { kind: "encounter"; encounter: { name: string; zones: string[]; creatures: PrepCreature[] } })
  | (PrepBase & { kind: "quest"; quest: QuestSpec })
  | (PrepBase & { kind: "notice"; text: string });

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

/** The tutorial pack (`rules/tutorial.yaml`) as prepared items. */
export function tutorialPack(engine: Engine): PrepItem[] {
  const t = engine.rules.tutorial as {
    pack: string;
    notices: { id: string; group: string; title: string; note?: string; text: string[] }[];
    quests: { group: string; note?: string; quest: QuestSpec }[];
    encounters: { id: string; group: string; title: string; note?: string; zones: string[]; creatures: PrepCreature[] }[];
  };
  const extra = (x: { group: string; note?: string }) => ({ group: x.group, ...(x.note ? { note: x.note } : {}) });
  const items: PrepItem[] = [
    ...t.notices.map((n): PrepItem => ({ id: `${t.pack}-${n.id}`, kind: "notice", title: n.title, ...extra(n), text: n.text.join("\n\n") })),
    ...t.quests.map((q): PrepItem => ({ id: `${t.pack}-${q.quest.id.toLowerCase()}`, kind: "quest", title: `[${q.quest.id}] ${q.quest.title}`, ...extra(q), quest: q.quest })),
    ...t.encounters.map((e): PrepItem => ({ id: `${t.pack}-${e.id}`, kind: "encounter", title: e.title, ...extra(e), encounter: { name: e.title, zones: e.zones, creatures: e.creatures } })),
  ];
  // The book's order: group by group as the chapter runs.
  const order = [...new Set([...t.notices, ...t.quests, ...t.encounters].map((x) => x.group))].sort();
  return items.sort((a, b) => order.indexOf(a.group!) - order.indexOf(b.group!));
}
