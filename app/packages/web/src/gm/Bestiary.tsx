/**
 * The Bestiary as the GM's library (Bestiary): the sizing table with the party's row and its
 * columns sized for the party at hand, and every stat block, each with the VE its kill pays and
 * the Force it counts at from Level 8. Fights are built in Combat, where the same sizing reads the
 * creatures chosen.
 */
import type { Engine } from "@gradebreaker/engine";
import { type GmView, partyLevelOf } from "@gradebreaker/record";
import { Fragment, useState } from "react";

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

/** An Off or Def line: "06 DEX (bite) · 08 PER", its numbers set as numbers. */
function Line({ xs }: { xs: Entry["offense"] }) {
  return (
    <>
      {xs.map((x, i) => (
        <Fragment key={i}>
          {i > 0 && " · "}
          <span className="num">{two(x.force)}</span> {x.stat}
          {x.means && <span className="dim"> ({x.means})</span>}
        </Fragment>
      ))}
    </>
  );
}

/** A sizing cell's text with its numbers set as numbers ("One at Force 40, or two at 20"). */
function Numbered({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d+)/).map((part, i) =>
        i % 2 ? (
          <span key={i} className="num">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function SizingTable({ view, engine }: { view: GmView; engine: Engine }) {
  const party = view.characters.filter((c) => !c.dead);
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
    <aside className="panel sizing-panel" aria-labelledby="encounter-sizing">
      <div className="panel__head">
        <i className="ic ic-party dim" aria-hidden="true" />
        <h2 id="encounter-sizing">Encounter sizing</h2>
      </div>
      <div className="panel__body stack">
        <p className="small">
          The party: {party.length ? `${party.length} at Level ${level} (the average, rounded down)` : "no player characters yet; read for four"}. The table is written for four; each character fewer or
          more shifts a fight one column, which from Level 8 is 10 Force a character.
        </p>
        <table className="sizing-table">
          <colgroup>
            <col className="sizing-table__level" />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr className="label">
              <th scope="col">Party Level</th>
              <th scope="col">Easy</th>
              <th scope="col">Standard</th>
              <th scope="col">Hard</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const here = level >= r.levels[0] && level <= r.levels[1];
              return (
                <tr key={r.party_level} className={here ? "is-current" : undefined} aria-current={here ? "true" : undefined}>
                  <th scope="row" className="num">
                    {r.party_level}
                  </th>
                  {(["easy", "standard", "hard"] as const).map((c) => (
                    <td key={c}>
                      <Numbered text={r[c]} />
                      {here && shift !== 0 && r.force && (
                        <div className="small dim">
                          For {size}: Force <span className="num">{engine.sizedForce(r.force[c]!, size)}</span>
                        </div>
                      )}
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
      </div>
    </aside>
  );
}

function StatBlock({ engine, c }: { engine: Engine; c: Entry }) {
  // What a participant of the creature's own Grade receives, as the line says.
  const ve = engine.killVe(c.tier, c.grade, c.grade);
  const id = `sb-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <article className="panel creature-block" aria-labelledby={id}>
      <div className="panel__head">
        <h3 id={id}>{c.name}</h3>
        {c.imprint && <span className="tag">Imprint</span>}
        <span className="grow" />
        <span className="small">
          <span className="dim">Grade</span> {c.grade} · <span className="dim">Tier</span> {c.tier}
        </span>
      </div>
      <div className="panel__body stack">
        <dl className={`statline creature-block__line${c.aether !== undefined ? " creature-block__line--aether" : ""}`}>
          <div>
            <dt>HP</dt>
            <dd>{c.hp}</dd>
          </div>
          <div>
            <dt>Beats</dt>
            <dd>{c.beats}</dd>
          </div>
          <div>
            <dt>HRT</dt>
            <dd>{two(c.hrt)}</dd>
          </div>
          <div>
            <dt>PER</dt>
            <dd>{two(c.per)}</dd>
          </div>
          {c.aether !== undefined && (
            <div>
              <dt>Aether</dt>
              <dd>{c.aether}</dd>
            </div>
          )}
        </dl>
        <dl className="creature-block__attacks">
          <dt className="label">Off</dt>
          <dd>
            <Line xs={c.offense} />
          </dd>
          <dt className="label">Def</dt>
          <dd>
            <Line xs={c.defense} />
          </dd>
        </dl>
        <div className="cluster">
          <span className="tag">{c.yields ? "Yields" : "Does not Yield"}</span>
        </div>
        <p className="prose creature-block__tactics">{c.tactics}</p>
        <p className="small dim creature-block__pays">
          A kill pays each participant of its Grade <b className="num">{ve}</b> VE. From Level 8 it counts at Force{" "}
          <b className="num">
            {engine.creatureSizingForce(
              c.offense.map((o) => o.force),
              c.defense.map((d) => d.force),
            )}
          </b>
          .
        </p>
      </div>
    </article>
  );
}

export function BestiarySection({ view, engine }: { view: GmView; engine: Engine | null }) {
  const [group, setGroup] = useState("all");
  if (!engine)
    return (
      <main className="screen">
        <p className="dim">Loading rules…</p>
      </main>
    );
  const all = engine.rules.bestiary.creatures as Entry[];
  const groups = [...new Set(all.map((c) => c.tier_group))];
  const shown = group === "all" ? all : all.filter((c) => c.tier_group === group);
  return (
    <main className="screen screen--side bestiary-screen">
      <section className="stack bestiary-screen__main" aria-labelledby="creature-blocks">
        <div className="spread">
          <h2 id="creature-blocks" className="cluster">
            <i className="ic ic-bestiary dim" aria-hidden="true" />
            Stat blocks
          </h2>
          <label className="field field--row">
            <span>Tier</span>
            <select className="select bestiary-screen__tier" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="all">All</option>
              {groups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="small dim">Build a fight from these under Combat, where the sizing reads the creatures you choose.</p>
        <div className="creature-blocks">
          {shown.map((c) => (
            <StatBlock key={c.name} engine={engine} c={c} />
          ))}
        </div>
      </section>
      <SizingTable view={view} engine={engine} />
    </main>
  );
}
