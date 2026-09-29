/**
 * Battle Memories and the Principle track (The Principle System).
 *
 * A Battle Memory Card is due automatically on a Volatility cascade of two or more extra dice on
 * a character's roll, and on surviving Downed (which the GM may withhold when the Downing taught
 * nothing); the GM grants any other card from the fiction. A due card reaches the player only
 * when the GM grants it. The player chooses which card to meditate on (the player-choice rule);
 * at a Consolidation after the card arrived, the GM awards 1 to 3 Insight toward the family the
 * memory expresses and gives the System's vision, and the card is spent. Other Insight sources
 * are awarded by the GM within the book's ranges; a Consolidation vision comes once a day, dawn
 * to dawn, on the in-game clock (Gabriel, 2026-09-27: nothing counts sessions; the book sentence
 * is queued), and without the clock the GM keeps the count.
 *
 * Insight is kept by family. The first family to reach 3 crystallizes into the slot the Grade
 * allows: the GM names the Principle and its minor passive. After that, a threshold met does
 * nothing until a Distillation: the GM records the articulation and the grant (an Application at
 * Seed and Early Fragment, Infusion at Mid Fragment, a Domain at Peak Fragment, which needs a
 * D-Grade body). On the Quiet Path the GM offers the articulation, in one or two phrasings, and
 * the player accepts one or vetoes. Reshaping renames a Principle at its present tier (the book's word; the record keeps
 * `refine` and the grant kind "refinement" as stored, so logs written before the rename replay).
 */
import type { Engine } from "@gradebreaker/engine";
import type { Envelope } from "./actions.ts";
import { type CharacterState, type Effect, Rejected, type World } from "./fold.ts";
import { MINUTES_PER_DAY } from "./clock.ts";

export interface BattleMemory {
  id: string;
  /** What happened, as the card says it. */
  text: string;
  source: "cascade" | "downed" | "gm";
  /** Consolidations completed when the card arrived: meditation waits for a later one. */
  afterRests: number;
  /** The player has chosen to meditate on it. */
  chosen?: boolean;
  meditation?: { id: string; family: string; ip: number; words?: string; vision?: string };
}

/** A card the rules make due, waiting on the GM's grant (or, for Downed, a pass). */
export interface MemoryDue {
  /** The action that made it due and the character: `${actionId}:${characterId}`. */
  key: string;
  reason: "cascade" | "downed";
  label: string;
}

export type GrantKind = "application" | "infusion" | "domain";

export interface Grant {
  /** The Distillation's action id. */
  id: string;
  tier: string;
  kind: GrantKind | "refinement";
  articulation: string;
  name?: string;
  text?: string;
  /** Aether per use, from the tier that granted it (`application_costs`). */
  aether?: number;
  /** Seed's Attunements, in the GM's words. */
  attunements?: string;
  /** Reshaping or Broadening: the name before. */
  from?: string;
  quiet?: boolean;
}

/** A Quiet Path offer: the GM's articulation in one or two phrasings, waiting on the player. */
export interface DistillOffer {
  id: string;
  refine?: boolean;
  articulations: string[];
  grant: { name?: string; text?: string; attunements?: string; rename?: string };
}

export interface Principle {
  family: string;
  name: string;
  /** The tier reached by Distillation (Initial Insight at crystallization). */
  tier: string;
  passive?: string;
  grants: Grant[];
  offer?: DistillOffer;
}

export interface PrincipleState {
  memories: BattleMemory[];
  due: MemoryDue[];
  /** Insight by family. */
  insight: Record<string, number>;
  /** Families in the order they reached crystallization's threshold. */
  reached: string[];
  principles: Principle[];
  /** In-game days, counted dawn to dawn, on which the character had a Consolidation vision. */
  visions: number[];
}

export function clonePrinciples(p: PrincipleState): PrincipleState {
  return {
    memories: p.memories.map((m) => ({ ...m, ...(m.meditation ? { meditation: { ...m.meditation } } : {}) })),
    due: p.due.map((d) => ({ ...d })),
    insight: { ...p.insight },
    reached: [...p.reached],
    principles: p.principles.map((x) => ({
      ...x,
      grants: x.grants.map((g) => ({ ...g })),
      ...(x.offer ? { offer: { ...x.offer, articulations: [...x.offer.articulations], grant: { ...x.offer.grant } } } : {}),
    })),
    visions: [...p.visions],
  };
}

export function stateOf(c: CharacterState): PrincipleState {
  c.principles ??= { memories: [], due: [], insight: {}, reached: [], principles: [], visions: [] };
  return c.principles;
}

// ---------------------------------------------------------------- actions ---

/** A card to a character: from the due list, or from the fiction. GM only. */
export interface GrantMemory {
  type: "memory.grant";
  characterId: string;
  text: string;
  due?: string;
}

/** The GM withholds a Downed card: the Downing taught nothing. GM only. */
export interface PassMemory {
  type: "memory.pass";
  characterId: string;
  due: string;
}

/** The player marks the card to meditate on at the next Consolidation, or unmarks it. */
export interface ChooseMemory {
  type: "memory.choose";
  characterId: string;
  memoryId: string;
  chosen: boolean;
}

/** The meditation, at a Consolidation after the card arrived: Insight, and the System's vision. GM only. */
export interface Meditate {
  type: "memory.meditate";
  characterId: string;
  memoryId: string;
  family: string;
  ip: number;
  words?: string;
  vision?: string;
}

/** Insight from any other source in the book's table. GM only. */
export interface AwardInsight {
  type: "insight.award";
  characterId: string;
  source: string;
  family: string;
  ip: number;
  note?: string;
}

/** The GM names the Principle the first family to reach the threshold crystallizes into. */
export interface NamePrinciple {
  type: "principle.name";
  characterId: string;
  family: string;
  name: string;
  passive?: string;
}

/**
 * A Distillation: the next tier and its grant, or a Reshaping (`rename` at the present tier).
 * With `quiet`, the GM's articulations are offered to the player instead. GM only.
 */
export interface Distill {
  type: "principle.distill";
  characterId: string;
  family: string;
  articulations: string[];
  quiet?: boolean;
  refine?: boolean;
  /** Reshaping's new name, or Broadening's at a tier-up. */
  rename?: string;
  name?: string;
  text?: string;
  attunements?: string;
}

/** The player's answer to a Quiet Path offer: one of its phrasings, or a veto. */
export interface AnswerOffer {
  type: "principle.answer";
  characterId: string;
  family: string;
  accept: boolean;
  articulation?: number;
}

export type PrincipleAction = GrantMemory | PassMemory | ChooseMemory | Meditate | AwardInsight | NamePrinciple | Distill | AnswerOffer;

// ------------------------------------------------------------------ rules ---

interface Family {
  name: string;
  pole: string;
}
interface Rung {
  tier: string;
  cumulative_ip: number;
}
interface Source {
  source: string;
  ip_min: number;
  ip_max: number;
}

export const families = (engine: Engine): Family[] => engine.rules.principles.families;
export const ladder = (engine: Engine): Rung[] => engine.rules.principles.ladder;
export const ipSources = (engine: Engine): Source[] => engine.rules.principles.ip_sources;
const MEDITATION = "Battle Memory meditation";
const VISION = "Consolidation vision";

/** Slots the body's Grade allows: one at F, the second from E (`slots`). */
export function slotsFor(engine: Engine, grade: string): number {
  const s = engine.rules.principles.slots;
  return grade === "F" ? s.at_f_grade : s.lifetime_max;
}

/** The next rung above a tier, or null at the top. */
export function nextRung(engine: Engine, tier: string): Rung | null {
  const l = ladder(engine);
  const i = l.findIndex((r) => r.tier === tier);
  return l[i + 1] ?? null;
}

/** "Weight 8/10": the Insight against the next threshold, or alone at the top. */
export function insightLine(engine: Engine, name: string, ip: number, tier: string): string {
  const next = nextRung(engine, tier);
  return next ? `${name} ${ip}/${next.cumulative_ip}` : `${name} ${ip}`;
}

function checkFamily(engine: Engine, family: string) {
  if (!families(engine).some((f) => f.name === family)) throw new Rejected(`${family} is not a family`);
}

function checkIp(engine: Engine, source: string, ip: number) {
  const row = ipSources(engine).find((s) => s.source === source);
  if (!row) throw new Rejected(`${source} is not an Insight source`);
  if (!Number.isInteger(ip) || ip < row.ip_min || ip > row.ip_max)
    throw new Rejected(`${source} pays ${row.ip_min === row.ip_max ? row.ip_min : `${row.ip_min} to ${row.ip_max}`} Insight`);
}

/** Insight into a family: toward its Principle if one holds it, toward resonance otherwise. */
function addInsight(engine: Engine, c: CharacterState, family: string, ip: number): Effect {
  const p = stateOf(c);
  const before = p.insight[family] ?? 0;
  p.insight[family] = before + ip;
  const held = p.principles.find((x) => x.family === family);
  const at = engine.rules.principles.crystallizes_at_ip as number;
  if (!held && before < at && p.insight[family]! >= at && !p.reached.includes(family)) p.reached.push(family);
  return held
    ? { kind: "insight", characterId: c.id, line: insightLine(engine, held.name, p.insight[family]!, held.tier) }
    : { kind: "resonance", characterId: c.id, family, ip: p.insight[family]!, of: at };
}

/** The family that crystallizes next, if a slot is free: the first to reach the threshold. */
export function crystallizing(engine: Engine, c: CharacterState): string | null {
  const p = c.principles;
  if (!p || p.principles.length >= slotsFor(engine, c.grade)) return null;
  return p.reached.find((f) => !p.principles.some((x) => x.family === f)) ?? null;
}

/** The Principle's next rung, when its Insight has met it and a Distillation can take it. */
export function distillable(engine: Engine, c: CharacterState, x: Principle): Rung | null {
  const next = nextRung(engine, x.tier);
  if (!next || (c.principles?.insight[x.family] ?? 0) < next.cumulative_ip) return null;
  const top = ladder(engine).at(-1)!;
  if (next.tier === top.tier && c.grade !== engine.rules.principles.domain_requires_grade) return null;
  return next;
}

const KINDS: Record<number, GrantKind> = { 1: "application", 2: "application", 3: "infusion", 4: "domain" };

/** The Aether a grant at this tier costs per use: `application_costs` names Mid and Peak Fragment in parentheses. */
function costOf(engine: Engine, tier: string): number | undefined {
  const rows = engine.rules.principles.application_costs as { granted_at: string; aether: number }[];
  return rows.find((r) => r.granted_at === tier || r.granted_at.endsWith(`(${tier})`))?.aether;
}

// ---------------------------------------------------- due cards from play ---

/**
 * The cards a recorded action makes due: a cascade on any character's roll (a Clash, a check,
 * Momentum, a roll on the dice tab) and a survivor of Downed at a fight's end.
 */
export function collectDue(engine: Engine, world: World, env: Envelope, effects: Effect[]) {
  const cascade = engine.rules.grades.volatility.battle_memory_cascade_dice as number;
  const charOf = (combatantId: string) => world.encounter?.combatants.find((x) => x.id === combatantId)?.characterId;
  const add = (characterId: string | undefined, reason: MemoryDue["reason"], label: string) => {
    const c = characterId ? world.characters.get(characterId) : undefined;
    if (!c || c.dead) return;
    const p = stateOf(c);
    const key = `${env.id}:${c.id}`;
    if (!p.due.some((d) => d.key === key)) p.due.push({ key, reason, label });
  };
  for (const e of effects) {
    if (e.kind === "rolled" && e.characterId && e.extraDice >= cascade) add(e.characterId, "cascade", `a cascade of ${e.extraDice} extra dice`);
    if (e.kind === "battle-memory-due") add(e.characterId, "downed", "survived Downed");
    if ("rolls" in e && Array.isArray(e.rolls)) {
      for (const r of e.rolls as { combatantId: string; natural: number[]; label: string }[]) {
        if (r.natural.length - 1 >= cascade) add(charOf(r.combatantId), "cascade", `a cascade of ${r.natural.length - 1} extra dice (${r.label})`);
      }
    }
  }
}

// ------------------------------------------------------------------ apply ---

export function applyPrinciples(engine: Engine, world: World, a: PrincipleAction, env: Envelope): Effect[] {
  const c = world.characters.get(a.characterId);
  if (!c) throw new Rejected(`no character ${a.characterId}`);
  if (c.dead) throw new Rejected(`${c.name} is dead`);
  const p = stateOf(c);
  const memory = (id: string) => {
    const m = p.memories.find((x) => x.id === id);
    if (!m) throw new Rejected(`no Battle Memory ${id} on ${c.name}`);
    return m;
  };
  const principle = (family: string) => {
    const x = p.principles.find((y) => y.family === family);
    if (!x) throw new Rejected(`${c.name} holds no ${family} Principle`);
    return x;
  };
  switch (a.type) {
    case "memory.grant": {
      const text = a.text.trim();
      if (!text) throw new Rejected("say what the memory is");
      let source: BattleMemory["source"] = "gm";
      if (a.due !== undefined) {
        const d = p.due.find((x) => x.key === a.due);
        if (!d) throw new Rejected(`no card due to ${c.name} for that`);
        source = d.reason;
        p.due = p.due.filter((x) => x.key !== a.due);
      }
      p.memories.push({ id: env.id, text, source, afterRests: c.counters?.consolidations ?? 0 });
      return [{ kind: "memory-granted", characterId: c.id, memoryId: env.id }];
    }
    case "memory.pass": {
      const d = p.due.find((x) => x.key === a.due);
      if (!d) throw new Rejected(`no card due to ${c.name} for that`);
      if (d.reason !== "downed") throw new Rejected("a cascade's card is automatic; only a Downing that taught nothing is withheld");
      p.due = p.due.filter((x) => x.key !== a.due);
      return [];
    }
    case "memory.choose": {
      const m = memory(a.memoryId);
      if (m.meditation) throw new Rejected("that memory is spent");
      if (a.chosen) m.chosen = true;
      else delete m.chosen;
      return [];
    }
    case "memory.meditate": {
      const m = memory(a.memoryId);
      if (m.meditation) throw new Rejected("that memory is spent");
      if ((c.counters?.consolidations ?? 0) <= m.afterRests) throw new Rejected("a memory is meditated on at a Consolidation after it arrived");
      checkFamily(engine, a.family);
      checkIp(engine, MEDITATION, a.ip);
      m.meditation = { id: env.id, family: a.family, ip: a.ip };
      if (a.words?.trim()) m.meditation.words = a.words.trim();
      if (a.vision?.trim()) m.meditation.vision = a.vision.trim();
      delete m.chosen;
      const out: Effect[] = [];
      if (m.meditation.vision) out.push({ kind: "vision", characterId: c.id, text: m.meditation.vision });
      out.push(addInsight(engine, c, a.family, a.ip));
      return out;
    }
    case "insight.award": {
      if (a.source === MEDITATION) throw new Rejected("a meditation spends a Battle Memory; record it from the card");
      checkFamily(engine, a.family);
      checkIp(engine, a.source, a.ip);
      if (a.source === VISION && world.clock) {
        const day = Math.floor((world.clock.at - world.clock.dawn * 60) / MINUTES_PER_DAY);
        if (p.visions.includes(day)) throw new Rejected(`${c.name} has had a Consolidation vision since dawn`);
        p.visions.push(day);
      }
      return [addInsight(engine, c, a.family, a.ip)];
    }
    case "principle.name": {
      const next = crystallizing(engine, c);
      if (next !== a.family) throw new Rejected(next ? `${next} crystallizes first` : `${c.name} has nothing crystallizing`);
      const name = a.name.trim();
      if (!name) throw new Rejected("name the Principle");
      const x: Principle = { family: a.family, name, tier: ladder(engine)[0]!.tier, grants: [] };
      if (a.passive?.trim()) x.passive = a.passive.trim();
      p.principles.push(x);
      return [{ kind: "principle-crystallized", characterId: c.id, name }];
    }
    case "principle.distill": {
      const x = principle(a.family);
      if (x.offer) throw new Rejected(`${c.name} has an offer waiting on an answer`);
      const articulations = a.articulations.map((s) => s.trim()).filter(Boolean);
      if (!articulations.length) throw new Rejected("state the articulation");
      if (articulations.length > (a.quiet ? 2 : 1)) throw new Rejected(a.quiet ? "offer one or two phrasings" : "one articulation");
      if (a.refine) {
        if (!a.rename?.trim()) throw new Rejected("a Reshaping names the Principle's new identity");
      } else if (!distillable(engine, c, x)) {
        const next = nextRung(engine, x.tier);
        throw new Rejected(next ? `${x.name} needs ${next.cumulative_ip} Insight${next.tier === ladder(engine).at(-1)!.tier ? " and a D-Grade body" : ""} for ${next.tier}` : `${x.name} is at the top of the ladder`);
      }
      const grant = {
        ...(a.name?.trim() ? { name: a.name.trim() } : {}),
        ...(a.text?.trim() ? { text: a.text.trim() } : {}),
        ...(a.attunements?.trim() ? { attunements: a.attunements.trim() } : {}),
        ...(a.rename?.trim() ? { rename: a.rename.trim() } : {}),
      };
      if (a.quiet) {
        x.offer = { id: env.id, articulations, grant, ...(a.refine ? { refine: true } : {}) };
        return [{ kind: "distillation-offered", characterId: c.id, name: x.name }];
      }
      return distill(engine, c, x, env.id, articulations[0]!, grant, Boolean(a.refine), false);
    }
    case "principle.answer": {
      const x = principle(a.family);
      const offer = x.offer;
      if (!offer) throw new Rejected(`no offer waits on ${c.name}`);
      delete x.offer;
      if (!a.accept) return [];
      const articulation = offer.articulations[a.articulation ?? 0];
      if (!articulation) throw new Rejected("pick one of the offered phrasings");
      if (!offer.refine && !distillable(engine, c, x)) throw new Rejected(`${x.name} no longer meets its next threshold`);
      return distill(engine, c, x, offer.id, articulation, offer.grant, Boolean(offer.refine), true);
    }
  }
}

function distill(
  engine: Engine,
  c: CharacterState,
  x: Principle,
  id: string,
  articulation: string,
  grant: DistillOffer["grant"],
  refine: boolean,
  quiet: boolean,
): Effect[] {
  const from = x.name;
  if (refine) {
    x.name = grant.rename!;
    x.grants.push({ id, tier: x.tier, kind: "refinement", articulation, from, ...(quiet ? { quiet } : {}) });
    return [{ kind: "principle-refined", characterId: c.id, from, name: x.name }];
  }
  const next = nextRung(engine, x.tier)!;
  const index = ladder(engine).findIndex((r) => r.tier === next.tier);
  const kind = KINDS[index]!;
  const g: Grant = { id, tier: next.tier, kind, articulation };
  if (grant.name) g.name = grant.name;
  if (grant.text) g.text = grant.text;
  if (grant.attunements) g.attunements = grant.attunements;
  const cost = costOf(engine, next.tier);
  if (cost !== undefined) g.aether = cost;
  if (grant.rename) {
    g.from = from;
    x.name = grant.rename;
  }
  if (quiet) g.quiet = true;
  x.tier = next.tier;
  x.grants.push(g);
  return [{ kind: "distilled", characterId: c.id, name: x.name, tier: next.tier, grantKind: kind, ...(g.name ? { grant: g.name } : {}) }];
}

// ----------------------------------------------------------------- views ---

export interface PrinciplesSheet {
  memories: BattleMemory[];
  due: MemoryDue[];
  /** Insight by family, every family with some. */
  insight: Record<string, number>;
  principles: (Principle & { ip: number; next: { tier: string; ip: number } | null; distillable: boolean })[];
  /** The family waiting on the GM's name. */
  crystallizing: string | null;
  slots: number;
}

export function principlesSheet(engine: Engine, c: CharacterState): PrinciplesSheet {
  const p = c.principles ? clonePrinciples(c.principles) : { memories: [], due: [], insight: {}, reached: [], principles: [], visions: [] };
  return {
    memories: p.memories,
    due: p.due,
    insight: p.insight,
    principles: p.principles.map((x) => {
      const next = nextRung(engine, x.tier);
      return { ...x, ip: p.insight[x.family] ?? 0, next: next && { tier: next.tier, ip: next.cumulative_ip }, distillable: Boolean(distillable(engine, c, x)) };
    }),
    crystallizing: crystallizing(engine, c),
    slots: slotsFor(engine, c.grade),
  };
}

/**
 * The Principle as the character's own interface shows it (What Can Be Seen, "Your Own
 * Interface"): each family while its resonance accrues, and once crystallized the name, tier,
 * and Insight; the cards the character holds and the visions they brought; a Quiet Path offer.
 */
export interface InterfacePrinciples {
  memories: { id: string; text: string; chosen: boolean; vision?: string; spent: boolean }[];
  resonance: { family: string; ip: number; of: number }[];
  principles: {
    family: string;
    name: string;
    tier: string;
    insight: string;
    passive?: string;
    grants: { tier: string; kind: Grant["kind"]; name?: string; text?: string; aether?: number; attunements?: string; articulation: string }[];
    offer?: string[];
  }[];
}

export function interfacePrinciples(engine: Engine, c: CharacterState): InterfacePrinciples {
  const p = c.principles;
  if (!p) return { memories: [], resonance: [], principles: [] };
  const at = engine.rules.principles.crystallizes_at_ip as number;
  return {
    memories: p.memories.map((m) => ({
      id: m.id,
      text: m.text,
      chosen: Boolean(m.chosen),
      spent: Boolean(m.meditation),
      ...(m.meditation?.vision ? { vision: m.meditation.vision } : {}),
    })),
    resonance: Object.entries(p.insight)
      .filter(([f, ip]) => ip > 0 && !p.principles.some((x) => x.family === f))
      .map(([family, ip]) => ({ family, ip, of: at })),
    principles: p.principles.map((x) => ({
      family: x.family,
      name: x.name,
      tier: x.tier,
      insight: insightLine(engine, x.name, p.insight[x.family] ?? 0, x.tier),
      ...(x.passive ? { passive: x.passive } : {}),
      grants: x.grants.map(({ id: _i, quiet: _q, from: _f, ...g }) => g),
      ...(x.offer ? { offer: [...x.offer.articulations] } : {}),
    })),
  };
}
