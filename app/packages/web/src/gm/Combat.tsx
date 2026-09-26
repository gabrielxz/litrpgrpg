/**
 * The GM's combat tracker (Core Mechanics, "Combat"). Setting up names the sides and who is on
 * each: characters from the record, creatures from the Bestiary or entered by hand. Running
 * it follows the book's round: the side holding Momentum takes its turn first, one combatant
 * at a time spending their Beats, then the next side; Momentum shifts at the start of a round
 * after a won Seize or a Reversal the GM calls. Tracker actions are the GM's bookkeeping and
 * record at once, with Undo (app/DESIGN.md, "The GM is the captain").
 */
import type { Engine } from "@gradebreaker/engine";
import type { Action, CombatantSpec, CombatantView, EncounterView, Envelope, GmView } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import { RollList } from "../Dice.tsx";

interface Creature {
  name: string;
  grade: string;
  tier: string;
  hp: number;
  beats: number;
  hrt: number;
  per: number;
}

const rid = () => Math.random().toString(36).slice(2, 6);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "combatant";

/** Records one tracker action at once; the error, if any, shows beside the tracker. */
function useRecord(campaignId: string, onRecorded: (env: Envelope) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      const r = await submit(campaignId, newActionId(), action);
      onRecorded(r.envelope);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error };
}

// ------------------------------------------------------ creature picker ---

function CreaturePicker({
  engine,
  sides,
  onAdd,
}: {
  engine: Engine;
  sides: { id: string; name: string }[];
  onAdd: (specs: CombatantSpec[]) => void;
}) {
  const bestiary: Creature[] = engine.rules.bestiary.creatures;
  const grades: string[] = engine.rules.grades.grades.map((g: { code: string }) => g.code);
  const [pick, setPick] = useState(bestiary[0]?.name ?? "");
  const [count, setCount] = useState("1");
  const [sideId, setSideId] = useState(sides[sides.length - 1]?.id ?? "");
  const [custom, setCustom] = useState({ name: "", grade: "F", hp: "", beats: "2", momentum: "" });
  const side = sides.some((s) => s.id === sideId) ? sideId : (sides[sides.length - 1]?.id ?? "");

  const addBestiary = () => {
    const c = bestiary.find((x) => x.name === pick);
    const n = Math.max(1, Math.min(20, Math.trunc(Number(count)) || 1));
    if (!c) return;
    onAdd(
      Array.from({ length: n }, (_, i) => ({
        combatantId: `${slug(c.name)}-${rid()}`,
        sideId: side,
        name: n > 1 ? `${c.name} ${i + 1}` : c.name,
        creature: c.name,
        grade: c.grade,
        maxHp: c.hp,
        beats: c.beats,
        momentumForce: Math.max(c.hrt, c.per),
      })),
    );
  };
  const hp = Math.trunc(Number(custom.hp));
  const customOk = custom.name.trim() && hp > 0;
  const addCustom = () => {
    if (!customOk) return;
    onAdd([
      {
        combatantId: `${slug(custom.name)}-${rid()}`,
        sideId: side,
        name: custom.name.trim(),
        grade: custom.grade,
        maxHp: hp,
        beats: Math.max(0, Math.trunc(Number(custom.beats)) || 0),
        momentumForce: Math.max(0, Math.trunc(Number(custom.momentum)) || 0),
      },
    ]);
    setCustom({ ...custom, name: "", hp: "" });
  };

  return (
    <div className="form">
      <div className="row">
        <label>
          From the Bestiary
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            {bestiary.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.grade} {c.tier}, HP {c.hp})
              </option>
            ))}
          </select>
        </label>
        <label>
          How many
          <input type="number" className="narrow-input" min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <label>
          Side
          <select value={side} onChange={(e) => setSideId(e.target.value)}>
            {sides.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={addBestiary}>Add</button>
      </div>
      <details>
        <summary>Someone not in the Bestiary</summary>
        <div className="row">
          <label>
            Name
            <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
          </label>
          <label>
            Grade
            <select value={custom.grade} onChange={(e) => setCustom({ ...custom, grade: e.target.value })}>
              {grades.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label>
            HP
            <input type="number" className="narrow-input" value={custom.hp} onChange={(e) => setCustom({ ...custom, hp: e.target.value })} />
          </label>
          <label>
            Beats
            <input type="number" className="narrow-input" value={custom.beats} onChange={(e) => setCustom({ ...custom, beats: e.target.value })} />
          </label>
          <label title="The higher of its HRT and PER Force">
            Momentum Force
            <input
              type="number"
              className="narrow-input"
              value={custom.momentum}
              onChange={(e) => setCustom({ ...custom, momentum: e.target.value })}
            />
          </label>
          <button disabled={!customOk} onClick={addCustom}>
            Add
          </button>
        </div>
      </details>
    </div>
  );
}

// ------------------------------------------------------------- setup ---

function Setup({ view, engine, onRecorded }: { view: GmView; engine: Engine; onRecorded: (env: Envelope) => void }) {
  const { run, busy, error } = useRecord(view.campaign.id, onRecorded);
  const [name, setName] = useState("");
  const [sides, setSides] = useState([
    { id: "party", name: "The party" },
    { id: "hostiles", name: "Hostiles" },
  ]);
  // Characters players hold start on the first side; the GM's own start out of the fight.
  const [placed, setPlaced] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.characters.map((c) => [c.id, c.playerId ? "party" : ""])),
  );
  const [others, setOthers] = useState<CombatantSpec[]>([]);

  const combatants: CombatantSpec[] = [
    ...view.characters.filter((c) => placed[c.id]).map((c) => ({ combatantId: c.id, sideId: placed[c.id]!, characterId: c.id })),
    ...others,
  ];
  const sideCount = new Set(combatants.map((c) => c.sideId)).size;
  const problem = sideCount < 2 ? "Put someone on at least two sides." : null;

  return (
    <section className="card combat-setup">
      <h2>A new fight</h2>
      <div className="row">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="The treeline" />
        </label>
      </div>
      <h3>Sides</h3>
      <div className="row">
        {sides.map((s, i) => (
          <label key={s.id}>
            Side {i + 1}
            <input value={s.name} onChange={(e) => setSides(sides.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} />
          </label>
        ))}
        {sides.length < 6 && (
          <button onClick={() => setSides([...sides, { id: `side-${rid()}`, name: `Side ${sides.length + 1}` }])} title="Three or more sides: Momentum sets the order for the whole round">
            Add a side
          </button>
        )}
      </div>
      <h3>Characters</h3>
      {view.characters.length === 0 && <p className="muted">No characters in the campaign yet.</p>}
      <table className="rows">
        <tbody>
          {view.characters.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>
                <select value={placed[c.id] ?? ""} onChange={(e) => setPlaced({ ...placed, [c.id]: e.target.value })}>
                  <option value="">Not in the fight</option>
                  {sides.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Creatures and NPCs</h3>
      <CreaturePicker engine={engine} sides={sides} onAdd={(specs) => setOthers([...others, ...specs])} />
      {others.length > 0 && (
        <table className="rows">
          <tbody>
            {others.map((o) => (
              <tr key={o.combatantId}>
                <td>{o.name}</td>
                <td className="muted small">
                  {sides.find((s) => s.id === o.sideId)?.name} · HP {o.maxHp} · {o.beats} Beat{o.beats === 1 ? "" : "s"} · Momentum {o.momentumForce}
                </td>
                <td>
                  <button onClick={() => setOthers(others.filter((x) => x.combatantId !== o.combatantId))}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {problem && <p className="muted">{problem}</p>}
      {error && <p className="error">{error}</p>}
      <button
        className="primary"
        disabled={Boolean(problem) || busy}
        onClick={() =>
          run({
            type: "combat.start",
            encounterId: `fight-${rid()}`,
            name: name.trim() || "Fight",
            sides: sides.filter((s) => combatants.some((c) => c.sideId === s.id)),
            combatants,
          })
        }
      >
        Start the fight
      </button>
    </section>
  );
}

// ------------------------------------------------------------ running ---

const BEAT_KINDS = ["Attack", "Move", "Check", "Item", "Application", "Disengage"];

function Pips({ n, of }: { n: number; of: number }) {
  return (
    <span className="pips" title={`${n} of ${of} Beats left`}>
      {Array.from({ length: Math.max(of, n) }, (_, i) => (
        <span key={i} className={i < n ? "pip on" : "pip"} />
      ))}
    </span>
  );
}

function CombatantRow({
  c,
  e,
  canAct,
  run,
  busy,
}: {
  c: CombatantView;
  e: EncounterView;
  canAct: boolean;
  run: (a: Action) => Promise<boolean>;
  busy: boolean;
}) {
  const [delta, setDelta] = useState("");
  const [other, setOther] = useState("");
  const acting = e.acting === c.id;
  const holder = e.order[0];
  const d = Math.trunc(Number(delta));
  const pct = c.maxHp ? Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100)) : 0;
  const applyHp = async (sign: 1 | -1) => {
    if (d > 0 && (await run({ type: "combat.hp", combatantId: c.id, delta: sign * d }))) setDelta("");
  };

  return (
    <li className={`combatant ${acting ? "acting" : ""} ${c.acted ? "acted" : ""} ${c.out ? "out" : ""} ${c.downed ? "downed" : ""}`}>
      <div className="combatant-head">
        <strong>{c.name}</strong>
        {c.creature && c.creature !== c.name && <span className="muted small"> {c.creature}</span>}
        <span className="muted small"> · Momentum {c.momentumForce}</span>
        {c.downed && <span className="tag danger">Downed</span>}
        {c.out && <span className="tag">Out</span>}
        {acting && <span className="tag attention">Acting</span>}
        {c.acted && !c.out && <span className="muted small"> · acted</span>}
        <span className="grow" />
        <Pips n={c.beats} of={c.beatsPerTurn} />
      </div>
      <div className="vital">
        <span>HP</span>
        <div className="meter hp">
          <div style={{ width: `${pct}%` }} />
        </div>
        <span className="num">
          {c.hp}/{c.maxHp}
        </span>
      </div>
      {c.spent.length > 0 && <div className="muted small">This round: {c.spent.join(", ")}</div>}
      {!c.out && (
        <div className="row tight">
          <input type="number" className="narrow-input" min={1} value={delta} onChange={(ev) => setDelta(ev.target.value)} placeholder="HP" />
          <button disabled={busy || !(d > 0)} onClick={() => applyHp(-1)}>
            Damage
          </button>
          <button disabled={busy || !(d > 0)} onClick={() => applyHp(1)}>
            Heal
          </button>
          <span className="grow" />
          {canAct && !acting && (
            <button className="primary" disabled={busy} onClick={() => run({ type: "combat.act", combatantId: c.id })}>
              {c.name} acts
            </button>
          )}
          <button disabled={busy} onClick={() => run({ type: "combat.remove", combatantId: c.id })} title="Fled, dead, or otherwise out">
            Out
          </button>
        </div>
      )}
      {acting && (
        <div className="row tight beats">
          {BEAT_KINDS.map((k) => (
            <button key={k} disabled={busy || c.beats < 1} onClick={() => run({ type: "combat.beat", combatantId: c.id, what: k })}>
              {k}
            </button>
          ))}
          <input className="narrow-input" value={other} onChange={(ev) => setOther(ev.target.value)} placeholder="Other" />
          <button
            disabled={busy || c.beats < 1 || !other.trim()}
            onClick={async () => {
              if (await run({ type: "combat.beat", combatantId: c.id, what: other.trim() })) setOther("");
            }}
          >
            Spend
          </button>
          {c.sideId !== holder && (
            <button disabled={busy || c.beats < 1} onClick={() => run({ type: "combat.seize", combatantId: c.id })} title="1 Beat: a Momentum Roll against the side holding Momentum">
              Seize Momentum
            </button>
          )}
          <button className="primary" disabled={busy} onClick={() => run({ type: "combat.done", combatantId: c.id })}>
            Done
          </button>
        </div>
      )}
    </li>
  );
}

function Running({
  view,
  engine,
  e,
  log,
  onRecorded,
}: {
  view: GmView;
  engine: Engine;
  e: EncounterView;
  log: Envelope[];
  onRecorded: (env: Envelope) => void;
}) {
  const { run, busy, error } = useRecord(view.campaign.id, onRecorded);
  const [adding, setAdding] = useState(false);
  const [ending, setEnding] = useState(false);
  const sideName = (id: string) => e.sides.find((s) => s.id === id)?.name ?? id;
  const order = e.round ? e.order : e.sides.map((s) => s.id);
  const turnSide = e.round ? e.order[e.turn] : undefined;
  const roundOver = e.round > 0 && e.turn >= e.order.length;

  // Undo takes back the latest tracker action still standing.
  const voided = new Set(log.flatMap((x) => (x.action.type === "void" ? [x.action.targetId] : [])));
  const rejected = new Set(view.rejected.map((r) => r.id));
  const last = [...log].reverse().find((x) => x.action.type.startsWith("combat.") && !voided.has(x.id) && !rejected.has(x.id));
  const undoable = last && last.action.type !== "combat.start";

  return (
    <section className="tracker">
      <header className="tracker-head">
        <h2>{e.name}</h2>
        <span className="muted">{e.round ? `Round ${e.round}` : "Momentum not rolled"}</span>
        {e.round > 0 && <span className="tag">Momentum: {sideName(e.order[0]!)}</span>}
        {e.pending && e.pending.sideId !== e.order[0] && (
          <span className="tag attention">
            Shifts to {sideName(e.pending.sideId)} next round ({e.pending.by === "seize" ? "Seize" : "Reversal"})
          </span>
        )}
        <span className="grow" />
        {e.round === 0 ? (
          <button className="primary" disabled={busy} onClick={() => run({ type: "combat.momentum" })}>
            Roll Initial Momentum
          </button>
        ) : (
          <button className={roundOver ? "primary" : ""} disabled={busy} onClick={() => run({ type: "combat.round" })}>
            Next round
          </button>
        )}
        <button disabled={busy || !undoable} onClick={() => last && run({ type: "void", targetId: last.id, reason: "undo" })}>
          Undo
        </button>
        {ending ? (
          <>
            <button className="primary" disabled={busy} onClick={() => run({ type: "combat.end" })}>
              End {e.name}
            </button>
            <button onClick={() => setEnding(false)}>Keep fighting</button>
          </>
        ) : (
          <button onClick={() => setEnding(true)}>End the fight…</button>
        )}
      </header>
      {e.round > 0 && (
        <div className="row tight reversals">
          <span className="muted small">Decisive Tactical Reversal:</span>
          {e.sides
            .filter((s) => s.id !== e.order[0])
            .map((s) => (
              <button key={s.id} disabled={busy} onClick={() => run({ type: "combat.reversal", sideId: s.id })}>
                Momentum to {s.name} next round
              </button>
            ))}
        </div>
      )}
      {roundOver && <p className="muted">Every side has acted. Start the next round.</p>}
      {error && <p className="error">{error}</p>}
      <div className="sides">
        {order.map((sid, i) => {
          const members = e.combatants.filter((c) => c.sideId === sid);
          const taking = sid === turnSide;
          return (
            <div key={sid} className={`side ${taking ? "taking" : ""}`}>
              <h3>
                {sideName(sid)}
                {e.round > 0 && i === 0 && <span className="tag">Momentum</span>}
                {taking && <span className="tag attention">Taking its turn</span>}
              </h3>
              <ol className="combatants">
                {members.map((c) => (
                  <CombatantRow key={c.id} c={c} e={e} canAct={taking && !c.acted && !c.out} run={run} busy={busy} />
                ))}
              </ol>
            </div>
          );
        })}
      </div>
      <details open={adding} onToggle={(ev) => setAdding((ev.target as HTMLDetailsElement).open)}>
        <summary>Someone joins the fight</summary>
        <AddMidFight view={view} engine={engine} e={e} run={run} />
      </details>
      <h3 className="rolls-heading">Recent rolls</h3>
      <RollList rolls={view.rolls.slice(0, 12)} gm />
    </section>
  );
}

function AddMidFight({ view, engine, e, run }: { view: GmView; engine: Engine; e: EncounterView; run: (a: Action) => Promise<boolean> }) {
  const inFight = new Set(e.combatants.filter((c) => !c.out && c.characterId).map((c) => c.characterId));
  const free = view.characters.filter((c) => !inFight.has(c.id));
  const [characterId, setCharacterId] = useState("");
  const [sideId, setSideId] = useState(e.sides[0]?.id ?? "");
  const picked = free.some((c) => c.id === characterId) ? characterId : (free[0]?.id ?? "");
  return (
    <div className="form">
      {free.length > 0 && (
        <div className="row">
          <label>
            Character
            <select value={picked} onChange={(ev) => setCharacterId(ev.target.value)}>
              {free.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Side
            <select value={sideId} onChange={(ev) => setSideId(ev.target.value)}>
              {e.sides.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() =>
              run({ type: "combat.add", combatant: { combatantId: e.combatants.some((c) => c.id === picked) ? `${picked}-${rid()}` : picked, sideId, characterId: picked } })
            }
          >
            Add
          </button>
        </div>
      )}
      <CreaturePicker
        engine={engine}
        sides={e.sides}
        onAdd={async (specs) => {
          for (const s of specs) if (!(await run({ type: "combat.add", combatant: s }))) break;
        }}
      />
      <p className="muted small">Bringing a new combatant into the fight can be a Decisive Tactical Reversal; call it above if it is.</p>
    </div>
  );
}

export function CombatSection({
  view,
  engine,
  log,
  onRecorded,
}: {
  view: GmView;
  engine: Engine | null;
  log: Envelope[];
  onRecorded: (env: Envelope) => void;
}) {
  if (!engine) return <p className="muted pad">Loading rules…</p>;
  return (
    <main className="page">
      {view.encounter ? (
        <Running view={view} engine={engine} e={view.encounter} log={log} onRecorded={onRecorded} />
      ) : (
        <Setup view={view} engine={engine} onRecorded={onRecorded} />
      )}
    </main>
  );
}
