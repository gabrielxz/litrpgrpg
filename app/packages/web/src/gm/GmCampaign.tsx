/** The GM's screen: every sheet, the forms that change them, the record, and the table. */
import type { GmView, Sheet } from "@gradebreaker/record";
import type { useCampaign } from "../live.ts";
import { useEngine } from "../live.ts";
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
        {c.pendingSystemLevels.length > 0 && <span className="tag attention">System points: Level {c.pendingSystemLevels.join(", ")}</span>}
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

export function GmCampaign({ view, live }: { view: GmView; live: ReturnType<typeof useCampaign> }) {
  const engine = useEngine(view.campaign.rulesVersion);
  const byId = new Map(view.characters.map((c) => [c.id, c.name]));
  const names = (id: string) => byId.get(id) ?? id;
  const playerName = (c: Sheet) =>
    c.playerId ? (view.members.find((m) => m.userId === c.playerId)?.displayName ?? "a former player") : "GM";

  return (
    <main className="gm">
      <section className="sheets">
        {view.characters.length === 0 ? (
          <p className="muted">No characters yet. Invite your players, then create their characters under New character.</p>
        ) : (
          view.characters.map((c) => <CharacterCard key={c.id} c={c} player={playerName(c)} />)
        )}
      </section>
      <aside className="side">
        {engine ? <RecordPanel view={view} engine={engine} names={names} onRecorded={live.addToLog} /> : <p className="muted">Loading rules…</p>}
        <Log view={view} log={live.log} names={names} onRecorded={live.addToLog} />
        <Table view={view} />
      </aside>
    </main>
  );
}
