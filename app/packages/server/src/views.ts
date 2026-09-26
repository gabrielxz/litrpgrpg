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
import type {
  CampaignInfo,
  CampaignRecord,
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
    if (a.type !== "dice.roll" || skip.has(env.id)) continue;
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
  "message",
]);

/** Effects a player is shown: the announced ones about their own characters. */
export function noticesFor(effects: Effect[], ownCharacterIds: ReadonlySet<string>): Effect[] {
  return effects.filter((e) => ANNOUNCED.has(e.kind) && "characterId" in e && e.characterId !== undefined && ownCharacterIds.has(e.characterId));
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
    };
  }
  const own = sheets.filter((s) => s.playerId === who.userId);
  const ownIds = new Set(own.map((s) => s.id));
  return {
    role: "player",
    campaign,
    members,
    characters: own.map((s) => interfaceSheet(s, record)),
    roster: sheets.filter((s) => s.playerId !== undefined && !ownIds.has(s.id)).map((s) => ({ id: s.id, name: s.name })),
    feed: feedFor(record, ownIds),
    rolls: rollsFor(record, members, "player"),
  };
}
