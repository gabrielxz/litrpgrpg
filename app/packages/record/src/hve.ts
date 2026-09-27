/**
 * The Hidden Vector Engine's sheet by hand (The Hidden Vector Engine, "The Session-End Sweep").
 *
 * During play the record logs nothing. At session end the GM tallies the moments they remember
 * for each character on the matching side of Current: 1 for a moment remembered, 2 for one that
 * surprised the table, 3, circled, with a one-line margin note, for a Defining moment. Then for
 * each axis, a side of Current leading by 2 or more adds one tally to that side of Deep, and
 * Current is erased. The sweep is one action for the whole table, so undoing it undoes the
 * session's sweep; the moments it recorded stay in the character's history (the circled notes
 * are what the System quotes back).
 *
 * A moment that clearly reads on two axes tallies its secondary one weight lower. Coercion aimed
 * at another player character is always at least `pvp_coercion_min_will_tallies` of Will. A table
 * moving from paper copies its Deep tallies across (`hve.deep`). Players never see any of it.
 */
import type { Engine } from "@gradebreaker/engine";
import { type CharacterState, type Effect, Rejected } from "./fold.ts";

/** One remembered moment on one character's sheet. */
export interface Moment {
  pole: string;
  /** The sweep's weight: its tallies (1, 2, or 3). */
  weight: number;
  /** The margin note: required on a Defining (circled) moment, a cue on any other. */
  note?: string;
  /** A second axis the moment clearly reads on, tallied one weight lower. */
  secondary?: string;
  /** Coercion aimed at another player character. */
  coercion?: boolean;
}

/** The session-end sweep: each listed character's moments into Current, then Deep. GM only. */
export interface SweepHve {
  type: "hve.sweep";
  /** The session, as the GM names it ("Session 3"). */
  label?: string;
  sheets: { characterId: string; moments: Moment[] }[];
}

/** Deep tallies copied across from a paper sheet or another mode. Poles left out are 0. GM only. */
export interface CopyDeep {
  type: "hve.deep";
  characterId: string;
  deep: Record<string, number>;
}

export type HveAction = SweepHve | CopyDeep;

/** One sweep as the character's history keeps it: Current before it was erased, and what Deep gained. */
export interface SweepEntry {
  id: string;
  label?: string;
  moments: Moment[];
  current: Record<string, number>;
  added: string[];
}

export interface HveState {
  deep: Record<string, number>;
  sweeps: SweepEntry[];
}

interface Axis {
  name: string;
  poles: { name: string }[];
}

export function axes(engine: Engine): { name: string; poles: [string, string] }[] {
  return (engine.rules.hve.axes as Axis[]).map((a) => ({ name: a.name, poles: [a.poles[0]!.name, a.poles[1]!.name] }));
}

export function poles(engine: Engine): string[] {
  return axes(engine).flatMap((a) => a.poles);
}

const axisOf = (engine: Engine, pole: string) => axes(engine).find((a) => a.poles.includes(pole))?.name;

export interface Weight {
  tallies: number;
  name: string;
  qualifies: string;
  example: string;
  circled?: boolean;
  margin_note?: boolean;
}

/** The weights a moment can carry: every row of the sweep's table that tallies. */
export function weights(engine: Engine): Weight[] {
  return (engine.rules.hve.sweep.weights as Weight[]).filter((w) => w.tallies > 0);
}

/** Current from the moments: each at its weight, a secondary one weight lower. */
export function currentOf(engine: Engine, moments: Moment[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(poles(engine).map((p) => [p, 0]));
  for (const m of moments) {
    out[m.pole] = (out[m.pole] ?? 0) + m.weight;
    if (m.secondary) out[m.secondary] = (out[m.secondary] ?? 0) + m.weight - 1;
  }
  return out;
}

function checkMoment(engine: Engine, name: string, m: Moment) {
  const all = poles(engine);
  if (!all.includes(m.pole)) throw new Rejected(`${m.pole} is not a side of an axis`);
  const w = weights(engine).find((x) => x.tallies === m.weight);
  if (!w) throw new Rejected(`a moment carries ${weights(engine).map((x) => x.tallies).join(", ")} tallies`);
  if (w.margin_note && !m.note?.trim()) throw new Rejected(`${name}'s ${w.name} moment needs its margin note`);
  if (m.secondary !== undefined) {
    if (!all.includes(m.secondary)) throw new Rejected(`${m.secondary} is not a side of an axis`);
    if (axisOf(engine, m.secondary) === axisOf(engine, m.pole)) throw new Rejected("a secondary tally goes on another axis");
    if (m.weight - 1 < 1) throw new Rejected("one weight lower than a single tally is no tally; tally only the primary");
  }
  if (m.coercion) {
    const min = engine.rules.hve.sweep.pvp_coercion_min_will_tallies as number;
    if (m.pole !== "Will" || m.weight < min) throw new Rejected(`coercion aimed at another player character is at least ${min} tallies of Will`);
  }
}

/** The leading side of each axis of Deep and by how much; a tied axis has no leader. */
export function leadsOf(engine: Engine, deep: Record<string, number>) {
  return axes(engine).map((a) => {
    const [x, y] = a.poles;
    const by = (deep[x] ?? 0) - (deep[y] ?? 0);
    return { axis: a.name, pole: by > 0 ? x : by < 0 ? y : null, by: Math.abs(by) };
  });
}

/** The whole-sheet profile Deep reads as, when every axis has a leader and they match one. */
export function archetypeOf(engine: Engine, deep: Record<string, number>): string | null {
  const leading = leadsOf(engine, deep).map((l) => l.pole);
  if (leading.includes(null)) return null;
  const a = (engine.rules.hve.archetypes as { name: string; poles: string[] }[]).find((x) => x.poles.every((p) => leading.includes(p)));
  return a?.name ?? null;
}

export function cloneHve(h: HveState): HveState {
  return { deep: { ...h.deep }, sweeps: h.sweeps.map((s) => ({ ...s, moments: s.moments.map((m) => ({ ...m })), current: { ...s.current }, added: [...s.added] })) };
}

function stateOf(c: CharacterState): HveState {
  c.hve ??= { deep: {}, sweeps: [] };
  return c.hve;
}

export function applyHve(engine: Engine, chars: Map<string, CharacterState>, a: HveAction, id: string): Effect[] {
  const need = (characterId: string) => {
    const c = chars.get(characterId);
    if (!c) throw new Rejected(`no character ${characterId}`);
    return c;
  };
  if (a.type === "hve.deep") {
    const c = need(a.characterId);
    const deep: Record<string, number> = {};
    for (const [pole, n] of Object.entries(a.deep)) {
      if (!poles(engine).includes(pole)) throw new Rejected(`${pole} is not a side of an axis`);
      if (!Number.isInteger(n) || n < 0) throw new Rejected("Deep tallies are whole numbers from 0");
      if (n > 0) deep[pole] = n;
    }
    stateOf(c).deep = deep;
    return [{ kind: "hve-copied", characterId: c.id }];
  }
  if (!a.sheets.length) throw new Rejected("a sweep covers at least one character");
  const seen = new Set<string>();
  const out: Effect[] = [];
  for (const s of a.sheets) {
    if (seen.has(s.characterId)) throw new Rejected("one sheet per character in a sweep");
    seen.add(s.characterId);
    const c = need(s.characterId);
    if (c.dead) throw new Rejected(`${c.name} is dead`);
    for (const m of s.moments) checkMoment(engine, c.name, m);
    const h = stateOf(c);
    const current = currentOf(engine, s.moments);
    const added: string[] = [];
    for (const ax of axes(engine)) {
      const [x, y] = ax.poles;
      const next = engine.sweepUpdate({ [x]: current[x]!, [y]: current[y]! }, h.deep).deep;
      for (const p of ax.poles) if ((next[p] ?? 0) > (h.deep[p] ?? 0)) added.push(p);
      h.deep = next;
    }
    const entry: SweepEntry = { id, moments: s.moments.map((m) => ({ ...m })), current, added };
    if (a.label?.trim()) entry.label = a.label.trim();
    h.sweeps.push(entry);
    out.push({ kind: "hve-swept", characterId: c.id, current, added });
  }
  return out;
}
