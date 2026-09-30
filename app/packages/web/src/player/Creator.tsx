/**
 * Building a character, on the player's side and in the System's style: registration at
 * Integration. Point buy with a Background (Character Creation), or one of the book's
 * ready-made characters. Checked with the same rules the record applies.
 */
import type { Engine } from "@gradebreaker/engine";
import { pointBuyProblems } from "@gradebreaker/record";
import { useState } from "react";
import { Clave, Icon } from "../ui.tsx";
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

  const anchorLine = (a: string) => {
    const line = anchor(engine, a, stats[a]!);
    const cut = line.indexOf(": ");
    return cut < 0 ? (
      line
    ) : (
      <>
        <span className="anchor__band">{line.slice(0, cut)}</span>
        {line.slice(cut)}
      </>
    );
  };

  // Always the System's register, on the player's screen or on the console's home page.
  return (
    <article className="interface iframe sys creator" aria-label="Registration">
      <header className="sys-head sys-head--plain">
        <Clave />
        <div>
          <h1 className="sys-name">Registration</h1>
          <p className="sys-sub">
            <span className="voice dim">Integrant record: incomplete.</span>
          </p>
        </div>
      </header>

      <div className="cluster creator__paths" role="radiogroup" aria-label="How to register">
        <label className="check">
          <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} /> Build your own
        </label>
        <label className="check">
          <input type="radio" checked={mode === "pregen"} onChange={() => setMode("pregen")} /> Play a ready-made character
        </label>
      </div>

      {mode === "pregen" ? (
        <div className="pregens" role="radiogroup" aria-label="Ready-made characters">
          {pregens.map((p) => (
            <label key={p.name} className={`check pregen${pregen === p.name ? " pregen--chosen" : ""}`}>
              <input type="radio" checked={pregen === p.name} onChange={() => setPregen(p.name)} />
              <span className="stack">
                <b className="display pregen__name">{p.name}</b>
                <span className="prose pregen__line">{p.tagline}</span>
                <span className="num dim pregen__stats">{ATTRIBUTES.map((a) => `${a} ${p.stats[a]}`).join(" · ")}</span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <>
          <div className="stack">
            <label className="field creator__name">
              <span>Name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Background</span>
              <textarea
                className="textarea prose creator__background"
                rows={2}
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="One or two lines of life before Integration: an ER nurse of twelve years, a line cook, a land surveyor."
              />
            </label>
          </div>
          <section className="sys-section" aria-label="Attributes">
            <h2 className="sys-label">
              Attributes <span className="tail">{left === 0 ? "all points spent" : left > 0 ? `${left} points left` : `${-left} over`}</span>
            </h2>
            <div>
              {ATTRIBUTES.map((a) => (
                <div key={a} className="point-row">
                  <span>{ATTRIBUTE_NAMES[a]}</span>
                  <button className="btn btn--sm btn--icon" onClick={() => bump(a, -1)} disabled={stats[a]! <= pb.min_per_stat} aria-label={`Lower ${a}`}>
                    <Icon name="remove" />
                  </button>
                  <span className="num point-row__value">{stats[a]}</span>
                  <button className="btn btn--sm btn--icon" onClick={() => bump(a, 1)} disabled={stats[a]! >= pb.max_per_stat} aria-label={`Raise ${a}`}>
                    <Icon name="add" />
                  </button>
                  <span className="small dim">{anchorLine(a)}</span>
                </div>
              ))}
            </div>
            <p className="small dim">
              Health <span className="num creator__derived">{engine.maxHp(stats.FOR!)}</span> (Fortitude × 2) · Aether{" "}
              <span className="num creator__derived">{engine.maxAether(stats.POW!)}</span> (Power) · each Attribute <span className="num">{pb.min_per_stat}</span> to{" "}
              <span className="num">{pb.max_per_stat}</span>
            </p>
          </section>
        </>
      )}

      <div className="stack">
        {problems.length > 0 && <p className="problem">{problems[0]}</p>}
        {error && <p className="error">{error}</p>}
        <div className="cluster creator__submit">
          <button className="btn btn--primary" disabled={problems.length > 0 || busy} onClick={submit}>
            {submitLabel}
          </button>
          {onCancel && (
            <button className="btn-link small dim" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
