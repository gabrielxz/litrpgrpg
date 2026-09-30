/**
 * What an acting combatant can spend a Beat on besides the Clash, shared by the GM's tracker
 * and a player's screen (Core Mechanics, "Downed and Death" and "Aura Pressure"; Items, the
 * pills): a pill for themselves or someone in their Zone, stabilizing a Downed ally by bare
 * hands, an execution, and the Will Save again by pushing back or intervening for an ally.
 */
import type { Engine } from "@gradebreaker/engine";
import type { Action } from "@gradebreaker/record";
import type { TechniqueOffer } from "./classes.ts";
import { useState } from "react";

/** A combatant as these forms need them, from either screen's view of the fight. */
export interface Mate {
  id: string;
  name: string;
  sideId: string;
  zoneId: string | null;
  out: boolean;
  downed: boolean;
  stabilized: boolean;
  suppressed: boolean;
  characterId?: string;
  pills?: { healing: number; aether: number };
}

/** The acting combatant: a character's Forces for the check and what they carry, or neither for a creature or NPC. */
export interface Actor extends Mate {
  force?: Record<string, number>;
  items?: { name: string; count: number }[];
  /** A character's class technique, when they hold a class. */
  technique?: TechniqueOffer;
}

export interface Pill {
  name: string;
  kind: "healing" | "aether";
  amount: number;
}

export function pillsOf(engine: Engine | null): Pill[] {
  if (!engine) return [];
  const items = engine.rules.items;
  return [
    ...items.healing_pills.map((p: { name: string; hp: number }) => ({ name: p.name, kind: "healing" as const, amount: p.hp })),
    ...items.aether_pills.map((p: { name: string; aether: number }) => ({ name: p.name, kind: "aether" as const, amount: p.aether })),
  ];
}

const sameZone = (a: Mate, b: Mate) => a.zoneId === null || b.zoneId === null || a.zoneId === b.zoneId;

type Open = null | "pill" | "stabilize" | "execute" | "intervene" | "technique";

export function CareActions({
  me,
  people,
  pills,
  pillLimit,
  stabilize,
  beats,
  busy,
  run,
}: {
  me: Actor;
  people: Mate[];
  pills: Pill[];
  pillLimit: number;
  /** The bare-hands stabilizing check from the rules data. */
  stabilize: { attribute: string; difficulty: string; resistance: number };
  beats: number;
  busy: boolean;
  run: (a: Action) => Promise<boolean>;
}) {
  // A character gives only the pills they carry; a creature's or NPC's are the GM's to say.
  const held = (p: Pill) => me.items?.find((i) => i.name.toLowerCase() === p.name.toLowerCase())?.count ?? 0;
  pills = me.characterId ? pills.filter((p) => held(p) > 0) : pills;
  const [open, setOpen] = useState<Open>(null);
  const [target, setTarget] = useState("");
  const [pillChoice, setPill] = useState(pills[0]?.name ?? "");
  const pill = pills.some((p) => p.name === pillChoice) ? pillChoice : (pills[0]?.name ?? "");
  const [force, setForce] = useState("");
  const [advantage, setAdvantage] = useState(false);
  const [drawback, setDrawback] = useState<"health" | "exposed">("health");
  const t = me.technique;
  // A Clash hook's technique is declared with the Clash; anything else is used on its own here.
  const ownUse = t && t.hook?.kind !== "clash" ? t : null;
  const live = people.filter((p) => !p.out);
  const zoneMates = live.filter((p) => p.id === me.id || sameZone(me, p));
  const pillTargets = zoneMates.filter((p) => p.id === me.id || p.characterId || p.downed);
  const dying = zoneMates.filter((p) => p.id !== me.id && p.downed && !p.stabilized);
  const downed = live.filter((p) => p.id !== me.id && p.downed);
  const suppressedAllies = live.filter((p) => p.id !== me.id && p.sideId === me.sideId && p.suppressed && p.characterId);
  // A heal goes to an ally: someone on the character's own side, within the hook's reach.
  const healTargets = ownUse?.hook?.kind === "heal" ? (ownUse.hook.reach === "zone" ? zoneMates : live).filter((p) => p.sideId === me.sideId) : [];
  const choices: Record<Exclude<Open, null>, Mate[]> = { pill: pillTargets, stabilize: dying, execute: downed, intervene: suppressedAllies, technique: healTargets };
  const list = open ? choices[open] : [];
  const picked = list.some((p) => p.id === target) ? target : (list[0]?.id ?? "");
  const pickedMate = list.find((p) => p.id === picked);
  const noBeat = busy || beats < 1;

  const toggle = (o: Exclude<Open, null>) => {
    setOpen(open === o ? null : o);
    setTarget("");
  };
  const done = async (a: Action) => {
    if (await run(a)) setOpen(null);
  };
  const pillInfo = pills.find((p) => p.name === pill);
  const takenOfKind = pillInfo && pickedMate?.pills ? pickedMate.pills[pillInfo.kind] : 0;

  const targetSelect = (
    <select value={picked} onChange={(e) => setTarget(e.target.value)} aria-label="Who">
      {list.map((p) => (
        <option key={p.id} value={p.id}>
          {p.id === me.id ? `${p.name} (self)` : p.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div className="form-row tight">
        {pills.length > 0 && (
          <button disabled={noBeat || pillTargets.length === 0} onClick={() => toggle("pill")}>
            Pill…
          </button>
        )}
        <button disabled={noBeat || dying.length === 0} onClick={() => toggle("stabilize")} title={`Bare hands: a ${stabilize.difficulty} (${stabilize.resistance}) ${stabilize.attribute} check in the Downed character's Zone`}>
          Stabilize…
        </button>
        <button disabled={noBeat || downed.length === 0} onClick={() => toggle("execute")} title="A deliberate attack on a Downed combatant kills them: 1 Beat, no roll">
          Execute…
        </button>
        {ownUse && me.characterId && (
          <button
            disabled={busy || Boolean(ownUse.blocked) || (!ownUse.noBeat && beats < 1)}
            onClick={() => toggle("technique")}
            title={ownUse.blocked ?? `${ownUse.noBeat ? "No Beat" : "1 Beat"}, ${ownUse.cost}`}
          >
            {ownUse.name}…
          </button>
        )}
        {me.suppressed && me.characterId && (
          <button disabled={noBeat} onClick={() => run({ type: "combat.will", combatantId: me.id, reason: "principle" })} title="A Principle Application that pushes back: 1 Beat, and the Will Save again">
            Push back (1 Beat)
          </button>
        )}
        {!me.suppressed && suppressedAllies.length > 0 && (
          <button disabled={noBeat} onClick={() => toggle("intervene")} title="Shield, shout, or reach them: 1 Beat, and they make the Will Save again">
            Intervene…
          </button>
        )}
      </div>
      {open === "pill" && (
        <div className="form-row tight subform">
          <select value={pill} onChange={(e) => setPill(e.target.value)} aria-label="Pill">
            {pills.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.kind === "healing" ? `${p.amount} HP` : `${p.amount} Aether`}){me.characterId ? `, ${held(p)} carried` : ""}
              </option>
            ))}
          </select>
          for {targetSelect}
          <button className="primary" disabled={noBeat || !picked || !pill} onClick={() => done({ type: "combat.pill", combatantId: me.id, targetId: picked, pill })}>
            {picked === me.id ? "Take it (1 Beat)" : "Give it (1 Beat)"}
          </button>
          {takenOfKind >= pillLimit && <span className="small warn">{pickedMate?.name} has taken {takenOfKind} of this kind since the last Consolidation: it will have no effect.</span>}
        </div>
      )}
      {open === "stabilize" && (
        <div className="form-row tight subform">
          {targetSelect}
          {me.force ? (
            <span className="small">
              {stabilize.attribute} {me.force[stabilize.attribute]}
            </span>
          ) : (
            <input type="number" className="narrow-input" value={force} onChange={(e) => setForce(e.target.value)} placeholder="Force" aria-label="Force" />
          )}
          <label className="check">
            <input type="checkbox" checked={advantage} onChange={(e) => setAdvantage(e.target.checked)} /> Medical Background (Advantage)
          </label>
          <button
            className="primary"
            disabled={noBeat || !picked || (!me.force && force.trim() === "")}
            onClick={() =>
              done({
                type: "combat.stabilize",
                combatantId: me.id,
                targetId: picked,
                ...(me.force ? {} : { force: Math.trunc(Number(force)) }),
                ...(advantage ? { advantage: true } : {}),
              })
            }
          >
            Stabilize (1 Beat)
          </button>
        </div>
      )}
      {open === "technique" && ownUse && (
        <div className="form-row tight subform">
          {ownUse.hook?.kind === "heal" && (
            <>
              {targetSelect}
              <span className="small">
                restores {ownUse.hook.amount} Health ({ownUse.hook.reach === "zone" ? "your Zone" : "your Zone or the next"})
              </span>
            </>
          )}
          {ownUse.chooseDrawback && (
            <select value={drawback} onChange={(e) => setDrawback(e.target.value as "health" | "exposed")} aria-label="Drawback">
              <option value="health">Pay 10 Health</option>
              <option value="exposed">Be Exposed until the next turn</option>
            </select>
          )}
          <button
            className="primary"
            disabled={busy || Boolean(ownUse.blocked) || (!ownUse.noBeat && beats < 1) || (ownUse.hook?.kind === "heal" && !picked)}
            onClick={() =>
              done({
                type: "class.technique",
                characterId: me.characterId!,
                ...(ownUse.hook?.kind === "heal" ? { targetId: picked } : {}),
                ...(ownUse.chooseDrawback ? { drawback } : {}),
              })
            }
          >
            Use {ownUse.name} ({ownUse.noBeat ? "no Beat" : "1 Beat"}, {ownUse.cost})
          </button>
          {ownUse.hook?.kind !== "heal" && <span className="small muted">The cost is paid here; the GM applies what it does.</span>}
        </div>
      )}
      {open === "execute" && (
        <div className="form-row tight subform">
          {targetSelect}
          <button className="danger" disabled={noBeat || !picked} onClick={() => done({ type: "combat.execute", combatantId: me.id, targetId: picked })}>
            Execute {pickedMate?.name} (1 Beat)
          </button>
        </div>
      )}
      {open === "intervene" && (
        <div className="form-row tight subform">
          {targetSelect}
          <button
            className="primary"
            disabled={noBeat || !picked}
            onClick={() => done({ type: "combat.will", combatantId: picked, reason: "intervention", helperId: me.id })}
          >
            Intervene (1 Beat)
          </button>
        </div>
      )}
    </>
  );
}
