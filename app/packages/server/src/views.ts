/**
 * What each person at the table receives. The GM sees the whole record. A player sees their
 * own characters' interfaces as What Can Be Seen lists them ("Your Own Interface"), the party
 * frame of each party those characters are in ("What a Party Shares"), and the notices about
 * those characters; nothing about the Hidden Vector Engine, the Saturation band (the GM
 * narrates it), assigned points still to be placed, or anyone else's sheet.
 *
 * The notice feed is rebuilt from the log on every view (app/DESIGN.md, "Decisions"): the
 * effects of every action that stands, in order. A voided action's notices leave the feed.
 */
import {
  type CampaignInfo,
  type CampaignRecord,
  type ClashResult,
  type Encounter,
  type PlayerClash,
  type EncounterView,
  type PlayerCombat,
  SPOILS,
  momentumForceOf,
  worldOf,
} from "@gradebreaker/record";
import type {
  Effect,
  FeedItem,
  GmView,
  InterfaceSheet,
  Member,
  PartyFrame,
  PlayerView,
  Role,
  RollView,
  Sheet,
  View,
} from "@gradebreaker/record";

export type { CampaignInfo, GmView, InterfaceSheet, LiveMessage, Member, PlayerView, Role, View } from "@gradebreaker/record";

/** The newest notices a player's feed carries. */
export const FEED_LENGTH = 100;
/** The newest rolls either view carries. */
export const ROLLS_LENGTH = 40;

/** Recent rolls that stand, newest first; for a player, the open ones without what the GM keeps. */
export function rollsFor(record: CampaignRecord, members: Member[], role: Role): RollView[] {
  const { effects, voided, rejected } = record.state;
  const skip = new Set([...voided, ...rejected.map((r) => r.envelope.id)]);
  const person = (id: string) => members.find((m) => m.userId === id)?.displayName ?? "someone";
  const out: RollView[] = [];
  for (let i = record.log.length - 1; i >= 0 && out.length < ROLLS_LENGTH; i--) {
    const env = record.log[i]!;
    const a = env.action;
    if (skip.has(env.id)) continue;
    if (
      a.type === "combat.momentum" ||
      a.type === "combat.seize" ||
      a.type === "combat.defend" ||
      a.type === "combat.stabilize" ||
      a.type === "combat.will" ||
      a.type === "combat.aura"
    ) {
      // Momentum, Clash, and check dice, newest first; a combatant's name as it stood in the fight.
      const rolls = (effects.get(env.id) ?? []).flatMap((x) =>
        x.kind === "momentum" || x.kind === "seized" || x.kind === "clash" || x.kind === "combat-check" ? x.rolls : [],
      );
      const kind = a.type === "combat.stabilize" || a.type === "combat.will" || a.type === "combat.aura" ? "check" : "clash";
      const names = new Map((record.state.encounter?.combatants ?? []).map((c) => [c.id, c]));
      for (const [j, r] of [...rolls.entries()].reverse()) {
        const c = names.get(r.combatantId);
        const v: RollView = {
          id: `${env.id}:${j}`,
          at: env.at,
          // One action rolls both sides of a Clash; the dice belong to the combatants, not to whoever recorded them.
          by: c?.name ?? r.combatantId,
          roller: c?.name ?? r.combatantId,
          label: r.label,
          rollKind: kind,
          natural: r.natural,
          surge: false,
          force: r.force,
          // Everything else in the total: Flanking, Exposed, Surge, the Cross-Grade Adjustment.
          modifier: r.total - r.natural.reduce((x, y) => x + y, 0) - r.force,
          total: r.total,
          exploded: r.natural.length > 1,
          entered: false,
          private: false,
        };
        if (c?.characterId) v.characterId = c.characterId;
        out.push(v);
      }
      continue;
    }
    if (a.type === "encounter.loot") {
      // One table roll per kill whose row has a chance.
      const loot = effects.get(env.id)?.find((x) => x.kind === "loot");
      if (!loot || loot.kind !== "loot") continue;
      const names = new Map((record.state.encounter?.combatants ?? []).map((c) => [c.id, c.name]));
      for (const [j, r] of [...loot.results.entries()].reverse()) {
        if (r.die === null) continue;
        out.push({
          id: `${env.id}:${j}`,
          at: env.at,
          by: person(env.actor.userId),
          roller: names.get(r.combatantId) ?? r.combatantId,
          label: `Loot (${r.row})`,
          rollKind: "table",
          natural: [r.die],
          surge: false,
          force: 0,
          modifier: 0,
          total: r.die,
          exploded: false,
          entered: false,
          private: false,
        });
      }
      continue;
    }
    if (a.type !== "dice.roll") continue;
    if (a.private && role !== "gm") continue;
    const e = effects.get(env.id)?.find((x) => x.kind === "rolled");
    if (!e || e.kind !== "rolled") continue;
    const roller = a.roller.kind === "character" ? (record.character(a.roller.characterId)?.name ?? a.roller.characterId) : a.roller.name;
    const v: RollView = {
      id: env.id,
      at: env.at,
      by: person(env.actor.userId),
      roller,
      rollKind: a.rollKind,
      natural: a.natural ?? [],
      surge: Boolean(a.surge),
      force: e.force,
      modifier: a.modifier,
      total: e.total,
      exploded: e.exploded,
      entered: Boolean(a.entered),
      private: Boolean(a.private),
    };
    if (e.characterId) v.characterId = e.characterId;
    if (a.label) v.label = a.label;
    if (a.roller.kind === "character" && a.roller.attribute) v.attribute = a.roller.attribute;
    if (a.dropped !== undefined) v.dropped = a.dropped;
    if (role === "gm") {
      v.battleMemory = e.battleMemory;
      if (a.resistance !== undefined) v.resistance = a.resistance;
      if (e.outcome) v.outcome = e.outcome;
    }
    out.push(v);
  }
  return out;
}

export function interfaceSheet(s: Sheet, record: CampaignRecord): InterfaceSheet {
  const st = record.state;
  const e = st.encounter && !st.encounter.ended ? st.encounter : null;
  const dying = e?.combatants.find((c) => c.characterId === s.id && !c.out);
  const name = (id: string) => st.characters.get(id)?.name ?? id;
  let party: PartyFrame | null = null;
  for (const p of st.parties.values()) {
    if (!p.members.includes(s.id)) continue;
    party = {
      id: p.id,
      members: p.members.map((m) => {
        const sh = record.sheet(m)!;
        return { id: m, name: sh.name, hp: sh.hp, maxHp: sh.maxHp, aether: sh.aether, downed: sh.downed };
      }),
    };
  }
  return {
    id: s.id,
    name: s.name,
    background: s.background,
    raw: s.raw,
    force: s.force,
    hp: s.hp,
    maxHp: s.maxHp,
    downed: s.downed,
    dead: s.dead,
    vitalCoherence: dying?.downed && !dying.downed.stabilized ? dying.downed.coherence : null,
    aether: s.aether,
    maxAether: s.maxAether,
    surgeCost: s.surgeCost,
    storedVe: s.storedVe,
    tolerance: s.tolerance,
    level: s.level,
    grade: s.grade,
    refinedVe: s.refinedVe,
    veToNextLevel: s.veToNextLevel,
    freePoints: s.freePoints,
    party,
    invitations: st.invites.filter((i) => i.toId === s.id).map((i) => ({ id: i.id, fromId: i.fromId, fromName: name(i.fromId) })),
    invited: st.invites.filter((i) => i.fromId === s.id).map((i) => ({ id: i.id, toId: i.toId, toName: name(i.toId) })),
    items: (st.inventory.get(s.id) ?? []).map((x) => ({ ...x })),
  };
}

/**
 * The effects the System announces to a character. Anything else (Saturation, which the GM
 * narrates; creation; reassignment; a held message; a void) reaches the GM only.
 */
const ANNOUNCED: ReadonlySet<Effect["kind"]> = new Set([
  "ve-acquired",
  "level",
  "aether-refilled",
  "healed-full",
  "collapsed",
  "temporary-returned",
  "points-placed",
  "party-invited",
  "party-declined",
  "party-formed",
  "party-joined",
  "party-left",
  "party-disbanded",
  "party-member-died",
  "message",
  "combat-downed",
  "vital-coherence",
  "stabilized",
  "revived",
  "pill",
  "kill-confirmed",
  "item-received",
]);

/** Effects a player is shown: the announced ones about their own characters. */
export function noticesFor(effects: Effect[], ownCharacterIds: ReadonlySet<string>): Effect[] {
  // A pill that wakes a Downed character is announced once, as the waking.
  const woken = new Set(effects.flatMap((e) => (e.kind === "revived" && e.characterId ? [e.characterId] : [])));
  return effects.filter(
    (e) =>
      ANNOUNCED.has(e.kind) &&
      "characterId" in e &&
      e.characterId !== undefined &&
      ownCharacterIds.has(e.characterId) &&
      // A pill that did nothing brings no notice.
      !(e.kind === "pill" && (e.restored === 0 || woken.has(e.characterId!))),
  );
}

/** The feed for a set of characters: every standing action's notices about them, newest first. */
export function feedFor(record: CampaignRecord, own: ReadonlySet<string>): FeedItem[] {
  const out: FeedItem[] = [];
  const { effects } = record.state;
  for (let i = record.log.length - 1; i >= 0 && out.length < FEED_LENGTH; i--) {
    const env = record.log[i]!;
    const shown = noticesFor(effects.get(env.id) ?? [], own);
    // Newest first: an action's last effect is the latest thing that happened.
    for (let j = shown.length - 1; j >= 0 && out.length < FEED_LENGTH; j--) {
      const effect = shown[j]!;
      out.push({ key: `${env.id}:${j}`, at: env.at, characterId: (effect as { characterId: string }).characterId, effect });
    }
  }
  return out;
}

/** The running fight with each combatant's HP and Momentum Force read where they live. */
export function encounterView(record: CampaignRecord, which: "running" | "aftermath" = "running"): EncounterView | null {
  const e = record.state.encounter;
  if (!e) return null;
  if (which === "running" ? e.ended : !e.ended || e.settled) return null;
  const world = worldOf(record.state);
  return {
    ...e,
    combatants: e.combatants.map((c) => {
      const sheet = c.characterId ? record.sheet(c.characterId) : undefined;
      const hp = sheet ? sheet.hp : (c.hp ?? 0);
      const maxHp = sheet ? sheet.maxHp : (c.maxHp ?? 0);
      return { ...c, hp, maxHp, momentumForce: momentumForceOf(record.engine, world, c) };
    }),
  };
}

function playerClash(engine: CampaignRecord["engine"], e: Encounter, cl: { attackerId: string; defenderId: string; label?: string; cornered?: boolean }, stage: PlayerClash["stage"], r?: ClashResult): PlayerClash {
  const who = (id: string) => e.combatants.find((c) => c.id === id);
  const out: PlayerClash = {
    attackerId: cl.attackerId,
    attackerName: who(cl.attackerId)?.name ?? cl.attackerId,
    defenderId: cl.defenderId,
    defenderName: who(cl.defenderId)?.name ?? cl.defenderId,
    stage,
  };
  if (cl.label) out.label = cl.label;
  if (cl.cornered) out.cornered = true;
  if (r) {
    Object.assign(out, { attackTotal: r.attackTotal, defenseTotal: r.defenseTotal, margin: r.margin, attackerWins: r.attackerWins, turnedAside: r.turnedAside });
    if (who(cl.defenderId)?.characterId) {
      out.yieldCap = r.yieldCap;
      out.damageMultiplier = engine.damageMultiplier(who(cl.attackerId)?.grade ?? "F");
    }
    if (r.yielded !== undefined) Object.assign(out, { yielded: r.yielded, damage: r.damage, drivenBack: r.drivenBack });
  }
  return out;
}

export function playerCombat(record: CampaignRecord): PlayerCombat | null {
  const e = record.state.encounter;
  if (!e || e.ended) return null;
  const side = (id: string) => ({ id, name: e.sides.find((s) => s.id === id)?.name ?? id });
  return {
    name: e.name,
    round: e.round,
    zones: e.zones,
    clash: e.clash ? playerClash(record.engine, e, e.clash, e.clash.stage, e.clash.result) : null,
    lastClash: e.lastClash ? playerClash(record.engine, e, e.lastClash, "resolved", e.lastClash) : null,
    order: (e.round ? e.order : e.sides.map((s) => s.id)).map(side),
    turnSide: e.round ? (e.order[e.turn] ?? null) : null,
    pendingShift: e.pending?.sideId ?? null,
    combatants: e.combatants.map((c) => ({
      id: c.id,
      name: c.name,
      sideId: c.sideId,
      acting: e.acting === c.id,
      acted: c.acted,
      out: c.out,
      zoneId: c.zoneId,
      exposed: Boolean(c.exposed),
      downed: Boolean(c.downed),
      stabilized: Boolean(c.downed?.stabilized),
      suppressed: c.aura === "suppressed",
      surprise: Boolean(e.round === 0 && e.surprise?.includes(c.id)),
      ...(c.characterId ? { characterId: c.characterId, beats: c.beats, beatsPerTurn: c.beatsPerTurn, pills: { ...c.pills } } : {}),
    })),
  };
}

export function viewFor(
  record: CampaignRecord,
  campaign: CampaignInfo,
  members: Member[],
  who: { userId: string; role: Role },
): View {
  const seq = record.log.length;
  const sheets = [...record.sheets().values()];
  if (who.role === "gm") {
    const st = record.state;
    return {
      role: "gm",
      campaign,
      members,
      seq,
      characters: sheets,
      rejected: record.rejected.map((r) => ({ id: r.envelope.id, seq: r.envelope.seq, reason: r.reason })),
      parties: [...st.parties.values()],
      invites: st.invites,
      held: st.held,
      rolls: rollsFor(record, members, "gm"),
      encounter: encounterView(record),
      aftermath: encounterView(record, "aftermath"),
      inventory: Object.fromEntries([...st.inventory].map(([k, v]) => [k, v.map((x) => ({ ...x }))])),
    };
  }
  const own = sheets.filter((s) => s.playerId === who.userId);
  const ownIds = new Set(own.map((s) => s.id));
  return {
    role: "player",
    campaign,
    members,
    characters: own.map((s) => interfaceSheet(s, record)),
    roster: sheets.filter((s) => s.playerId !== undefined && !ownIds.has(s.id) && !s.dead).map((s) => ({ id: s.id, name: s.name })),
    feed: feedFor(record, ownIds),
    rolls: rollsFor(record, members, "player"),
    combat: playerCombat(record),
    spoils: (record.state.inventory.get(SPOILS) ?? []).map((x) => ({ ...x })),
  };
}
