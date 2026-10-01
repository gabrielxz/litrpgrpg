/**
 * The Hidden Vector Engine by hand (The Hidden Vector Engine, "The Session-End Sweep"): the
 * session-end sweep, where the GM tallies the moments they remember for each character and the
 * record moves Current into Deep, and each character's standing sheet (Deep, Coherence, the
 * circled notes, past sweeps). Nothing here reaches a player.
 */
import "../css/hve-log.css";
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
  sessionName,
  sweepWeight,
  weights,
} from "@gradebreaker/record";
import { useEffect, useState } from "react";
import type { Names } from "../text.ts";
import { Commit } from "./Commit.tsx";
import { entryLine } from "./Events.tsx";
import { startOpportunity } from "../api.ts";
import type { DraftRuns } from "./Drafts.tsx";
import { Icon } from "../ui.tsx";
import { NEEDS_KEY, useAiConfigured } from "./useAi.ts";

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
    <div className="stack hve-moment">
      <div className="hve-moment__fields">
        <label className="field">
          <span>Side</span>
          <select
            className="select"
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
        <label className="field">
          <span>Weight</span>
          <select className="select" value={weight} onChange={(e) => setWeight(Number(e.target.value))}>
            {ws.map((x) => (
              <option key={x.tallies} value={x.tallies}>
                {x.tallies}: {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field" title="A moment that clearly reads on two axes tallies its secondary one weight lower">
          <span>Also reads on</span>
          <select className="select" value={secondary} disabled={weight < 2} onChange={(e) => setSecondary(e.target.value)}>
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
        <label className="field">
          <span>{w.margin_note ? "Margin note (required)" : "Note"}</span>
          <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={w.margin_note ? "One line: what they did" : "Optional cue"} />
        </label>
      </div>
      <div className="cluster hve-moment__act">
        <label className="check small">
          <input type="checkbox" checked={coercion} onChange={(e) => setCoercion(e.target.checked)} />
          Coercion of a player character
        </label>
        <button className="btn btn--sm" type="button" disabled={Boolean(problem)} onClick={add}>
          <Icon name="add" />
          Add
        </button>
      </div>
      {problem && <p className="problem">{problem}</p>}
    </div>
  );
}

/** Four rows, one per axis: Current as tallied so far, and Deep as it stands. */
function SheetRows({ engine, current, deep }: { engine: Engine; current: Record<string, number> | null; deep: Record<string, number> }) {
  const side = (v: Record<string, number>, p: string) => (
    <span className={v[p] ? undefined : "dim"}>
      {p} <span className="num">{v[p] ?? 0}</span>
    </span>
  );
  return (
    <table className={`hve-axes${current ? " hve-axes--current" : ""}`}>
      <thead>
        <tr className="label">
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
                {side(current, a.poles[0])} <span className="dim">|</span> {side(current, a.poles[1])}
              </td>
            )}
            <td>
              {side(deep, a.poles[0])} <span className="dim">|</span> {side(deep, a.poles[1])}
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
  const running = view.sessions[0] && !view.sessions[0].endedAt ? view.sessions[0] : undefined;
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
    <section className="panel hve-sweep" aria-label="The session-end sweep">
      <div className="panel__head">
        <i className="ic ic-hve dim" aria-hidden="true" />
        <h2>The session-end sweep</h2>
      </div>
      <div className="panel__body stack hve-panel-body">
        <p className="hve-intro">
          Say the session's three biggest moments out loud with the table and name what they share. The tallies that follow are yours alone:
          tally only what you recall without effort.
        </p>
        <details className="small hve-weighing">
          <summary>Weighing a moment</summary>
          <table className="table">
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
                  <td className="dim">{w.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul>
            {(sweep.calibration as string[]).map((c) => (
              <li key={c}>{c.charAt(0).toUpperCase() + c.slice(1)}.</li>
            ))}
            <li>Coercion aimed at another player character is always at least {sweep.pvp_coercion_min_will_tallies} tallies of Will.</li>
          </ul>
        </details>
        <label className="field hve-session">
          <span>Session</span>
          <input className="input" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder={running ? sessionName(running) : "Session 3"} />
        </label>
        {!running && <p className="small dim">No session is running; name the session this sweep closes.</p>}
        {living.length === 0 && <p className="dim">No characters yet.</p>}
      </div>
      {living.map((c) => (
        <div key={c.id} className="stack hve-sheet" role="group" aria-label={`${c.name}'s sweep sheet`}>
          <h3>{c.name}</h3>
          {logged(c.id).length > 0 && (
            <div className="stack hve-list">
              <h4 className="dim">Logged since the last sweep</h4>
              <ul className="stack hve-list">
                {logged(c.id).map(({ e, x }) => (
                  <li key={e.id}>
                    <label className="check small hve-logged">
                      <input type="checkbox" checked={isIn(e, x)} onChange={(ev) => setPicked({ ...picked, [`${e.id}:${x.characterId}`]: ev.target.checked })} />
                      <span>
                        {entryLine(x)}
                        {x.intensity === below && <span className="dim"> ({isIn(e, x) ? "raised to a full tally" : "a reminder"})</span>}
                        <span className="dim"> · {e.summary}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {handMoments(c.id).length > 0 && (
            <ul className="stack small hve-list">
              {handMoments(c.id).map((m, i) => (
                <li key={i}>
                  <span className={ws.find((w) => w.tallies === m.weight)?.circled ? "circled" : undefined}>{momentLine(ws, m)}</span>
                  {m.note && <span className="dim"> · {m.note}</span>}{" "}
                  <button className="btn-link" type="button" onClick={() => set(c.id, handMoments(c.id).filter((_, j) => j !== i))}>
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
        <p className="callout hve-callout" role="status">
          <Icon name="warning" />
          <span>
            {total} tallies across the party. A normal session runs {low} to {high}; more usually means table talk is being counted.
          </span>
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
    <details className="small hve-disclosure">
      <summary className="dim">Copy Deep across from a paper sheet</summary>
      <div className="hve-deep">
        {axes(engine).flatMap((a) =>
          a.poles.map((p) => (
            <label key={p} className="field">
              <span>{p}</span>
              <input className="input num" type="number" min={0} value={deep[p] ?? 0} onChange={(e) => setDeep({ ...deep, [p]: Number(e.target.value) })} />
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
    <section className="panel hve-standing" aria-label={c.name}>
      <div className="panel__head">
        <h3>{c.name}</h3>
        {c.dead && <span className="tag tag--danger">dead</span>}
      </div>
      <div className="panel__body stack hve-standing__body">
        <p className="small">
          <b>{c.hve.coherence.profile}</b> (Coherence +{c.hve.coherence.bonus})
          {c.hve.archetype && <span className="dim"> · reads as {c.hve.archetype}</span>}
        </p>
        <SheetRows engine={engine} current={null} deep={c.hve.deep} />
        {notes.length > 0 && (
          <div className="stack small hve-circled">
            <h4>Circled</h4>
            <ul className="stack hve-circled">
              {notes.map(({ s, m }, i) => (
                <li key={i}>
                  <span className="circled">{m.pole}</span> {m.note}
                  {s.label && <span className="dim"> ({s.label})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {c.hve.sweeps.length > 0 && (
          <details className="small hve-disclosure">
            <summary className="dim">Sweeps ({c.hve.sweeps.length})</summary>
            <ul className="stack hve-circled">
              {[...c.hve.sweeps].reverse().map((s) => (
                <li key={s.id}>
                  <b>{s.label ?? "Unnamed session"}</b>: {s.moments.map((m) => momentLine(ws, m)).join("; ")}
                  {s.added.length ? ` → Deep ${s.added.map((p) => `${p} +1`).join(", ")}` : " → Deep unchanged"}
                </li>
              ))}
            </ul>
          </details>
        )}
        {!c.dead && <CopyDeep view={view} engine={engine} c={c} names={names} onRecorded={onRecorded} />}
      </div>
    </section>
  );
}

/**
 * A Personal Opportunity drafted at the sweep (Quests, "Personal Opportunities"; The Hidden Vector
 * Engine: the offer is drafted at the sweep). The draft lands in Suggestions, where the GM opens it
 * in the Quests form to edit and issue; writing one by hand in Quests makes the same record.
 */
function OpportunityCard({ view, drafts }: { view: GmView; drafts: DraftRuns }) {
  const living = view.characters.filter((c) => !c.dead);
  const [who, setWho] = useState(living[0]?.id ?? "");
  const [situation, setSituation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  const configured = useAiConfigured(view.campaign.id);
  const run = drafts.runs.find((r) => r.id === started);
  const draft = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await startOpportunity(view.campaign.id, who, situation);
      drafts.setRuns((rs) => [out.run, ...rs]);
      setStarted(out.run.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!living.length) return null;
  return (
    <section className="panel" aria-label="Personal Opportunities">
      <div className="panel__head">
        <i className="ic ic-quest dim" aria-hidden="true" />
        <h2>Personal Opportunities</h2>
      </div>
      <div className="panel__body stack hve-panel-body">
        <p className="small dim hve-offer-note">
          Drafted after the sweep, from the character's sheet, the sweep's moments, and the situation. The draft waits in Suggestions for you to edit and issue; a
          Personal Opportunity written in the <a href="#quests">Quests</a> section makes the same record.
        </p>
        <label className="field hve-offer-for">
          <span>For</span>
          <select className="select" value={who} onChange={(e) => setWho(e.target.value)}>
            {living.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>The situation (optional)</span>
          <textarea className="textarea" rows={2} maxLength={2000} value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="Where they are, who is near, what presses on them" />
        </label>
        <div className="cluster">
          {configured === false ? (
            <span className="small dim">Drafting an offer {NEEDS_KEY}.</span>
          ) : (
            <button className="btn btn--primary" type="button" disabled={busy || !who || drafts.drafting || !configured} onClick={draft}>
              Draft an offer
            </button>
          )}
          {run?.status === "drafting" && <span className="small dim">Drafting…</span>}
          {run?.status === "done" && run.items.length > 0 && (
            <span className="small">
              Drafted: waiting in <a href="#suggestions">Suggestions</a>.
            </span>
          )}
          {run?.status === "done" && !run.items.length && <span className="error">{run.dropped[0]?.why ?? "Nothing came back."}</span>}
          {run?.status === "failed" && <span className="error">{run.message}</span>}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}

export function HveSection({ view, engine, names, onRecorded, drafts }: { view: GmView; engine: Engine | null; names: Names; onRecorded: (env: Envelope) => void; drafts: DraftRuns }) {
  if (!engine) return <p className="dim pad">Loading rules…</p>;
  return (
    <main className="screen screen--side hve-screen">
      <div className="stack hve-main">
        <SweepForm view={view} engine={engine} names={names} onRecorded={onRecorded} />
        <OpportunityCard view={view} drafts={drafts} />
      </div>
      <aside className="stack hve-side" aria-label="Standing sheets">
        <p className="small dim">Players never see these sheets. Undo a sweep from the campaign log.</p>
        {view.characters.map((c) => (
          <StandingSheet key={c.id} view={view} engine={engine} c={c} names={names} onRecorded={onRecorded} />
        ))}
      </aside>
    </main>
  );
}
