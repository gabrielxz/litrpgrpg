/**
 * The character sheet as the record computes it, and the difference between two sets of
 * sheets (what a preview or a correction shows the GM before anything is applied).
 */
import { ATTRIBUTES, type Engine, type Stats } from "@gradebreaker/engine";
import { type CharacterState, capLevel, maxAetherOf, maxHpOf, rawStats } from "./fold.ts";

export interface Sheet {
  id: string;
  name: string;
  playerId?: string;
  background: string;
  pregen?: string;
  grade: string;
  level: number;
  /** Raw Attributes, temporary losses included. */
  raw: Stats;
  /** Each Attribute read at the character's Grade. */
  force: Stats;
  maxHp: number;
  hp: number;
  downed: boolean;
  maxAether: number;
  aether: number;
  surgeCost: number;
  tolerance: number;
  storedVe: number;
  saturation: { band: string; penalty: number; collapseClock: boolean };
  refinedVe: number;
  /** Refined VE still needed for the next level; null at the Level cap. */
  veToNextLevel: number | null;
  atCap: boolean;
  pendingSystemLevels: number[];
  freePoints: number;
  temporary: ("FOR" | "POW")[];
}

export function sheetOf(engine: Engine, c: CharacterState): Sheet {
  const raw = rawStats(c);
  const force: Stats = {};
  for (const a of ATTRIBUTES) force[a] = engine.force(raw[a]!, c.grade);
  const maxAether = maxAetherOf(engine, c);
  const sat = engine.saturation(c.storedVe, c.grade);
  const atCap = c.level >= capLevel(engine, c);
  const sheet: Sheet = {
    id: c.id,
    name: c.name,
    background: c.background,
    grade: c.grade,
    level: c.level,
    raw,
    force,
    maxHp: maxHpOf(engine, c),
    hp: c.hp,
    downed: c.hp === 0,
    maxAether,
    aether: c.aether,
    surgeCost: engine.surgeCost(maxAether),
    tolerance: engine.tolerance(c.grade),
    storedVe: c.storedVe,
    saturation: { band: sat.band, penalty: sat.penalty, collapseClock: sat.collapse_clock },
    refinedVe: c.refinedVe,
    veToNextLevel: atCap ? null : engine.levelCost(c.grade) - c.refinedVe,
    atCap,
    pendingSystemLevels: [...c.pendingSystemLevels].sort((a, b) => a - b),
    freePoints: c.freePoints,
    temporary: c.temporary.map((t) => t.attribute),
  };
  if (c.playerId !== undefined) sheet.playerId = c.playerId;
  if (c.pregen !== undefined) sheet.pregen = c.pregen;
  return sheet;
}

export interface Change {
  /** A dotted path into the sheet: `level`, `raw.FOR`, `saturation.band`. */
  field: string;
  before: unknown;
  after: unknown;
}

export interface SheetDiff {
  characterId: string;
  name: string;
  /** `added` and `removed` when the character exists on only one side. */
  status: "changed" | "added" | "removed";
  changes: Change[];
}

function flatten(value: unknown, prefix: string, out: Map<string, unknown>) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out.set(prefix, value);
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Every field that differs, per character. Characters with no difference are left out. */
export function diffSheets(before: Map<string, Sheet>, after: Map<string, Sheet>): SheetDiff[] {
  const out: SheetDiff[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(id);
    const a = after.get(id);
    if (!b) {
      out.push({ characterId: id, name: a!.name, status: "added", changes: [] });
      continue;
    }
    if (!a) {
      out.push({ characterId: id, name: b.name, status: "removed", changes: [] });
      continue;
    }
    const fb = new Map<string, unknown>();
    const fa = new Map<string, unknown>();
    flatten(b, "", fb);
    flatten(a, "", fa);
    const changes: Change[] = [];
    for (const field of new Set([...fb.keys(), ...fa.keys()])) {
      if (!same(fb.get(field), fa.get(field))) changes.push({ field, before: fb.get(field), after: fa.get(field) });
    }
    if (changes.length) out.push({ characterId: id, name: a.name, status: "changed", changes });
  }
  return out;
}
