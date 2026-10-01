/**
 * The Clash's three declarations, shared by the GM's tracker and a player's screen: the
 * attack, the defense (the server rolls both sides when it is recorded), and the defender's
 * Yield once the Margin is known.
 */
import type { Engine } from "@gradebreaker/engine";
import type { ClashSide, ForceOption, Proficiency } from "@gradebreaker/record";
import type { TechniqueOffer } from "./classes.ts";
import { useState } from "react";

/** Who is Clashing: a character (Force by Attribute) or a creature (its stat block's lines). */
export type Clasher =
  | {
      kind: "character";
      name: string;
      force: Record<string, number>;
      aether: number;
      surgeCost: number;
      /** The weapon shapes from the rules, and the character's tier in each they have a Mark in. */
      shapes: string[];
      proficiencies: Proficiency[];
      /** The class technique, when the character holds a class. */
      technique?: TechniqueOffer;
      /** A class permission lets Health pay for a Surge: this much (Blood for Aether). */
      surgeHealth?: number;
      /** A class permission's Surge cost against a higher-Grade opponent (Above You). */
      surgeUp?: number;
    }
  | { kind: "creature"; name: string; options: ForceOption[] };

const OFFENSE = [
  ["STR", "heavy melee"],
  ["DEX", "finesse, ranged"],
  ["POW", "spells"],
] as const;
const DEFENSE = [
  ["DEX", "dodge"],
  ["FOR", "absorb"],
  ["HRT", "mind, spirit, coercion"],
  ["PER", "illusion, the senses"],
] as const;

const int = (s: string) => (s.trim() === "" ? 0 : Math.trunc(Number(s)));

function SideFields({
  engine,
  who,
  role,
  value,
  onChange,
}: {
  engine: Engine;
  who: Clasher;
  role: "attack" | "defense";
  value: ClashSide;
  onChange: (s: ClashSide) => void;
}) {
  const [mod, setMod] = useState(value.modifier ? String(value.modifier) : "");
  const choices = role === "attack" ? OFFENSE : DEFENSE;
  return (
    <div className="form-row tight">
      {who.kind === "character" ? (
        <label>
          {role === "attack" ? "Attack with" : "Defend with"}
          <select value={value.attribute ?? ""} onChange={(e) => onChange({ ...value, attribute: e.target.value })}>
            {choices.map(([a, what]) => (
              <option key={a} value={a}>
                {a} {who.force[a]} ({what})
              </option>
            ))}
          </select>
        </label>
      ) : who.options.length === 0 ? (
        <label>
          Force
          <input
            type="number"
            className="narrow-input"
            value={value.force ?? 0}
            onChange={(e) => onChange({ ...value, force: int(e.target.value) })}
          />
        </label>
      ) : (
        <label>
          {role === "attack" ? "Attack" : "Defense"}
          <select
            value={value.force === undefined ? "" : `${value.force}|${value.means ?? ""}`}
            onChange={(e) => {
              const [f, m] = e.target.value.split("|");
              onChange({ ...value, force: Number(f), ...(m ? { means: m } : {}) });
            }}
          >
            {who.options.map((o, i) => (
              <option key={i} value={`${o.force}|${o.means ?? ""}`}>
                {o.means ?? o.stat} (Force {o.force})
              </option>
            ))}
          </select>
        </label>
      )}
      {who.kind === "character" && who.shapes.length > 0 && (
        <label title="The weapon shape adds its Proficiency bonus, and an exploding roll earns a Mark in it">
          With
          <select
            value={value.shape ?? ""}
            onChange={(e) => {
              const { shape: _, ...rest } = value;
              onChange(e.target.value ? { ...rest, shape: e.target.value } : rest);
            }}
          >
            <option value="">{role === "attack" ? "No weapon shape (improvised)" : "No weapon (dodge, absorb)"}</option>
            {who.shapes.map((s) => {
              const p = who.proficiencies.find((x) => x.shape === s);
              return (
                <option key={s} value={s}>
                  {s} {p ? `(${p.tier} +${p.bonus})` : "(untrained)"}
                </option>
              );
            })}
          </select>
        </label>
      )}
      <label>
        Modifiers
        <input
          type="number"
          className="narrow-input"
          value={mod}
          placeholder="0"
          onChange={(e) => {
            setMod(e.target.value);
            onChange({ ...value, modifier: int(e.target.value) });
          }}
        />
      </label>
      <label className="check" title="Two d100, keep the higher. The GM grants it from the fiction.">
        <input type="checkbox" checked={Boolean(value.advantage)} onChange={(e) => onChange({ ...value, advantage: e.target.checked })} /> Advantage
      </label>
      {who.kind === "character" && who.technique && who.technique.sides.includes(role) && (
        <label className="check" title={who.technique.blocked ?? "Part of this Clash: its cost is paid, and the app adds its bonus"}>
          <input
            type="checkbox"
            checked={Boolean(value.technique)}
            disabled={Boolean(who.technique.blocked) && !value.technique}
            onChange={(e) => {
              const { technique: _, ...rest } = value;
              onChange(e.target.checked ? { ...rest, technique: true } : rest);
            }}
          />{" "}
          {who.technique.name} ({who.technique.hook?.kind === "clash" ? `+${who.technique.hook.bonus}, ` : ""}
          {who.technique.cost}){who.technique.blocked ? `: ${who.technique.blocked}` : ""}
        </label>
      )}
      {who.kind === "character" && (
        <label className="check" title={`Declared before the roll. No Beat.${who.surgeUp !== undefined ? ` Against a higher Grade it costs ${Math.min(who.surgeUp, who.surgeCost)} Aether.` : ""}`}>
          <input
            type="checkbox"
            checked={Boolean(value.surge)}
            disabled={who.aether < Math.min(who.surgeCost, who.surgeUp ?? who.surgeCost) && who.surgeHealth === undefined}
            onChange={(e) => {
              const { surge: _s, surgeHealth: _h, ...rest } = value;
              onChange(e.target.checked ? { ...rest, surge: true, ...(who.aether < who.surgeCost && who.surgeHealth !== undefined ? { surgeHealth: true } : {}) } : rest);
            }}
          />{" "}
          Surge (+{engine.rules.combat.surge.bonus} for {who.surgeCost} Aether{who.surgeUp !== undefined && who.surgeUp < who.surgeCost ? `, ${who.surgeUp} against a higher Grade` : ""})
        </label>
      )}
      {who.kind === "character" && who.surgeHealth !== undefined && value.surge && (
        <label className="check" title="The class permission lets Health pay for the Surge">
          <input
            type="checkbox"
            checked={Boolean(value.surgeHealth)}
            onChange={(e) => {
              const { surgeHealth: _, ...rest } = value;
              onChange(e.target.checked ? { ...rest, surgeHealth: true } : rest);
            }}
          />{" "}
          Pay it with {who.surgeHealth} Health
        </label>
      )}
    </div>
  );
}

function initial(who: Clasher, role: "attack" | "defense"): ClashSide {
  if (who.kind === "character") {
    // An attack starts with the shape the character has the most Marks in.
    const best = [...who.proficiencies].sort((a, b) => b.marks - a.marks)[0];
    return { attribute: role === "attack" ? "STR" : "DEX", modifier: 0, ...(role === "attack" && best ? { shape: best.shape } : {}) };
  }
  const o = who.options[0];
  return o ? { force: o.force, ...(o.means ? { means: o.means } : {}), modifier: 0 } : { force: 0, modifier: 0 };
}

export interface AttackDeclaration {
  defenderId: string;
  attack: ClashSide;
  flanking: boolean;
  cornered: boolean;
  label?: string;
  /** A Rush: the Zone the attacker moves into first. */
  rush?: string;
}

export function AttackForm({
  engine,
  attacker,
  targets,
  suggestFlanking,
  gm,
  free,
  reaction,
  rush,
  busy,
  onDeclare,
  onCancel,
}: {
  engine: Engine;
  attacker: Clasher;
  targets: { id: string; name: string; zoneId?: string | null }[];
  suggestFlanking: (defenderId: string) => boolean;
  /** The GM also sets Cornered; Flanking is offered to everyone, pre-checked from the Zones. */
  gm?: boolean;
  free?: boolean;
  /** Off-turn for no Beat: the reaction's name, and whether it is the class technique used as one. */
  reaction?: { name: string; technique: boolean };
  /** The class permission's Rush: its name and the Zones it can go into. */
  rush?: { name: string; zones: { id: string; name: string }[] };
  busy?: boolean;
  onDeclare: (d: AttackDeclaration) => void;
  onCancel?: () => void;
}) {
  const [target, setTarget] = useState(targets[0]?.id ?? "");
  const [side, setSide] = useState<ClashSide>(() => ({ ...initial(attacker, "attack"), ...(reaction?.technique ? { technique: true } : {}) }));
  const [rushTo, setRushTo] = useState("");
  const [flank, setFlank] = useState<boolean | null>(null);
  const [cornered, setCornered] = useState(false);
  const [label, setLabel] = useState("");
  const defenderId = targets.some((t) => t.id === target) ? target : (targets[0]?.id ?? "");
  const flanking = flank ?? suggestFlanking(defenderId);
  const flankingBonus: number = engine.rules.resolution.flanking_bonus;
  // A Rush goes into the target's Zone when the scene places it; otherwise the attacker names one.
  const targetZone = targets.find((t) => t.id === defenderId)?.zoneId ?? null;
  const rushZones = rush ? rush.zones.filter((z) => !targetZone || z.id === targetZone) : [];
  const rushing = rushZones.some((z) => z.id === rushTo) ? rushTo : "";
  if (!targets.length) return <p className="muted small">Nobody to attack.</p>;
  return (
    <div className="clash-form">
      <div className="form-row tight">
        <label>
          {free ? "Free strike at" : "Target"}
          <select value={defenderId} onChange={(e) => (setTarget(e.target.value), setFlank(null))}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          What (optional)
          <input className="narrow-input wide" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Axe" />
        </label>
      </div>
      {rush && rushZones.length > 0 && (
        <div className="form-row tight">
          <label title="Moving into the Zone and attacking there costs the attack's one Beat">
            {rush.name}
            <select value={rushing} onChange={(e) => setRushTo(e.target.value)}>
              <option value="">No: attack from here</option>
              {rushZones.map((z) => (
                <option key={z.id} value={z.id}>
                  Into {z.name}, then attack
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <SideFields engine={engine} who={attacker} role="attack" value={side} onChange={setSide} />
      <div className="form-row tight">
        <label className="check" title={`+${flankingBonus} when two or more hostiles engage the target; suggested from the Zones`}>
          <input type="checkbox" checked={flanking} onChange={(e) => setFlank(e.target.checked)} /> Flanking +{flankingBonus}
        </label>
        {gm && (
          <label className="check" title="Nowhere to be driven: the target can Yield only one Beat">
            <input type="checkbox" checked={cornered} onChange={(e) => setCornered(e.target.checked)} /> Target Cornered
          </label>
        )}
      </div>
      <div className="form-row tight">
        <button
          className="btn btn--sm btn--primary"
          disabled={busy || !defenderId}
          onClick={() => onDeclare({ defenderId, attack: side, flanking, cornered, ...(label.trim() ? { label: label.trim() } : {}), ...(rushing ? { rush: rushing } : {}) })}
        >
          {free ? "Declare the free strike" : reaction ? `${reaction.name}: ${attacker.name} attacks (no Beat)` : rushing ? `${rush!.name}: move and attack (1 Beat)` : `${attacker.name} attacks (1 Beat)`}
        </button>
        {onCancel && <button className="btn btn--sm" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

export function DefenseForm({ engine, defender, busy, onDefend }: { engine: Engine; defender: Clasher; busy?: boolean; onDefend: (s: ClashSide) => void }) {
  const [side, setSide] = useState<ClashSide>(() => initial(defender, "defense"));
  return (
    <div className="clash-form">
      <SideFields engine={engine} who={defender} role="defense" value={side} onChange={setSide} />
      <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => onDefend(side)}>
        Roll the Clash
      </button>
    </div>
  );
}

/** The defender's Yield: each Beat takes the rules' Margin per Beat off, after any ally's cover, before the Grade multiplier. */
export function YieldChoice({
  engine,
  margin,
  cap,
  multiplier,
  busy,
  onYield,
}: {
  engine: Engine;
  margin: number;
  cap: number;
  multiplier: number;
  busy?: boolean;
  onYield: (beats: number) => void;
}) {
  const options = Array.from({ length: cap + 1 }, (_, y) => {
    const left = Math.max(0, margin - engine.rules.combat.yield.margin_reduction_per_beat * y);
    return { y, damage: left * multiplier, drivenBack: left >= engine.rules.resolution.rule_of_40.driven_back_margin };
  });
  return (
    <div className="form-row tight yield">
      {options.map((o) => (
        <button key={o.y} className={o.y === 0 ? "btn btn--sm" : "btn btn--sm btn--primary"} disabled={busy} onClick={() => onYield(o.y)}>
          {o.y === 0 ? `Take ${o.damage}` : `Yield ${o.y} Beat${o.y === 1 ? "" : "s"}: ${o.damage}`}
          {o.drivenBack ? ", Driven Back" : ""}
          {o.y >= 2 ? " (may be driven)" : ""}
        </button>
      ))}
    </div>
  );
}
