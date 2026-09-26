/**
 * The GM's forms, one per kind of action. Each builds a draft from what the GM enters (with
 * the engine's number as the default where the book gives one) and hands it to Commit, which
 * previews and records it.
 */
import type { Engine } from "@gradebreaker/engine";
import {
  type Action,
  type AwardBasis,
  type Envelope,
  type GmView,
  type RestGoal,
  type Sheet,
  hoursForGoal,
  pointBuyProblems,
} from "@gradebreaker/record";
import { useMemo, useState } from "react";
import { ATTRIBUTES, type Names } from "../text.ts";
import { Commit } from "./Commit.tsx";

type Tab = "character" | "ve" | "rest" | "points" | "vitals" | "collapse";

const TABS: [Tab, string][] = [
  ["ve", "Award VE"],
  ["rest", "Consolidation"],
  ["points", "Assigned points"],
  ["vitals", "HP and Aether"],
  ["character", "New character"],
  ["collapse", "Collapse"],
];

interface FormProps {
  view: GmView;
  engine: Engine;
  names: Names;
  onRecorded: (env: Envelope) => void;
}

export function RecordPanel(props: Omit<FormProps, "onRecorded"> & { onRecorded: (env: Envelope) => void }) {
  const [tab, setTab] = useState<Tab>(props.view.characters.length ? "ve" : "character");
  // A form is remounted after each record, so it starts clean with a new key.
  const [round, setRound] = useState(0);
  const onRecorded = (env: Envelope) => {
    props.onRecorded(env);
    setRound((r) => r + 1);
  };
  const p = { ...props, onRecorded };
  return (
    <section className="card record">
      <nav className="tabs">
        {TABS.map(([t, label]) => (
          <button key={t} className={t === tab ? "active" : ""} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </nav>
      <div key={`${tab}-${round}`}>
        {tab === "character" && <NewCharacterForm {...p} />}
        {tab === "ve" && <AwardForm {...p} />}
        {tab === "rest" && <RestForm {...p} />}
        {tab === "points" && <PointsForm {...p} />}
        {tab === "vitals" && <VitalsForm {...p} />}
        {tab === "collapse" && <CollapseForm {...p} />}
      </div>
    </section>
  );
}

const shortId = () => Math.random().toString(36).slice(2, 6);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "character";
const int = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? NaN : Math.trunc(Number(s)));

function NoCharacters() {
  return <p className="muted">Create a character first.</p>;
}

// ------------------------------------------------------------ character ---

function NewCharacterForm({ view, engine, names, onRecorded }: FormProps) {
  const pregens: { name: string; tagline: string }[] = engine.rules.character.pregens;
  const pb = engine.rules.character.point_buy;
  const [mode, setMode] = useState<"pregen" | "custom">("pregen");
  const [pregen, setPregen] = useState(pregens[0]?.name ?? "");
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("");
  const [background, setBackground] = useState("");
  const [stats, setStats] = useState<Record<string, string>>(Object.fromEntries(ATTRIBUTES.map((a) => [a, "5"])));
  const [suffix] = useState(shortId);
  const players = view.members.filter((m) => m.role === "player");

  const numbers = Object.fromEntries(ATTRIBUTES.map((a) => [a, int(stats[a] ?? "")]));
  const spent = Object.values(numbers).reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
  const withPlayer = playerId ? { playerId } : {};
  let action: Action | null = null;
  let problem: string | null = null;
  if (mode === "pregen") {
    action = { type: "character.pregen", characterId: `${slug(pregen)}-${suffix}`, pregen, ...withPlayer };
  } else {
    const problems = pointBuyProblems(engine, numbers);
    if (!name.trim()) problem = "Give the character a name.";
    else if (!background.trim()) problem = "Write the Background: one or two lines of life before Integration.";
    else if (problems.length) problem = problems.join("; ");
    action = { type: "character.create", characterId: `${slug(name)}-${suffix}`, name: name.trim(), stats: numbers, background, ...withPlayer };
  }

  return (
    <div className="form">
      <div className="row">
        <label>
          <input type="radio" checked={mode === "pregen"} onChange={() => setMode("pregen")} /> Ready-made
        </label>
        <label>
          <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} /> Point buy
        </label>
      </div>
      <label>
        Player
        <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
          <option value="">Held by the GM</option>
          {players.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
      </label>
      {mode === "pregen" ? (
        <label>
          Character
          <select value={pregen} onChange={(e) => setPregen(e.target.value)}>
            {pregens.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}: {p.tagline}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Background
            <textarea rows={2} value={background} onChange={(e) => setBackground(e.target.value)} />
          </label>
          <div className="stat-inputs">
            {ATTRIBUTES.map((a) => (
              <label key={a}>
                {a}
                <input
                  type="number"
                  min={pb.min_per_stat}
                  max={pb.max_per_stat}
                  value={stats[a]}
                  onChange={(e) => setStats({ ...stats, [a]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <p className="muted">
            {spent} of {pb.points} points; each Attribute {pb.min_per_stat} to {pb.max_per_stat}.
          </p>
        </>
      )}
      <Commit
        campaignId={view.campaign.id}
        action={action}
        problem={problem}
        names={names}
        label={`Create ${mode === "pregen" ? pregen : name.trim() || "the character"}`}
        onRecorded={onRecorded}
      />
    </div>
  );
}

// ------------------------------------------------------------------- VE ---

type BasisKind = AwardBasis["kind"];

function AwardForm({ view, engine, names, onRecorded }: FormProps) {
  const aw = engine.rules.cultivation.awards;
  const tiers: string[] = aw.kill_tiers.map((t: { difficulty: string }) => t.difficulty);
  const cores: { name: string; ve: number }[] = aw.cores;
  const densities = Object.entries(aw.ambient_absorption_per_hour as Record<string, number>);
  const grades: string[] = engine.rules.grades.grades.map((g: { code: string }) => g.code);

  const [kind, setKind] = useState<BasisKind>("kill");
  const [creature, setCreature] = useState("");
  const [victimGrade, setVictimGrade] = useState("F");
  const [boss, setBoss] = useState(false);
  const [questId, setQuestId] = useState("");
  const [core, setCore] = useState(cores[0]?.name ?? "");
  const [density, setDensity] = useState(densities[0]?.[0] ?? "Moderate");
  const [hours, setHours] = useState("1");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [included, setIncluded] = useState<Record<string, boolean>>(Object.fromEntries(view.characters.map((c) => [c.id, true])));
  const [tier, setTier] = useState<Record<string, string>>(Object.fromEntries(view.characters.map((c) => [c.id, "Moderate"])));
  const [override, setOverride] = useState<Record<string, string>>({});

  if (!view.characters.length) return <NoCharacters />;

  const defaultFor = (c: Sheet): number => {
    switch (kind) {
      case "kill": {
        const ve = engine.killVe(tier[c.id] ?? "Moderate", c.grade, victimGrade);
        return boss ? Math.floor(ve * aw.boss_multiplier_gm_discretion) : ve;
      }
      case "core":
        return (cores.find((x) => x.name === core)?.ve ?? 0) * engine.scale(c.grade);
      case "ambient":
        return (aw.ambient_absorption_per_hour[density] ?? 0) * Math.max(0, int(hours) || 0) * engine.scale(c.grade);
      default:
        return int(amount) || 0;
    }
  };

  const rows = view.characters.map((c) => {
    const o = override[c.id];
    const ve = o !== undefined && o !== "" ? int(o) : defaultFor(c);
    return { c, ve };
  });
  const chosen = rows.filter((r) => included[r.c.id]);
  const chosenTiers = [...new Set(chosen.map((r) => tier[r.c.id] ?? "Moderate"))];
  const basis: AwardBasis =
    kind === "kill"
      ? { kind, tier: chosenTiers.length === 1 ? chosenTiers[0]! : "mixed", victimGrade, ...(creature.trim() ? { creature: creature.trim() } : {}) }
      : kind === "quest"
        ? { kind, ...(questId.trim() ? { questId: questId.trim() } : {}) }
        : kind === "core"
          ? { kind, core }
          : kind === "ambient"
            ? { kind, hours: int(hours) || 0, density }
            : kind === "hidden-achievement"
              ? { kind }
              : { kind, note: note.trim() || "award" };
  let problem: string | null = null;
  if (!chosen.length) problem = "Choose who receives it.";
  else if (chosen.some((r) => Number.isNaN(r.ve) || r.ve < 0)) problem = "Each award is a whole number of VE.";
  const action: Action = { type: "ve.award", basis, awards: chosen.map((r) => ({ characterId: r.c.id, ve: r.ve })) };

  return (
    <div className="form">
      <label>
        Source
        <select value={kind} onChange={(e) => setKind(e.target.value as BasisKind)}>
          <option value="kill">Kill</option>
          <option value="quest">Quest</option>
          <option value="core">Core</option>
          <option value="ambient">Ambient absorption</option>
          <option value="hidden-achievement">Hidden Achievement</option>
          <option value="other">Other</option>
        </select>
      </label>
      {kind === "kill" && (
        <div className="row">
          <label>
            Creature
            <input value={creature} onChange={(e) => setCreature(e.target.value)} placeholder="Frenzy Rat" />
          </label>
          <label>
            Its Grade
            <select value={victimGrade} onChange={(e) => setVictimGrade(e.target.value)}>
              {grades.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={boss} onChange={(e) => setBoss(e.target.checked)} /> Boss ×{aw.boss_multiplier_gm_discretion}
          </label>
        </div>
      )}
      {kind === "quest" && (
        <label>
          Quest
          <input value={questId} onChange={(e) => setQuestId(e.target.value)} placeholder="Q-001" />
        </label>
      )}
      {kind === "core" && (
        <label>
          Core
          <select value={core} onChange={(e) => setCore(e.target.value)}>
            {cores.map((x) => (
              <option key={x.name} value={x.name}>
                {x.name} ({x.ve} VE at F)
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === "ambient" && (
        <div className="row">
          <label>
            Density
            <select value={density} onChange={(e) => setDensity(e.target.value)}>
              {densities.map(([d, v]) => (
                <option key={d} value={d}>
                  {d} ({v} VE an hour at F)
                </option>
              ))}
            </select>
          </label>
          <label>
            Hours
            <input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
        </div>
      )}
      {kind === "other" && (
        <label>
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      {(kind === "quest" || kind === "hidden-achievement" || kind === "other") && (
        <label>
          VE each
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      )}
      <table className="rows">
        <thead>
          <tr>
            <th />
            <th>Character</th>
            {kind === "kill" && <th>Tier for them</th>}
            <th>VE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c, ve }) => (
            <tr key={c.id}>
              <td>
                <input type="checkbox" checked={Boolean(included[c.id])} onChange={(e) => setIncluded({ ...included, [c.id]: e.target.checked })} />
              </td>
              <td>{c.name}</td>
              {kind === "kill" && (
                <td>
                  <select value={tier[c.id]} onChange={(e) => setTier({ ...tier, [c.id]: e.target.value })}>
                    {tiers.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </td>
              )}
              <td>
                <input
                  type="number"
                  className="narrow-input"
                  value={override[c.id] ?? String(Number.isNaN(ve) ? "" : ve)}
                  onChange={(e) => setOverride({ ...override, [c.id]: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Every participant collects the full award for their own tier; nothing is divided.</p>
      <Commit
        campaignId={view.campaign.id}
        action={action}
        problem={problem}
        names={names}
        label={new Set(chosen.map((r) => r.ve)).size === 1 && chosen.length ? `Award ${chosen[0]!.ve} VE` : "Award VE"}
        onRecorded={onRecorded}
      />
    </div>
  );
}

// -------------------------------------------------------- Consolidation ---

type GoalKind = RestGoal["kind"];

function RestForm({ view, engine, names, onRecorded }: FormProps) {
  const [highDensity, setHighDensity] = useState(false);
  const [included, setIncluded] = useState<Record<string, boolean>>(Object.fromEntries(view.characters.map((c) => [c.id, true])));
  const [goal, setGoal] = useState<Record<string, GoalKind>>({});
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [hours, setHours] = useState<Record<string, string>>({});
  const [interrupted, setInterrupted] = useState<Record<string, boolean>>({});

  if (!view.characters.length) return <NoCharacters />;

  const rows = view.characters.map((c) => {
    const g = goal[c.id] ?? "everything";
    const g2: RestGoal = g === "amount" ? { kind: "amount", ve: int(amount[c.id] ?? "") || 0 } : { kind: g };
    const plan = hoursForGoal(engine, c, g2, highDensity);
    const h = hours[c.id] !== undefined && hours[c.id] !== "" ? int(hours[c.id]!) : plan.hours;
    return { c, g, plan, h };
  });
  const chosen = rows.filter((r) => included[r.c.id]);
  const problem = !chosen.length
    ? "Choose who rests. A guard is simply left out."
    : chosen.some((r) => Number.isNaN(r.h) || r.h < 0)
      ? "Hours are whole and not negative."
      : null;
  const action: Action = {
    type: "consolidation.rest",
    highDensity,
    rests: chosen.map((r) => ({ characterId: r.c.id, hours: r.h, ...(interrupted[r.c.id] ? { interrupted: true } : {}) })),
  };

  return (
    <div className="form">
      <label className="check">
        <input type="checkbox" checked={highDensity} onChange={(e) => setHighDensity(e.target.checked)} /> High or Extreme density site
        (refines {engine.refineRate("F", true)} VE an hour at F)
      </label>
      <table className="rows">
        <thead>
          <tr>
            <th />
            <th>Character</th>
            <th>Goal</th>
            <th>Hours</th>
            <th>Interrupted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ c, g, plan, h }) => (
            <tr key={c.id}>
              <td>
                <input type="checkbox" checked={Boolean(included[c.id])} onChange={(e) => setIncluded({ ...included, [c.id]: e.target.checked })} />
              </td>
              <td>
                {c.name}
                <div className="muted small">{c.storedVe} VE stored</div>
              </td>
              <td>
                <select value={g} onChange={(e) => setGoal({ ...goal, [c.id]: e.target.value as GoalKind })}>
                  <option value="everything">Process everything</option>
                  <option value="next-level">Until the next level</option>
                  <option value="amount">A specific amount</option>
                </select>
                {g === "amount" && (
                  <input
                    type="number"
                    className="narrow-input"
                    placeholder="VE"
                    value={amount[c.id] ?? ""}
                    onChange={(e) => setAmount({ ...amount, [c.id]: e.target.value })}
                  />
                )}
                {plan.note && <div className="muted small">{plan.note}</div>}
              </td>
              <td>
                <input
                  type="number"
                  className="narrow-input"
                  min={0}
                  value={hours[c.id] ?? String(h)}
                  onChange={(e) => setHours({ ...hours, [c.id]: e.target.value })}
                />
              </td>
              <td>
                <input type="checkbox" checked={Boolean(interrupted[c.id])} onChange={(e) => setInterrupted({ ...interrupted, [c.id]: e.target.checked })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Enter the full hours each character completed. An interrupted rest keeps them.</p>
      <Commit campaignId={view.campaign.id} action={action} problem={problem} names={names} label="Record the rest" onRecorded={onRecorded} />
    </div>
  );
}

// ------------------------------------------------------- System points ---

function PointsForm({ view, engine, names, onRecorded }: FormProps) {
  const lv = engine.rules.character.leveling;
  const mapping: { behavior: string; primary: string; secondary: string }[] = engine.rules.character.behavioral_stat_mapping;
  const waiting = view.characters.filter((c) => c.pendingSystemLevels.length);
  const [characterId, setCharacterId] = useState(waiting[0]?.id ?? "");
  const c = waiting.find((x) => x.id === characterId) ?? waiting[0];
  const [level, setLevel] = useState<number | null>(null);
  const [placement, setPlacement] = useState<Record<string, string>>({});

  if (!c)
    return (
      <p className="muted">
        No character has assigned points due. Each level brings 3, which you place by how the character has behaved since the
        last level; they come due when the level lands during Consolidation.
      </p>
    );
  const lvl = level !== null && c.pendingSystemLevels.includes(level) ? level : c.pendingSystemLevels[0]!;
  const due = lv.system_assigned * engine.scale(c.grade);
  const numbers = Object.fromEntries(
    ATTRIBUTES.map((a) => [a, int(placement[a] ?? "") || 0]).filter(([, v]) => v !== 0),
  ) as Record<string, number>;
  const total = Object.values(numbers).reduce((a, b) => a + b, 0);
  const problem =
    lvl >= lv.class_level
      ? `From Level ${lv.class_level} the class places assigned points; class selection is not in the app yet.`
      : total !== due
        ? `Place exactly ${due} points (${total} placed).`
        : null;
  const action: Action = { type: "points.system", characterId: c.id, level: lvl, placement: numbers };

  return (
    <div className="form">
      <div className="row">
        <label>
          Character
          <select value={c.id} onChange={(e) => setCharacterId(e.target.value)}>
            {waiting.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Level
          <select value={lvl} onChange={(e) => setLevel(Number(e.target.value))}>
            {c.pendingSystemLevels.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="stat-inputs">
        {ATTRIBUTES.map((a) => (
          <label key={a}>
            {a} <span className="muted small">{c.raw[a]}</span>
            <input type="number" min={0} value={placement[a] ?? ""} onChange={(e) => setPlacement({ ...placement, [a]: e.target.value })} />
          </label>
        ))}
      </div>
      <table className="rows mapping">
        <thead>
          <tr>
            <th>Behavior since the last level</th>
            <th>Primary</th>
            <th>Secondary</th>
          </tr>
        </thead>
        <tbody>
          {mapping.map((m) => (
            <tr
              key={m.behavior}
              className="clickable"
              title="Place 2 in the primary and 1 in the secondary"
              onClick={() => setPlacement({ [m.primary]: String(2 * engine.scale(c.grade)), [m.secondary]: String(engine.scale(c.grade)) })}
            >
              <td>{m.behavior}</td>
              <td>{m.primary}</td>
              <td>{m.secondary}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Assigned points: the {due} Attribute points each level gives by how the character behaved since the last level
        (Progression, "Behavioral Stat Mapping"). Reward what the character actually did. Click a row to place 2 and 1, or split
        them by hand.
      </p>
      <Commit
        campaignId={view.campaign.id}
        action={action}
        problem={problem}
        names={names}
        label={`Place ${c.name}'s Level ${lvl} points`}
        onRecorded={onRecorded}
      />
    </div>
  );
}

// -------------------------------------------------------- HP and Aether ---

function VitalsForm({ view, names, onRecorded }: FormProps) {
  const [characterId, setCharacterId] = useState(view.characters[0]?.id ?? "");
  const [resource, setResource] = useState<"hp" | "aether">("hp");
  const [delta, setDelta] = useState("");
  const c = view.characters.find((x) => x.id === characterId) ?? view.characters[0];
  if (!c) return <NoCharacters />;
  const d = int(delta);
  const problem = Number.isNaN(d) || d === 0 ? "Enter a change: negative for damage or spending, positive for healing or restoring." : null;
  const action: Action = { type: resource === "hp" ? "hp.change" : "aether.change", characterId: c.id, delta: d };
  return (
    <div className="form">
      <div className="row">
        <label>
          Character
          <select value={c.id} onChange={(e) => setCharacterId(e.target.value)}>
            {view.characters.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} (HP {x.hp}/{x.maxHp}, Aether {x.aether}/{x.maxAether})
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="radio" checked={resource === "hp"} onChange={() => setResource("hp")} /> HP
        </label>
        <label>
          <input type="radio" checked={resource === "aether"} onChange={() => setResource("aether")} /> Aether
        </label>
        <label>
          Change
          <input type="number" className="narrow-input" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="−5" />
        </label>
      </div>
      <p className="muted">Until the combat tracker records fights, damage and spending are entered here.</p>
      <Commit
        campaignId={view.campaign.id}
        action={action}
        problem={problem}
        names={names}
        label={`Apply ${Number.isNaN(d) ? "" : d > 0 ? `+${d}` : d} ${resource === "hp" ? "HP" : "Aether"} to ${c.name}`}
        onRecorded={onRecorded}
      />
    </div>
  );
}

// -------------------------------------------------------------- collapse ---

function CollapseForm({ view, names, onRecorded }: FormProps) {
  const critical = useMemo(() => view.characters.filter((c) => c.saturation.collapseClock), [view.characters]);
  const [characterId, setCharacterId] = useState(critical[0]?.id ?? "");
  const [attribute, setAttribute] = useState<"FOR" | "POW">("FOR");
  const [highDensity, setHighDensity] = useState(false);
  const c = critical.find((x) => x.id === characterId) ?? critical[0];
  if (!c) return <p className="muted">Nobody is at Critical Saturation. The collapse clock runs only there.</p>;
  const action: Action = { type: "saturation.collapse", characterId: c.id, attribute, highDensity };
  return (
    <div className="form">
      <div className="row">
        <label>
          Character
          <select value={c.id} onChange={(e) => setCharacterId(e.target.value)}>
            {critical.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({x.storedVe} VE)
              </option>
            ))}
          </select>
        </label>
        <label>
          Point lost (player's choice)
          <select value={attribute} onChange={(e) => setAttribute(e.target.value as "FOR" | "POW")}>
            <option value="FOR">FOR</option>
            <option value="POW">POW</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={highDensity} onChange={(e) => setHighDensity(e.target.checked)} /> High density site
        </label>
      </div>
      <p className="muted">Roll the collapse clock at the end of each full hour at Critical and record the collapse when it comes.</p>
      <Commit campaignId={view.campaign.id} action={action} names={names} label={`Record ${c.name}'s collapse`} onRecorded={onRecorded} />
    </div>
  );
}
