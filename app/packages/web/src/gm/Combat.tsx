/**
 * The GM's combat tracker (Core Mechanics, "Combat"). Setting up names the sides and who is on
 * each: characters from the record, creatures from the Bestiary or entered by hand. Running
 * it follows the book's round: the side holding Momentum takes its turn first, one combatant
 * at a time spending their Beats, then the next side; Momentum shifts at the start of a round
 * after a won Seize or a Reversal the GM calls. Tracker actions are the GM's bookkeeping and
 * record at once, with Undo (app/DESIGN.md, "The GM is the captain"). Before Initial Momentum
 * the GM can give the Surprise Beat; Aura Pressure asks for the Will Save when a higher-Grade
 * combatant is in the fight; a Downed combatant shows vital coherence and the GM's rulings.
 */
import type { Engine } from "@gradebreaker/engine";
import {
  type Action,
  type CombatantSpec,
  type CombatantView,
  type Encounter,
  type EncounterView,
  type Envelope,
  type ForceOption,
  type GmView,
  auraSavers,
  flankingSuggested,
  pillLimit,
  shapes,
  stabilizeCheck,
} from "@gradebreaker/record";
import { useState } from "react";
import { Icon, Mark, Meter, useMarkRow } from "../ui.tsx";
import { newActionId, submit } from "../api.ts";
import { type Actor, CareActions, type Mate, pillsOf } from "../Care.tsx";
import { AttackForm, type Clasher, DefenseForm, YieldChoice } from "../Clash.tsx";
import type { Names } from "../text.ts";
import { AftermathPanel } from "./Aftermath.tsx";
import { RollList } from "../Dice.tsx";
import { SizingPanel, sizedOf } from "./Sizing.tsx";
import { permissionClash, reactionsOffered, techniqueOffer } from "../classes.ts";
import { type Firing, expandCreatures, prepCreaturesOf, savedTo } from "./Prep.tsx";
import { prepCause } from "@gradebreaker/record";
import { Commit } from "./Commit.tsx";

interface Creature {
  name: string;
  grade: string;
  tier: string;
  hp: number;
  beats: number;
  hrt: number;
  per: number;
  yields: boolean;
  offense: ForceOption[];
  defense: ForceOption[];
  hunts_by_reading?: boolean;
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
  const run = async (action: Action, cause?: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await submit(campaignId, newActionId(), action, cause);
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
  const [custom, setCustom] = useState({ name: "", grade: "F", hp: "", beats: "2", momentum: "", kind: "npc" as "npc" | "creature", hunts: false });
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
        yields: c.yields,
        offense: c.offense,
        defense: c.defense,
        ...(c.hunts_by_reading ? { huntsByReading: true } : {}),
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
        kind: custom.kind,
        grade: custom.grade,
        maxHp: hp,
        beats: Math.max(0, Math.trunc(Number(custom.beats)) || 0),
        momentumForce: Math.max(0, Math.trunc(Number(custom.momentum)) || 0),
        ...(custom.hunts ? { huntsByReading: true } : {}),
      },
    ]);
    setCustom({ ...custom, name: "", hp: "" });
  };

  return (
    <div className="stack picker">
      <div className="picker__row">
        <label className="field">
          <span>From the Bestiary</span>
          <select className="select" value={pick} onChange={(e) => setPick(e.target.value)}>
            {bestiary.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.grade} {c.tier}, HP {c.hp})
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>How many</span>
          <input type="number" className="input num" min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <label className="field">
          <span>Side</span>
          <select className="select" value={side} onChange={(e) => setSideId(e.target.value)}>
            {sides.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={addBestiary}>
          <Icon name="add" />
          Add
        </button>
      </div>
      <details>
        <summary className="small dim">Someone not in the Bestiary</summary>
        <div className="form-row picker__custom">
          <label>
            Name
            <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} />
          </label>
          <label title="At 0 HP an NPC is Downed and a creature dies">
            At 0 HP
            <select value={custom.kind} onChange={(e) => setCustom({ ...custom, kind: e.target.value as "npc" | "creature" })}>
              <option value="npc">NPC: Downed</option>
              <option value="creature">Creature: dies</option>
            </select>
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
          <label className="check" title="It finds its prey by the System's reading, so a character the System reads as dead is passed over">
            <input type="checkbox" checked={custom.hunts} onChange={(e) => setCustom({ ...custom, hunts: e.target.checked })} /> Hunts by the System's reading
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
          <button className="btn" disabled={!customOk} onClick={addCustom}>
            <Icon name="add" />
            Add
          </button>
        </div>
      </details>
    </div>
  );
}

// ------------------------------------------------------------- setup ---

function Setup({ view, engine, onRecorded, firing, onFired }: { view: GmView; engine: Engine; onRecorded: (env: Envelope) => void; firing?: Extract<Firing, { kind: "encounter" }>; onFired?: () => void }) {
  const { run, busy, error } = useRecord(view.campaign.id, onRecorded);
  const [name, setName] = useState(firing?.encounter.name ?? "");
  const [sides, setSides] = useState([
    { id: "party", name: "The party" },
    { id: "hostiles", name: "Hostiles" },
  ]);
  // Characters players hold start on the first side; the GM's own start out of the fight.
  const [placed, setPlaced] = useState<Record<string, string>>(() =>
    Object.fromEntries(view.characters.map((c) => [c.id, c.playerId ? "party" : ""])),
  );
  const [others, setOthers] = useState<CombatantSpec[]>(() => (firing ? expandCreatures(engine, firing.encounter.creatures, "hostiles") : []));
  const [zoneText, setZoneText] = useState(firing?.encounter.zones.join(", ") || "Here");
  const [prepTitle, setPrepTitle] = useState("");
  const zones = zoneText
    .split(",")
    .map((z) => z.trim())
    .filter(Boolean)
    .map((name, i) => ({ id: `z${i + 1}`, name }));

  const combatants: CombatantSpec[] = [
    ...view.characters.filter((c) => placed[c.id]).map((c) => ({ combatantId: c.id, sideId: placed[c.id]!, characterId: c.id })),
    ...others,
  ];
  const sideCount = new Set(combatants.map((c) => c.sideId)).size;
  const problem = sideCount < 2 ? "Put someone on at least two sides." : null;

  const start = async () => {
    const ok = await run(
      {
        type: "combat.start",
        encounterId: `fight-${rid()}`,
        name: name.trim() || "Fight",
        sides: sides.filter((s) => combatants.some((c) => c.sideId === s.id)),
        zones,
        combatants,
      },
      firing && prepCause(firing.prepId),
    );
    if (ok) onFired?.();
  };

  // The Combat screen's two columns: the fight's parts on the left, its sizing and start docked right.
  return (
    <main className="screen screen--side combat-screen combat-setup">
      <section className="stack combat-main" aria-label="A new fight">
        <header className="stack combat-head combat-head__title">
          <span className="label">The fight</span>
          <h1>A new fight</h1>
          {firing && <p className="small dim">From Prep. Place the characters, then start it.</p>}
        </header>
        <section className="panel">
          <div className="panel__head">
            <Icon name="clash" />
            <h2>Name, sides, and Zones</h2>
          </div>
          <div className="panel__body stack">
            <label className="field setup__name">
              <span>Name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="The treeline" />
            </label>
            <div className="cluster setup__sides">
              {sides.map((s, i) => (
                <label key={s.id} className="field">
                  <span>Side {i + 1}</span>
                  <input className="input" value={s.name} onChange={(e) => setSides(sides.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))} />
                </label>
              ))}
              {sides.length < 6 && (
                <button className="btn btn--sm setup__add-side" onClick={() => setSides([...sides, { id: `side-${rid()}`, name: `Side ${sides.length + 1}` }])} title="Three or more sides: Momentum sets the order for the whole round">
                  <Icon name="add" />
                  Add a side
                </button>
              )}
            </div>
            <label className="field">
              <span>Zones: loose areas, separated by commas; everyone starts in the first</span>
              <input className="input" value={zoneText} onChange={(e) => setZoneText(e.target.value)} placeholder="The bar, The floor, The doorway" />
            </label>
            {zones.length > 0 && (
              <div className="zones__grid" role="list" aria-label="Zones">
                {zones.map((z, i) => (
                  <div key={z.id} role="listitem" className="zone-card">
                    <div className="spread">
                      <b className="world">{z.name}</b>
                      <Icon name="zone" />
                    </div>
                    <div className="small dim">{i === 0 ? "everyone starts here" : "empty"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel__head">
            <Icon name="party" />
            <h2>Characters</h2>
          </div>
          {view.characters.length === 0 ? (
            <p className="dim panel__body">No characters in the campaign yet.</p>
          ) : (
            <ul className="rows panel__rows">
              {view.characters.map((c) => (
                <li key={c.id}>
                  <span className="row__main">
                    <b>{c.name}</b> <span className="small dim num">Level {c.level} · {c.grade}</span>
                  </span>
                  <select className="select select--sm setup__side" value={placed[c.id] ?? ""} onChange={(e) => setPlaced({ ...placed, [c.id]: e.target.value })} aria-label={`Side for ${c.name}`}>
                    <option value="">Not in the fight</option>
                    {sides.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <div className="panel__head">
            <Icon name="bestiary" />
            <h2>Creatures and NPCs</h2>
          </div>
          <div className="panel__body stack">
            <CreaturePicker engine={engine} sides={sides} onAdd={(specs) => setOthers([...others, ...specs])} />
          </div>
          {others.length > 0 && (
            <ul className="rows panel__rows setup__others">
              {others.map((o) => (
                <li key={o.combatantId}>
                  <span className="row__main">
                    <b>{o.name}</b>{" "}
                    <span className="small dim">
                      {sides.find((s) => s.id === o.sideId)?.name} · HP {o.maxHp} · {o.beats} Beat{o.beats === 1 ? "" : "s"} · Momentum {o.momentumForce}
                    </span>
                  </span>
                  <button className="btn btn--sm" onClick={() => setOthers(others.filter((x) => x.combatantId !== o.combatantId))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
      <aside className="stack combat-aside">
        <section className="panel">
          <div className="panel__head">
            <Icon name="momentum" />
            <h2>Start</h2>
          </div>
          <div className="panel__body stack">
            <SizingPanel
              engine={engine}
              party={view.characters.filter((c) => placed[c.id])}
              creatures={others.filter((o) => !view.characters.some((c) => placed[c.id] === o.sideId)).map((o) => sizedOf(engine, o))}
            />
            {problem && <p className="problem">{problem}</p>}
            {error && <p className="error">{error}</p>}
          </div>
          <div className="draft__decide">
            <button className="btn btn--primary" disabled={Boolean(problem) || busy} onClick={start}>
              <Icon name="play" />
              Start the fight
            </button>
          </div>
        </section>
        {firing && others.length > 0 && (
          <details className="panel folded">
            <summary>Save the changes to Prep</summary>
            <Commit
              campaignId={view.campaign.id}
              action={{
                type: "prep.save",
                items: [
                  savedTo(view, firing.prepId, {
                    kind: "encounter",
                    title: view.prep.find((p) => p.id === firing.prepId)?.title ?? (name.trim() || "Fight"),
                    encounter: { name: name.trim() || "Fight", zones: zones.map((z) => z.name), creatures: prepCreaturesOf(others.filter((o) => !view.characters.some((c) => c.id === o.characterId))) },
                  }),
                ],
              }}
              names={(id) => id}
              label="Save to Prep"
              onRecorded={(env) => {
                onRecorded(env);
                onFired?.();
              }}
            />
          </details>
        )}
        {others.length > 0 && (
          <details className="panel folded">
            <summary>Save this fight to Prep</summary>
            <label className="field">
              <span>Title</span>
              <input className="input" value={prepTitle} onChange={(e) => setPrepTitle(e.target.value)} placeholder={name.trim() || "The treeline"} />
            </label>
            <Commit
              campaignId={view.campaign.id}
              action={{
                type: "prep.save",
                items: [
                  {
                    id: `fight-${slug(prepTitle.trim() || name.trim() || "fight")}`,
                    kind: "encounter",
                    title: prepTitle.trim() || name.trim() || "Fight",
                    encounter: { name: name.trim() || prepTitle.trim() || "Fight", zones: zones.map((z) => z.name), creatures: prepCreaturesOf(others.filter((o) => !view.characters.some((c) => c.id === o.characterId))) },
                  },
                ],
              }}
              names={(id) => id}
              label="Save to Prep"
              onRecorded={onRecorded}
            />
          </details>
        )}
      </aside>
    </main>
  );
}

// ------------------------------------------------------------ running ---

const BEAT_KINDS = ["Check", "Item", "Application", "Disengage"];

/** A combatant as the Clash forms need them: a character's Forces, or a creature's stat block lines. */
export function clasherOf(view: GmView, c: CombatantView, role: "attack" | "defense", engine?: Engine): Clasher {
  const sheet = c.characterId ? view.characters.find((s) => s.id === c.characterId) : undefined;
  if (sheet)
    return {
      kind: "character",
      name: c.name,
      force: sheet.force,
      aether: sheet.aether,
      surgeCost: sheet.surgeCost,
      shapes: engine ? shapes(engine) : [],
      proficiencies: sheet.proficiencies,
      ...(sheet.class ? { technique: techniqueOffer(engine ?? null, sheet.class, { aether: sheet.aether, usedThisFight: Boolean(c.techniqueUsed), inFight: true }) } : {}),
      ...permissionClash(sheet.class),
    };
  return { kind: "creature", name: c.name, options: (role === "attack" ? c.offense : c.defense) ?? [] };
}

function Pips({ n, of }: { n: number; of: number }) {
  return (
    <span className="pips" title={`${n} of ${of} Beats left`}>
      {Array.from({ length: Math.max(of, n) }, (_, i) => (
        <i key={i} className={i < n ? "on" : ""} />
      ))}
    </span>
  );
}

/** A combatant as the shared in-fight forms read them. */
export function mateOf(c: CombatantView): Mate {
  const m: Mate = {
    id: c.id,
    name: c.name,
    sideId: c.sideId,
    zoneId: c.zoneId,
    out: c.out,
    downed: Boolean(c.downed),
    stabilized: Boolean(c.downed?.stabilized),
    suppressed: c.aura === "suppressed",
    pills: c.pills,
  };
  if (c.characterId) m.characterId = c.characterId;
  return m;
}

function CombatantRow({
  c,
  e,
  view,
  engine,
  canAct,
  run,
  busy,
}: {
  c: CombatantView;
  e: EncounterView;
  view: GmView;
  engine: Engine;
  canAct: boolean;
  run: (a: Action) => Promise<boolean>;
  busy: boolean;
}) {
  const [delta, setDelta] = useState("");
  const [other, setOther] = useState("");
  const [attacking, setAttacking] = useState<null | "turn" | "free" | { name: string; technique: boolean }>(null);
  const [zone, setZone] = useState(c.zoneId ?? "");
  const targets = e.combatants.filter((x) => !x.out && x.sideId !== c.sideId).map((x) => ({ id: x.id, name: x.name, zoneId: x.zoneId }));
  const sheet = c.characterId ? view.characters.find((s) => s.id === c.characterId) : undefined;
  const permission = sheet?.class?.permission;
  const hook = permission?.hook;
  const reactions = reactionsOffered(engine, sheet?.class, {
    reactionsUsed: c.reactionsUsed ?? 0,
    technique: sheet?.class ? techniqueOffer(engine, sheet.class, { aether: sheet.aether, usedThisFight: Boolean(c.techniqueUsed), inFight: true }) : null,
  });
  const zoneName = (id: string | null) => e.zones.find((z) => z.id === id)?.name ?? "";
  const pickedZone = zone && zone !== c.zoneId ? zone : "";
  const acting = e.acting === c.id;
  const holder = e.order[0];
  const d = Math.trunc(Number(delta));
  const applyHp = async (sign: 1 | -1) => {
    if (d > 0 && (await run({ type: "combat.hp", combatantId: c.id, delta: sign * d }))) setDelta("");
  };
  // The acting combatant's situational controls are open; any other row opens them with one
  // press (P4). Free strikes and reactions stay in view whenever they can be taken.
  const [open, setOpen] = useState(false);
  const ruling = Boolean(c.downed || (c.dead && c.kind !== "character" && c.hp === 0));
  const offTurn = !acting && !e.clash && e.round > 0 && !c.out && !c.downed;
  const reactionsNow = offTurn ? reactions : [];
  const down = Boolean(c.downed || c.dead);
  const marked = useMarkRow(c.characterId);
  const hpControls = (
    <>
      <input type="number" className="input num track__delta" min={1} value={delta} onChange={(ev) => setDelta(ev.target.value)} placeholder="HP" aria-label={`HP for ${c.name}`} />
      <button className="btn btn--sm" disabled={busy || !(d > 0)} onClick={() => applyHp(-1)}>
        Damage
      </button>
      <button className="btn btn--sm" disabled={busy || !(d > 0)} onClick={() => applyHp(1)}>
        Heal
      </button>
    </>
  );

  return (
    <li className={`track${acting ? " track--acting" : ""}${(c.acted || c.out) && !acting ? " track--done" : ""}${down ? " track--downed" : ""}${marked.className}`} style={marked.style}>
      <span className="track__stripe" aria-hidden="true" />
      <div className="track__who">
        <span className={`track__name${c.characterId ? "" : " world"}`}>
          <Mark id={c.characterId} />
          {c.name}
        </span>
        <span className="track__meta">
          {c.creature && c.creature !== c.name && `${c.creature} · `}Momentum {c.momentumForce}
          {c.zoneId && (
            <>
              {" · "}
              <span className="world">{zoneName(c.zoneId)}</span>
            </>
          )}
          {c.huntsByReading && " · hunts by the System's reading"}
          {c.acted && !c.out && " · acted"}
        </span>
        <div className="track__tags">
          {acting && <span className="tag tag--solid">Acting</span>}
          {e.round === 0 && e.surprise?.includes(c.id) && <span className="tag tag--solid">Surprise Beat</span>}
          {c.exposed && (
            <span className="tag tag--danger">
              <Icon name="exposed" />
              Exposed
            </span>
          )}
          {c.downed && (
            <span className="tag tag--danger">
              <Icon name="downed" />
              {c.downed.stabilized ? "Downed, stabilized" : `Downed: vital coherence ${c.downed.coherence}`}
            </span>
          )}
          {c.aura === "suppressed" && (
            <span className="tag tag--danger">
              <Icon name="suppressed" />
              Suppressed
            </span>
          )}
          {c.aura === "steeled" && <span className="tag">Steeled</span>}
          {c.readAsDead && (
            <span className="tag" title={permission?.effect}>
              Reads as dead
            </span>
          )}
          {c.dead ? <span className="tag tag--danger">Dead</span> : c.out && <span className="tag">Out</span>}
        </div>
      </div>
      <div className="track__hp">
        <Meter kind={down ? "danger" : "health"} value={c.hp} max={c.maxHp} />
        <span className="num" style={down ? { color: "var(--danger)" } : undefined}>
          <b>{c.hp}</b>/{c.maxHp}
        </span>
      </div>
      <div className="track__beats" title={`${c.beats} of ${c.beatsPerTurn} Beats left`}>
        {c.downed || c.out ? (
          <span className="dim small">no Beats</span>
        ) : (
          <>
            <Pips n={c.beats} of={c.beatsPerTurn} />
            <span className="num dim">
              {c.beats}/{c.beatsPerTurn}
            </span>
          </>
        )}
      </div>
      <div className="track__actions">
        {ruling ? (
          <>
            <span className="small dim">Your ruling:</span>
            {(c.dead || !c.downed?.stabilized) && (
              <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "combat.fate", combatantId: c.id, fate: "stabilized" })} title="Left alive, or success at a cost: the countdown stops">
                {c.dead ? "Left alive" : "Stabilized"}
              </button>
            )}
            {!c.dead && (
              <button className="btn btn--sm btn--danger" disabled={busy} onClick={() => run({ type: "combat.fate", combatantId: c.id, fate: "dead" })}>
                Dies
              </button>
            )}
          </>
        ) : (
          !c.out && (
            <>
              {hpControls}
              {canAct && !acting && (
                <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => run({ type: "combat.act", combatantId: c.id })}>
                  {c.name} acts
                </button>
              )}
              <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "combat.remove", combatantId: c.id })} title="Fled, dead, or otherwise out">
                Out
              </button>
            </>
          )
        )}
        {!c.out && !acting && (
          <button className="btn btn--sm btn--icon track__more" aria-expanded={open} aria-label={open ? `Fewer controls for ${c.name}` : `More controls for ${c.name}`} onClick={() => setOpen(!open)}>
            <Icon name="caret" />
          </button>
        )}
      </div>
      {offTurn && !attacking && (
        <div className="track__quick">
          <button className="btn btn--sm" disabled={busy} onClick={() => setAttacking("free")} title="Leaving a Zone without Disengaging: one Clash roll at no Beat">
            Free strike…
          </button>
          {reactionsNow.map((r) => (
            <button key={r.name} className="btn btn--sm" disabled={busy} onClick={() => setAttacking(r)} title={r.technique ? sheet!.class!.technique.effect : permission!.effect}>
              {r.name}…
            </button>
          ))}
        </div>
      )}
      {(acting || open) && !c.out && (
        <div className="track__drawer">
          {c.spent.length > 0 && <div className="small dim">This round: {c.spent.join(", ")}</div>}
          {c.characterId && (c.pills.healing > 0 || c.pills.aether > 0) && (
            <div className="small dim">
              Pills since the last Consolidation: {c.pills.healing} healing, {c.pills.aether} Aether
            </div>
          )}
          {ruling && <div className="cluster">{hpControls}</div>}
          <div className="cluster">
            {e.zones.length > 1 && (
              <>
                <select className="select select--sm" value={zone || c.zoneId || ""} onChange={(ev) => setZone(ev.target.value)} aria-label={`Zone for ${c.name}`}>
                  {e.zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
                {pickedZone && acting && (
                  <button className="btn btn--sm" disabled={busy || c.beats < 1} onClick={() => run({ type: "combat.move", combatantId: c.id, zoneId: pickedZone })}>
                    <Icon name="move" />
                    Move (1 Beat)
                  </button>
                )}
                {pickedZone && acting && hook?.kind === "free-move" && (
                  <button className="btn btn--sm" disabled={busy} title={permission!.effect} onClick={() => run({ type: "combat.move", combatantId: c.id, zoneId: pickedZone, permission: true })}>
                    Move by {permission!.name} (no Beat)
                  </button>
                )}
                {pickedZone && (
                  <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "combat.move", combatantId: c.id, zoneId: pickedZone, forced: true })} title="Driven, thrown, or placed: no Beat">
                    Place
                  </button>
                )}
              </>
            )}
            <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "combat.exposed", combatantId: c.id, exposed: !c.exposed })} title="−10 to Clash rolls until the end of their next turn">
              {c.exposed ? "Clear Exposed" : "Exposed"}
            </button>
            {!c.downed && (
              <button
                className="btn btn--sm"
                disabled={busy}
                onClick={() => run({ type: "combat.suppress", combatantId: c.id, suppressed: c.aura !== "suppressed" })}
                title="Your ruling: a creature or NPC under Aura Pressure, or three or more Grades apart without a save"
              >
                {c.aura === "suppressed" ? "Clear Suppressed" : "Suppressed"}
              </button>
            )}
            {c.aura === "suppressed" && c.characterId && e.aura && (
              <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "combat.will", combatantId: c.id, reason: "distracted" })} title="The entity took significant damage or was distracted: the Will Save again">
                Entity hurt: save again
              </button>
            )}
          </div>
          {acting && !e.clash && (
            <div className="cluster beats">
              <button className="btn btn--sm btn--primary" disabled={busy || c.beats < 1} aria-expanded={attacking === "turn"} onClick={() => setAttacking(attacking === "turn" ? null : "turn")}>
                <Icon name="clash" />
                Attack…
              </button>
              {BEAT_KINDS.map((k) => (
                <button key={k} className="btn btn--sm" disabled={busy || c.beats < 1} onClick={() => run({ type: "combat.beat", combatantId: c.id, what: k })}>
                  {k}
                </button>
              ))}
              {hook?.kind === "free-disengage" && (
                <button className="btn btn--sm" disabled={busy} title={permission!.effect} onClick={() => run({ type: "combat.beat", combatantId: c.id, what: "Disengage", permission: true })}>
                  Disengage by {permission!.name} (no Beat)
                </button>
              )}
              <input className="input track__other" value={other} onChange={(ev) => setOther(ev.target.value)} placeholder="Other" aria-label="Another use of a Beat" />
              <button
                className="btn btn--sm"
                disabled={busy || c.beats < 1 || !other.trim()}
                onClick={async () => {
                  if (await run({ type: "combat.beat", combatantId: c.id, what: other.trim() })) setOther("");
                }}
              >
                Spend
              </button>
              {e.round > 0 && c.sideId !== holder && (
                <button className="btn btn--sm" disabled={busy || c.beats < 1} onClick={() => run({ type: "combat.seize", combatantId: c.id })} title="1 Beat: a Momentum Roll against the side holding Momentum">
                  <Icon name="momentum" />
                  Seize Momentum
                </button>
              )}
              {auraSavers(engine, e as unknown as Encounter, c.id, true).length > 0 && (
                <button className="btn btn--sm" disabled={busy || c.beats < 1} onClick={() => run({ type: "combat.aura", entityId: c.id, flaring: true, flare: true })} title="1 Beat: a fresh Will Save against 115 from everyone below its Grade">
                  Flare aura
                </button>
              )}
              <span className="grow" />
              <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => run({ type: "combat.done", combatantId: c.id })}>
                <Icon name="confirm" />
                Done
              </button>
            </div>
          )}
          {acting && !e.clash && (
            <CareActions
              me={actorOf(view, c, engine)}
              people={e.combatants.map(mateOf)}
              pills={pillsOf(engine)}
              pillLimit={pillLimit(engine)}
              stabilize={stabilizeCheck(engine)}
              beats={c.beats}
              busy={busy}
              run={run}
            />
          )}
        </div>
      )}
      {attacking && !e.clash && (
        <div className="track__drawer">
          <AttackForm
            attacker={clasherOf(view, c, "attack", engine)}
            targets={targets}
            suggestFlanking={(d) => flankingSuggested(e as unknown as Encounter, c.id, d)}
            gm
            free={attacking === "free"}
            {...(typeof attacking === "object" ? { reaction: attacking } : {})}
            {...(attacking === "turn" && hook?.kind === "rush" ? { rush: { name: permission!.name, zones: e.zones.filter((z) => z.id !== c.zoneId) } } : {})}
            busy={busy}
            onCancel={() => setAttacking(null)}
            onDeclare={async (d) => {
              const ok = await run({
                type: "combat.attack",
                attackerId: c.id,
                defenderId: d.defenderId,
                attack: d.attack,
                ...(d.flanking ? { flanking: true } : {}),
                ...(d.cornered ? { cornered: true } : {}),
                ...(attacking === "free" ? { free: true } : {}),
                ...(typeof attacking === "object" ? { reaction: true } : {}),
                ...(d.rush ? { rush: d.rush } : {}),
                ...(d.label ? { label: d.label } : {}),
              });
              if (ok) setAttacking(null);
            }}
          />
        </div>
      )}
    </li>
  );
}

function actorOf(view: GmView, c: CombatantView, engine: Engine | null): Actor {
  const sheet = c.characterId ? view.characters.find((s) => s.id === c.characterId) : undefined;
  if (!sheet) return mateOf(c);
  return {
    ...mateOf(c),
    force: sheet.force,
    items: view.inventory[sheet.id] ?? [],
    ...(sheet.class ? { technique: techniqueOffer(engine, sheet.class, { aether: sheet.aether, usedThisFight: Boolean(c.techniqueUsed), inFight: true }) } : {}),
  };
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

  // The pending Clash docks in a column that stays in view (Decisions, "the makeover", P3).
  return (
    <main className="screen screen--side combat-screen">
      <section className="stack combat-main" aria-label="The fight">
        <header className="spread combat-head">
          <div className="stack combat-head__title">
            <span className="label">The fight</span>
            <h1>{e.name}</h1>
            <div className="cluster">
              <span className="tablebar__big">{e.round ? `Round ${e.round}` : "Momentum not rolled"}</span>
              {e.round > 0 && (
                <span className="tag">
                  <Icon name="momentum" />
                  Momentum: {sideName(e.order[0]!)}
                </span>
              )}
              {e.pending && e.pending.sideId !== e.order[0] && (
                <span className="tag tag--solid">
                  Shifts to {sideName(e.pending.sideId)} next round ({e.pending.by === "seize" ? "Seize" : "Reversal"})
                </span>
              )}
            </div>
          </div>
          <div className="cluster">
            {e.round === 0 ? (
              <button className="btn btn--primary" disabled={busy} onClick={() => run({ type: "combat.momentum" })}>
                <Icon name="momentum" />
                Roll Initial Momentum
              </button>
            ) : (
              <button className={roundOver ? "btn btn--primary" : "btn"} disabled={busy} onClick={() => run({ type: "combat.round" })}>
                <Icon name="next" />
                Next round
              </button>
            )}
            <button className="btn" disabled={busy || !undoable} onClick={() => last && run({ type: "void", targetId: last.id, reason: "undo" })}>
              <Icon name="undo" />
              Undo
            </button>
            {ending ? (
              <span className="confirm confirm--armed">
                <button className="btn btn--primary" disabled={busy} onClick={() => run({ type: "combat.end" })}>
                  End {e.name}
                </button>
                <button className="btn" onClick={() => setEnding(false)}>
                  Keep fighting
                </button>
              </span>
            ) : (
              <button className="btn" onClick={() => setEnding(true)}>
                End the fight…
              </button>
            )}
          </div>
        </header>
        {e.round > 0 && (
          <div className="cluster small">
            <span className="dim">Decisive Tactical Reversal:</span>
            {e.sides
              .filter((s) => s.id !== e.order[0])
              .map((s) => (
                <button key={s.id} className="btn btn--sm" disabled={busy} onClick={() => run({ type: "combat.reversal", sideId: s.id })}>
                  Momentum to {s.name} next round
                </button>
              ))}
          </div>
        )}
        {roundOver && <p className="callout">Every side has acted. Start the next round.</p>}
        {error && <p className="error">{error}</p>}
        {e.round === 0 && !e.surprise && <SurprisePanel e={e} run={run} busy={busy} />}
        <AuraPanel engine={engine} e={e} run={run} busy={busy} />
        {e.zones.length > 0 && <ZonesBar e={e} run={run} busy={busy} />}
        {order.map((sid, i) => {
          const members = e.combatants.filter((c) => c.sideId === sid);
          const taking = sid === turnSide;
          return (
            <section key={sid} className="stack combat-side-block" aria-label={sideName(sid)}>
              <h2 className="cluster combat-side-block__head">
                {sideName(sid)}
                {e.round > 0 && i === 0 && (
                  <span className="tag">
                    <Icon name="momentum" />
                    Momentum
                  </span>
                )}
                {taking && <span className="tag tag--solid">Taking its turn</span>}
              </h2>
              <ol className="tracker">
                {members.map((c) => (
                  <CombatantRow
                    key={c.id}
                    c={c}
                    e={e}
                    view={view}
                    engine={engine}
                    canAct={(taking || (e.round === 0 && Boolean(e.surprise?.includes(c.id)))) && !c.acted && !c.out && !c.downed && !e.clash}
                    run={run}
                    busy={busy}
                  />
                ))}
              </ol>
            </section>
          );
        })}
        <details className="panel combat-join" open={adding} onToggle={(ev) => setAdding((ev.target as HTMLDetailsElement).open)}>
          <summary>Someone joins the fight</summary>
          <AddMidFight view={view} engine={engine} e={e} run={run} />
        </details>
      </section>
      <aside className="stack combat-aside">
        <ClashPanel view={view} engine={engine} e={e} run={run} busy={busy} />
        <section className="panel">
          <div className="panel__head">
            <Icon name="dice" />
            <h2 className="label">Recent rolls</h2>
          </div>
          <div className="panel__body">
            <RollList rolls={view.rolls.slice(0, 12)} gm />
          </div>
        </section>
      </aside>
    </main>
  );
}

/** Before Initial Momentum: who, if anyone, achieved true surprise. */
function SurprisePanel({ e, run, busy }: { e: EncounterView; run: (a: Action) => Promise<boolean>; busy: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const able = e.combatants.filter((c) => !c.out && !c.downed);
  return (
    <details className="disclosure">
      <summary>An ambush? Give the Surprise Beat</summary>
      <p className="small muted">Each surprising combatant takes one free Beat before Initial Momentum is rolled.</p>
      <div className="form-row tight">
        {able.map((c) => (
          <label key={c.id} className="check">
            <input
              type="checkbox"
              checked={picked.includes(c.id)}
              onChange={(ev) => setPicked(ev.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))}
            />{" "}
            {c.name}
          </label>
        ))}
        <button className="primary" disabled={busy || picked.length === 0} onClick={() => run({ type: "combat.surprise", combatantIds: picked })}>
          Give the Surprise Beat
        </button>
      </div>
    </details>
  );
}

/** A higher-Grade combatant in the fight: the Will Save for everyone below its Grade who has not faced it. */
function AuraPanel({ engine, e, run, busy }: { engine: Engine; e: EncounterView; run: (a: Action) => Promise<boolean>; busy: boolean }) {
  const pressing = e.combatants
    .filter((c) => !c.out && !c.downed)
    .map((c) => ({ c, savers: auraSavers(engine, e as unknown as Encounter, c.id, false) }))
    .filter((x) => x.savers.length > 0);
  if (!pressing.length) return null;
  return (
    <section className="clash-panel">
      {pressing.map(({ c, savers }) => (
        <div key={c.id}>
          <h3>
            Aura Pressure: {c.name} ({c.grade}-Grade)
          </h3>
          <p className="small">
            {savers.map((s) => s.name).join(", ")} {savers.length === 1 ? "makes" : "make"} the Will Save, Heart against its aura. Three or more Grades
            apart, you may mark them Suppressed without a save; an entity holding its aura in asks for no save.
          </p>
          <div className="form-row tight">
            <button className="primary" disabled={busy} onClick={() => run({ type: "combat.aura", entityId: c.id, flaring: false })}>
              Carried calmly: Moderate (90)
            </button>
            <button className="primary" disabled={busy} onClick={() => run({ type: "combat.aura", entityId: c.id, flaring: true })}>
              Flaring: Hard (115)
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

/** The Clash waiting on its defense or Yield, and the last one resolved with its drive. */
function ClashPanel({
  view,
  engine,
  e,
  run,
  busy,
}: {
  view: GmView;
  engine: Engine;
  e: EncounterView;
  run: (a: Action) => Promise<boolean>;
  busy: boolean;
}) {
  const name = (id: string) => e.combatants.find((c) => c.id === id)?.name ?? id;
  const [drive, setDrive] = useState("");
  const cl = e.clash;
  if (cl) {
    const att = e.combatants.find((c) => c.id === cl.attackerId)!;
    const def = e.combatants.find((c) => c.id === cl.defenderId)!;
    const a = cl.attack;
    const cut = (cl.result?.covers ?? []).reduce((n, x) => n + x.cut, 0);
    const how = a.attribute ? `${a.attribute}` : `${a.means ?? "Force"} ${a.force}`;
    const extras = [
      a.modifier ? `${a.modifier > 0 ? "+" : ""}${a.modifier}` : "",
      cl.flanking ? "Flanking +10" : "",
      a.surge ? `Surge +5${a.surgeHealth ? " (paid in Health)" : ""}` : "",
      a.advantage ? "Advantage" : "",
      att.exposed ? "Exposed −10" : "",
      cl.cornered ? `${def.name} Cornered` : "",
      cl.free ? "free strike" : "",
    ].filter(Boolean);
    return (
      <section className="panel clash" aria-label="The Clash">
        <div className="panel__head">
          <Icon name="clash" />
          <h2>
            {att.name} attacks {def.name}
            {cl.label ? `: ${cl.label}` : ""}
          </h2>
        </div>
        <div className="panel__body stack clash__body">
        <p className="small dim">
          {how}
          {extras.length ? ` · ${extras.join(" · ")}` : ""}
        </p>
        {cl.stage === "defense" ? (
          <>
            <p className="small">
              {def.characterId ? `${def.name}'s player can answer on their screen, or record it here.` : `${def.name} defends.`}
              {def.exposed ? " Exposed: −10." : ""}
            </p>
            <DefenseForm defender={clasherOf(view, def, "defense", engine)} busy={busy} onDefend={(s) => run({ type: "combat.defend", defense: s })} />
          </>
        ) : (
          <>
            <div className="clash__totals">
              <div className="stack">
                <span className="label">Attack</span>
                <span className="num clash__total">{cl.result!.attackTotal}</span>
                <span className="small dim">{att.name}</span>
              </div>
              <span className="dim clash__against">against</span>
              <div className="stack">
                <span className="label">Defense</span>
                <span className="num clash__total">{cl.result!.defenseTotal}</span>
                <span className="small dim">{def.name}</span>
              </div>
            </div>
            <div className="spread clash__margin">
              <span className="label">Margin</span>
              <span className="num">
                {cut ? (
                  <>
                    <s className="dim">{cl.result!.margin}</s> {Math.max(0, cl.result!.margin - cut)}
                  </>
                ) : (
                  cl.result!.margin
                )}
              </span>
            </div>
            {cut > 0 && <p className="small dim">{cut} cut by {cl.result!.covers!.map((x) => name(x.combatantId)).join(" and ")}.</p>}
            {def.characterId && <p className="small">{def.name}'s player can choose on their screen.</p>}
            {(e.coverIds ?? []).length > 0 && (
              <div className="cluster">
                {e.coverIds!.map((id) => {
                  const sh = view.characters.find((s) => s.id === e.combatants.find((x) => x.id === id)?.characterId);
                  const p = sh?.class?.permission;
                  return (
                    <button key={id} className="btn btn--sm" disabled={busy} title={p?.effect} onClick={() => run({ type: "combat.cover", combatantId: id })}>
                      {p?.name ?? "Cover"}: {name(id)} cuts the Margin by {p?.hook?.kind === "cover" ? p.hook.cut : ""} (a Beat from the next turn)
                    </button>
                  );
                })}
              </div>
            )}
            <YieldChoice
              margin={Math.max(0, cl.result!.margin - cut)}
              cap={cl.result!.yieldCap}
              multiplier={engine.damageMultiplier(att.grade)}
              busy={busy}
              onYield={(y) => run({ type: "combat.resolve", yield: y })}
            />
          </>
        )}
        </div>
      </section>
    );
  }
  const r = e.lastClash;
  if (!r) return null;
  const def = e.combatants.find((c) => c.id === r.defenderId);
  const line = !r.attackerWins
    ? `${name(r.defenderId)} turns the attack, ${r.defenseTotal} against ${r.attackTotal}${r.turnedAside ? `: Turned Aside, ${name(r.attackerId)} is Exposed` : ""}.`
    : `${name(r.attackerId)} hits ${name(r.defenderId)}, Margin ${r.margin}${r.yielded ? `, ${r.yielded} Beat${r.yielded === 1 ? "" : "s"} Yielded` : ""}: ${r.damage} damage${r.drivenBack ? ", Driven Back and Exposed" : ""}.`;
  const zones = e.zones.filter((z) => z.id !== def?.zoneId);
  const target = zones.some((z) => z.id === drive) ? drive : (zones[0]?.id ?? "");
  return (
    <section className="panel clash clash--last" aria-label="The last Clash">
      <div className="panel__body stack">
      <p>{line}</p>
      {!r.attackerWins && r.defenseExploded && (
        <p className="small dim">A defensive Clash won on an explosion can be a Decisive Tactical Reversal; call it above if it is.</p>
      )}
      {r.drivable && def && !def.out && zones.length > 0 && (
        <div className="cluster">
          <span className="small">{name(r.attackerId)} may drive {def.name} into an adjacent Zone:</span>
          <select className="select select--sm" value={target} onChange={(ev) => setDrive(ev.target.value)}>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "combat.move", combatantId: def.id, zoneId: target, forced: true })}>
            Drive
          </button>
        </div>
      )}
      </div>
    </section>
  );
}

/** Who stands where, and the Zones renamed or added. */
function ZonesBar({ e, run, busy }: { e: EncounterView; run: (a: Action) => Promise<boolean>; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(e.zones.map((z) => z.name).join(", "));
  const save = async () => {
    const names = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Existing Zones keep their ids in order; new names get new ids.
    const zones = names.map((n, i) => ({ id: e.zones[i]?.id ?? `z${Date.now().toString(36)}${i}`, name: n }));
    if (await run({ type: "combat.zones", zones })) setEditing(false);
  };
  return (
    <div className="stack zones">
      <div className="zones__grid" role="list" aria-label="Zones">
        {e.zones.map((z) => (
          <div key={z.id} role="listitem" className="zone-card">
            <div className="spread">
              <b className="world">{z.name}</b>
              <Icon name="zone" />
            </div>
            <div className="small dim">
              {e.combatants
                .filter((c) => c.zoneId === z.id && !c.out)
                .map((c, i) => (
                  <span key={c.id} className={c.characterId ? undefined : "world"}>
                    {i > 0 && ", "}
                    <Mark id={c.characterId} />
                    {c.name}
                  </span>
                ))}
              {!e.combatants.some((c) => c.zoneId === z.id && !c.out) && "empty"}
            </div>
          </div>
        ))}
      </div>
      {editing ? (
        <div className="cluster">
          <input className="input wide" value={text} onChange={(ev) => setText(ev.target.value)} aria-label="Zones, separated by commas" />
          <button className="btn btn--sm" disabled={busy} onClick={save}>
            Save Zones
          </button>
        </div>
      ) : (
        <div>
          <button className="btn-link small dim" onClick={() => setEditing(true)}>
            Edit Zones
          </button>
        </div>
      )}
    </div>
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
        <div className="form-row">
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
  names,
  log,
  onRecorded,
  firing,
  onFired,
}: {
  view: GmView;
  engine: Engine | null;
  names: Names;
  log: Envelope[];
  onRecorded: (env: Envelope) => void;
  firing?: Extract<Firing, { kind: "encounter" }>;
  onFired?: () => void;
}) {
  if (!engine) return <p className="muted pad">Loading rules…</p>;
  if (view.encounter) return <Running view={view} engine={engine} e={view.encounter} log={log} onRecorded={onRecorded} />;
  return (
    <main className="page">
      {view.aftermath ? (
        // Keyed by the fight, so a new aftermath starts from its own defaults.
        <AftermathPanel key={view.aftermath.id} view={view} engine={engine} names={names} onRecorded={onRecorded} />
      ) : (
        <Setup key={firing?.prepId ?? "new"} view={view} engine={engine} onRecorded={onRecorded} {...(firing ? { firing } : {})} {...(onFired ? { onFired } : {})} />
      )}
    </main>
  );
}
