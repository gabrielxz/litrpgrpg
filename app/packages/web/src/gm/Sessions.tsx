/**
 * Sessions on the GM's screen: a bar under the sections that starts a session, marks who
 * arrives or leaves, and ends it with the summary and a check that the sweep was recorded; and
 * the campaign's sessions, newest first, each summary editable afterward. With the campaign's
 * key, the summary can be drafted from what the record holds for the session. The campaign
 * memory (the campaign paragraph and each character's chronicle, which AI requests carry instead
 * of the whole history) is written for the newest session, and can be drafted as a rewrite of
 * the memory before it with the session folded in. Nothing here reaches a player.
 */
import { type Action, type CampaignSession, type Envelope, type GmView, clockLine, memoryOf, sessionName } from "@gradebreaker/record";
import { useState } from "react";
import { draftMemory, draftSessionSummary, newActionId, submit } from "../api.ts";
import type { Names } from "../text.ts";
import { Commit } from "./Commit.tsx";
import { useAiConfigured } from "./useAi.ts";
import { useTablebarOpen } from "./Setup.tsx";

/** Drafts the session's summary into the GM's field; the GM edits it before saving. */
function DraftSummary({ view, s, onDraft }: { view: GmView; s: CampaignSession; onDraft: (text: string) => void }) {
  const ai = useAiConfigured(view.campaign.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ai) return null;
  const draft = async () => {
    setBusy(true);
    setError(null);
    try {
      onDraft((await draftSessionSummary(view.campaign.id, s.id)).draft.summary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cluster">
      <button className="btn btn--sm" type="button" disabled={busy} onClick={draft}>
        {busy ? "Drafting…" : "Draft it from the record"}
      </button>
      <span className="small dim">From the session's events, kills, quests, titles, and levels; it replaces the text above.</span>
      {error && <span className="error">{error}</span>}
    </div>
  );
}

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
      <DraftSummary view={view} s={s} onDraft={setSummary} />
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
            <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "session.attend", characterId: c.id, present: !here(c.id) })}>
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
  useTablebarOpen("start", () => setOpen("start"));
  const recorded = (env: Envelope) => {
    setOpen(null);
    onRecorded(env);
  };
  const toggle = (p: typeof open) => setOpen(open === p ? null : p);
  const here = running ? running.present.filter((id) => !running.left.includes(id)) : [];
  // A part of the table bar; its forms open under the bar (styles.css, "the table bar").
  return (
    <>
      <div className="tablebar__part session">
        <i className="ic ic-session dim" aria-hidden="true" />
        {running ? (
          <>
            <span className="tablebar__big tablebar__name">{sessionName(running)}</span>
            <span className="dim">
              since {time(running.startedAt)} · {here.length ? here.map(names).join(", ") : "nobody at the table"}
              {running.left.length > 0 && ` (left: ${running.left.map(names).join(", ")})`}
            </span>
            <button className="btn btn--sm" aria-expanded={open === "attendance"} onClick={() => toggle("attendance")}>
              Attendance
            </button>
            <button className="btn btn--sm" aria-expanded={open === "end"} onClick={() => toggle("end")}>
              End the session
            </button>
          </>
        ) : (
          <>
            <span className="dim">No session running.</span>
            <button className="btn btn--sm" aria-expanded={open === "start"} onClick={() => toggle("start")}>
              Start a session
            </button>
          </>
        )}
      </div>
      {open === "start" && !running && (
        <div className="tablebar__drawer">
          <StartForm view={view} names={names} onRecorded={recorded} />
        </div>
      )}
      {open === "attendance" && running && (
        <div className="tablebar__drawer">
          <Attendance view={view} s={running} onRecorded={onRecorded} />
        </div>
      )}
      {open === "end" && running && (
        <div className="tablebar__drawer">
          <EndForm view={view} s={running} names={names} onRecorded={recorded} onSweep={onSweep} />
        </div>
      )}
    </>
  );
}

function SummaryEditor({ view, s, names, onRecorded }: { view: GmView; s: CampaignSession; names: Names; onRecorded: (env: Envelope) => void }) {
  const [text, setText] = useState(s.summary ?? "");
  return (
    <details className="small log-disclosure">
      <summary>{s.summary ? "Edit the summary" : "Write a summary"}</summary>
      <div className="stack log-disclosure__body">
        <textarea className="textarea" aria-label="Summary" value={text} maxLength={2000} rows={3} onChange={(e) => setText(e.target.value)} />
        <DraftSummary view={view} s={s} onDraft={setText} />
        <Commit
          campaignId={view.campaign.id}
          action={text.trim() === (s.summary ?? "") ? null : { type: "session.summary", sessionId: s.id, summary: text }}
          problem={text.trim() === (s.summary ?? "") ? "Unchanged." : null}
          names={names}
          label="Save the summary"
          onRecorded={onRecorded}
        />
      </div>
    </details>
  );
}

/** The memory now, from the sessions as the view holds them (newest first there, oldest first here). */
const memoryNow = (view: GmView) => memoryOf({ sessions: new Map([...view.sessions].reverse().map((s) => [s.id, s])) });

/**
 * The campaign memory written for the newest session: the paragraph and a chronicle for each
 * character present, starting from the memory now. With the campaign's key, a rewrite drafts in.
 */
function MemoryEditor({ view, s, names, onRecorded }: { view: GmView; s: CampaignSession; names: Names; onRecorded: (env: Envelope) => void }) {
  const ai = useAiConfigured(view.campaign.id);
  const now = memoryNow(view);
  const who = s.present.filter((id) => view.characters.some((c) => c.id === id && !c.dead));
  const [campaign, setCampaign] = useState(now.campaign?.text ?? "");
  const [chronicles, setChronicles] = useState<Record<string, string>>(Object.fromEntries(who.map((id) => [id, now.chronicles.get(id)?.text ?? ""])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = (await draftMemory(view.campaign.id, s.id)).draft;
      setCampaign(d.campaign);
      setChronicles({ ...chronicles, ...Object.fromEntries(d.chronicles.map((c) => [c.characterId, c.text])) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const changed = who.filter((id) => (chronicles[id] ?? "").trim() !== (now.chronicles.get(id)?.text ?? ""));
  const campaignChanged = campaign.trim() !== (now.campaign?.text ?? "");
  const action: Action | null =
    campaignChanged || changed.length
      ? { type: "session.memory", sessionId: s.id, ...(campaignChanged ? { campaign } : {}), ...(changed.length ? { chronicles: changed.map((id) => ({ characterId: id, text: chronicles[id] ?? "" })) } : {}) }
      : null;
  return (
    <details className="small log-disclosure">
      <summary>{now.campaign ? "Update the campaign memory" : "Write the campaign memory"}</summary>
      <div className="stack log-disclosure__body">
        <p className="dim">What every AI request for this campaign carries in place of the whole history. The campaign paragraph: the premise and where the story stands. A chronicle: who a character has been so far.</p>
        <label className="field">
          <span>The campaign</span>
          <textarea className="textarea" value={campaign} maxLength={3000} rows={4} onChange={(e) => setCampaign(e.target.value)} placeholder="The premise, where the story stands, what is unresolved, who matters." />
        </label>
        {who.map((id) => (
          <label key={id} className="field">
            <span>{names(id)}'s chronicle</span>
            <textarea className="textarea" value={chronicles[id] ?? ""} maxLength={2000} rows={2} onChange={(e) => setChronicles({ ...chronicles, [id]: e.target.value })} />
          </label>
        ))}
        {ai && (
          <div className="cluster">
            <button className="btn btn--sm" type="button" disabled={busy} onClick={draft}>
              {busy ? "Drafting…" : "Draft the rewrite"}
            </button>
            <span className="small dim">Folds {sessionName(s)} into the memory as it stood; it replaces the text above.</span>
            {error && <span className="error">{error}</span>}
          </div>
        )}
        <Commit campaignId={view.campaign.id} action={action} problem={action ? null : "Unchanged."} names={names} label="Save the memory" onRecorded={onRecorded} />
      </div>
    </details>
  );
}

export function SessionsCard({ view, names, onRecorded }: { view: GmView; names: Names; onRecorded: (env: Envelope) => void }) {
  if (!view.sessions.length) return null;
  const now = memoryNow(view);
  const newest = view.sessions[0]!;
  return (
    <aside className="panel sessions-panel" aria-labelledby="sessions-h">
      <div className="panel__head">
        <i className="ic ic-session dim" aria-hidden="true" />
        <h2 id="sessions-h">Sessions</h2>
      </div>
      <div className="panel__body stack sessions-memory">
        <h3>Campaign memory</h3>
        {now.campaign ? <p className="prose">{now.campaign.text}</p> : <p className="small dim">No campaign paragraph yet.</p>}
        {[...now.chronicles].length > 0 && (
          <ul className="small stack sessions-chronicles">
            {[...now.chronicles].map(([id, c]) => (
              <li key={id}>
                <b>{names(id)}</b>: {c.text}
              </li>
            ))}
          </ul>
        )}
        <MemoryEditor key={`${newest.id}:${now.campaign?.text ?? ""}:${[...now.chronicles.values()].map((c) => c.text).join("|")}`} view={view} s={newest} names={names} onRecorded={onRecorded} />
      </div>
      <ol className="rows sessions-rows">
        {view.sessions.map((s) => {
          const events = view.events.filter((e) => e.sessionId === s.id).length;
          const swept = sweptIn(view, s);
          return (
            <li key={s.id}>
              <div>
                <b>{sessionName(s)}</b>
                <span className="small dim">
                  {" "}
                  · {day(s.startedAt)}, {time(s.startedAt)}
                  {s.endedAt ? ` to ${time(s.endedAt)}` : ", running"}
                  {s.clockStart !== undefined && ` · in the game, ${clockLine(s.clockStart)}${s.clockEnd !== undefined ? ` to ${clockLine(s.clockEnd)}` : ""}`}
                </span>
              </div>
              <div className="small dim sessions-roster">
                {s.present.map(names).join(", ") || "nobody"}
                {s.left.length > 0 && ` (left early: ${s.left.map(names).join(", ")})`} · {events} {events === 1 ? "event" : "events"} ·{" "}
                {swept.length ? `swept: ${swept.map(names).join(", ")}` : "no sweep"}
              </div>
              {s.summary && <p className="prose sessions-summary">{s.summary}</p>}
              <SummaryEditor key={s.summary ?? ""} view={view} s={s} names={names} onRecorded={onRecorded} />
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
