/**
 * The in-game clock: the campaign's day and hour, counted from Integration (Day 1, 00:00).
 *
 * The GM sets the clock once and advances it as the fiction moves. A day runs from one dawn to
 * the next for anything "once a day" (`classes.yaml` `once_a_day_resets`); dawn is the rules'
 * `dawn_hour` unless the GM sets another when setting the clock. Crossing midnight into Day N
 * means every living character has survived N − 1 days (the count behind Week One). A quest
 * issued with a window in hours falls due that many hours later; passing a due time is shown to
 * the GM, and the quest stays open until the GM fails or expires it. Nothing here reaches a
 * player except a quest's hours remaining, which its holder's log shows.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Effect, Rejected, type World } from "./fold.ts";
import { countMax } from "./titles.ts";

export const MINUTES_PER_DAY = 24 * 60;

export interface Clock {
  /** Minutes since Day 1, 00:00. */
  at: number;
  /** The hour the clock reads dawn. */
  dawn: number;
}

/** Sets the clock: the day and hour it reads now. GM only. */
export interface SetClock {
  type: "clock.set";
  day: number;
  hour: number;
  minute?: number;
  /** Dawn's hour where the party is; absent, the rules' `dawn_hour`. */
  dawnHour?: number;
}

/** Moves the clock forward. GM only. */
export interface AdvanceClock {
  type: "clock.advance";
  minutes: number;
}

export type ClockAction = SetClock | AdvanceClock;

export const dayOf = (at: number) => Math.floor(at / MINUTES_PER_DAY) + 1;

/** "Day 3, 14:05". */
export function clockLine(at: number): string {
  const m = at % MINUTES_PER_DAY;
  return `Day ${dayOf(at)}, ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes from `at` to the next dawn, never 0: at dawn exactly, the next one. */
export function toNextDawn(clock: Clock): number {
  const m = clock.at % MINUTES_PER_DAY;
  const d = clock.dawn * 60;
  return m < d ? d - m : MINUTES_PER_DAY - m + d;
}

/** Dawns in the half-open span (from, to]. */
function dawnsBetween(from: number, to: number, dawn: number): number {
  const count = (t: number) => Math.floor((t - dawn * 60) / MINUTES_PER_DAY);
  return Math.max(0, count(to) - count(from));
}

function move(world: World, from: number | null, clock: Clock): Effect[] {
  const out: Effect[] = [{ kind: "clock", from, to: clock.at }];
  if (from !== null && clock.at > from) {
    const dawns = dawnsBetween(from, clock.at, clock.dawn);
    if (dawns) out.push({ kind: "dawn", count: dawns });
    for (const q of world.quests.values()) {
      if ((q.status === "active" || q.status === "offered") && q.due !== undefined && q.due > from && q.due <= clock.at) {
        out.push({ kind: "quest-due", questId: q.id });
      }
    }
  }
  // Every living character has survived the days before today.
  for (const c of world.characters.values()) if (!c.dead) countMax(c, "days-survived", dayOf(clock.at) - 1);
  return out;
}

export function applyClock(engine: Engine, world: World, a: ClockAction): Effect[] {
  const from = world.clock?.at ?? null;
  if (a.type === "clock.set") {
    const minute = a.minute ?? 0;
    if (!Number.isInteger(a.day) || a.day < 1) throw new Rejected("the day is a whole number from 1");
    if (!Number.isInteger(a.hour) || a.hour < 0 || a.hour > 23) throw new Rejected("the hour runs 0 to 23");
    if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Rejected("the minute runs 0 to 59");
    const dawn = a.dawnHour ?? (engine.rules.classes.permission.dawn_hour as number);
    if (!Number.isInteger(dawn) || dawn < 0 || dawn > 23) throw new Rejected("dawn's hour runs 0 to 23");
    world.clock = { at: (a.day - 1) * MINUTES_PER_DAY + a.hour * 60 + minute, dawn };
    return move(world, from, world.clock);
  }
  if (!world.clock) throw new Rejected("set the clock first");
  if (!Number.isInteger(a.minutes) || a.minutes < 1) throw new Rejected("the clock moves forward by whole minutes");
  world.clock = { ...world.clock, at: world.clock.at + a.minutes };
  return move(world, from, world.clock);
}
