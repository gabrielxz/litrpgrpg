/**
 * The campaign's record, newest first. Undo and Correct each record a void, previewed first:
 * the preview names every later action that would stop applying. Actions that no longer apply
 * stay in the log, marked, for the GM to resolve. Prep's saves and removals are the GM's
 * preparation, not play, so they are hidden unless the GM shows them.
 */
import type { Envelope, GmView } from "@gradebreaker/record";
import { useMemo, useState } from "react";
import { type Names, describe } from "../text.ts";
import { Commit } from "./Commit.tsx";
import { Icon } from "../ui.tsx";

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
  const [showPrep, setShowPrep] = useState(false);
  const rejected = useMemo(() => new Map(view.rejected.map((r) => [r.id, r.reason])), [view.rejected]);
  const seqOf = useMemo(() => {
    const m = new Map(log.map((e) => [e.id, e.seq]));
    return (id: string) => m.get(id);
  }, [log]);
  const voided = useMemo(() => {
    const s = new Map<string, "undo" | "correction">();
    for (const e of log) if (e.action.type === "void" && !rejected.has(e.id)) s.set(e.action.targetId, e.action.reason);
    return s;
  }, [log, rejected]);
  const who = (userId: string) => view.members.find((m) => m.userId === userId)?.displayName ?? "someone";
  // Prep entries, and undos of them, are preparation rather than play.
  const prepIds = useMemo(() => new Set(log.filter((e) => e.action.type.startsWith("prep.")).map((e) => e.id)), [log]);
  const isPrep = (e: Envelope) => prepIds.has(e.id) || (e.action.type === "void" && prepIds.has(e.action.targetId));
  const prepCount = log.filter(isPrep).length;
  const shown = [...log]
    .reverse()
    .filter((e) => showPrep || !isPrep(e))
    .slice(0, limit);

  return (
    <section className="panel log-panel" aria-labelledby="log-h">
      <div className="panel__head">
        <i className="ic ic-log dim" aria-hidden="true" />
        <h2 id="log-h">Campaign log</h2>
        <span className="grow" />
        {prepCount > 0 && (
          <label className="check small">
            <input type="checkbox" checked={showPrep} onChange={(e) => setShowPrep(e.target.checked)} /> Show Prep entries ({prepCount})
          </label>
        )}
      </div>
      {view.rejected.length > 0 && (
        <div className="callout log-callout" role="status">
          <Icon name="warning" />
          <span>
            {view.rejected.length} action{view.rejected.length === 1 ? " no longer applies" : "s no longer apply"}. Each is marked
            below; record it again if it should stand.
          </span>
        </div>
      )}
      {log.length === 0 && <p className="panel__body dim">Nothing recorded yet.</p>}
      <ol className="rows log-rows">
        {shown.map((e) => {
          const isVoided = voided.has(e.id);
          const reason = rejected.get(e.id);
          const canVoid = e.action.type !== "void" && !isVoided && !reason;
          return (
            <li key={e.id} className={`${isVoided ? "is-voided" : ""}${reason ? " is-rejected" : ""}`}>
              <span className="num small dim log-seq">#{e.seq + 1}</span>
              <div className="log-what">
                <div className="log-text">{describe(e.action, names, seqOf, who)}</div>
                <div className="row__meta">
                  {who(e.actor.userId)} · {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {e.source === "suggestion" && e.cause?.startsWith("draft:") ? " · accepted from a draft" : ""}
                </div>
              </div>
              {canVoid ? (
                <div className="row__actions small dim">
                  <button className="btn-link" type="button" aria-expanded={open?.id === e.id && open.reason === "undo"} onClick={() => setOpen({ id: e.id, reason: "undo" })}>
                    Undo
                  </button>
                  <button className="btn-link" type="button" aria-expanded={open?.id === e.id && open.reason === "correction"} onClick={() => setOpen({ id: e.id, reason: "correction" })}>
                    Correct
                  </button>
                </div>
              ) : (
                <span />
              )}
              {isVoided && (
                <div className="cluster small log-note">
                  <Icon name="undo" />
                  {voided.get(e.id) === "correction" ? "Corrected" : "Undone"}: it no longer counts.
                </div>
              )}
              {reason && (
                <div className="cluster log-note">
                  <span className="tag tag--danger">
                    <Icon name="danger" />
                    No longer applies
                  </span>
                  <span className="small">{reason}</span>
                </div>
              )}
              {open?.id === e.id && (
                <div className="log-void">
                  {open.reason === "correction" && (
                    <div className="log-void__note">
                      <input className="input" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="What was wrong (kept in the log)" />
                    </div>
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
                    label={open.reason === "undo" ? `Undo #${e.seq + 1}` : `Correct #${e.seq + 1}`}
                    danger={{ icon: open.reason === "undo" ? "undo" : "edit" }}
                    onRecorded={(env) => {
                      setOpen(null);
                      setNote("");
                      onRecorded(env);
                    }}
                    actions={
                      <button className="btn-link small log-void__cancel" type="button" onClick={() => setOpen(null)}>
                        Cancel
                      </button>
                    }
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {log.length > limit && (
        <div className="log-more">
          <button className="btn-link small" type="button" onClick={() => setLimit(limit + 40)}>
            Earlier entries
          </button>
        </div>
      )}
    </section>
  );
}
