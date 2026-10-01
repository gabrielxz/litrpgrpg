/**
 * The table's dice: a roll form and the recent rolls. The server rolls, so the button is the
 * roll itself and there is no preview. A player rolls for their own characters; the GM rolls
 * for anyone, privately if they choose, against a Resistance, or types in dice rolled by hand.
 */
import type { Action, Proficiency, RollView } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "./api.ts";
import { ATTRIBUTES } from "./text.ts";
import { Mark } from "./ui.tsx";

export interface RollerOption {
  id: string;
  name: string;
  force: Record<string, number>;
  aether: number;
  surgeCost: number;
  proficiencies: Proficiency[];
}

const OUTCOME: Record<string, string> = {
  success: "Success",
  exceptional: "Exceptional Success",
  soft: "Soft Failure",
  hard: "Hard Failure",
  catastrophic: "Catastrophic Failure",
};

const int = (s: string) => (s.trim() === "" ? 0 : Math.trunc(Number(s)));

export function RollForm({
  campaignId,
  characters,
  gm,
  difficulties,
  grades,
  onRolled,
  shapes = [],
  surgeBonus,
}: {
  campaignId: string;
  /** A Surge's bonus to the roll, from the rules. */
  surgeBonus: number;
  characters: RollerOption[];
  /** The weapon shapes a character's Clash can be made with. */
  shapes?: string[];
  /** The GM's controls: anyone as roller, tables, Resistance, private rolls, typed-in dice. */
  gm?: boolean;
  difficulties?: { difficulty: string; resistance: number }[];
  grades?: string[];
  onRolled?: () => void;
}) {
  const [who, setWho] = useState(characters[0]?.id ?? (gm ? "other" : ""));
  const [otherName, setOtherName] = useState("");
  const [otherGrade, setOtherGrade] = useState("F");
  const [kind, setKind] = useState<"clash" | "check" | "table">("clash");
  const [attribute, setAttribute] = useState("STR");
  const [modifier, setModifier] = useState("");
  const [advantage, setAdvantage] = useState(false);
  const [surge, setSurge] = useState(false);
  const [shape, setShape] = useState("");
  const [priv, setPriv] = useState(false);
  const [resistance, setResistance] = useState("");
  const [label, setLabel] = useState("");
  const [typed, setTyped] = useState("");
  const [typedDropped, setTypedDropped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const c = characters.find((x) => x.id === who);
  const isOther = gm && who === "other";
  const mod = int(modifier);
  const canSurge = Boolean(c) && kind === "clash";
  const affordable = c ? c.aether >= c.surgeCost : false;
  const typedDice = typed.trim() ? typed.trim().split(/[\s,+]+/).map(Number) : null;

  let problem: string | null = null;
  if (!c && !isOther) problem = "Pick who rolls.";
  else if (isOther && !otherName.trim()) problem = "Name who rolls.";
  else if (Number.isNaN(mod)) problem = "Modifiers are whole numbers.";
  else if (typedDice?.some((d) => !Number.isInteger(d))) problem = "Type the dice as numbers: 97 12.";

  const roll = async () => {
    const action: Action = {
      type: "dice.roll",
      roller: c ? { kind: "character", characterId: c.id, ...(kind === "table" ? {} : { attribute }) } : { kind: "other", name: otherName.trim(), grade: otherGrade },
      rollKind: kind,
      modifier: mod,
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(advantage && kind !== "table" ? { advantage: true } : {}),
      ...(surge && canSurge ? { surge: true } : {}),
      ...(shape && canSurge ? { shape } : {}),
      ...(gm && priv ? { private: true } : {}),
      ...(gm && kind === "check" && resistance ? { resistance: int(resistance) } : {}),
      ...(typedDice ? { natural: typedDice } : {}),
      ...(typedDice && advantage && typedDropped ? { dropped: int(typedDropped) } : {}),
    };
    setBusy(true);
    setError(null);
    try {
      await submit(campaignId, newActionId(), action);
      setSurge(false);
      setTyped("");
      setTypedDropped("");
      onRolled?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const name = c?.name ?? (otherName.trim() || "them");
  return (
    <div className="form dice-form">
      <div className="form-row">
        {(gm || characters.length > 1) && (
          <label>
            Who rolls
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              {characters.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
              {gm && <option value="other">Someone else…</option>}
            </select>
          </label>
        )}
        {isOther && (
          <>
            <label>
              Name
              <input value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="Frenzy Rat" />
            </label>
            <label>
              Grade
              <select value={otherGrade} onChange={(e) => setOtherGrade(e.target.value)}>
                {(grades ?? ["F"]).map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <div className="form-row">
        <label>
          <input type="radio" checked={kind === "clash"} onChange={() => setKind("clash")} /> Clash
        </label>
        <label>
          <input type="radio" checked={kind === "check"} onChange={() => setKind("check")} /> Check
        </label>
        {gm && (
          <label title="A d100 read against a table: an item's effect, the collapse clock. It does not explode.">
            <input type="radio" checked={kind === "table"} onChange={() => setKind("table")} /> Table
          </label>
        )}
      </div>
      <div className="form-row">
        {c && kind !== "table" && (
          <label>
            Force
            <select value={attribute} onChange={(e) => setAttribute(e.target.value)}>
              {ATTRIBUTES.map((a) => (
                <option key={a} value={a}>
                  {a} {c.force[a]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {isOther ? "Force and modifiers" : "Modifiers"}
          <input type="number" className="narrow-input" value={modifier} onChange={(e) => setModifier(e.target.value)} placeholder="0" />
        </label>
        {gm && kind === "check" && (
          <label>
            Resistance
            <select value={resistance} onChange={(e) => setResistance(e.target.value)}>
              <option value="">Not entered</option>
              {(difficulties ?? []).map((d) => (
                <option key={d.difficulty} value={d.resistance}>
                  {d.difficulty} {d.resistance}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="form-row">
        {kind !== "table" && (
          <label className="check" title="Two d100, keep the higher. The GM grants it from the fiction.">
            <input type="checkbox" checked={advantage} onChange={(e) => setAdvantage(e.target.checked)} /> Advantage
          </label>
        )}
        {canSurge && shapes.length > 0 && (
          <label title="The weapon shape adds its Proficiency bonus, and an exploding roll earns a Mark in it">
            With
            <select value={shape} onChange={(e) => setShape(e.target.value)}>
              <option value="">No weapon shape</option>
              {shapes.map((s) => {
                const p = c!.proficiencies.find((x) => x.shape === s);
                return (
                  <option key={s} value={s}>
                    {s} {p ? `(${p.tier} +${p.bonus})` : "(untrained)"}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        {canSurge && (
          <label className="check" title="Declared before the roll. No Beat.">
            <input type="checkbox" checked={surge} disabled={!affordable} onChange={(e) => setSurge(e.target.checked)} /> Surge (+{surgeBonus} for{" "}
            {c!.surgeCost} Aether{affordable ? "" : `; ${c!.aether} left`})
          </label>
        )}
        {gm && (
          <label className="check">
            <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Private
          </label>
        )}
      </div>
      <label>
        What for (optional)
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Swing at the rat" />
      </label>
      {gm && (
        <details className="typed">
          <summary>Dice rolled by hand</summary>
          <div className="form-row">
            <label>
              Kept die and any it exploded into
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="97 12" />
            </label>
            {advantage && (
              <label>
                The lower die
                <input type="number" className="narrow-input" value={typedDropped} onChange={(e) => setTypedDropped(e.target.value)} />
              </label>
            )}
          </div>
        </details>
      )}
      {problem && <p className="muted">{problem}</p>}
      {error && <p className="error">{error}</p>}
      <button className="btn btn--sm btn--primary" disabled={Boolean(problem) || busy} onClick={roll}>
        {typedDice ? `Record ${name}'s dice` : `Roll for ${name}`}
      </button>
    </div>
  );
}

export function RollList({ rolls, gm }: { rolls: RollView[]; gm?: boolean }) {
  if (!rolls.length) return <p className="muted small">No rolls yet.</p>;
  return (
    <ol className="rolls">
      {rolls.map((r) => {
        const bonus = r.force + r.modifier + (r.surge ? 5 : 0);
        return (
          <li key={r.id} className={r.private ? "private" : ""}>
            <div className="roll-head">
              <strong className={r.characterId || r.rollKind === "table" ? undefined : "world"}>
                <Mark id={r.characterId} />
                {r.roller}
              </strong>
              {r.label && <span> · {r.label}</span>}
              <span className="muted small">
                {" "}
                {r.rollKind === "table" ? "table" : r.rollKind}
                {r.attribute ? ` · ${r.attribute}` : ""}
                {r.private ? " · private" : ""}
                {r.entered ? " · by hand" : ""}
                {r.by !== r.roller ? ` · ${r.by}` : ""}
              </span>
            </div>
            <div className="roll-body">
              {r.dropped !== undefined && <span className="die dropped">{r.dropped}</span>}
              {r.natural.map((d, i) => (
                <span key={i} className={`die${i < r.natural.length - 1 ? " exploded" : ""}`}>
                  {d}
                </span>
              ))}
              {bonus !== 0 && <span className="muted">{bonus > 0 ? `+ ${bonus}` : `− ${-bonus}`}</span>}
              {r.surge && <span className="tag">Surge</span>}
              <span className="roll-total">{r.total}</span>
              {r.exploded && <span className="tag attention">exploded</span>}
              {gm && r.outcome && (
                <span className="tag">
                  {OUTCOME[r.outcome] ?? r.outcome} vs {r.resistance}
                </span>
              )}
              {gm && r.battleMemory && <span className="tag attention">Battle Memory Card</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
