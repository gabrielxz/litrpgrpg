/**
 * The GM's screen, in sections: the party (every sheet and the forms that change them), the
 * campaign log, the table (members, invite links, who plays whom), and any player's screen as
 * that player sees it.
 */
import type { Envelope, GmView, PlayerView, Sheet } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { useCampaign } from "../live.ts";
import { useEngine } from "../live.ts";
import { PlayerCampaign } from "../player/PlayerCampaign.tsx";
import { Commit } from "./Commit.tsx";
import { ATTRIBUTES } from "../text.ts";
import { Table } from "./Invites.tsx";
import { Log } from "./Log.tsx";
import { RecordPanel } from "./Record.tsx";

function Meter({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={`meter ${className ?? ""}`}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

function CharacterCard({ c, player }: { c: Sheet; player: string }) {
  const band = c.saturation.band;
  return (
    <article className="sheet-card">
      <header>
        <h3>{c.name}</h3>
        <span className="muted">{player}</span>
      </header>
      <div className="line">
        Level {c.level} · {c.grade}-Grade
        {c.pendingSystemLevels.length > 0 && <span className="tag attention">Assigned points due: Level {c.pendingSystemLevels.join(", ")}</span>}
        {c.freePoints > 0 && <span className="tag">{c.freePoints} free held</span>}
      </div>
      <div className="vital">
        <span>HP</span>
        <Meter value={c.hp} max={c.maxHp} className="hp" />
        <span className="num">
          {c.hp}/{c.maxHp}
        </span>
      </div>
      {c.downed && <p className="tag danger">Downed</p>}
      <div className="vital">
        <span>Aether</span>
        <Meter value={c.aether} max={c.maxAether} className="aether" />
        <span className="num">
          {c.aether}/{c.maxAether}
        </span>
      </div>
      <div className="vital">
        <span>Stored</span>
        <Meter value={c.storedVe} max={c.tolerance} className={`ve band-${band.toLowerCase()}`} />
        <span className="num">
          {c.storedVe}/{c.tolerance}
        </span>
      </div>
      {band !== "None" && (
        <p className={`tag band-${band.toLowerCase()}`}>
          {band} Saturation {c.saturation.penalty}
          {c.saturation.collapseClock ? " · collapse clock running" : ""}
        </p>
      )}
      <div className="vital">
        <span>Refined</span>
        <Meter value={c.refinedVe} max={c.refinedVe + (c.veToNextLevel ?? 0)} className="refined" />
        <span className="num">{c.atCap ? "cap" : `${c.veToNextLevel} to go`}</span>
      </div>
      <table className="stats">
        <tbody>
          <tr>
            {ATTRIBUTES.map((a) => (
              <th key={a}>{a}</th>
            ))}
          </tr>
          <tr>
            {ATTRIBUTES.map((a) => (
              <td key={a}>{c.raw[a]}</td>
            ))}
          </tr>
        </tbody>
      </table>
      {c.temporary.length > 0 && <p className="small muted">Temporarily down 1 {c.temporary.join(", 1 ")} until a clean Consolidation.</p>}
      <p className="small muted">{c.background}</p>
    </article>
  );
}

/** Hand a character to another player, or take it over as the GM. */
function Holders({ view, names, onRecorded }: { view: GmView; names: (id: string) => string; onRecorded: (env: Envelope) => void }) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const players = view.members.filter((m) => m.role === "player");
  const who = (id: string | undefined) => (id ? (players.find((m) => m.userId === id)?.displayName ?? "a former player") : "the GM");
  if (!view.characters.length) return null;
  return (
    <section className="card">
      <h2>Who plays whom</h2>
      <table className="rows">
        <tbody>
          {view.characters.map((c) => {
            const current = c.playerId ?? "";
            const picked = choice[c.id] ?? current;
            return (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  <select value={picked} onChange={(e) => setChoice({ ...choice, [c.id]: e.target.value })}>
                    <option value="">The GM</option>
                    {players.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                  {picked !== current && (
                    <Commit
                      campaignId={view.campaign.id}
                      action={{ type: "character.assign", characterId: c.id, ...(picked ? { playerId: picked } : {}) }}
                      names={names}
                      label={`Hand ${c.name} to ${who(picked || undefined)}`}
                      onRecorded={(env) => {
                        setChoice({ ...choice, [c.id]: picked });
                        onRecorded(env);
                      }}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** A player's screen exactly as they see it, refreshed whenever the record changes. */
function ViewAs({ view }: { view: GmView }) {
  const players = view.members.filter((m) => m.role === "player");
  const [userId, setUserId] = useState(players[0]?.userId ?? "");
  const [shown, setShown] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picked = players.some((m) => m.userId === userId) ? userId : (players[0]?.userId ?? "");
  useEffect(() => {
    if (!picked) return;
    api<PlayerView>("GET", `/campaigns/${view.campaign.id}/players/${picked}/view`)
      .then((v) => {
        setShown(v);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [picked, view]);
  if (!players.length) return <p className="muted pad">No players yet. Invite them from the Table.</p>;
  return (
    <div className="view-as">
      <div className="view-as-bar">
        Viewing as
        <select value={picked} onChange={(e) => setUserId(e.target.value)}>
          {players.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
        <span className="muted small">exactly what their screen shows; nothing here can be changed</span>
      </div>
      {error && <p className="error">{error}</p>}
      {shown && <PlayerCampaign view={shown} notices={[]} readOnly />}
    </div>
  );
}

type Section = "party" | "log" | "table" | "player";
const SECTIONS: [Section, string][] = [
  ["party", "Party"],
  ["log", "Campaign log"],
  ["table", "Table"],
  ["player", "Player view"],
];

function useSection(): [Section, (s: Section) => void] {
  const read = () => {
    const h = window.location.hash.slice(1);
    return (SECTIONS.some(([s]) => s === h) ? h : "party") as Section;
  };
  const [section, set] = useState<Section>(read);
  useEffect(() => {
    const on = () => set(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [section, (s) => (window.location.hash = s)];
}

export function GmCampaign({ view, live }: { view: GmView; live: ReturnType<typeof useCampaign> }) {
  const engine = useEngine(view.campaign.rulesVersion);
  const [section, setSection] = useSection();
  const byId = new Map(view.characters.map((c) => [c.id, c.name]));
  const names = (id: string) => byId.get(id) ?? id;
  const playerName = (c: Sheet) =>
    c.playerId ? (view.members.find((m) => m.userId === c.playerId)?.displayName ?? "a former player") : "GM";

  return (
    <>
      <nav className="sections">
        {SECTIONS.map(([s, label]) => (
          <button key={s} className={s === section ? "active" : ""} onClick={() => setSection(s)}>
            {label}
            {s === "log" && view.rejected.length > 0 && <span className="tag attention">{view.rejected.length}</span>}
          </button>
        ))}
      </nav>
      {section === "party" && (
        <main className="gm">
          <section className="sheets">
            {view.characters.length === 0 ? (
              <p className="muted">No characters yet. Players can build their own once they join, or you can create one under New character.</p>
            ) : (
              view.characters.map((c) => <CharacterCard key={c.id} c={c} player={playerName(c)} />)
            )}
          </section>
          <aside className="side">
            {engine ? <RecordPanel view={view} engine={engine} names={names} onRecorded={live.addToLog} /> : <p className="muted">Loading rules…</p>}
          </aside>
        </main>
      )}
      {section === "log" && (
        <main className="page">
          <Log view={view} log={live.log} names={names} onRecorded={live.addToLog} />
        </main>
      )}
      {section === "table" && (
        <main className="page narrow">
          <Table view={view} />
          <Holders view={view} names={names} onRecorded={live.addToLog} />
        </main>
      )}
      {section === "player" && <ViewAs view={view} />}
    </>
  );
}
