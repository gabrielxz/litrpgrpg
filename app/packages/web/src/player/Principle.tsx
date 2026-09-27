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
    <div className="sys-section principle">
      <h3>Principle</h3>
      {p.principles.map((x) => (
        <div key={x.family} className="principle-entry">
          <div>
            <strong>{x.name}</strong> <span className="sys-dim small">{x.tier}</span>
          </div>
          <div className="small">Insight: {x.insight}</div>
          {x.passive && <div className="small">{x.passive}</div>}
          {x.grants
            .filter((g) => g.kind !== "refinement")
            .map((g, i) => (
              <div key={i} className="small grant">
                {g.name && <strong>{g.name}</strong>}
                {g.aether !== undefined && g.aether > 0 && <span className="sys-dim"> · {g.aether} Aether</span>}
                {g.text && <div>{g.text}</div>}
                {g.attunements && <div className="sys-dim">Attunements: {g.attunements}</div>}
              </div>
            ))}
          {x.offer && (
            <div className="offer">
              <div className="small">Articulation proposed:</div>
              {x.offer.map((a, i) => (
                <div key={i} className="item-actions">
                  <em className="grow">{a}</em>
                  {can && (
                    <button className="sys-confirm inline" disabled={busy} onClick={() => run({ type: "principle.answer", characterId: c.id, family: x.family, accept: true, articulation: i })}>
                      Confirm
                    </button>
                  )}
                </div>
              ))}
              {can && (
                <button className="inline" disabled={busy} onClick={() => run({ type: "principle.answer", characterId: c.id, family: x.family, accept: false })}>
                  Decline
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {p.resonance.map((r) => (
        <div key={r.family} className="small">
          Resonance accruing: {r.family.toUpperCase()}. {r.ip}/{r.of}.
        </div>
      ))}
      {held.length > 0 && (
        <>
          <h4>Battle Memories</h4>
          <ul className="items">
            {held.map((m) => (
              <li key={m.id}>
                <span className="grow">
                  {m.text}
                  {m.chosen && <span className="sys-dim small"> · to meditate on at the next Consolidation</span>}
                </span>
                {can && (
                  <span className="item-actions">
                    <button className="inline" disabled={busy} onClick={() => run({ type: "memory.choose", characterId: c.id, memoryId: m.id, chosen: !m.chosen })}>
                      {m.chosen ? "Set aside" : "Meditate on this"}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {spent.some((m) => m.vision) && (
        <details>
          <summary className="small">Visions</summary>
          <ul className="items">
            {spent
              .filter((m) => m.vision)
              .map((m) => (
                <li key={m.id} className="small">
                  <em>{m.vision}</em>
                  <span className="sys-dim"> · {m.text}</span>
                </li>
              ))}
          </ul>
        </details>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
