/**
 * The GM's Events section: log what happened at the table (a summary, the context, the
 * characters in it, the GM's notes) with an optional HVE entry per character, and read the
 * events back, newest first. The sweep offers each entry not yet swept. Nothing here reaches a
 * player.
 */
import type { Engine } from "@gradebreaker/engine";
import { type CampaignEvent, type Envelope, type GmView, type HveEntry, axes, intensities, sessionName, weights } from "@gradebreaker/record";
import { useState } from "react";
import type { Names } from "../text.ts";
import { Commit } from "./Commit.tsx";

/** An intensity as the table reads it: the sweep's weight name, or the reminder tier. */
export function intensityName(engine: Engine, n: number): string {
  const w = weights(engine).find((x) => x.tallies === n);
  return w ? `${n}: ${w.name}` : `${n}: below the sweep's threshold (a reminder)`;
}

export function entryLine(x: HveEntry): string {
  return `${x.pole} ${x.intensity}${x.secondary ? `, ${x.secondary} ${x.intensity - 1}` : ""}${x.coercion ? ", coercion of a player character" : ""}`;
}

function EntryFields({ engine, entry, onChange }: { engine: Engine; entry: HveEntry; onChange: (x: HveEntry) => void }) {
  const ax = axes(engine);
  const axisOf = (p: string) => ax.find((a) => a.poles.includes(p))!.name;
  const set = (patch: Partial<HveEntry>) => {
    const next: HveEntry = { ...entry, ...patch };
    if (next.secondary === "" || (next.secondary && (next.intensity < 2 || axisOf(next.secondary) === axisOf(next.pole)))) delete next.secondary;
    if (next.intent === "") delete next.intent;
    if (next.outcome === "") delete next.outcome;
    if (!next.coercion) delete next.coercion;
    onChange(next);
  };
  return (
    <div className="moment-form">
      <label>
        Side
        <select value={entry.pole} onChange={(e) => set({ pole: e.target.value })}>
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
        Intensity
        <select value={entry.intensity} onChange={(e) => set({ intensity: Number(e.target.value) })}>
          {intensities(engine).map((n) => (
            <option key={n} value={n}>
              {intensityName(engine, n)}
            </option>
          ))}
        </select>
      </label>
      <label title="A moment that clearly reads on two axes tallies its secondary one weight lower">
        Also reads on
        <select value={entry.secondary ?? ""} disabled={entry.intensity < 2} onChange={(e) => set({ secondary: e.target.value })}>
          <option value="">nothing else</option>
          {ax
            .filter((a) => a.name !== axisOf(entry.pole))
            .map((a) => (
              <optgroup key={a.name} label={a.name}>
                {a.poles.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
      </label>
      <label className="grow">
        Intent
        <input value={entry.intent ?? ""} maxLength={300} onChange={(e) => set({ intent: e.target.value })} placeholder="What they were after" />
      </label>
      <label className="grow">
        Outcome
        <input value={entry.outcome ?? ""} maxLength={300} onChange={(e) => set({ outcome: e.target.value })} placeholder="What came of it" />
      </label>
      <label className="check">
        <input type="checkbox" checked={Boolean(entry.coercion)} onChange={(e) => set({ coercion: e.target.checked })} />
        Coercion of a player character
      </label>
    </div>
  );
}

function LogForm({ view, engine, names, onRecorded }: { view: GmView; engine: Engine; names: Names; onRecorded: (env: Envelope) => void }) {
  const living = view.characters.filter((c) => !c.dead);
  const [summary, setSummary] = useState("");
  const [context, setContext] = useState("");
  const [notes, setNotes] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [entries, setEntries] = useState<Record<string, HveEntry>>({});
  const first = axes(engine)[0]!.poles[0];
  const toggle = (id: string, on: boolean) => {
    setParticipants(on ? [...participants, id] : participants.filter((p) => p !== id));
    if (!on) {
      const { [id]: _, ...rest } = entries;
      setEntries(rest);
    }
  };
  const chosen = participants.filter((id) => entries[id]).map((id) => entries[id]!);
  const action = summary.trim()
    ? {
        type: "event.log" as const,
        summary: summary.trim(),
        participants,
        ...(context.trim() ? { context: context.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(chosen.length ? { entries: chosen } : {}),
      }
    : null;
  return (
    <section className="card">
      <h2>Log an event</h2>
      <div className="form">
        <label>
          What happened
          <input value={summary} maxLength={300} onChange={(e) => setSummary(e.target.value)} placeholder="Took the party's only healing pill while the others argued" />
        </label>
        <label>
          Context
          <input value={context} maxLength={300} onChange={(e) => setContext(e.target.value)} placeholder="Recycling Node loot split" />
        </label>
        <fieldset className="participants">
          <legend>Who was in it</legend>
          {living.length === 0 && <p className="muted">No characters yet.</p>}
          {living.map((c) => (
            <div key={c.id} className="participant">
              <label className="check">
                <input type="checkbox" checked={participants.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
                {c.name}
              </label>
              {participants.includes(c.id) && (
                <label className="check small">
                  <input
                    type="checkbox"
                    checked={Boolean(entries[c.id])}
                    onChange={(e) => {
                      if (e.target.checked) setEntries({ ...entries, [c.id]: { characterId: c.id, pole: first, intensity: weights(engine)[0]!.tallies } });
                      else {
                        const { [c.id]: _, ...rest } = entries;
                        setEntries(rest);
                      }
                    }}
                  />
                  HVE entry
                </label>
              )}
              {entries[c.id] && <EntryFields engine={engine} entry={entries[c.id]!} onChange={(x) => setEntries({ ...entries, [c.id]: x })} />}
            </div>
          ))}
        </fieldset>
        <label>
          GM notes
          <textarea value={notes} maxLength={2000} rows={2} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <Commit
        campaignId={view.campaign.id}
        action={action}
        problem={action ? null : "Say what happened."}
        names={names}
        label="Log the event"
        onRecorded={(env) => {
          setSummary("");
          setContext("");
          setNotes("");
          setParticipants([]);
          setEntries({});
          onRecorded(env);
        }}
      />
    </section>
  );
}

function EventCard({ e, names, session }: { e: CampaignEvent; names: Names; session?: string }) {
  return (
    <li className="event">
      <div>
        <strong>{e.summary}</strong>
        {e.context && <span className="muted"> · {e.context}</span>}
      </div>
      <div className="muted small">
        {session ? `${session} · ` : ""}
        {new Date(e.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
        {e.participants.length > 0 && ` · ${e.participants.map(names).join(", ")}`}
      </div>
      {e.entries.length > 0 && (
        <ul className="moments">
          {e.entries.map((x) => (
            <li key={x.characterId}>
              {names(x.characterId)}: {entryLine(x)}
              {x.intent && <span className="muted"> · intent: {x.intent}</span>}
              {x.outcome && <span className="muted"> · outcome: {x.outcome}</span>} <span className={`tag${x.sweptIn ? "" : " attention"}`}>{x.sweptIn ? "swept" : "for the sweep"}</span>
            </li>
          ))}
        </ul>
      )}
      {e.notes && <p className="muted small">{e.notes}</p>}
    </li>
  );
}

export function EventsSection({ view, engine, names, onRecorded }: { view: GmView; engine: Engine | null; names: Names; onRecorded: (env: Envelope) => void }) {
  const [who, setWho] = useState("");
  if (!engine) return <p className="muted pad">Loading rules…</p>;
  const shown = who ? view.events.filter((e) => e.participants.includes(who)) : view.events;
  const sessionOf = (e: CampaignEvent) => {
    const s = view.sessions.find((x) => x.id === e.sessionId);
    return s && sessionName(s);
  };
  return (
    <main className="gm">
      <div>
        <LogForm view={view} engine={engine} names={names} onRecorded={onRecorded} />
      </div>
      <aside className="side">
        <section className="card">
          <h2>Events</h2>
          <label>
            Show
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">every character</option>
              {view.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {shown.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="events">
              {shown.map((e) => (
                <EventCard key={e.id} e={e} names={names} session={sessionOf(e)} />
              ))}
            </ul>
          )}
          <p className="muted small">Players never see events. Undo one from the campaign log.</p>
        </section>
      </aside>
    </main>
  );
}
