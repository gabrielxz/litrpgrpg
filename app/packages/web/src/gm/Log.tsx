/**
 * The campaign's record, newest first. Undo and Correct each record a void, previewed first:
 * the preview names every later action that would stop applying. Actions that no longer apply
 * stay in the log, marked, for the GM to resolve.
 */
import type { Envelope, GmView } from "@gradebreaker/record";
import { useMemo, useState } from "react";
import { type Names, describe } from "../text.ts";
import { Commit } from "./Commit.tsx";

export function Log({
  view,
  log,
  names,
  onRecorded,
}: {
  view: GmView;
  log: Envelope[];
  names: Names;
  onRecorded: (env: Envelope) => void;
}) {
  const [open, setOpen] = useState<{ id: string; reason: "undo" | "correction" } | null>(null);
  const [note, setNote] = useState("");
  const [limit, setLimit] = useState(40);
  const rejected = useMemo(() => new Map(view.rejected.map((r) => [r.id, r.reason])), [view.rejected]);
  const seqOf = useMemo(() => {
    const m = new Map(log.map((e) => [e.id, e.seq]));
    return (id: string) => m.get(id);
  }, [log]);
  const voided = useMemo(() => {
    const s = new Set<string>();
    for (const e of log) if (e.action.type === "void" && !rejected.has(e.id)) s.add(e.action.targetId);
    return s;
  }, [log, rejected]);
  const who = (userId: string) => view.members.find((m) => m.userId === userId)?.displayName ?? "someone";
  const shown = [...log].reverse().slice(0, limit);

  return (
    <section className="card log">
      <h2>Record</h2>
      {view.rejected.length > 0 && (
        <p className="warning">
          {view.rejected.length} action{view.rejected.length === 1 ? " no longer applies" : "s no longer apply"}. Each is marked
          below; record it again if it should stand.
        </p>
      )}
      {log.length === 0 && <p className="muted">Nothing recorded yet.</p>}
      <ol className="entries">
        {shown.map((e) => {
          const isVoided = voided.has(e.id);
          const reason = rejected.get(e.id);
          const canVoid = e.action.type !== "void" && !isVoided && !reason;
          return (
            <li key={e.id} className={`${isVoided ? "voided" : ""} ${reason ? "rejected" : ""}`}>
              <div className="entry">
                <span className="seq">#{e.seq + 1}</span>
                <span className="what">{describe(e.action, names, seqOf)}</span>
                <span className="meta">
                  {who(e.actor.userId)} · {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                {canVoid && (
                  <span className="entry-actions">
                    <button className="link" onClick={() => setOpen({ id: e.id, reason: "undo" })}>
                      Undo
                    </button>
                    <button className="link" onClick={() => setOpen({ id: e.id, reason: "correction" })}>
                      Correct
                    </button>
                  </span>
                )}
              </div>
              {isVoided && <div className="small muted">Removed from the record.</div>}
              {reason && <div className="small error">No longer applies: {reason}</div>}
              {open?.id === e.id && (
                <div className="void-form">
                  {open.reason === "correction" && (
                    <input value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="What was wrong (kept in the log)" />
                  )}
                  <Commit
                    campaignId={view.campaign.id}
                    action={{
                      type: "void",
                      targetId: e.id,
                      reason: open.reason,
                      ...(open.reason === "correction" && note.trim() ? { note: note.trim() } : {}),
                    }}
                    names={names}
                    label={open.reason === "undo" ? "Undo it" : "Record the correction"}
                    onRecorded={(env) => {
                      setOpen(null);
                      setNote("");
                      onRecorded(env);
                    }}
                  />
                  <button className="link" onClick={() => setOpen(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {log.length > limit && (
        <button className="link" onClick={() => setLimit(limit + 40)}>
          Earlier entries
        </button>
      )}
    </section>
  );
}
