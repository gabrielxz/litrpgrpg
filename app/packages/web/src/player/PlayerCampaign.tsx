/**
 * The player's System interface: what What Can Be Seen lists under "Your Own Interface", in
 * its order, for each character the player holds, and the System's notices beside it. The
 * player spends free points here; everything else arrives from the GM's record.
 */
import type { InterfaceSheet, PlayerView } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import type { Notice, useCampaign } from "../live.ts";
import { ATTRIBUTES, ATTRIBUTE_NAMES, noticeLine } from "../text.ts";

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="sys-bar">
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

function SpendPoints({ campaignId, c }: { campaignId: string; c: InterfaceSheet }) {
  const [placement, setPlacement] = useState<Record<string, number>>({});
  const [id, setId] = useState(newActionId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = Object.values(placement).reduce((a, b) => a + b, 0);
  const bump = (a: string, d: number) => {
    const next = Math.max(0, (placement[a] ?? 0) + d);
    if (d > 0 && total >= c.freePoints) return;
    setPlacement({ ...placement, [a]: next });
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const spent = Object.fromEntries(Object.entries(placement).filter(([, v]) => v > 0));
      await submit(campaignId, id, { type: "points.free", characterId: c.id, placement: spent });
      setPlacement({});
      setId(newActionId());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sys-section">
      <h3>Unallocated points: {c.freePoints - total}</h3>
      <div className="allocate">
        {ATTRIBUTES.map((a) => (
          <div key={a} className="allocate-row">
            <span>{ATTRIBUTE_NAMES[a]}</span>
            <button onClick={() => bump(a, -1)} disabled={!placement[a]} aria-label={`One less ${a}`}>
              −
            </button>
            <span className="num">{placement[a] ? `+${placement[a]}` : ""}</span>
            <button onClick={() => bump(a, 1)} disabled={total >= c.freePoints} aria-label={`One more ${a}`}>
              +
            </button>
          </div>
        ))}
      </div>
      <button className="sys-confirm" disabled={!total || busy} onClick={confirm}>
        Allocate
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Interface({ campaignId, c }: { campaignId: string; c: InterfaceSheet }) {
  const toNext = c.veToNextLevel;
  return (
    <article className="interface">
      <header>
        <img src="/clave.svg" alt="" className="clave-mark" />
        <div>
          <h2>{c.name}</h2>
          <div className="sys-dim">
            Level {c.level} · {c.grade}-Grade
          </div>
        </div>
      </header>

      <div className="sys-section">
        <table className="sys-stats">
          <thead>
            <tr>
              <th />
              <th>Raw</th>
              <th>Force</th>
            </tr>
          </thead>
          <tbody>
            {ATTRIBUTES.map((a) => (
              <tr key={a}>
                <td>{ATTRIBUTE_NAMES[a]}</td>
                <td className="num">{c.raw[a]}</td>
                <td className="num">{c.force[a]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sys-section vitals">
        <div className="sys-vital">
          <span>Health</span>
          <Bar value={c.hp} max={c.maxHp} />
          <span className="num">
            {c.hp} / {c.maxHp}
          </span>
        </div>
        <div className="sys-vital">
          <span>Aether</span>
          <Bar value={c.aether} max={c.maxAether} />
          <span className="num">
            {c.aether} / {c.maxAether}
          </span>
        </div>
        <div className="sys-vital">
          <span>Volatile Energy</span>
          <Bar value={c.storedVe} max={c.tolerance} />
          <span className="num">
            {c.storedVe} / {c.tolerance}
          </span>
        </div>
      </div>

      <div className="sys-section">
        <div className="sys-vital">
          <span>Level {c.level + 1}</span>
          <Bar value={c.refinedVe} max={c.refinedVe + (toNext ?? 0)} />
          <span className="num">{toNext === null ? "Grade limit" : `${c.refinedVe} / ${c.refinedVe + toNext}`}</span>
        </div>
      </div>

      {c.freePoints > 0 && <SpendPoints campaignId={campaignId} c={c} />}
    </article>
  );
}

function Notices({ notices }: { notices: Notice[] }) {
  const lines = notices.map((n) => ({ ...n, text: noticeLine(n.effect) })).filter((n) => n.text);
  return (
    <aside className="notices">
      {lines.length === 0 ? (
        <p className="sys-dim">
          <em>No new notices.</em>
        </p>
      ) : (
        <ol>
          {lines.map((n) => (
            <li key={n.key}>
              <img src="/clave.svg" alt="" className="clave-tiny" />
              <em>{n.text}</em>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

export function PlayerCampaign({ view, live }: { view: PlayerView; live: ReturnType<typeof useCampaign> }) {
  return (
    <main className="player">
      {view.characters.length === 0 ? (
        <p className="sys-dim waiting">
          <em>Interface: awaiting registration.</em>
          <span className="small">Your GM has not given you a character yet.</span>
        </p>
      ) : (
        <div className="interfaces">
          {view.characters.map((c) => (
            <Interface key={c.id} campaignId={view.campaign.id} c={c} />
          ))}
        </div>
      )}
      <Notices notices={live.notices} />
    </main>
  );
}
