/**
 * The class on the player's interface (Classes, "The Level 10 Scene"): the three offers, each in
 * the System's words with its mechanics beside them, until the player accepts one; then the class
 * held, and a once-a-day permission the player marks when they use it.
 */
import type { Engine } from "@gradebreaker/engine";
import type { InterfaceSheet, PlayerClass } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import { costLine, profileLine, selectionLine } from "../classes.ts";

function Package({ engine, p, bonus }: { engine: Engine | null; p: PlayerClass; bonus?: number }) {
  const selection = selectionLine(engine, p, bonus);
  return (
    <>
      <p className="sys-text">
        <em>{p.notice}</em>
      </p>
      <dl className="class-mechanics small">
        <dt>Profile</dt>
        <dd>
          {profileLine(engine, p)}
          {selection && ` Selection: ${selection}.`}
        </dd>
        <dt>{p.technique.name}</dt>
        <dd>
          {costLine(engine, p)}. {p.technique.effect}
        </dd>
        <dt>{p.permission.name}</dt>
        <dd>{p.permission.effect}</dd>
      </dl>
    </>
  );
}

export function ClassOffers({ campaignId, engine, c, readOnly }: { campaignId: string; engine: Engine | null; c: InterfaceSheet; readOnly?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!c.classOffers.length) return null;
  const accept = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await submit(campaignId, newActionId(), { type: "class.accept", characterId: c.id, name });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sys-section class-offers">
      <h3>Classification</h3>
      <p className="sys-dim small">
        <em>Three offers. One will be accepted; the others close.</em>
      </p>
      {c.classOffers.map((p) => (
        <div key={p.name} className="class-offer">
          <h4>{p.name}</h4>
          <Package engine={engine} p={p} />
          {!readOnly &&
            !c.dead &&
            (picked === p.name ? (
              <div className="item-actions">
                <span className="small">The other two close.</span>
                <button className="sys-confirm inline" disabled={busy} onClick={() => accept(p.name)}>
                  Accept {p.name}
                </button>
                <button className="sys-confirm inline" onClick={() => setPicked(null)}>
                  Not yet
                </button>
              </div>
            ) : (
              <button className="sys-confirm inline" onClick={() => setPicked(p.name)}>
                Accept…
              </button>
            ))}
        </div>
      ))}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function ClassHeld({ campaignId, engine, c, readOnly }: { campaignId: string; engine: Engine | null; c: InterfaceSheet; readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const k = c.class;
  if (!k) return null;
  const use = async () => {
    setBusy(true);
    setError(null);
    try {
      await submit(campaignId, newActionId(), { type: "class.use", characterId: c.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sys-section">
      <h3>Class: {k.name}</h3>
      <Package engine={engine} p={k} bonus={k.bonus} />
      {k.permission.onceADay && (
        <div className="item-actions">
          <span className="small sys-dim">
            {k.usedSinceDawn === null ? `${k.permission.name}: once a day.` : k.usedSinceDawn ? `${k.permission.name}: used. Ready at dawn.` : `${k.permission.name}: ready.`}
          </span>
          {!readOnly && !c.dead && k.usedSinceDawn !== true && (
            <button className="sys-confirm inline" disabled={busy} onClick={use}>
              Use {k.permission.name}
            </button>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
