/**
 * Sessions on the GM's screen: a bar under the sections that starts a session, marks who
 * arrives or leaves, and ends it with the summary and a check that the sweep was recorded; and
 * the campaign's sessions, newest first, each summary editable afterward. Nothing here reaches
 * a player.
 */
import { type Action, type CampaignSession, type Envelope, type GmView, clockLine, sessionName } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import type { Names } from "../text.ts";
import { Commit } from "./Commit.tsx";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { dateStyle: "medium" });

/** Characters swept in a session, from each sheet's sweep history. */
function sweptIn(view: GmView, s: CampaignSession): string[] {
  return view.characters.filter((c) => c.hve.sweeps.some((w) => w.sessionId === s.id)).map((c) => c.id);
}

function StartForm({ view, names, onRecorded }: { view: GmView; names: Names; onRecorded: (env: Envelope) => void }) {
  const living = view.characters.filter((c) => !c.dead);
  const [label, setLabel] = useState("");
  const [present, setPresent] = useState<string[]>(living.map((c) => c.id));
  const next = `Session ${view.sessions.length + 1}`;
  return (
    <div className="form">
      <label>
        Name
        <input value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder={next} />
      </label>
      <fieldset className="participants">
        <legend>At the table</legend>
        {living.map((c) => (
          <label key={c.id} className="check">
            <input
              type="checkbox"
              checked={present.includes(c.id)}
              onChange={(e) => setPresent(e.target.checked ? [...present, c.id] : present.filter((p) => p !== c.id))}
            />
            {c.name}
          </label>
        ))}
      </fieldset>
      <Commit
        campaignId={view.campaign.id}
        action={{ type: "session.start", present, ...(label.trim() ? { label: label.trim() } : {}) }}
        names={names}
        label={`Start ${label.trim() || next}`}
        onRecorded={onRecorded}
      />
    </div>
  );
}

function EndForm({
  view,
  s,
  names,
  onRecorded,
  onSweep,
}: {
  view: GmView;
  s: CampaignSession;
  names: Names;
  onRecorded: (env: Envelope) => void;
  onSweep: () => void;
}) {
  const [summary, setSummary] = useState(s.summary ?? "");
  const swept = sweptIn(view, s);
  return (
    <div className="form">
      {swept.length ? (
        <p className="small">Swept this session: {swept.map(names).join(", ")}.</p>
      ) : (
        <p className="small warn">
          No sweep recorded this session.{" "}
          <button className="link" onClick={onSweep}>
            Go to the sweep
          </button>
        </p>
      )}
      <label>
        Summary
        <textarea
          value={summary}
          maxLength={2000}
          rows={3}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Three sentences: what happened, what changed, what is left open."
        />
      </label>
      <Commit
        campaignId={view.campaign.id}
        action={{ type: "session.end", ...(summary.trim() ? { summary: summary.trim() } : {}) }}
        names={names}
        label={`End ${sessionName(s)}`}
        onRecorded={onRecorded}
      />
    </div>
  );
}

/** Who is at the table now: arrivals and departures record at once, and undo from the campaign log. */
function Attendance({ view, s, onRecorded }: { view: GmView; s: CampaignSession; onRecorded: (env: Envelope) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      onRecorded((await submit(view.campaign.id, newActionId(), action)).envelope);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const here = (id: string) => s.present.includes(id) && !s.left.includes(id);
  return (
    <div className="attendance">
      {view.characters
        .filter((c) => !c.dead)
        .map((c) => (
          <span key={c.id} className="attendee">
            <button disabled={busy} onClick={() => run({ type: "session.attend", characterId: c.id, present: !here(c.id) })}>
              {here(c.id) ? `${c.name} leaves` : `${c.name} joins`}
            </button>
          </span>
        ))}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function SessionBar({ view, names, onRecorded, onSweep }: { view: GmView; names: Names; onRecorded: (env: Envelope) => void; onSweep: () => void }) {
  const running = view.sessions[0] && !view.sessions[0].endedAt ? view.sessions[0] : undefined;
  const [open, setOpen] = useState<"start" | "end" | "attendance" | null>(null);
  const recorded = (env: Envelope) => {
    setOpen(null);
    onRecorded(env);
  };
  const toggle = (p: typeof open) => setOpen(open === p ? null : p);
  const here = running ? running.present.filter((id) => !running.left.includes(id)) : [];
  return (
    <div className="session-bar">
      <div className="session-line">
        {running ? (
          <>
            <strong>{sessionName(running)}</strong>
            <span className="muted">
              since {time(running.startedAt)} · {here.length ? here.map(names).join(", ") : "nobody at the table"}
              {running.left.length > 0 && ` (left: ${running.left.map(names).join(", ")})`}
            </span>
            <button onClick={() => toggle("attendance")}>Attendance</button>
            <button onClick={() => toggle("end")}>End the session</button>
          </>
        ) : (
          <>
            <span className="muted">No session running.</span>
            <button onClick={() => toggle("start")}>Start a session</button>
          </>
        )}
      </div>
      {open === "start" && !running && <StartForm view={view} names={names} onRecorded={recorded} />}
      {open === "attendance" && running && <Attendance view={view} s={running} onRecorded={onRecorded} />}
      {open === "end" && running && <EndForm view={view} s={running} names={names} onRecorded={recorded} onSweep={onSweep} />}
    </div>
  );
}

function SummaryEditor({ view, s, names, onRecorded }: { view: GmView; s: CampaignSession; names: Names; onRecorded: (env: Envelope) => void }) {
  const [text, setText] = useState(s.summary ?? "");
  return (
    <details>
      <summary>{s.summary ? "Edit the summary" : "Write a summary"}</summary>
      <textarea value={text} maxLength={2000} rows={3} onChange={(e) => setText(e.target.value)} />
      <Commit
        campaignId={view.campaign.id}
        action={text.trim() === (s.summary ?? "") ? null : { type: "session.summary", sessionId: s.id, summary: text }}
        problem={text.trim() === (s.summary ?? "") ? "Unchanged." : null}
        names={names}
        label="Save the summary"
        onRecorded={onRecorded}
      />
    </details>
  );
}

export function SessionsCard({ view, names, onRecorded }: { view: GmView; names: Names; onRecorded: (env: Envelope) => void }) {
  if (!view.sessions.length) return null;
  return (
    <section className="card">
      <h2>Sessions</h2>
      <ul className="events">
        {view.sessions.map((s) => {
          const events = view.events.filter((e) => e.sessionId === s.id).length;
          const swept = sweptIn(view, s);
          return (
            <li key={s.id} className="event">
              <div>
                <strong>{sessionName(s)}</strong>
                <span className="muted">
                  {" "}
                  · {day(s.startedAt)}, {time(s.startedAt)}
                  {s.endedAt ? ` to ${time(s.endedAt)}` : ", running"}
                  {s.clockStart !== undefined && ` · in the game, ${clockLine(s.clockStart)}${s.clockEnd !== undefined ? ` to ${clockLine(s.clockEnd)}` : ""}`}
                </span>
              </div>
              <div className="muted small">
                {s.present.map(names).join(", ") || "nobody"}
                {s.left.length > 0 && ` (left early: ${s.left.map(names).join(", ")})`} · {events} {events === 1 ? "event" : "events"} ·{" "}
                {swept.length ? `swept: ${swept.map(names).join(", ")}` : "no sweep"}
              </div>
              {s.summary && <p>{s.summary}</p>}
              <SummaryEditor key={s.summary ?? ""} view={view} s={s} names={names} onRecorded={onRecorded} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
