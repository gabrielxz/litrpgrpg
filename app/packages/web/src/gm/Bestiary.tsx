/**
 * The Bestiary as the GM's library (Bestiary): the sizing table with the party's row and its
 * columns sized for the party at hand, and every stat block, each with the VE its kill pays and
 * the Force it counts at from Level 8. Fights are built in Combat, where the same sizing reads the
 * creatures chosen.
 */
import type { Engine } from "@gradebreaker/engine";
import { type GmView, partyLevelOf } from "@gradebreaker/record";
import { useState } from "react";

interface Entry {
  name: string;
  tier_group: string;
  grade: string;
  tier: string;
  hp: number;
  beats: number;
  hrt: number;
  per: number;
  aether?: number;
  imprint?: boolean;
  offense: { force: number; stat: string; means?: string }[];
  defense: { force: number; stat: string; means?: string }[];
  yields: boolean;
  tactics: string;
}

const two = (n: number) => String(n).padStart(2, "0");
const line = (xs: Entry["offense"]) => xs.map((x) => `${two(x.force)} ${x.stat}${x.means ? ` (${x.means})` : ""}`).join(" · ");

function SizingTable({ view, engine }: { view: GmView; engine: Engine }) {
  const party = view.characters.filter((c) => c.playerId && !c.dead);
  const level = partyLevelOf(party.map((c) => c.level));
  const size = party.length || 4;
  const rows = engine.rules.bestiary.encounter_sizing as {
    party_level: string;
    levels: [number, number];
    easy: string;
    standard: string;
    hard: string;
    force?: Record<string, number>;
  }[];
  const shift = size - 4;
  return (
    <section className="card">
      <h2>Encounter sizing</h2>
      <p className="muted small">
        The party: {party.length ? `${party.length} at Level ${level} (the average, rounded down)` : "no player characters yet; read for four"}. The table is written for four; each character fewer or
        more shifts a fight one column, which from Level 8 is 10 Force a character.
      </p>
      <table className="rows">
        <thead>
          <tr>
            <th>Party Level</th>
            <th>Easy</th>
            <th>Standard</th>
            <th>Hard</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const here = level >= r.levels[0] && level <= r.levels[1];
            return (
              <tr key={r.party_level} className={here ? "current-row" : ""}>
                <td>{r.party_level}</td>
                {(["easy", "standard", "hard"] as const).map((c) => (
                  <td key={c}>
                    {r[c]}
                    {here && shift !== 0 && r.force && <div className="small">For {size}: Force {engine.sizedForce(r.force[c]!, size)}</div>}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {shift !== 0 && level < 8 && (
        <p className="small">
          For a party of {size}: read the column {Math.abs(shift)} {shift < 0 ? "easier" : "harder"}, or {shift < 0 ? "drop" : "add"} one creature of the fight's lowest tier per
          character.
        </p>
      )}
    </section>
  );
}

function StatBlock({ engine, c }: { engine: Engine; c: Entry }) {
  const ve = engine.killVe(c.tier, "F", c.grade);
  return (
    <article className="stat-block">
      <h3>
        {c.name} {c.imprint && <span className="tag">Imprint</span>}
      </h3>
      <p className="small">
        <strong>Grade</strong> {c.grade} · <strong>Tier</strong> {c.tier} · <strong>HP</strong> {c.hp} · <strong>Beats</strong> {c.beats}
        {c.aether !== undefined && (
          <>
            {" "}
            · <strong>Aether</strong> {c.aether}
          </>
        )}
      </p>
      <p className="small">
        <strong>Off</strong> {line(c.offense)}
        <br />
        <strong>Def</strong> {line(c.defense)}
        <br />
        <strong>HRT</strong> {two(c.hrt)} · <strong>PER</strong> {two(c.per)} · {c.yields ? "Yields" : "Does not Yield"}
      </p>
      <p className="small">{c.tactics}</p>
      <p className="muted small">
        A kill pays each participant of its Grade {ve} VE. From Level 8 it counts at Force{" "}
        {engine.creatureSizingForce(
          c.offense.map((o) => o.force),
          c.defense.map((d) => d.force),
        )}
        .
      </p>
    </article>
  );
}

export function BestiarySection({ view, engine }: { view: GmView; engine: Engine | null }) {
  const [group, setGroup] = useState("all");
  if (!engine) return <p className="muted pad">Loading rules…</p>;
  const all = engine.rules.bestiary.creatures as Entry[];
  const groups = [...new Set(all.map((c) => c.tier_group))];
  const shown = group === "all" ? all : all.filter((c) => c.tier_group === group);
  return (
    <main className="page">
      <SizingTable view={view} engine={engine} />
      <section className="card">
        <div className="row">
          <h2>Stat blocks</h2>
          <label className="inline-label">
            Tier
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="all">All</option>
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">Build a fight from these under Combat, where the sizing reads the creatures you choose.</p>
        <div className="stat-blocks">
          {shown.map((c) => (
            <StatBlock key={c.name} engine={engine} c={c} />
          ))}
        </div>
      </section>
    </main>
  );
}
