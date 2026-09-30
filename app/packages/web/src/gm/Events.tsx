/**
 * The GM's Events section: draft events from table talk and review the drafts, log what
 * happened at the table by hand (a summary, the context, the characters in it, the GM's notes)
 * with an optional HVE entry per character, and read the events back, newest first. The sweep
 * offers each entry not yet swept. Nothing here reaches a player.
 */
import type { Engine } from "@gradebreaker/engine";
import { type CampaignEvent, type Envelope, type GmView, type HeardLine, type HveEntry, clockLine, sessionName } from "@gradebreaker/record";
import { useState } from "react";
import type { Names } from "../text.ts";
import { Commit } from "./Commit.tsx";
import { type DraftRuns, DraftsCard } from "./Drafts.tsx";
import { EventFields, emptyEvent, eventActionOf } from "./EventFields.tsx";
import { HeardCard } from "./Heard.tsx";

export function entryLine(x: HveEntry): string {
  return `${x.pole} ${x.intensity}${x.secondary ? `, ${x.secondary} ${x.intensity - 1}` : ""}${x.coercion ? ", coercion of a player character" : ""}`;
}

function LogForm({ view, engine, names, onRecorded }: { view: GmView; engine: Engine; names: Names; onRecorded: (env: Envelope) => void }) {
  const [value, setValue] = useState(emptyEvent);
  const action = eventActionOf(value);
  return (
    <section className="card">
      <h2>Log an event</h2>
      <EventFields view={view} engine={engine} value={value} onChange={setValue} />
      <Commit
        campaignId={view.campaign.id}
        action={action}
        problem={action ? null : "Say what happened."}
        names={names}
        label="Log the event"
        onRecorded={(env) => {
          setValue(emptyEvent());
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
        {e.clock !== undefined ? `${clockLine(e.clock)} · ` : ""}
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

export function EventsSection({
  view,
  engine,
  names,
  onRecorded,
  drafts,
  heard,
}: {
  view: GmView;
  engine: Engine | null;
  names: Names;
  onRecorded: (env: Envelope) => void;
  drafts: DraftRuns;
  heard: HeardLine[];
}) {
  const [who, setWho] = useState("");
  const [seed, setSeed] = useState<{ text: string; n: number }>({ text: "", n: 0 });
  if (!engine) return <p className="muted pad">Loading rules…</p>;
  const shown = who ? view.events.filter((e) => e.participants.includes(who)) : view.events;
  const sessionOf = (e: CampaignEvent) => {
    const s = view.sessions.find((x) => x.id === e.sessionId);
    return s && sessionName(s);
  };
  return (
    <main className="gm">
      <div>
        <HeardCard view={view} heard={heard} drafts={drafts} onUse={(text) => setSeed((s) => ({ text, n: s.n + 1 }))} />
        <DraftsCard view={view} engine={engine} names={names} onRecorded={onRecorded} drafts={drafts} seed={seed} />
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
