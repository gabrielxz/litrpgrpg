/**
 * Building a character, on the player's side and in the System's style: registration at
 * Integration. Point buy with a Background (Character Creation), or one of the book's
 * ready-made characters. Checked with the same rules the record applies.
 */
import type { Engine } from "@gradebreaker/engine";
import { pointBuyProblems } from "@gradebreaker/record";
import { useState } from "react";
import { ATTRIBUTES, ATTRIBUTE_NAMES } from "../text.ts";

export type CharacterSpec =
  | { kind: "custom"; name: string; background: string; stats: Record<string, number> }
  | { kind: "pregen"; pregen: string };

interface Pregen {
  name: string;
  tagline: string;
  background: string;
  stats: Record<string, number>;
}

/** The book's anchor for a score: the highest anchor at or below it ("average" for 5 and 6). */
function anchor(engine: Engine, attr: string, value: number): string {
  const a = engine.rules.character.stat_anchors;
  const scores: number[] = a.scores;
  let i = -1;
  scores.forEach((s, j) => {
    if (value >= s) i = j;
  });
  return i < 0 ? "" : `${a.labels[i]}: ${a[attr][i]}`;
}

export function Creator({
  engine,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  engine: Engine;
  submitLabel: string;
  onSubmit: (spec: CharacterSpec) => Promise<void>;
  onCancel?: () => void;
}) {
  const pb = engine.rules.character.point_buy;
  const pregens: Pregen[] = engine.rules.character.pregens;
  const [mode, setMode] = useState<"custom" | "pregen">("custom");
  const [pregen, setPregen] = useState(pregens[0]?.name ?? "");
  const [name, setName] = useState("");
  const [background, setBackground] = useState("");
  const [stats, setStats] = useState<Record<string, number>>(Object.fromEntries(ATTRIBUTES.map((a) => [a, 5])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const spent = Object.values(stats).reduce((a, b) => a + b, 0);
  const left = pb.points - spent;
  const problems =
    mode === "pregen"
      ? []
      : [
          ...(name.trim() ? [] : ["Name the character."]),
          ...(background.trim() ? [] : ["Write the Background: one or two lines of life before Integration."]),
          ...(left !== 0 ? [`Spend exactly ${pb.points} points (${left > 0 ? `${left} left` : `${-left} over`}).`] : []),
          ...pointBuyProblems(engine, stats).filter((p) => !p.includes("total")),
        ];
  const bump = (a: string, d: number) => {
    const v = (stats[a] ?? 5) + d;
    if (v < pb.min_per_stat || v > pb.max_per_stat) return;
    setStats({ ...stats, [a]: v });
  };
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(mode === "pregen" ? { kind: "pregen", pregen } : { kind: "custom", name: name.trim(), background: background.trim(), stats });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <article className="interface creator">
      <header>
        <img src="/clave.svg" alt="" className="clave-mark" />
        <div>
          <h2>Registration</h2>
          <div className="sys-dim">
            <em>Integrant record: incomplete.</em>
          </div>
        </div>
      </header>

      <div className="sys-section sys-choice">
        <label className="check">
          <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} /> Build your own
        </label>
        <label className="check">
          <input type="radio" checked={mode === "pregen"} onChange={() => setMode("pregen")} /> Play a ready-made character
        </label>
      </div>

      {mode === "pregen" ? (
        <div className="sys-section pregens">
          {pregens.map((p) => (
            <label key={p.name} className={`pregen ${pregen === p.name ? "chosen" : ""}`}>
              <input type="radio" checked={pregen === p.name} onChange={() => setPregen(p.name)} />
              <strong>{p.name}</strong>
              <span>{p.tagline}</span>
              <span className="sys-dim small">
                {ATTRIBUTES.map((a) => `${a} ${p.stats[a]}`).join(" · ")}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <>
          <div className="sys-section sys-fields">
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Background
              <textarea
                rows={2}
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="One or two lines of life before Integration: an ER nurse of twelve years, a line cook, a land surveyor."
              />
            </label>
          </div>
          <div className="sys-section">
            <h3>
              Attributes <span className="sys-dim">{left === 0 ? "all points spent" : left > 0 ? `${left} points left` : `${-left} over`}</span>
            </h3>
            <div className="point-buy">
              {ATTRIBUTES.map((a) => (
                <div key={a} className="point-row">
                  <span>{ATTRIBUTE_NAMES[a]}</span>
                  <button onClick={() => bump(a, -1)} disabled={stats[a]! <= pb.min_per_stat} aria-label={`Lower ${a}`}>
                    −
                  </button>
                  <span className="num">{stats[a]}</span>
                  <button onClick={() => bump(a, 1)} disabled={stats[a]! >= pb.max_per_stat} aria-label={`Raise ${a}`}>
                    +
                  </button>
                  <span className="sys-dim small anchor">{anchor(engine, a, stats[a]!)}</span>
                </div>
              ))}
            </div>
            <p className="sys-dim small">
              Health {engine.maxHp(stats.FOR!)} (Fortitude × 2) · Aether {engine.maxAether(stats.POW!)} (Power) · each Attribute{" "}
              {pb.min_per_stat} to {pb.max_per_stat}
            </p>
          </div>
        </>
      )}

      <div className="sys-section">
        {problems.length > 0 && <p className="sys-dim small">{problems[0]}</p>}
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="sys-confirm" disabled={problems.length > 0 || busy} onClick={submit}>
            {submitLabel}
          </button>
          {onCancel && (
            <button className="link sys-link" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
