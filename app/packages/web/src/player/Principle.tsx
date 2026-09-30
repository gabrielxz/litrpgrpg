/**
 * The Principle on the character's own interface (What Can Be Seen, "Your Own Interface"):
 * each family while its resonance accrues, and once crystallized the name, its place on the
 * ladder, and its Insight; the Battle Memories the character holds, with the one they will
 * meditate on at the next Consolidation (the player's choice) and the visions spent ones
 * brought; and a Quiet Path articulation the System proposes, to confirm or decline.
 */
import type { Action, InterfaceSheet } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";

export function PrincipleSection({ campaignId, c, readOnly }: { campaignId: string; c: InterfaceSheet; readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = c.principle;
  if (!p.memories.length && !p.resonance.length && !p.principles.length) return null;
  const can = !readOnly && !c.dead;
  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      await submit(campaignId, newActionId(), action);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const held = p.memories.filter((m) => !m.spent);
  const spent = p.memories.filter((m) => m.spent);
  return (
    <section className="sys-section">
      <h2 className="sys-label">Principle</h2>
      {p.principles.map((x) => (
        <div key={x.family} className="principle">
          <svg className="principle__mark" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="square" aria-hidden="true">
            <path d="M6 6H14V14H6V10" />
            <path d="M3 3H17V17H9" />
          </svg>
          <div className="stack">
            <div className="cluster">
              <b className="principle__name">{x.name}</b>
              <span className="small dim">{x.tier}</span>
            </div>
            <p>
              Insight: <span className="num">{x.insight}</span>
            </p>
            {(x.passive || x.grants.some((g) => g.kind !== "refinement")) && (
              <dl className="tray spec mechanics">
                {x.passive && (
                  <>
                    <dt>Passive</dt>
                    <dd>{x.passive}</dd>
                  </>
                )}
                {x.grants
                  .filter((g) => g.kind !== "refinement")
                  .map((g, i) => (
                    <div key={i} className="spec__pair">
                      <dt>{g.name ?? "Grant"}</dt>
                      <dd>
                        {g.aether !== undefined && g.aether > 0 && <span className="num">{g.aether} Aether. </span>}
                        {g.text}
                        {g.attunements && <span className="dim"> Attunements: {g.attunements}</span>}
                      </dd>
                    </div>
                  ))}
              </dl>
            )}
            {x.offer && (
              <div className="articulation stack">
                <p className="label">Articulation proposed:</p>
                {x.offer.map((a, i) => (
                  <div key={i} className="spread articulation__line">
                    <em className="voice grow">{a}</em>
                    {can && (
                      <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => run({ type: "principle.answer", characterId: c.id, family: x.family, accept: true, articulation: i })}>
                        Confirm
                      </button>
                    )}
                  </div>
                ))}
                {can && (
                  <div>
                    <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "principle.answer", characterId: c.id, family: x.family, accept: false })}>
                      Decline
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
      {p.resonance.map((r) => (
        <p key={r.family} className="voice">
          Resonance accruing: {r.family.toUpperCase()}. <span className="num">{r.ip}/{r.of}</span>.
        </p>
      ))}
      {held.length > 0 && (
        <>
          <h3 className="small dim sub-label">Battle Memories</h3>
          <ul>
            {held.map((m) => (
              <li key={m.id} className="sys-row sys-row--center">
                <span className="sys-row__main">
                  {m.text}
                  {m.chosen && <span className="small dim"> · to meditate on at the next Consolidation</span>}
                </span>
                {can && (
                  <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "memory.choose", characterId: c.id, memoryId: m.id, chosen: !m.chosen })}>
                    {m.chosen ? "Set aside" : "Meditate on this"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {spent.some((m) => m.vision) && (
        <details>
          <summary className="small dim">Visions</summary>
          <ul>
            {spent
              .filter((m) => m.vision)
              .map((m) => (
                <li key={m.id} className="sys-row small">
                  <span className="sys-row__main">
                    <em className="voice">{m.vision}</em>
                    <span className="dim"> · {m.text}</span>
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
