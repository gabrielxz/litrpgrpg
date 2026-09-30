/**
 * The GM's preview-then-record step, shared by every form: while the draft changes, the server
 * previews it (what it does, which sheets change, what stops applying), and previews it again
 * whenever the log moves, so a form left open never shows what it would have done before; Record
 * appends it under an idempotency key that is renewed only after it lands, so a double click or a
 * retry records it once.
 */
import { type Action, type Effect, type Envelope, type Preview, noticesFor } from "@gradebreaker/record";
import { createContext, useContext, useEffect, useState } from "react";
import { type Appended, newActionId, preview, submit } from "../api.ts";
import { changeLine, effectLine, type Names, noticeLine } from "../text.ts";
import { Clave, Icon } from "../ui.tsx";

/** The GM view's log length; a preview is redone when it changes. */
export const LogSeq = createContext(0);

export interface CommitProps {
  campaignId: string;
  action: Action | null;
  /** Why the draft is not ready, shown in place of a preview. */
  problem?: string | null;
  names: Names;
  /** The button: the action in words ("Create Kara", "Award 130 VE"). */
  label: string;
  onRecorded?: (envelope: Envelope) => void;
  /** What caused it: a prepared item fired from Prep. */
  cause?: string;
  /** Records through another route than the log's (accepting a draft); the preview is the same. */
  submitWith?: (id: string, action: Action) => Promise<Appended>;
  /** Other buttons for the decide row, after the record button (a draft's Dismiss). */
  actions?: React.ReactNode;
  /** An action that takes something back (an undo): the destructive button, with its icon. */
  danger?: { icon: string };
}

/** "Kara", "Kara and Joe", "Kara, Joe, and Andre". */
const listed = (xs: string[]) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs.at(-1)}`);

/**
 * What the players get, in their register (Decisions, "the makeover", P2): each character's
 * notices, chosen by the same rule as their feed; characters who receive the same notices share
 * one preview.
 */
export function PlayerPreview({ effects, names }: { effects: Effect[]; names: Names }) {
  const everyone = new Set(effects.flatMap((e) => ("characterId" in e && e.characterId ? [e.characterId] : [])));
  const byCharacter = new Map<string, string[]>();
  for (const e of noticesFor(effects, everyone)) {
    const text = noticeLine(e);
    const id = (e as { characterId: string }).characterId;
    if (text) byCharacter.set(id, [...(byCharacter.get(id) ?? []), text]);
  }
  const groups = new Map<string, { ids: string[]; texts: string[] }>();
  for (const [id, texts] of byCharacter) {
    const key = texts.join("\u0000");
    const g = groups.get(key);
    if (g) g.ids.push(id);
    else groups.set(key, { ids: [id], texts });
  }
  return (
    <>
      {[...groups.values()].map((g) => (
        <div key={g.ids.join()} className="preview sys">
          <div className="preview__to">
            <Icon name="send" />
            {listed(g.ids.map(names))} {g.ids.length > 1 ? "each receive" : "receives"}
          </div>
          {g.texts.map((t, i) => (
            <div key={i} className="notice">
              <Clave />
              <span className="notice__text">{t}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function PreviewView({ pv, names }: { pv: Preview; names: Names }) {
  const effects = pv.effects.map((e) => effectLine(e, names)).filter((l): l is string => Boolean(l));
  return (
    <>
      <div className="record">
        <div className={`record__head${pv.accepted ? "" : " refused"}`}>{pv.accepted ? "If you record this" : "This cannot be recorded"}</div>
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
              {d.status === "added" ? "New character: " : d.status === "removed" ? "Removed from the campaign: " : ""}
              <strong>{d.name}</strong>
              {lines.length > 0 && (
                <ul>
                  {lines.map((l, i) => (
                    <li key={i} className="delta">
                      {l}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {pv.newlyRejected.length > 0 && (
          <div className="stranded">
            <strong>Earlier-recorded actions that would stop applying:</strong>
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
      {pv.accepted && <PlayerPreview effects={pv.effects} names={names} />}
    </>
  );
}

export function Commit({ campaignId, action, problem, names, label, onRecorded, cause, submitWith, actions, danger }: CommitProps) {
  const [id, setId] = useState(newActionId);
  const [pv, setPv] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = JSON.stringify(action);
  const seq = useContext(LogSeq);

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
  }, [key, problem, campaignId, id, seq]);

  const record = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const r = submitWith ? await submitWith(id, action) : await submit(campaignId, id, action, cause);
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
      {problem ? <p className="problem">{problem}</p> : pv && <PreviewView pv={pv} names={names} />}
      {error && <p className="error">{error}</p>}
      <div className="commit__decide">
        <button className={danger ? "btn btn--danger" : "btn btn--primary"} disabled={!action || Boolean(problem) || !pv?.accepted || busy} onClick={record}>
          <Icon name={danger?.icon ?? "confirm"} />
          {label}
        </button>
        {actions}
      </div>
    </div>
  );
}
