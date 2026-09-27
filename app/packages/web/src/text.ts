/**
 * Words for the record. `describe` and `effectLine` are the GM's register: plain bookkeeping.
 * `noticeLine` is the System's register for the player interface: clinical, in-world units
 * only (never round, roll, or check), set in bare italics by the caller. The notice wording
 * is a first draft for Gabriel's voice pass (The System AI, "The Voice of the System").
 */
import { type Action, type Change, type Effect, MINUTES_PER_DAY, clockLine } from "@gradebreaker/record";

export const ATTRIBUTES = ["STR", "DEX", "FOR", "HRT", "POW", "PER", "CHA"] as const;

export const ATTRIBUTE_NAMES: Record<string, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  FOR: "Fortitude",
  HRT: "Heart",
  POW: "Power",
  PER: "Perception",
  CHA: "Charisma",
};

export type Names = (characterId: string) => string;

/**
 * The table's words, which the System never says (rules/system-ai.yaml, `voice.units`). The
 * composer warns when a message uses one; some are ordinary English too ("turn back"), so the
 * GM decides.
 */
export const TABLE_WORDS = /\b(rounds?|beats?|turns?|rolls?|rolled|dice|die|margins?|resistance|checks?|DC)\b/gi;

export function tableWordsIn(text: string): string[] {
  return [...new Set([...text.matchAll(TABLE_WORDS)].map((m) => m[0].toLowerCase()))];
}

const stack = (s: { name: string; count: number }) => (s.count === 1 ? s.name : `${s.name} ×${s.count}`);
const holder = (h: string, name: Names) => (h === "spoils" ? "the spoils" : name(h));

/** A count toward an Achievement title, in words: "locks-picked" is "locks picked". */
export const counterLabel = (key: string) => key.replace(/-/g, " ");

/** A weapon shape as the System names it: "axes and hammers" is Axes and Hammers. */
const titleCase = (s: string) =>
  s
    .split(" ")
    .map((w) => (w === "and" || w === "to" ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");

const clip = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
const placement = (p: Record<string, number>) =>
  Object.entries(p)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k} ${signed(v)}`)
    .join(", ");

/** A quest in the GM's log: its code and title by its key, or the code an older action named it by. */
const questName = (id: string, name: Names) => {
  const n = name(id);
  return n === id ? `[${id}]` : n;
};

/** "3 hours 20 minutes". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  return [h ? part(h, "hour") : "", m ? part(m, "minute") : ""].filter(Boolean).join(" ") || "0 minutes";
}

/** One line for the GM's log. */
export function describe(
  a: Action,
  name: Names,
  seqOf: (id: string) => number | undefined,
  person: (userId: string) => string = () => "a player",
): string {
  switch (a.type) {
    case "character.create":
      return `Created ${a.name} (point buy)`;
    case "character.pregen":
      return `Created ${a.pregen} (ready-made)`;
    case "character.assign":
      return `${name(a.characterId)} handed to ${a.playerId ? person(a.playerId) : "the GM"}`;
    case "ve.award": {
      const who = a.awards.map((w) => `${name(w.characterId)} ${w.ve}`).join(", ");
      const b = a.basis;
      const why =
        b.kind === "kill"
          ? `kill${b.creature ? `: ${b.creature}` : ""}`
          : b.kind === "quest"
            ? `quest${b.questId ? ` ${b.questId}` : ""}`
            : b.kind === "core"
              ? b.core
              : b.kind === "ambient"
                ? `ambient, ${b.hours} h`
                : b.kind === "hidden-achievement"
                  ? "Hidden Achievement"
                  : b.note;
      return `VE: ${who} (${why})`;
    }
    case "consolidation.rest":
      return `Consolidation${a.highDensity ? " (high density)" : ""}: ${a.rests
        .map((r) => `${name(r.characterId)} ${r.hours} h${r.interrupted ? ", interrupted" : ""}`)
        .join("; ")}`;
    case "saturation.collapse":
      return `Collapse: ${name(a.characterId)} (${a.attribute})`;
    case "points.system":
      return `Assigned points, Level ${a.level}: ${name(a.characterId)} ${placement(a.placement)}`;
    case "points.free":
      return `Free points: ${name(a.characterId)} ${placement(a.placement)}`;
    case "hp.change":
      return `HP: ${name(a.characterId)} ${signed(a.delta)}`;
    case "aether.change":
      return `Aether: ${name(a.characterId)} ${signed(a.delta)}`;
    case "party.invite":
      return `Party: ${name(a.fromId)} invites ${name(a.toId)}`;
    case "party.answer": {
      const seq = seqOf(a.inviteId);
      return `Party: invitation ${seq === undefined ? "" : `#${seq + 1} `}${a.accept ? "accepted" : "declined"}`;
    }
    case "party.leave":
      return `Party: ${name(a.characterId)} leaves`;
    case "party.disband":
      return "Party disbanded";
    case "message.send":
      return `System message${a.hold ? " held" : ""} to ${a.to.map(name).join(", ")}: “${clip(a.text)}”`;
    case "message.release": {
      const seq = seqOf(a.messageId);
      return `Sent held message ${seq === undefined ? "" : `#${seq + 1}`}`.trim();
    }
    case "dice.roll": {
      const who = a.roller.kind === "character" ? name(a.roller.characterId) : a.roller.name;
      const dice = (a.natural ?? []).join(" + ");
      return `${a.private ? "Private roll" : "Roll"}: ${who}${a.label ? `, ${a.label}` : ""} (${dice}${a.entered ? ", by hand" : ""})`;
    }
    case "combat.start":
      return `Fight begins: ${a.name} (${a.combatants.length} combatants)`;
    case "combat.add":
      return `Joins the fight: ${a.combatant.name ?? name(a.combatant.characterId ?? a.combatant.combatantId)}`;
    case "combat.remove":
      return `Out of the fight: ${name(a.combatantId)}`;
    case "combat.momentum":
      return "Initial Momentum rolled";
    case "combat.seize":
      return `${name(a.combatantId)} tries to seize Momentum`;
    case "combat.reversal":
      return "Decisive Tactical Reversal called";
    case "combat.act":
      return `${name(a.combatantId)} acts`;
    case "combat.beat":
      return `${name(a.combatantId)}: ${a.what}`;
    case "combat.done":
      return `${name(a.combatantId)} is done`;
    case "combat.round":
      return "Next round";
    case "combat.hp":
      return `${name(a.combatantId)}: HP ${signed(a.delta)}`;
    case "combat.end":
      return "Fight ends";
    case "combat.attack":
      return `${a.free ? "Free strike" : "Attack"}: ${name(a.attackerId)} at ${name(a.defenderId)}${a.label ? ` (${a.label})` : ""}`;
    case "combat.defend":
      return "Defense rolled";
    case "combat.resolve":
      return a.yield ? `Yield ${a.yield} Beat${a.yield === 1 ? "" : "s"}` : "Takes the hit";
    case "combat.move":
      return `${name(a.combatantId)} ${a.forced ? "is placed" : "moves"}`;
    case "combat.exposed":
      return `${name(a.combatantId)}: ${a.exposed ? "Exposed" : "no longer Exposed"}`;
    case "combat.zones":
      return `Zones: ${a.zones.map((z) => z.name).join(", ")}`;
    case "combat.fate":
      return `Ruling: ${name(a.combatantId)} ${a.fate === "dead" ? "dies" : "is stabilized"}`;
    case "combat.stabilize":
      return `${name(a.combatantId)} tries to stabilize ${name(a.targetId)}`;
    case "combat.execute":
      return `${name(a.combatantId)} executes ${name(a.targetId)}`;
    case "combat.pill":
      return a.combatantId === a.targetId ? `${name(a.combatantId)} takes a ${a.pill}` : `${name(a.combatantId)} gives ${name(a.targetId)} a ${a.pill}`;
    case "combat.aura":
      return `Aura Pressure: ${name(a.entityId)}${a.flare ? " flares" : ""} (${a.flaring ? "Hard" : "Moderate"})`;
    case "combat.will":
      return `${name(a.combatantId)} makes the Will Save again (${
        a.reason === "principle" ? "pushes back" : a.reason === "intervention" ? `${name(a.helperId ?? "")} intervenes` : "the entity is hurt or distracted"
      })`;
    case "combat.suppress":
      return `${name(a.combatantId)}: ${a.suppressed ? "Suppressed" : "no longer Suppressed"}`;
    case "combat.surprise":
      return `Surprise Beat: ${a.combatantIds.map(name).join(", ")}`;
    case "encounter.loot":
      return `Loot rolled for ${a.kills.map((k) => name(k.combatantId)).join(", ")}`;
    case "encounter.settle":
      return `Fight settled: ${a.kills.length} kill${a.kills.length === 1 ? "" : "s"}, ${a.awards.map((w) => `${name(w.characterId)} ${w.ve} VE`).join(", ") || "no VE"}${
        a.spoils.length ? `; spoils: ${a.spoils.map(stack).join(", ")}` : ""
      }`;
    case "item.give":
      return `Items to ${holder(a.to, name)}: ${a.items.map(stack).join(", ")}`;
    case "item.move":
      return `${holder(a.from, name)} → ${holder(a.to, name)}: ${stack(a)}`;
    case "item.remove":
      return `${holder(a.from, name)} uses up ${stack(a)}${a.note ? ` (${a.note})` : ""}`;
    case "proficiency.mark":
      return `Mark by hand: ${name(a.characterId)}, ${a.shape}`;
    case "title.grant":
      return `Title for ${name(a.characterId)}: ${a.title.name ?? a.title.catalog}`;
    case "title.choose":
      return `${name(a.characterId)} places a title's point in ${a.attribute}`;
    case "title.wear":
      return `${name(a.characterId)} ${a.worn ? "wears" : "hides"} a Bestowed title`;
    case "title.reveal":
      return `${name(a.characterId)} reveals a Hidden Achievement`;
    case "title.release":
      return `${name(a.characterId)}: a negative title released${a.replacement ? `, becoming ${a.replacement.name ?? a.replacement.catalog}` : ""}`;
    case "title.dismiss":
      return `${name(a.characterId)}: ${a.catalog} passed on`;
    case "counter.tick":
      return `${name(a.characterId)}: ${counterLabel(a.counter)} +${a.count}`;
    case "quest.issue":
      return `Quest ${a.quest.category === "Mandate" || a.quest.category === "Hidden" ? "issued" : "offered"}: [${a.quest.id}] ${a.quest.title} to ${a.to.map(name).join(", ")}`;
    case "quest.answer":
      return `${name(a.characterId)} ${a.accept ? "accepts" : "refuses"} ${questName(a.questId, name)}`;
    case "quest.share":
      return `${name(a.characterId)} shares ${questName(a.questId, name)} with the party`;
    case "quest.progress":
      return `${questName(a.questId, name)} ${a.by > 0 ? "+" : ""}${a.by}`;
    case "quest.reveal":
      return `${questName(a.questId, name)} partly revealed as "${a.name}"`;
    case "quest.complete":
      return `${questName(a.questId, name)} complete: ${a.awards.map((w) => `${name(w.characterId)} ${w.ve} VE`).join(", ") || "no VE"}`;
    case "quest.fail":
      return `${questName(a.questId, name)} failed`;
    case "quest.withdraw":
      return `${questName(a.questId, name)} expires`;
    case "pill.take":
      return a.characterId === a.targetId ? `${name(a.characterId)} takes a ${a.pill}` : `${name(a.characterId)} gives ${name(a.targetId)} a ${a.pill}`;
    case "hve.sweep": {
      const tallies = a.sheets.reduce((n, s) => n + s.moments.reduce((m, x) => m + x.weight + (x.secondary ? x.weight - 1 : 0), 0), 0);
      return `HVE sweep${a.label ? ` (${a.label})` : ""}: ${a.sheets.map((s) => name(s.characterId)).join(", ")}, ${tallies} ${tallies === 1 ? "tally" : "tallies"}`;
    }
    case "hve.deep":
      return `${name(a.characterId)}: Deep tallies copied across`;
    case "memory.grant":
      return `${name(a.characterId)}: Battle Memory Card granted (${a.text})`;
    case "memory.pass":
      return `${name(a.characterId)}: Battle Memory Card withheld (the Downing taught nothing)`;
    case "memory.choose":
      return `${name(a.characterId)} ${a.chosen ? "will meditate on" : "sets aside"} a Battle Memory`;
    case "memory.meditate":
      return `${name(a.characterId)} meditates: ${a.ip} Insight toward ${a.family}`;
    case "insight.award":
      return `${name(a.characterId)}: ${a.ip} Insight toward ${a.family} (${a.source})`;
    case "principle.name":
      return `${name(a.characterId)}: ${a.family} crystallizes as ${a.name}`;
    case "principle.distill":
      return `${name(a.characterId)}: ${a.quiet ? "Distillation offered" : a.refine ? "Refinement" : "Distillation"} (${a.family})`;
    case "principle.answer":
      return `${name(a.characterId)} ${a.accept ? "accepts" : "vetoes"} the offered articulation`;
    case "class.offer":
      return `Class offers to ${name(a.characterId)}: ${a.offers.map((o) => o.name).join(", ")}`;
    case "class.accept":
      return `${name(a.characterId)} accepts ${a.name}`;
    case "class.use":
      return `${name(a.characterId)} uses the class's once-a-day permission`;
    case "class.technique":
      return `${name(a.characterId)} uses the class technique${a.targetId ? ` on ${name(a.targetId)}` : ""}${a.drawback ? ` (${a.drawback === "health" ? "10 Health" : "Exposed"})` : ""}`;
    case "prep.save":
      return a.pack ? `Loaded the ${a.pack} pack into Prep (${a.items.length} items)` : `Prepared: ${a.items.map((i) => i.title).join(", ")}`;
    case "prep.remove":
      return `Removed from Prep: ${a.prepIds.join(", ")}`;
    case "clock.set":
      return `Clock set to ${clockLine((a.day - 1) * MINUTES_PER_DAY + a.hour * 60 + (a.minute ?? 0))}${a.dawnHour !== undefined ? `, dawn at ${String(a.dawnHour).padStart(2, "0")}:00` : ""}`;
    case "clock.advance":
      return `Clock forward ${duration(a.minutes)}`;
    case "session.start":
      return `Session started${a.label ? `: ${a.label}` : ""}${a.present.length ? ` (${a.present.map(name).join(", ")})` : ""}`;
    case "session.attend":
      return `${name(a.characterId)} ${a.present ? "joins" : "leaves"} the session`;
    case "session.end":
      return `Session ended${a.summary ? `: ${a.summary}` : ""}`;
    case "session.summary":
      return a.summary.trim() ? `Session summary: ${a.summary}` : "Session summary cleared";
    case "event.log":
      return `Event: ${a.summary}${a.participants.length ? ` (${a.participants.map(name).join(", ")})` : ""}${a.entries?.length ? `, ${a.entries.length} HVE ${a.entries.length === 1 ? "entry" : "entries"}` : ""}`;
    case "void": {
      const seq = seqOf(a.targetId);
      const target = seq === undefined ? "an action" : `#${seq + 1}`;
      return `${a.reason === "correction" ? "Corrected" : "Undid"} ${target}${a.note ? `: ${a.note}` : ""}`;
    }
  }
}

/** One line for a preview or the GM's feed. */
export function effectLine(e: Effect, name: Names): string | null {
  switch (e.kind) {
    case "hve-swept": {
      const cur = Object.entries(e.current).filter(([, n]) => n > 0).map(([p, n]) => `${p} ${n}`);
      return `${name(e.characterId)}: Current ${cur.join(", ") || "empty"}${e.added.length ? `; Deep ${e.added.map((p) => `${p} +1`).join(", ")}` : "; Deep unchanged"}`;
    }
    case "hve-copied":
      return `${name(e.characterId)}: Deep tallies set from the copied sheet`;
    case "classification":
      return `${name(e.characterId)} is offered ${e.offers.map((o) => o.name).join(", ")}`;
    case "class-accepted":
      return `${name(e.characterId)} holds ${e.name}: ${e.lead} +${e.bonus}`;
    case "class-used":
      return `${name(e.characterId)} uses ${e.name}`;
    case "technique-used":
      return `${name(e.characterId)} uses ${e.name}, its cost paid`;
    case "prepared":
      return `${e.count} item${e.count === 1 ? "" : "s"} in Prep${e.pack ? ` from the ${e.pack} pack` : ""}`;
    case "memory-granted":
      return `${name(e.characterId)} receives a Battle Memory Card`;
    case "vision":
      return `${name(e.characterId)} sees: ${e.text}`;
    case "resonance":
      return `${name(e.characterId)}: Resonance accruing, ${e.family} ${e.ip}/${e.of}${e.ip >= e.of ? " (crystallizes: name the Principle)" : ""}`;
    case "insight":
      return `${name(e.characterId)}: Insight ${e.line}`;
    case "principle-crystallized":
      return `${name(e.characterId)}: Initial Insight, ${e.name}`;
    case "distillation-offered":
      return `${name(e.characterId)} is offered a Distillation of ${e.name}, to accept or veto`;
    case "distilled":
      return `${name(e.characterId)}: ${e.name} reaches ${e.tier}${e.grant ? `; ${e.grant}` : ""}`;
    case "principle-refined":
      return `${name(e.characterId)}: ${e.from} refined into ${e.name}`;
    case "clock":
      return `The clock reads ${clockLine(e.to)}`;
    case "dawn":
      return e.count === 1 ? "Dawn passes: once-a-day uses return" : `${e.count} dawns pass: once-a-day uses return`;
    case "quest-due":
      return `[${e.code}] reaches its time limit (fail or expire it from Quests)`;
    case "session-started":
      return `${e.name} starts`;
    case "session-ended":
      return `${e.name} ends`;
    case "event-logged":
      return `Event logged: ${e.summary}`;
    case "created":
      return null; // the preview's sheet changes already show the new character
    case "reassigned":
      return `${name(e.characterId)} goes ${e.playerId ? "to a new player" : "to the GM"}`;
    case "ve-acquired":
      return `${name(e.characterId)} stores ${e.ve} VE`;
    case "saturation":
      return `${name(e.characterId)}: Saturation ${e.from} → ${e.to} (narrate the symptoms; the System sends no notice)`;
    case "aether-refilled":
      return `${name(e.characterId)}: Aether refills at hour ${e.hour}`;
    case "level":
      return `${name(e.characterId)} reaches Level ${e.level}${e.hour ? ` at hour ${e.hour}` : ""}`;
    case "healed-full":
      return `${name(e.characterId)}: HP full at hour ${e.hour}`;
    case "collapsed":
      return `${name(e.characterId)} collapses: loses 1 ${e.attribute} until a clean Consolidation; ${e.hours} h of involuntary Consolidation`;
    case "temporary-returned":
      return `${name(e.characterId)}: the lost ${e.attribute} point returns`;
    case "points-placed":
      return `${name(e.characterId)}: ${e.by === "system" ? "assigned" : "free"} points ${placement(e.placement) || "none"}${e.lost ? `; lost past the cap: ${placement(e.lost)}` : ""}`;
    case "party-invited":
      return `${e.fromName} invites ${name(e.characterId)} to a party`;
    case "party-declined":
      return `${e.byName} declines ${name(e.characterId)}'s invitation`;
    case "party-formed":
      return `${name(e.characterId)} is in a party with ${e.withNames.join(", ")}`;
    case "party-joined":
      return e.memberId === e.characterId ? `${e.memberName} joins the party` : null;
    case "party-left":
      return e.memberId === e.characterId ? `${e.memberName} leaves the party` : null;
    case "party-disbanded":
      return `${name(e.characterId)}: the party is disbanded`;
    case "message":
      return `${name(e.characterId)} receives the message`;
    case "message-held":
      return `Held for ${e.to.map(name).join(", ")}; nobody sees it until you send it`;
    case "combat-started":
    case "combat-ended":
      return null;
    case "momentum":
      return `Momentum: ${e.totals.map((t) => t.total).join(" against ")}`;
    case "seized":
      return `${name(e.combatantId)} ${e.won ? "seizes" : "fails to seize"} Momentum, ${e.total} against ${e.against}`;
    case "momentum-shifted":
      return `Momentum shifts (${e.by === "seize" ? "Seize" : "Reversal"})`;
    case "combat-hp":
      return `${name(e.combatantId)}: HP ${e.from} → ${e.to}`;
    case "combat-downed":
      return `${name(e.combatantId)} is Downed: vital coherence ${e.coherence}`;
    case "vital-coherence":
      return `${name(e.combatantId)}: vital coherence ${e.coherence}`;
    case "stabilized":
      return `${name(e.combatantId)} is stabilized`;
    case "revived":
      return `${name(e.combatantId)} wakes at ${e.hp} HP`;
    case "combat-died":
      return `${name(e.combatantId)} dies${
        e.cause === "annihilated"
          ? ": annihilated"
          : e.cause === "executed"
            ? `, executed by ${name(e.byId ?? "")}${e.byCharacterId ? " (HVE: weighs heavily, on the Will or Hunger side)" : ""}`
            : e.cause === "countdown"
              ? ": vital coherence 0"
              : ""
      }`;
    case "party-member-died":
      return null; // the death's own line says it
    case "battle-memory-due":
      return `${name(e.characterId)} survived Downed: a Battle Memory Card, unless the Downing taught nothing`;
    case "item-received":
      return `${name(e.characterId)} receives ${stack(e)}`;
    case "loot":
      return `Loot: ${e.results.map((r) => `${name(r.combatantId)} (${r.row}${r.die === null ? "" : `, ${r.die}`}): ${r.drop}`).join("; ")}`;
    case "kill-confirmed":
      return null; // the settlement's line names the kills
    case "encounter-settled":
      return null;
    case "quest-offered":
      return `${name(e.characterId)}'s log: ${e.line}, offered`;
    case "quest-issued":
      return `${name(e.characterId)}'s log: ${e.line}`;
    case "quest-accepted":
      return `${name(e.characterId)} accepts ${e.line}`;
    case "quest-refused":
      return `${name(e.characterId)} refuses ${e.line}`;
    case "quest-shared":
      return `${name(e.characterId)} holds ${e.line}${e.of ? ` (${e.done}/${e.of})` : ""}`;
    case "quest-progress":
      return null; // the count shows on the quest
    case "quest-revealed":
      return `${name(e.characterId)}'s log: ${e.line}`;
    case "quest-completed":
      return `${name(e.characterId)}: ${e.line} complete`;
    case "quest-failed":
      return `${name(e.characterId)}: ${e.line} failed`;
    case "title-conferred":
      return `${name(e.characterId)} holds ${e.name}${e.negative ? " (negative)" : ""}`;
    case "title-echoed":
      return `${name(e.characterId)}: ${e.name} is Echoed (its flat bonus stays)`;
    case "title-released":
      return `${name(e.characterId)}: ${e.name} released, its penalty returned`;
    case "mark":
      return `${name(e.characterId)}: a Mark in ${e.shape} (${e.marks}${e.nextAt ? ` of ${e.nextAt}` : ""}), ${e.tier}${e.advanced ? ", a new tier" : ""}`;
    case "spoils-added":
      return `Into the spoils: ${e.items.map(stack).join(", ")}`;
    case "combat-check":
      return `${e.label}: ${e.rolls.length ? `${e.total} against ${e.resistance}` : "the Force alone meets it"}, ${e.success ? "success" : "failure"}${
        e.aura ? ` (${e.aura === "steeled" ? "steeled for the encounter" : "Suppressed: 1 Beat"})` : ""
      }`;
    case "pill":
      return `${name(e.targetId)}: ${e.pill}${
        e.noEffect === "grade" ? ", no effect (another Grade)" : e.noEffect === "limit" ? ", no effect (past the limit since the last Consolidation)" : `, ${e.restored} ${e.pillKind === "healing" ? "HP" : "Aether"}`
      }`;
    case "clash":
      return `Clash: ${e.attackTotal} against ${e.defenseTotal}, Margin ${e.margin}${
        e.battleMemory.length ? `; ${e.battleMemory.map(name).join(", ")} earns a Battle Memory Card` : ""
      }`;
    case "clash-resolved":
      return e.turnedAside
        ? "Turned Aside: the attacker is Exposed"
        : `${name(e.defenderId)} takes ${e.damage}${e.yielded ? ` after Yielding ${e.yielded}` : ""}${e.drivenBack ? ", Driven Back" : ""}`;
    case "rolled":
      return `Total ${e.total}${e.exploded ? `, exploded (${e.extraDice} extra)` : ""}${e.outcome ? `: ${e.outcome}` : ""}${
        e.battleMemory ? `; ${e.characterId ? name(e.characterId) : "the roller"} earns a Battle Memory Card` : ""
      }${e.surgeCost ? `; Surge spent ${e.surgeCost} Aether` : ""}`;
    case "voided":
      return null;
  }
}

/** The System's notice on a player's interface, or null for effects the System does not announce. */
const GRANT_NOTICE = { application: "Application registered", infusion: "Infusion", domain: "Domain" } as const;

export function noticeLine(e: Effect): string | null {
  switch (e.kind) {
    case "ve-acquired":
      return `Volatile Energy absorbed: ${e.ve}.`;
    case "level":
      return `Level ${e.level} attained.`;
    case "aether-refilled":
      return "Aether restored.";
    case "healed-full":
      return "Health restored.";
    case "collapsed":
      return `Consolidation enforced: ${e.hours} hours. ${ATTRIBUTE_NAMES[e.attribute]} reduced.`;
    case "temporary-returned":
      return `${ATTRIBUTE_NAMES[e.attribute]} restored.`;
    case "points-placed": {
      const parts = Object.entries(e.placement)
        .filter(([, v]) => v)
        .map(([k, v]) => `${ATTRIBUTE_NAMES[k]} +${v}`)
        .join(", ");
      if (!parts) return null;
      return `${e.by === "system" ? "Attributes allocated" : "Allocation recorded"}: ${parts}.`;
    }
    case "party-invited":
      return `Party invitation received: ${e.fromName}.`;
    case "party-declined":
      return `Party invitation declined: ${e.byName}.`;
    case "party-formed":
      return `Party formed: ${e.withNames.join(", ")}.`;
    case "party-joined":
      return e.memberId === e.characterId ? "Party joined." : `Party member added: ${e.memberName}.`;
    case "party-left":
      return e.memberId === e.characterId ? "Party left." : `Party member departed: ${e.memberName}.`;
    case "party-disbanded":
      return "Party dissolved.";
    case "message":
      return e.text;
    case "combat-downed":
      return `Vital coherence: ${e.coherence}. Falling. Stabilization: required.`;
    case "vital-coherence":
      return `Vital coherence: ${e.coherence}. Falling.`;
    case "stabilized":
      return "Vital coherence: stable.";
    case "revived":
      return `Consciousness restored. Health: ${e.hp}.`;
    case "party-member-died":
      return `Party member deceased: ${e.memberName}.`;
    case "pill":
      return e.pillKind === "healing" ? `Health restored: ${e.restored}.` : `Aether restored: ${e.restored}.`;
    case "kill-confirmed":
      return `Kill confirmed. Grade ${e.victimGrade}, ${e.tier}.`;
    case "item-received":
      return `Item registered: ${stack(e)}.`;
    case "title-conferred":
      return `Title conferred: ${e.name}.`;
    case "classification":
      return [e.text, ...e.offers.map((o) => `${o.heading}\n${o.notice}`)].join("\n\n");
    case "class-accepted":
      return `Class accepted: ${e.name}. ${ATTRIBUTE_NAMES[e.lead]} +${e.bonus}.`;
    case "memory-granted":
      return "Battle Memory retained.";
    case "vision":
      return e.text;
    case "resonance":
      return `Resonance accruing: ${e.family.toUpperCase()}. ${e.ip}/${e.of}.`;
    case "insight":
      return `Insight Gained: ${e.line}`;
    case "principle-crystallized":
      return `Initial Insight: ${e.name}.`;
    case "distillation-offered":
      return `Articulation proposed: ${e.name}. Confirmation required.`;
    case "distilled":
      return `Distillation complete: ${e.name}, ${e.tier}.${e.grant ? ` ${GRANT_NOTICE[e.grantKind]}: ${e.grant}.` : ""}`;
    case "principle-refined":
      return `Principle refined: ${e.from} is now ${e.name}.`;
    case "quest-offered":
      return `Quest offered: ${e.line}.`;
    case "quest-issued":
      return `Quest registered: ${e.line}.`;
    case "quest-accepted":
      return `Quest accepted: ${e.line}.`;
    case "quest-refused":
      return `Quest refused: ${e.line}.`;
    case "quest-shared":
      return `Quest shared: ${e.line}.${e.of ? ` Objective: ${e.done}/${e.of}.` : ""}`;
    case "quest-progress":
      return `${e.line}: ${e.done}/${e.of}.`;
    case "quest-revealed":
      return `Hidden objective updated: ${e.line}.`;
    case "quest-completed":
      return `Quest complete: ${e.line}.`;
    case "quest-failed":
      return `Quest failed: ${e.line}.`;
    case "title-echoed":
      return `Title echoed: ${e.name}.`;
    case "title-released":
      return `Title released: ${e.name}.`;
    case "mark": {
      const shape = titleCase(e.shape);
      if (e.marks === 1) return `Technique acquired: ${shape}. ${e.tier}.`;
      if (e.advanced) return `Technique advanced: ${shape}. ${e.tier}.`;
      return `Technique noted: ${shape}. ${e.nextAt ? `${e.marks}/${e.nextAt}` : e.marks}.`;
    }
    default:
      return null;
  }
}

const FIELD_LABELS: Record<string, string> = {
  level: "Level",
  storedVe: "Stored VE",
  refinedVe: "Refined VE",
  veToNextLevel: "VE to next level",
  hp: "HP",
  maxHp: "Max HP",
  aether: "Aether",
  maxAether: "Max Aether",
  "saturation.band": "Saturation",
  pendingSystemLevels: "Assigned points due",
  freePoints: "Free points",
  temporary: "Temporary loss",
  downed: "Downed",
  "hve.coherence.profile": "Coherence",
};

/** A sheet change as the GM reads it, or null for derived fields that repeat another. */
export function changeLine(c: Change): string | null {
  const label = c.field.startsWith("raw.") ? c.field.slice(4) : c.field.startsWith("hve.deep.") ? `Deep ${c.field.slice(9)}` : FIELD_LABELS[c.field];
  if (!label) return null;
  const show = (v: unknown) =>
    Array.isArray(v) ? (v.length ? v.join(", ") : "none") : v === null || v === undefined ? "none" : String(v);
  return `${label}: ${show(c.before)} → ${show(c.after)}`;
}
