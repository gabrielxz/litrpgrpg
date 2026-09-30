/**
 * Which effects reach a player as the System's notices. The server builds each player's feed with
 * it, and the GM's preview of an action shows each character's notices with it, so the two agree.
 */
import type { Effect } from "./fold.ts";

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
  "treasure-absorbed",
  "kill-confirmed",
  "mark",
  "item-received",
  "title-conferred",
  "title-echoed",
  "title-released",
  "quest-offered",
  "quest-issued",
  "quest-accepted",
  "quest-refused",
  "quest-shared",
  "quest-progress",
  "quest-revealed",
  "quest-completed",
  "quest-failed",
  "memory-granted",
  "vision",
  "resonance",
  "insight",
  "principle-crystallized",
  "distillation-offered",
  "distilled",
  "principle-refined",
  "classification",
  "class-accepted",
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
      !(e.kind === "pill" && (e.restored === 0 || woken.has(e.characterId!))) &&
      // Nor does a treasure of another Grade.
      !(e.kind === "treasure-absorbed" && e.noEffect),
  );
}
