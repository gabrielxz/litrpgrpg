/**
 * The GM's preview-then-record step, shared by every form: while the draft changes, the server
 * previews it (what it does, which sheets change, what stops applying); Record appends it
 * under an idempotency key that is renewed only after it lands, so a double click or a retry
 * records it once.
 */
import type { Action, Envelope, Preview } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { newActionId, preview, submit } from "../api.ts";
import { changeLine, effectLine, type Names } from "../text.ts";

export interface CommitProps {
  campaignId: string;
  action: Action | null;
  /** Why the draft is not ready, shown in place of a preview. */
  problem?: string | null;
  names: Names;
  label?: string;
  onRecorded?: (envelope: Envelope) => void;
}

export function PreviewView({ pv, names }: { pv: Preview; names: Names }) {
  const effects = pv.effects.map((e) => effectLine(e, names)).filter((l): l is string => Boolean(l));
  return (
    <div className="preview">
      {!pv.accepted && <p className="error">{pv.reason}</p>}
      {effects.length > 0 && (
        <ul className="effects">
          {effects.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
      {pv.changes.map((d) => {
        const lines = d.changes.map(changeLine).filter((l): l is string => Boolean(l));
        if (d.status === "changed" && !lines.length) return null;
        return (
          <div key={d.characterId} className="change">
            <strong>{d.name}</strong>
            {d.status === "added" && " enters the record"}
            {d.status === "removed" && " leaves the record"}
            {lines.length > 0 && (
              <ul>
                {lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {pv.newlyRejected.length > 0 && (
        <div className="stranded">
          <strong>Stops applying:</strong>
          <ul>
            {pv.newlyRejected.map((r) => (
              <li key={r.envelope.id}>
                #{r.envelope.seq + 1}: {r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Commit({ campaignId, action, problem, names, label = "Record", onRecorded }: CommitProps) {
  const [id, setId] = useState(newActionId);
  const [pv, setPv] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(action);

  useEffect(() => {
    setError(null);
    if (!action || problem) {
      setPv(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      preview(campaignId, id, action)
        .then((p) => live && setPv(p))
        .catch((e) => live && setError(e.message));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, problem, campaignId, id]);

  const record = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const r = await submit(campaignId, id, action);
      setId(newActionId());
      setPv(null);
      onRecorded?.(r.envelope);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="commit">
      {problem ? <p className="muted">{problem}</p> : pv && <PreviewView pv={pv} names={names} />}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={!action || Boolean(problem) || !pv?.accepted || busy} onClick={record}>
        {label}
      </button>
    </div>
  );
}
