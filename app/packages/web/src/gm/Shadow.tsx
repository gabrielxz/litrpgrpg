/**
 * Shadow mode in the GM's Events section (app/DESIGN.md, M3, "Shadow mode"). While the campaign
 * drafts in shadow, the listener's drafts are kept from review, so what the GM logs by hand is the
 * GM's own. Asked, this card compares the two for the session: what both caught, what the GM
 * logged that the listener missed, and what the listener drafted that the GM did not log. The GM
 * then puts the drafts in review, where one the GM let pass can still be accepted.
 */
import type { Action, GmView, HeardLine } from "@gradebreaker/record";
import { useState } from "react";
import { type DraftItem, type ShadowSession, releaseShadow, shadowSession } from "../api.ts";
import { type Names, describe } from "../text.ts";
import type { DraftRuns } from "./Drafts.tsx";

const what = (a: Action | undefined, names: Names) => (!a ? "" : a.type === "event.log" ? a.summary : describe(a, names, () => undefined));

/** An event's entries as "Kara Hunger". */
const sides = (a: Action | undefined, names: Names) => (a?.type === "event.log" ? (a.entries ?? []).map((e) => `${names(e.characterId)} ${e.pole}`).join(", ") : "");

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "none");

export function ShadowCard({ view, names, heard, drafts }: { view: GmView; names: Names; heard: HeardLine[]; drafts: DraftRuns }) {
  const session = view.sessions.find((s) => !s.endedAt) ?? view.sessions[0];
  const runs = drafts.runs.filter((r) => r.shadow && r.talk.heard?.sessionId === session?.id);
  const hidden = runs.filter((r) => r.shadow === "hidden").length;
  const [report, setReport] = useState<ShadowSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!session || !runs.length) return null;

  const said = new Map(heard.map((l) => [`h${l.id}`, l]));
  const speaker = (userId: string) => view.members.find((m) => m.userId === userId)?.displayName ?? "Someone";
  const cited = (item: DraftItem) =>
    item.lines
      .map((id) => said.get(id))
      .filter((l): l is HeardLine => Boolean(l))
      .map((l) => `${speaker(l.userId)}: ${l.text}`)
      .join(" / ");

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const compare = () => run(async () => setReport(await shadowSession(view.campaign.id, session.id)));
  const release = () =>
    run(async () => {
      await releaseShadow(view.campaign.id, session.id);
      await drafts.refresh();
      setReport(await shadowSession(view.campaign.id, session.id));
    });

  const events = report?.byType["event.log"];
  const all = report ? Object.values(report.byType).reduce((t, x) => ({ both: t.both + x.both, gmOnly: t.gmOnly + x.gmOnly, listenerOnly: t.listenerOnly + x.listenerOnly }), { both: 0, gmOnly: 0, listenerOnly: 0 }) : null;

  return (
    <section className="card shadow">
      <h2>Drafted in shadow</h2>
      <p className="small">
        {runs.length} window{runs.length === 1 ? "" : "s"} of heard lines drafted this session
        {hidden ? `; ${hidden === runs.length ? "their" : `${hidden} windows'`} drafts are kept from review.` : ", all in review."}
      </p>
      <div className="form-row">
        <button className="btn btn--sm" disabled={busy} onClick={compare}>
          {report ? "Compare again" : "Compare with what you logged"}
        </button>
        {hidden > 0 && (
          <button className="btn btn--sm" disabled={busy} onClick={release}>
            Put the drafts in review
          </button>
        )}
        <span className="muted small">Comparing shows you the drafts.</span>
      </div>
      {error && <p className="error small">{error}</p>}
      {report && all && (
        <>
          <p className="small">
            Of what you logged by hand, the listener drafted {all.both} of {all.both + all.gmOnly} ({pct(all.both, all.both + all.gmOnly)})
            {events ? `, moments ${events.both} of ${events.both + events.gmOnly}` : ""}. It drafted {all.listenerOnly} more you did not log.
            {report.both.some((m) => m.sameSide === false) ? ` ${report.both.filter((m) => m.sameSide === false).length} shared moment(s) read on another side.` : ""}
          </p>
          {report.gmOnly.length > 0 && (
            <details className="disclosure" open>
              <summary>You logged, the listener missed ({report.gmOnly.length})</summary>
              <ul className="small">
                {report.gmOnly.map((e) => (
                  <li key={e.id}>{what(e.action, names)}</li>
                ))}
              </ul>
            </details>
          )}
          {report.listenerOnly.length > 0 && (
            <details className="disclosure" open>
              <summary>The listener drafted, you did not log ({report.listenerOnly.length})</summary>
              <ul className="small">
                {report.listenerOnly.map((i) => (
                  <li key={`${i.runId}/${i.itemId}`}>
                    {what(i.action, names)}
                    <br />
                    <span className="muted">{cited(i)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {report.both.length > 0 && (
            <details className="disclosure">
              <summary>Both ({report.both.length})</summary>
              <ul className="small">
                {report.both.map((m) => (
                  <li key={`${m.item.runId}/${m.item.itemId}`}>
                    {what(m.logged.action, names)}
                    {m.sameSide === false ? <span className="muted"> (you logged {sides(m.logged.action, names)}; drafted {sides(m.item.action, names)})</span> : null}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
