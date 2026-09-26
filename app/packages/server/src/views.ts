/**
 * What each person at the table receives. The GM sees the whole record. A player sees their
 * own characters' interfaces as What Can Be Seen lists them ("Your Own Interface"), and the
 * notices about those characters; nothing about the Hidden Vector Engine, the Saturation band
 * (the GM narrates it), System points still to be placed, or anyone else's sheet. The party
 * frame arrives with the party itself.
 */
import type {
  CampaignInfo,
  CampaignRecord,
  Effect,
  GmView,
  InterfaceSheet,
  Member,
  PlayerView,
  Role,
  Sheet,
  View,
} from "@gradebreaker/record";

export type { CampaignInfo, GmView, InterfaceSheet, LiveMessage, Member, PlayerView, Role, View } from "@gradebreaker/record";

export function interfaceSheet(s: Sheet): InterfaceSheet {
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
    return {
      role: "gm",
      campaign,
      members,
      seq,
      characters: sheets,
      rejected: record.rejected.map((r) => ({ id: r.envelope.id, seq: r.envelope.seq, reason: r.reason })),
    };
  }
  return {
    role: "player",
    campaign,
    members,
    characters: sheets.filter((s) => s.playerId === who.userId).map(interfaceSheet),
  };
}

/** Effects a player is shown: those about their own characters, less the ones only the GM reads. */
const GM_ONLY: ReadonlySet<Effect["kind"]> = new Set(["saturation", "voided"]);

export function noticesFor(effects: Effect[], ownCharacterIds: ReadonlySet<string>): Effect[] {
  return effects.filter((e) => !GM_ONLY.has(e.kind) && "characterId" in e && ownCharacterIds.has(e.characterId));
}

