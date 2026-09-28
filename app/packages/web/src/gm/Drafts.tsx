/**
 * Drafting from table talk, in the GM's Events section. The GM pastes or types what was said,
 * one `Name: words` line each, and sees how each name was read before drafting. The campaign's
 * model drafts the moments and the bookkeeping on the server. A moment opens in the same editor
 * as logging by hand, with the lines it cites and the model's reason for each entry; an item,
 * quest, or count opens in its own small form; a Prep cue points at the prepared item to fire.
 * The GM accepts each (as drafted or edited) or dismisses it. Nothing here reaches a player.
 */
import type { Engine } from "@gradebreaker/engine";
import { type NameReading, type TypedTalk, readTypedTalk } from "@gradebreaker/listening/typed";
import type { Envelope, GmView, LogEvent } from "@gradebreaker/record";
import { useEffect, useMemo, useState } from "react";
import { type DraftItem, type DraftRun, acceptDraft, api, draftRuns, markDraft, startDraft } from "../api.ts";
import { type Names, describe } from "../text.ts";
import { Commit } from "./Commit.tsx";
import { ActionDraftCard, CueCard } from "./DraftActions.tsx";
import { EventFields, eventActionOf, eventValueOf } from "./EventFields.tsx";

const POLL_MS = 3000;

const readingLine = (r: NameReading, names: Names, members: GmView["members"]) => {
  const who = members.find((m) => m.userId === r.speaker)?.displayName ?? "the GM";
  if (r.kind === "character") return `${r.name}: ${who} as ${names(r.as!)}`;
  if (r.kind === "voiced") return `${r.name}: someone the GM voices`;
  if (r.kind === "gm") return `${r.name}: the GM`;
  return `${r.name}: ${who}, out of character`;
};

function Readings({ talk, view, names }: { talk: TypedTalk; view: GmView; names: Names }) {
  const voiced = talk.readings.filter((r) => r.kind === "voiced");
  return (
    <div className="small readings">
      <span className="muted">
        {talk.lines.length} line{talk.lines.length === 1 ? "" : "s"}.{" "}
      </span>
      {talk.readings.map((r) => (
        <span key={r.name} className={`tag${r.kind === "voiced" ? " attention" : ""}`}>
          {readingLine(r, names, view.members)} ({r.lines})
        </span>
      ))}
      {voiced.length > 0 && (
        <p className="muted">
          A name that is no character and no one at the table reads as someone the GM voices. If it is a player, type their name as it shows in the
          Table section.
        </p>
      )}
    </div>
  );
}

/** The lines a draft cites, as spoken. */
function Cited({ view, run, item, names }: { view: GmView; run: DraftRun; item: DraftItem; names: Names }) {
  const speakers = new Map(run.talk.speakers.map((s) => [s.id, s.name]));
  const byId = new Map(run.talk.lines.map((l) => [l.id, l]));
  const characterIds = new Set(view.characters.map((c) => c.id));
  return (
    <ul className="cited">
      {item.lines.map((id) => {
        const l = byId.get(id);
        if (!l) return null;
        const as = l.as ? (characterIds.has(l.as) ? names(l.as) : l.as) : null;
        return (
          <li key={id}>
            <span className="muted">{speakers.get(l.speaker) ?? "?"}{as ? ` as ${as}` : ""}:</span> {l.text}
          </li>
        );
      })}
    </ul>
  );
}

function DraftCard({
  view,
  engine,
  names,
  run,
  item,
  onChanged,
  onRecorded,
}: {
  view: GmView;
  engine: Engine;
  names: Names;
  run: DraftRun;
  item: DraftItem;
  onChanged: (item: DraftItem) => void;
  onRecorded: (env: Envelope) => void;
}) {
  const [value, setValue] = useState(() => eventValueOf(item.action as LogEvent));
  const [error, setError] = useState<string | null>(null);
  const action = eventActionOf(value);
  const why = Object.fromEntries(item.reasons.map((r) => [r.characterId, r.why]));
  const dismiss = async () => {
    setError(null);
    try {
      onChanged((await markDraft(view.campaign.id, item, "dismiss")).item);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <li className="draft">
      <Cited view={view} run={run} item={item} names={names} />
      {item.undone && <p className="small warning">Accepted, and its event was undone in the log. Accept it again or dismiss it.</p>}
      <EventFields view={view} engine={engine} value={value} onChange={setValue} why={why} />
      <Commit
        campaignId={view.campaign.id}
        action={action}
        problem={action ? null : "Say what happened."}
        names={names}
        label="Accept"
        submitWith={async (id, a) => {
          const out = await acceptDraft(view.campaign.id, item, id, a);
          onChanged(out.item);
          return out.appended;
        }}
        onRecorded={onRecorded}
      />
      <div className="row">
        <button onClick={dismiss}>Dismiss</button>
        {error && <span className="error small">{error}</span>}
      </div>
    </li>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

function RunLine({ run }: { run: DraftRun }) {
  const lines = `${run.talk.lines.length} line${run.talk.lines.length === 1 ? "" : "s"}`;
  if (run.status === "drafting") return <p className="muted">Drafting from {lines}…</p>;
  if (run.status === "failed") return <p className="error small">The draft from {lines} ({when(run.createdAt)}) failed: {run.message}</p>;
  const n = run.items.length;
  return (
    <details className="panel small">
      <summary>
        {when(run.createdAt)}: {n === 0 ? "no moments" : `${n} draft${n === 1 ? "" : "s"}`} from {lines}
        {run.dropped.length > 0 ? `, ${run.dropped.length} dropped` : ""}
      </summary>
      {run.dropped.map((d, i) => (
        <p key={`d${i}`} className="muted">
          Dropped a draft: {d.why}.
        </p>
      ))}
      {run.repaired.map((r, i) => (
        <p key={`r${i}`} className="muted">
          Repaired: {r}.
        </p>
      ))}
      {run.dropped.length + run.repaired.length === 0 && <p className="muted">Every draft came back as the record takes it.</p>}
    </details>
  );
}

export function DraftsCard({ view, engine, names, onRecorded }: { view: GmView; engine: Engine; names: Names; onRecorded: (env: Envelope) => void }) {
  const id = view.campaign.id;
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [runs, setRuns] = useState<DraftRun[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    draftRuns(id)
      .then((r) => setRuns(r.runs))
      .catch((e) => setError(e.message));

  useEffect(() => {
    void api<{ configured: boolean }>("GET", `/campaigns/${id}/ai`)
      .then((a) => setConfigured(a.configured))
      .catch(() => setConfigured(false));
    void refresh();
  }, [id]);

  const drafting = runs.some((r) => r.status === "drafting");
  useEffect(() => {
    if (!drafting) return;
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [drafting, id]);

  // An accepted event that is undone comes back to review, so the list follows the log.
  useEffect(() => {
    if (runs.some((r) => r.items.some((i) => i.status === "accepted"))) void refresh();
  }, [view.seq]);

  const roster = useMemo(
    () => ({
      members: view.members.map((m) => ({ userId: m.userId, name: m.displayName, role: m.role })),
      characters: view.characters.map((c) => ({ id: c.id, name: c.name, playerId: c.playerId })),
    }),
    [view.members, view.characters],
  );
  const talk = useMemo(() => readTypedTalk(text, roster), [text, roster]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const { run } = await startDraft(id, text);
      setRuns([run, ...runs]);
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const replace = (item: DraftItem) =>
    setRuns((rs) => rs.map((r) => (r.id === item.runId ? { ...r, items: r.items.map((i) => (i.itemId === item.itemId ? item : i)) } : r)));

  const settled = (i: DraftItem) => (i.status === "accepted" && !i.undone) || (i.kind === "cue" && i.fired && i.status === "open");
  const waiting = runs.flatMap((run) => run.items.filter((i) => (i.status === "open" || i.undone) && !settled(i)).map((item) => ({ run, item })));
  const dismissed = runs.flatMap((run) => run.items.filter((i) => i.status === "dismissed").map((item) => ({ run, item })));
  const accepted = runs.flatMap((run) => run.items.filter(settled).map((item) => ({ run, item })));
  const summary = (i: DraftItem) =>
    i.kind === "cue"
      ? `Prep cue: ${view.prep.find((p) => p.id === i.prepId)?.title ?? i.prepId}${i.fired ? " (fired)" : ""}`
      : i.action!.type === "event.log"
        ? i.action!.summary
        : describe(i.action!, names, () => undefined);
  const dismiss = async (item: DraftItem) => {
    setError(null);
    try {
      replace((await markDraft(id, item, "dismiss")).item);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const restore = async (item: DraftItem) => {
    setError(null);
    try {
      replace((await markDraft(id, item, "restore")).item);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="card drafts">
      <h2>Draft from table talk</h2>
      {configured === false ? (
        <p className="muted">Drafting needs the campaign's key: set it on the AI card in the Table section. Logging by hand, below, makes the same record.</p>
      ) : (
        <>
          <label>
            What was said, one line each as Name: words
            <textarea
              value={text}
              rows={6}
              onChange={(e) => setText(e.target.value)}
              placeholder={"GM: The pill sits between you.\nKara: Mine. I swallow it before anyone argues.\nAndre: Put it back."}
            />
          </label>
          {talk.lines.length > 0 && <Readings talk={talk} view={view} names={names} />}
          <div className="row">
            <button className="primary" disabled={!talk.lines.length || busy || drafting || !configured} onClick={start}>
              Draft
            </button>
            <span className="muted small">Drafts wait here for you; nothing is logged until you accept one.</span>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
      {runs.slice(0, 3).map((r) => (
        <RunLine key={r.id} run={r} />
      ))}
      {waiting.length > 0 && (
        <>
          <h3>To review</h3>
          <ul className="drafts">
            {waiting.map(({ run, item }) => {
              const key = `${item.runId}/${item.itemId}/${item.status}`;
              const cited = <Cited view={view} run={run} item={item} names={names} />;
              if (item.kind === "cue") return <CueCard key={key} view={view} item={item} cited={cited} onDismiss={() => dismiss(item)} />;
              if (item.kind === "action")
                return (
                  <ActionDraftCard
                    key={key}
                    view={view}
                    engine={engine}
                    names={names}
                    item={item}
                    cited={cited}
                    onChanged={replace}
                    onRecorded={onRecorded}
                    onDismiss={() => dismiss(item)}
                  />
                );
              return <DraftCard key={key} view={view} engine={engine} names={names} run={run} item={item} onChanged={replace} onRecorded={onRecorded} />;
            })}
          </ul>
        </>
      )}
      {accepted.length > 0 && (
        <details className="panel">
          <summary>Accepted ({accepted.length})</summary>
          <ul className="small">
            {accepted.map(({ item }) => (
              <li key={`${item.runId}/${item.itemId}`}>{summary(item)}</li>
            ))}
          </ul>
        </details>
      )}
      {dismissed.length > 0 && (
        <details className="panel">
          <summary>Dismissed ({dismissed.length})</summary>
          <ul className="small">
            {dismissed.map(({ item }) => (
              <li key={`${item.runId}/${item.itemId}`}>
                {summary(item)}{" "}
                <button className="link" onClick={() => restore(item)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
