/**
 * The class on the player's interface (Classes, "The Level 10 Scene"): the three offers, each in
 * the System's words with its mechanics beside them, until the player accepts one; then the class
 * held, and a once-a-day permission the player marks when they use it.
 */
import type { Engine } from "@gradebreaker/engine";
import type { InterfaceSheet, PlayerClass } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import { costLine, profileLine, selectionLine, techniqueOffer } from "../classes.ts";

/** A few System glyphs beside a class's name: decoration, the same for a class every time. */
const GLYPHS = ["tri", "step", "nest", "fork", "bars", "kite", "corner", "bracket", "peak", "shelf", "rise", "break"];
function Glyphs({ name }: { name: string }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const picks = [GLYPHS[h % 12]!, GLYPHS[(h >>> 4) % 12]!, GLYPHS[(h >>> 8) % 12]!].slice(0, 2 + (h % 2));
  return (
    <span className="cluster glyphs" aria-hidden="true">
      {picks.map((g, i) => (
        <i key={i} className={`gl gl-${g}`} />
      ))}
    </span>
  );
}

/** The class in the System's words, then its mechanics in the table's register (the tray). */
function Package({ engine, p, bonus }: { engine: Engine | null; p: PlayerClass; bonus?: number }) {
  const selection = selectionLine(engine, p, bonus);
  return (
    <>
      <p className="voice">{p.notice}</p>
      <dl className="tray spec mechanics">
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
    <section className="sys-section" aria-label="Classification">
      <h2 className="sys-label">Classification</h2>
      <p className="voice dim">Three offers. One will be accepted; the others close.</p>
      {c.classOffers.map((p) => (
        <article key={p.name} className={`class-card stack${picked === p.name ? " class-card--picked" : ""}`}>
          <div className="spread">
            <h3>{p.name}</h3>
            <Glyphs name={p.name} />
          </div>
          <Package engine={engine} p={p} />
          {!readOnly &&
            !c.dead &&
            (picked === p.name ? (
              <div className="confirm confirm--armed">
                <span className="confirm__what">The other two close.</span>
                <button className="btn btn--primary" disabled={busy} onClick={() => accept(p.name)}>
                  <i className="ic ic-confirm" aria-hidden="true" />
                  Accept {p.name}
                </button>
                <button className="btn" onClick={() => setPicked(null)}>
                  Not yet
                </button>
              </div>
            ) : (
              <div>
                <button className="btn" onClick={() => setPicked(p.name)}>
                  Accept…
                </button>
              </div>
            ))}
        </article>
      ))}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/**
 * The technique outside a fight: its cost paid and a heal applied. In a fight it is used from the
 * fight's panel, and a once-per-fight technique only there.
 */
function OutOfFight({ campaignId, engine, c, inFight }: { campaignId: string; engine: Engine | null; c: InterfaceSheet; inFight: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState(c.id);
  const k = c.class!;
  const t = techniqueOffer(engine, k, { aether: c.aether, inFight: false });
  if (inFight || t.hook?.kind === "clash" || k.technique.cost === "Frequency") return null;
  const people = [{ id: c.id, name: c.name }, ...(c.party?.members.filter((m) => m.id !== c.id) ?? [])];
  const use = async () => {
    setBusy(true);
    setError(null);
    try {
      await submit(campaignId, newActionId(), {
        type: "class.technique",
        characterId: c.id,
        ...(t.hook?.kind === "heal" ? { targetId: target } : {}),
        // Outside a fight there is no Exposed: a Drawback technique costs Health.
        ...(t.chooseDrawback ? { drawback: "health" as const } : {}),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cluster">
      {t.hook?.kind === "heal" && (
        <select className="select select--sm" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Whom">
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === c.id ? `${p.name} (self)` : p.name}
            </option>
          ))}
        </select>
      )}
      <button className="btn btn--sm" disabled={busy || Boolean(t.blocked)} onClick={use} title={t.blocked ?? t.cost}>
        Use {t.name} ({t.cost})
      </button>
      {t.blocked && <span className="small dim">{t.blocked}</span>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function ClassHeld({ campaignId, engine, c, readOnly, inFight }: { campaignId: string; engine: Engine | null; c: InterfaceSheet; readOnly?: boolean; inFight: boolean }) {
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
    <section className="sys-section">
      <h2 className="sys-label">Class</h2>
      <div className="spread">
        <h3 className="class-name">{k.name}</h3>
        <Glyphs name={k.name} />
      </div>
      <Package engine={engine} p={k} bonus={k.bonus} />
      {!readOnly && !c.dead && <OutOfFight campaignId={campaignId} engine={engine} c={c} inFight={inFight} />}
      {k.permission.onceADay && (
        <div className="cluster">
          <span className="small dim">
            {k.usedSinceDawn === null ? `${k.permission.name}: once a day.` : k.usedSinceDawn ? `${k.permission.name}: used. Ready at dawn.` : `${k.permission.name}: ready.`}
          </span>
          {!readOnly && !c.dead && k.usedSinceDawn !== true && (
            <button className="btn btn--sm" disabled={busy} onClick={use}>
              Use {k.permission.name}
            </button>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
