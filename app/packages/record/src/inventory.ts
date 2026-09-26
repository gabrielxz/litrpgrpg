/**
 * What characters carry, and the spoils a fight leaves for the party to divide (Items; The
 * System AI, "Loot": "the party divides what drops"). Items are named stacks: the record
 * keeps names and counts, and the table reads an item's rules from the Items chapter. Pills
 * are the exception the tracker spends (Core Mechanics, "Downed and Death"; Items, the pills).
 *
 * The GM gives and moves anything. A player moves their own character's items to anyone or
 * to the spoils, claims from the spoils for their own character, and uses or drops their own
 * (app/DESIGN.md, "The player-choice rule": dividing the spoils is the players' decision).
 */
import { type Effect, Rejected, type World } from "./fold.ts";

/** The holder of items no character has claimed. */
export const SPOILS = "spoils";

export interface Stack {
  name: string;
  count: number;
}

/** The GM grants items: a quest's reward, a starting kit, a find. */
export interface GiveItems {
  type: "item.give";
  to: string;
  items: Stack[];
}

/** Items change hands: between characters, into the spoils, or claimed from them. */
export interface MoveItems {
  type: "item.move";
  from: string;
  to: string;
  name: string;
  count: number;
}

/** Items used up, lost, or traded away outside the tracker. */
export interface RemoveItems {
  type: "item.remove";
  from: string;
  name: string;
  count: number;
  note?: string;
}

export type ItemAction = GiveItems | MoveItems | RemoveItems;

const key = (name: string) => name.trim().toLowerCase();

function holderName(world: World, holder: string): string {
  if (holder === SPOILS) return "the spoils";
  const c = world.characters.get(holder);
  if (!c) throw new Rejected(`no character ${holder}`);
  return c.name;
}

function checkStack(s: Stack) {
  if (!s.name.trim()) throw new Rejected("an item needs a name");
  if (!Number.isInteger(s.count) || s.count < 1) throw new Rejected(`a count is a whole number from 1, not ${s.count}`);
}

/** Adds to a holder's stack of the same name, or starts one. */
export function put(world: World, holder: string, s: Stack): Effect[] {
  checkStack(s);
  holderName(world, holder);
  const list = world.inventory.get(holder) ?? [];
  const found = list.find((x) => key(x.name) === key(s.name));
  if (found) found.count += s.count;
  else list.push({ name: s.name.trim(), count: s.count });
  world.inventory.set(holder, list);
  return holder === SPOILS ? [] : [{ kind: "item-received", characterId: holder, name: found?.name ?? s.name.trim(), count: s.count }];
}

/** Takes from a holder's stack; refuses what they do not hold. Returns the stack's name as held. */
export function take(world: World, holder: string, name: string, count: number): string {
  checkStack({ name, count });
  const who = holderName(world, holder);
  const list = world.inventory.get(holder) ?? [];
  const found = list.find((x) => key(x.name) === key(name));
  if (!found || found.count < count) throw new Rejected(`${who} ${holder === SPOILS ? "hold" : "holds"} ${found?.count ?? 0} ${name.trim()}`);
  found.count -= count;
  if (found.count === 0) list.splice(list.indexOf(found), 1);
  return found.name;
}

export function applyItems(world: World, a: ItemAction): Effect[] {
  switch (a.type) {
    case "item.give":
      if (!a.items.length) throw new Rejected("name at least one item");
      return a.items.flatMap((s) => put(world, a.to, s));
    case "item.move": {
      if (a.from === a.to) throw new Rejected("an item moves to someone else");
      if (a.to !== SPOILS && world.characters.get(a.to)?.dead) throw new Rejected(`${holderName(world, a.to)} is dead`);
      const name = take(world, a.from, a.name, a.count);
      return put(world, a.to, { name, count: a.count });
    }
    case "item.remove":
      take(world, a.from, a.name, a.count);
      return [];
  }
}

/** A player moves only what their own character holds, and claims from the spoils only for their own character. */
export function authorizeItemsPlayer(world: World, a: ItemAction, userId: string): void {
  const own = (holder: string) => world.characters.get(holder)?.playerId === userId;
  switch (a.type) {
    case "item.give":
      throw new Rejected("only the GM grants items");
    case "item.move":
      if (a.from === SPOILS ? own(a.to) : own(a.from)) return;
      throw new Rejected("a player moves only their own character's items, or claims from the spoils for them");
    case "item.remove":
      if (own(a.from)) return;
      throw new Rejected("a player removes only their own character's items");
  }
}
