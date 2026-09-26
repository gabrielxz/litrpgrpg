/**
 * Fills in the dice for an action that asks the server to roll: a `dice.roll` without its
 * dice, a Momentum Roll, a Seize, a Clash's defense, stabilizing, a Will Save, or loot. The record
 * stays pure; the caller passes the random source. A retry of an action already recorded takes the recorded dice, so it matches and
 * records once. Dice the client sends for a `dice.roll` were rolled at the table and are
 * marked as entered.
 */
import type { Action, Draft } from "./actions.ts";
import { rollLootDice } from "./aftermath.ts";
import { rollCheckDice, rollCombatDice } from "./combat.ts";
import { type D100, rollD100s } from "./dice.ts";
import { worldOf } from "./fold.ts";
import type { CampaignRecord } from "./record.ts";

export function rollFor(record: CampaignRecord, draft: Draft, d100: D100): Draft {
  const a = draft.action;
  const prior = record.find(draft.id)?.action;
  if (a.type === "dice.roll") {
    if (a.natural !== undefined) return { ...draft, action: { ...a, entered: true } };
    if (prior?.type === "dice.roll" && prior.natural) {
      return { ...draft, action: { ...a, natural: prior.natural, ...(prior.dropped === undefined ? {} : { dropped: prior.dropped }) } };
    }
    const grade = a.roller.kind === "character" ? (record.character(a.roller.characterId)?.grade ?? "F") : a.roller.grade;
    let threshold: number;
    try {
      threshold = record.engine.volatilityThreshold(grade);
    } catch {
      return draft; // an unknown Grade: the record refuses it with the reason
    }
    const dice = rollD100s(threshold, { advantage: Boolean(a.advantage), explodes: a.rollKind !== "table" }, d100);
    return { ...draft, action: { ...a, ...dice } };
  }
  if (a.type === "combat.defend") {
    if (a.attackDice && a.defenseDice) return draft;
    if (prior?.type === "combat.defend" && prior.attackDice && prior.defenseDice)
      return { ...draft, action: { ...a, attackDice: prior.attackDice, defenseDice: prior.defenseDice } };
    const e = record.state.encounter;
    const cl = e?.clash;
    if (!e || !cl) return draft;
    const grade = (id: string) => e.combatants.find((c) => c.id === id)?.grade ?? "F";
    const roll = (g: string, advantage: boolean) => rollD100s(record.engine.volatilityThreshold(g), { advantage }, d100);
    return {
      ...draft,
      action: {
        ...a,
        attackDice: roll(grade(cl.attackerId), Boolean(cl.attack.advantage)),
        defenseDice: roll(grade(cl.defenderId), Boolean(a.defense.advantage)),
      },
    };
  }
  if (a.type === "combat.momentum" || a.type === "combat.seize") {
    if (a.attempts) return draft;
    if (prior?.type === a.type && prior.attempts) return { ...draft, action: { ...a, attempts: prior.attempts } as Action };
    return { ...draft, action: rollCombatDice(record.engine, worldOf(record.state), a, d100) };
  }
  if (a.type === "combat.stabilize" || a.type === "combat.will") {
    if (a.dice) return draft;
    if (prior?.type === a.type) return prior.dice ? { ...draft, action: { ...a, dice: prior.dice } as Action } : draft;
    return { ...draft, action: rollCheckDice(record.engine, worldOf(record.state), a, d100) };
  }
  if (a.type === "encounter.loot") {
    if (a.dice) return draft;
    if (prior?.type === "encounter.loot" && prior.dice) return { ...draft, action: { ...a, dice: prior.dice } };
    return { ...draft, action: rollLootDice(record.engine, a, d100) };
  }
  if (a.type === "combat.aura") {
    if (a.saves) return draft;
    if (prior?.type === "combat.aura" && prior.saves) return { ...draft, action: { ...a, saves: prior.saves } };
    return { ...draft, action: rollCheckDice(record.engine, worldOf(record.state), a, d100) };
  }
  return draft;
}
