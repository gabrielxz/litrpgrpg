/**
 * The Hidden Vector Engine by hand (The Hidden Vector Engine, "The Session-End Sweep"): the
 * session-end sweep, where the GM tallies the moments they remember for each character and the
 * record moves Current into Deep, and each character's standing sheet (Deep, Coherence, the
 * circled notes, past sweeps). Nothing here reaches a player.
 */
import type { Engine } from "@gradebreaker/engine";
import {
  type CampaignEvent,
  type Envelope,
  type GmView,
  type HveEntry,
  type Moment,
  type Sheet,
  type Weight,
  axes,
  currentOf,
  sweepWeight,
  weights,
} from "@gradebreaker/record";
import { useEffect, useState } from "react";
import type { Names } from "../text.ts";
import { Commit } from "./Commit.tsx";
import { entryLine } from "./Events.tsx";

type Drafts = Record<string, Moment[]>;

/** The sweep in progress, kept in this browser until it is recorded. */
function useDrafts(campaignId: string): [Drafts, (d: Drafts) => void] {
  const key = `gradebreaker.sweep.${campaignId}`;
  const [drafts, setDrafts] = useState<Drafts>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}") as Drafts;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(drafts));
    } catch {
      // Storage is a convenience; the sweep still records without it.
    }
  }, [key, drafts]);
  return [drafts, setDrafts];
}

function momentLine(ws: Weight[], m: Moment) {
  const w = ws.find((x) => x.tallies === m.weight);
  return `${m.pole} ${m.weight}${w?.circled ? " (circled)" : ""}${m.secondary ? `, ${m.secondary} ${m.weight - 1}` : ""}${m.coercion ? ", coercion of a player character" : ""}`;
}

/** One way to add a moment to a character's sweep sheet. */
function AddMoment({ engine, onAdd }: { engine: Engine; onAdd: (m: Moment) => void }) {
  const ws = weights(engine);
  const ax = axes(engine);
  const [pole, setPole] = useState(ax[0]!.poles[0]);
  const [weight, setWeight] = useState(ws[0]!.tallies);
  const [secondary, setSecondary] = useState("");
  const [note, setNote] = useState("");
  const [coercion, setCoercion] = useState(false);
  const w = ws.find((x) => x.tallies === weight)!;
  const minWill = engine.rules.hve.sweep.pvp_coercion_min_will_tallies as number;
  const axisOf = (p: string) => ax.find((a) => a.poles.includes(p))!.name;
  const problem =
    w.margin_note && !note.trim()
      ? `A ${w.name} moment is circled and needs its margin note.`
      : coercion && (pole !== "Will" || weight < minWill)
        ? `Coercion aimed at another player character is at least ${minWill} tallies of Will.`
        : null;
  const add = () => {
    const m: Moment = { pole, weight };
    if (note.trim()) m.note = note.trim();
    if (secondary && weight > 1) m.secondary = secondary;
    if (coercion) m.coercion = true;
    onAdd(m);
    setWeight(ws[0]!.tallies);
    setSecondary("");
    setNote("");
    setCoercion(false);
  };
  return (
    <div className="moment-form">
      <label>
        Side
        <select
          value={pole}
          onChange={(e) => {
            setPole(e.target.value);
            if (secondary && axisOf(secondary) === axisOf(e.target.value)) setSecondary("");
          }}
        >
          {ax.map((a) => (
            <optgroup key={a.name} label={a.name}>
              {a.poles.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label>
        Weight
        <select value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
          {ws.map((x) => (
            <option key={x.tallies} value={x.tallies}>
              {x.tallies}: {x.name}
            </option>
          ))}
        </select>
      </label>
      <label title="A moment that clearly reads on two axes tallies its secondary one weight lower">
        Also reads on
        <select value={secondary} disabled={weight < 2} onChange={(e) => setSecondary(e.target.value)}>
          <option value="">nothing else</option>
          {ax
            .filter((a) => a.name !== axisOf(pole))
            .map((a) => (
              <optgroup key={a.name} label={a.name}>
                {a.poles.map((p) => (
                  <option key={p} value={p}>
                    {p} ({weight - 1})
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
      </label>
      <label className="grow">
        {w.margin_note ? "Margin note (required)" : "Note"}
        <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={w.margin_note ? "One line: what they did" : "Optional cue"} />
      </label>
      <label className="check">
        <input type="checkbox" checked={coercion} onChange={(e) => setCoercion(e.target.checked)} />
        Coercion of a player character
      </label>
      <button disabled={Boolean(problem)} onClick={add}>
        Add
      </button>
      {problem && <p className="muted small">{problem}</p>}
    </div>
  );
}

/** Four rows, one per axis: Current as tallied so far, and Deep as it stands. */
function SheetRows({ engine, current, deep }: { engine: Engine; current: Record<string, number> | null; deep: Record<string, number> }) {
  const side = (v: Record<string, number>, p: string) => <span className={v[p] ? "" : "muted"}>{`${p} ${v[p] ?? 0}`}</span>;
  return (
    <table className="rows hve-rows">
      <thead>
        <tr>
          <th>Axis</th>
          {current && <th>Current</th>}
          <th>Deep</th>
        </tr>
      </thead>
      <tbody>
        {axes(engine).map((a) => (
          <tr key={a.name}>
            <td>{a.name}</td>
            {current && (
              <td>
                {side(current, a.poles[0])} | {side(current, a.poles[1])}
              </td>
            )}
            <td>
              {side(deep, a.poles[0])} | {side(deep, a.poles[1])}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SweepForm({ view, engine, names, onRecorded }: { view: GmView; engine: Engine; names: Names; onRecorded: (env: Envelope) => void }) {
  const [drafts, setDrafts] = useDrafts(view.campaign.id);
  const [label, setLabel] = useState("");
  const ws = weights(engine);
  const sweep = engine.rules.hve.sweep;
  const [low, high] = sweep.expected_tallies_per_session_party as [number, number];
  const living = view.characters.filter((c) => !c.dead);
  // Entries from logged events not yet swept: offered in, a reminder left out until the GM raises it.
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const below = engine.rules.hve.structured_logging.intensities.below_threshold as number;
  const logged = (id: string) =>
    [...view.events].reverse().flatMap((e) => e.entries.filter((x) => x.characterId === id && !x.sweptIn).map((x) => ({ e, x })));
  const isIn = (e: CampaignEvent, x: HveEntry) => picked[`${e.id}:${x.characterId}`] ?? x.intensity !== below;
  const fromEntry = (e: CampaignEvent, x: HveEntry): Moment => {
    const m: Moment = { pole: x.pole, weight: sweepWeight(engine, x.intensity), note: e.summary, eventId: e.id };
    if (x.secondary) m.secondary = x.secondary;
    if (x.coercion) m.coercion = true;
    return m;
  };
  const handMoments = (id: string) => drafts[id] ?? [];
  const momentsOf = (id: string) => [...logged(id).filter(({ e, x }) => isIn(e, x)).map(({ e, x }) => fromEntry(e, x)), ...handMoments(id)];
  const set = (id: string, ms: Moment[]) => setDrafts({ ...drafts, [id]: ms });
  const sheets = living.filter((c) => momentsOf(c.id).length > 0).map((c) => ({ characterId: c.id, moments: momentsOf(c.id) }));
  const total = sheets.reduce((n, s) => n + Object.values(currentOf(engine, s.moments)).reduce((a, b) => a + b, 0), 0);
  return (
    <section className="card">
      <h2>The session-end sweep</h2>
      <p>
        Say the session's three biggest moments out loud with the table and name what they share. The tallies that follow are yours alone:
        tally only what you recall without effort.
      </p>
      <details>
        <summary>Weighing a moment</summary>
        <table className="rows">
          <thead>
            <tr>
              <th>Weight</th>
              <th>What qualifies</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            {(sweep.weights as Weight[]).map((w) => (
              <tr key={w.tallies}>
                <td>
                  {w.tallies ? `${w.tallies}: ` : ""}
                  {w.name}
                  {w.circled ? ", circled" : ""}
                </td>
                <td>{w.qualifies}</td>
                <td className="muted">{w.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="small">
          {(sweep.calibration as string[]).map((c) => (
            <li key={c}>{c.charAt(0).toUpperCase() + c.slice(1)}.</li>
          ))}
          <li>Coercion aimed at another player character is always at least {sweep.pvp_coercion_min_will_tallies} tallies of Will.</li>
        </ul>
      </details>
      <label>
        Session
        <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Session 3" />
      </label>
      {living.length === 0 && <p className="muted">No characters yet.</p>}
      {living.map((c) => (
        <div key={c.id} className="sweep-sheet">
          <h3>{c.name}</h3>
          {logged(c.id).length > 0 && (
            <div>
              <h4>Logged since the last sweep</h4>
              <ul className="moments">
                {logged(c.id).map(({ e, x }) => (
                  <li key={e.id}>
                    <label className="check">
                      <input type="checkbox" checked={isIn(e, x)} onChange={(ev) => setPicked({ ...picked, [`${e.id}:${x.characterId}`]: ev.target.checked })} />
                      <span>
                        {entryLine(x)}
                        {x.intensity === below && <span className="muted"> ({isIn(e, x) ? "raised to a full tally" : "a reminder"})</span>}
                        <span className="muted"> · {e.summary}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {handMoments(c.id).length > 0 && (
            <ul className="moments">
              {handMoments(c.id).map((m, i) => (
                <li key={i}>
                  <span className={ws.find((w) => w.tallies === m.weight)?.circled ? "circled" : ""}>{momentLine(ws, m)}</span>
                  {m.note && <span className="muted"> · {m.note}</span>}{" "}
                  <button className="link" onClick={() => set(c.id, handMoments(c.id).filter((_, j) => j !== i))}>
                    remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AddMoment engine={engine} onAdd={(m) => set(c.id, [...handMoments(c.id), m])} />
          <SheetRows engine={engine} current={currentOf(engine, momentsOf(c.id))} deep={c.hve.deep} />
        </div>
      ))}
      {total > high && (
        <p className="warn small">
          {total} tallies across the party. A normal session runs {low} to {high}; more usually means table talk is being counted.
        </p>
      )}
      <Commit
        campaignId={view.campaign.id}
        action={sheets.length ? { type: "hve.sweep", ...(label.trim() ? { label: label.trim() } : {}), sheets } : null}
        problem={sheets.length ? null : "No moments tallied. If none come to mind, the sheets stay as they are and there is nothing to record."}
        names={names}
        label="Record the sweep"
        onRecorded={(env) => {
          setDrafts({});
          setPicked({});
          setLabel("");
          onRecorded(env);
        }}
      />
    </section>
  );
}

/** Deep copied across from a paper sheet: every side's tallies as they stand. */
function CopyDeep({ view, engine, c, names, onRecorded }: { view: GmView; engine: Engine; c: Sheet; names: Names; onRecorded: (env: Envelope) => void }) {
  const [deep, setDeep] = useState<Record<string, number>>({ ...c.hve.deep });
  const bad = Object.values(deep).some((n) => !Number.isInteger(n) || n < 0);
  return (
    <details>
      <summary>Copy Deep across from a paper sheet</summary>
      <div className="deep-inputs">
        {axes(engine).flatMap((a) =>
          a.poles.map((p) => (
            <label key={p}>
              {p}
              <input type="number" min={0} value={deep[p] ?? 0} onChange={(e) => setDeep({ ...deep, [p]: Number(e.target.value) })} />
            </label>
          )),
        )}
      </div>
      <Commit
        campaignId={view.campaign.id}
        action={{ type: "hve.deep", characterId: c.id, deep }}
        problem={bad ? "Deep tallies are whole numbers from 0." : null}
        names={names}
        label={`Set ${c.name}'s Deep`}
        onRecorded={onRecorded}
      />
    </details>
  );
}

function StandingSheet({ view, engine, c, names, onRecorded }: { view: GmView; engine: Engine; c: Sheet; names: Names; onRecorded: (env: Envelope) => void }) {
  const ws = weights(engine);
  const circled = new Set(ws.filter((w) => w.circled).map((w) => w.tallies));
  const notes = c.hve.sweeps.flatMap((s) => s.moments.filter((m) => circled.has(m.weight) && m.note).map((m) => ({ s, m })));
  return (
    <section className="card">
      <h3>
        {c.name}
        {c.dead && <span className="tag danger">dead</span>}
      </h3>
      <p>
        <strong>{c.hve.coherence.profile}</strong> (Coherence +{c.hve.coherence.bonus})
        {c.hve.archetype && <span className="muted"> · reads as {c.hve.archetype}</span>}
      </p>
      <SheetRows engine={engine} current={null} deep={c.hve.deep} />
      {notes.length > 0 && (
        <div>
          <h4>Circled</h4>
          <ul className="moments">
            {notes.map(({ s, m }, i) => (
              <li key={i}>
                <span className="circled">{m.pole}</span> {m.note}
                {s.label && <span className="muted"> ({s.label})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {c.hve.sweeps.length > 0 && (
        <details>
          <summary>Sweeps ({c.hve.sweeps.length})</summary>
          <ul className="moments small">
            {[...c.hve.sweeps].reverse().map((s) => (
              <li key={s.id}>
                <strong>{s.label ?? "Unnamed session"}</strong>: {s.moments.map((m) => momentLine(ws, m)).join("; ")}
                {s.added.length ? ` → Deep ${s.added.map((p) => `${p} +1`).join(", ")}` : " → Deep unchanged"}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!c.dead && <CopyDeep view={view} engine={engine} c={c} names={names} onRecorded={onRecorded} />}
    </section>
  );
}

export function HveSection({ view, engine, names, onRecorded }: { view: GmView; engine: Engine | null; names: Names; onRecorded: (env: Envelope) => void }) {
  if (!engine) return <p className="muted pad">Loading rules…</p>;
  return (
    <main className="gm">
      <div>
        <SweepForm view={view} engine={engine} names={names} onRecorded={onRecorded} />
      </div>
      <aside className="side">
        <p className="muted small">Players never see these sheets. Undo a sweep from the campaign log.</p>
        {view.characters.map((c) => (
          <StandingSheet key={c.id} view={view} engine={engine} c={c} names={names} onRecorded={onRecorded} />
        ))}
      </aside>
    </main>
  );
}
