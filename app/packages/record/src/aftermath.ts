/**
 * The end of a fight, after the last Beat (Cultivation, "Combat Kills"; The System AI, "Loot").
 * The GM rolls the loot, one roll per kill, and settles the encounter once: who took part,
 * each kill's tier and finishing blow, the VE each participant collects, and what dropped,
 * which goes into the spoils for the party to divide. Settling is one action, so the whole
 * aftermath is undone as one thing.
 *
 * Every participant collects the full award at their own tier; the finishing blow earns
 * nothing extra and is recorded as the confirmed kill for titles that count kills. A kill is
 * a combatant who died: a Downed NPC left alive released nothing.
 */
import type { Engine } from "@gradebreaker/engine";
import type { Encounter } from "./combat.ts";
import { type D100, rollD100s } from "./dice.ts";
import { type Effect, Rejected, type World, storeVe } from "./fold.ts";
import { SPOILS, type Stack, put } from "./inventory.ts";
import { count, countMax } from "./titles.ts";

/** One kill as the GM settles it: the tier for the party, the boss's ×1.5, and who finished it. */
export interface KillEntry {
  combatantId: string;
  tier: string;
  boss?: boolean;
  /** The confirmed finishing blow: a combatant in the fight. */
  byId?: string;
  /** A character for whom this enemy sat at another tier (Cultivation: "each character then collects the award for their own tier"). */
  tiers?: Record<string, string>;
}

/** One roll per kill on the loot table; `dice` holds the d100 for each row that has a chance, null for the others. */
export interface RollLoot {
  type: "encounter.loot";
  encounterId: string;
  kills: { combatantId: string; tier: string; boss?: boolean }[];
  dice?: (number | null)[];
}

export interface Settle {
  type: "encounter.settle";
  encounterId: string;
  /** Characters who meaningfully took part. */
  participants: string[];
  kills: KillEntry[];
  /** What each participant collects: the computed award, or the GM's override. */
  awards: { characterId: string; ve: number }[];
  /** What dropped, into the spoils. */
  spoils: Stack[];
}

export type AftermathAction = RollLoot | Settle;

/** A loot roll's result as the table reads it. */
export interface LootResult {
  combatantId: string;
  /** The table row read: one higher for a boss. */
  row: string;
  die: number | null;
  drop: string;
}

// The loot table's chances live in its drop text (rules/system-ai.yaml `loot_table`); backlog
// edit 12 gives them their own fields. A chance succeeds on a d100 at or under it.
const LOOT: Record<string, { chance?: number; hit: string; miss?: string }> = {
  Trivial: { hit: "Nothing, or salvage on a memorable kill" },
  Easy: { chance: 50, hit: "One minor consumable", miss: "Nothing" },
  Moderate: { hit: "One consumable" },
  Hard: { chance: 25, hit: "One consumable, plus a skill shard or equipment", miss: "One consumable" },
  Severe: { hit: "One meaningful item" },
  Peak: { hit: "One meaningful item plus one bespoke drop" },
};
const PEAK_BOSS = "One meaningful item plus two bespoke drops";

function tiers(engine: Engine): string[] {
  return engine.rules["system-ai"].loot_table.map((r: { tier: string }) => r.tier);
}

/** The row a kill reads and whether it rolls: a boss reads one row higher; a Peak boss has its own drop. */
export function lootRow(engine: Engine, tier: string, boss: boolean): { row: string; chance?: number } {
  const order = tiers(engine);
  const i = order.indexOf(tier);
  if (i < 0) throw new Rejected(`no tier ${tier}`);
  if (boss && i === order.length - 1) return { row: "Peak boss" };
  const row = order[boss ? i + 1 : i]!;
  const chance = LOOT[row]?.chance;
  return chance === undefined ? { row } : { row, chance };
}

function lootDrop(row: string, die: number | null): string {
  if (row === "Peak boss") return PEAK_BOSS;
  const l = LOOT[row]!;
  if (l.chance === undefined || die === null) return l.hit;
  return die <= l.chance ? l.hit : l.miss!;
}

function ended(world: World, encounterId: string): Encounter {
  const e = world.encounter;
  if (!e || e.id !== encounterId) throw new Rejected("that fight is not the last one");
  if (!e.ended) throw new Rejected(`${e.name} is still running`);
  if (e.settled) throw new Rejected(`${e.name} is already settled`);
  return e;
}

function dead(e: Encounter, id: string) {
  const c = e.combatants.find((x) => x.id === id);
  if (!c) throw new Rejected(`no combatant ${id} in ${e.name}`);
  if (!c.dead) throw new Rejected(`${c.name} did not die`);
  return c;
}

function rollLoot(engine: Engine, world: World, a: RollLoot): Effect[] {
  const e = ended(world, a.encounterId);
  if (e.loot) throw new Rejected("the loot is rolled; undo the roll to roll again");
  if (!a.kills.length) throw new Rejected("name the kills to roll for");
  if (!a.dice || a.dice.length !== a.kills.length) throw new Rejected("the dice were not rolled");
  const seen = new Set<string>();
  e.loot = a.kills.map((k, i) => {
    if (seen.has(k.combatantId)) throw new Rejected("one roll per kill");
    seen.add(k.combatantId);
    dead(e, k.combatantId);
    const { row, chance } = lootRow(engine, k.tier, Boolean(k.boss));
    const die = a.dice![i] ?? null;
    if (chance === undefined && die !== null) throw new Rejected(`${row} has no chance to roll`);
    if (chance !== undefined && (die === null || !Number.isInteger(die) || die < 1 || die > 100)) throw new Rejected("a loot roll is a d100");
    return { combatantId: k.combatantId, row, die, drop: lootDrop(row, die) };
  });
  return [{ kind: "loot", encounterId: e.id, results: e.loot.map((r) => ({ ...r })) }];
}

/** The d100 for each kill whose row has a chance; a table roll, so it does not explode. */
export function rollLootDice(engine: Engine, a: RollLoot, d100: D100): RollLoot {
  if (a.dice) return a;
  try {
    const dice = a.kills.map((k) => (lootRow(engine, k.tier, Boolean(k.boss)).chance === undefined ? null : rollD100s(100, { explodes: false }, d100).natural[0]!));
    return { ...a, dice };
  } catch (err) {
    if (err instanceof Rejected) return a;
    throw err;
  }
}

/** What each participant collects for these kills at their own tier; a boss pays 1.5×, rounded down. */
export function encounterAwards(
  engine: Engine,
  e: { combatants: { id: string; grade: string }[] },
  participants: { characterId: string; grade: string }[],
  kills: KillEntry[],
): { characterId: string; ve: number }[] {
  const boss = engine.rules.cultivation.awards.boss_multiplier_gm_discretion;
  return participants.map(({ characterId, grade }) => {
    const ve = kills.reduce((sum, k) => {
      const victim = e.combatants.find((c) => c.id === k.combatantId);
      if (!victim) return sum;
      const base = engine.killVe(k.tiers?.[characterId] ?? k.tier, grade, victim.grade);
      return sum + Math.floor(base * (k.boss ? boss : 1));
    }, 0);
    return { characterId, ve };
  });
}

function settle(engine: Engine, world: World, a: Settle): Effect[] {
  const e = ended(world, a.encounterId);
  const inFight = new Set(e.combatants.flatMap((c) => (c.characterId ? [c.characterId] : [])));
  const parts = new Set<string>();
  for (const p of a.participants) {
    if (!inFight.has(p)) throw new Rejected(`${world.characters.get(p)?.name ?? p} was not in ${e.name}`);
    if (world.characters.get(p)?.dead) throw new Rejected(`${world.characters.get(p)!.name} is dead`);
    if (parts.has(p)) throw new Rejected("a participant is listed twice");
    parts.add(p);
  }
  const killed = new Set<string>();
  const out: Effect[] = [];
  for (const k of a.kills) {
    if (killed.has(k.combatantId)) throw new Rejected("a kill is listed twice");
    killed.add(k.combatantId);
    const victim = dead(e, k.combatantId);
    for (const t of [k.tier, ...Object.values(k.tiers ?? {})]) {
      try {
        engine.killTierMultiple(t);
      } catch {
        throw new Rejected(`no tier ${t}`);
      }
    }
    for (const c of Object.keys(k.tiers ?? {})) if (!parts.has(c)) throw new Rejected(`${c} is not a participant`);
    if (k.byId !== undefined && !e.combatants.some((c) => c.id === k.byId)) throw new Rejected(`no combatant ${k.byId} in ${e.name}`);
    for (const p of parts)
      out.push({ kind: "kill-confirmed", characterId: p, encounterId: e.id, victimId: victim.id, victimGrade: victim.grade, tier: k.tiers?.[p] ?? k.tier });
  }
  const awarded = new Set<string>();
  for (const w of a.awards) {
    if (!parts.has(w.characterId)) throw new Rejected(`${world.characters.get(w.characterId)?.name ?? w.characterId} is not a participant`);
    if (awarded.has(w.characterId)) throw new Rejected("a participant is awarded twice");
    awarded.add(w.characterId);
    if (!Number.isInteger(w.ve) || w.ve < 0) throw new Rejected(`an award is a whole number of VE, not ${w.ve}`);
    if (w.ve > 0) out.push(...storeVe(engine, world.characters.get(w.characterId)!, w.ve));
  }
  for (const s of a.spoils) out.push(...put(world, SPOILS, s));
  if (a.spoils.length) out.push({ kind: "spoils-added", encounterId: e.id, items: a.spoils.map((s) => ({ name: s.name.trim(), count: s.count })) });
  // Confirmed kills are finishing blows (Titles, "Achievement Titles"); a Severe or Peak kill reads the killer's own tier.
  const perKiller = new Map<string, number>();
  for (const k of a.kills) {
    const killer = k.byId ? e.combatants.find((c) => c.id === k.byId)?.characterId : undefined;
    const ch = killer ? world.characters.get(killer) : undefined;
    if (!ch) continue;
    count(ch, "confirmed-kills");
    const tier = k.tiers?.[ch.id] ?? k.tier;
    if (tier === "Severe" || tier === "Peak") count(ch, "severe-or-peak-kills");
    perKiller.set(ch.id, (perKiller.get(ch.id) ?? 0) + 1);
  }
  for (const [id, n] of perKiller) countMax(world.characters.get(id)!, "most-kills-in-a-fight", n);
  e.settled = true;
  e.kills = a.kills.map((k) => ({ ...k, ...(k.tiers ? { tiers: { ...k.tiers } } : {}) }));
  return [{ kind: "encounter-settled", encounterId: e.id }, ...out];
}

export function applyAftermath(engine: Engine, world: World, a: AftermathAction): Effect[] {
  return a.type === "encounter.loot" ? rollLoot(engine, world, a) : settle(engine, world, a);
}
