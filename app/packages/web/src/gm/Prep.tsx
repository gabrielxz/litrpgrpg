/**
 * The GM's Prep section: fights, quests, System notices, loot, and NPCs prepared before a session
 * and fired live. A notice fires here, to the characters the GM picks, its text editable for the
 * counts the moment fills in; loot goes to the spoils or to a character; an NPC with numbers joins
 * the running fight. A fight opens in Combat's setup and a quest in the Quests form, filled in, so
 * the GM places characters or picks holders and records it there. Whatever is fired carries the
 * prepared item as its cause, so Prep shows what has gone out. Every item edits in place, saved
 * again under its id (a fight or a quest from its own form). The tutorial loads as a pack, and so
 * does a file in the same shape.
 */
import type { Engine } from "@gradebreaker/engine";
import {
  type Action,
  type Appended,
  type CombatantSpec,
  type Envelope,
  type GmView,
  type PackData,
  type PrepCreature,
  type PrepItem,
  type QuestSpec,
  SPOILS,
  packItems,
  prepCause,
  tutorialPack,
} from "@gradebreaker/record";
import { useState } from "react";
import { parse as parseYaml } from "yaml";
import { type Names } from "../text.ts";
import { TableWords } from "./TableWords.tsx";
import { Commit } from "./Commit.tsx";

type Props = { view: GmView; engine: Engine | null; names: Names; log: Envelope[]; onRecorded: (env: Envelope) => void };

/** A prepared item handed to Combat or Quests to fire. */
export type Firing =
  | { prepId: string; kind: "encounter"; encounter: Extract<PrepItem, { kind: "encounter" }>["encounter"] }
  | { prepId: string; kind: "quest"; quest: QuestSpec }
  /** A drafted quest (a Personal Opportunity), opened in the form to edit and issue as the draft's acceptance. */
  | { draftId: string; kind: "quest"; quest: QuestSpec; to: string[]; submitWith: (id: string, action: Action) => Promise<Appended> };

/** A prepared item saved again under its id, keeping its group and cue. */
export function savedTo(view: GmView, prepId: string, item: Omit<Extract<PrepItem, { kind: "quest" }>, "id"> | Omit<Extract<PrepItem, { kind: "encounter" }>, "id">): PrepItem {
  const was = view.prep.find((p) => p.id === prepId);
  return { ...item, id: prepId, ...(was?.group ? { group: was.group } : {}), ...(was?.note ? { note: was.note } : {}) };
}

const rid = () => Math.random().toString(36).slice(2, 6);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "combatant";

interface Entry {
  name: string;
  grade: string;
  hp: number;
  beats: number;
  hrt: number;
  per: number;
  yields: boolean;
  offense: CombatantSpec["offense"];
  defense: CombatantSpec["defense"];
}

/** A prepared fight's creatures as the tracker's combatants: Bestiary blocks filled in, counts numbered. */
export function expandCreatures(engine: Engine, creatures: PrepCreature[], sideId: string): CombatantSpec[] {
  const bestiary = engine.rules.bestiary.creatures as Entry[];
  const out: CombatantSpec[] = [];
  for (const c of creatures) {
    const n = c.count ?? 1;
    const b = c.creature ? bestiary.find((x) => x.name === c.creature) : undefined;
    const base = c.name ?? b?.name ?? "Someone";
    for (let i = 0; i < n; i++) {
      const spec: CombatantSpec = { combatantId: `${slug(base)}-${rid()}`, sideId, name: n > 1 ? `${base} ${i + 1}` : base };
      if (b) {
        Object.assign(spec, { creature: b.name, grade: b.grade, maxHp: b.hp, beats: b.beats, momentumForce: Math.max(b.hrt, b.per), yields: b.yields, offense: b.offense, defense: b.defense });
      }
      for (const k of ["kind", "grade", "maxHp", "beats", "momentumForce", "yields", "offense", "defense"] as const) {
        if (c[k] !== undefined) (spec as unknown as Record<string, unknown>)[k] = c[k];
      }
      out.push(spec);
    }
  }
  return out;
}

/** The combatants a fight's setup holds, back into a prepared fight's creatures. */
export function prepCreaturesOf(specs: CombatantSpec[]): PrepCreature[] {
  return specs.map((s) => {
    if (s.creature) return { creature: s.creature, ...(s.name && s.name !== s.creature ? { name: s.name } : {}) };
    const c: PrepCreature = { name: s.name ?? "Someone" };
    for (const k of ["kind", "grade", "maxHp", "beats", "momentumForce", "yields", "offense", "defense"] as const) {
      if (s[k] !== undefined) (c as unknown as Record<string, unknown>)[k] = s[k];
    }
    return c;
  });
}

// ------------------------------------------------------------- notices ---

function FireNotice({ view, names, item, onRecorded }: { view: GmView; names: Names; item: Extract<PrepItem, { kind: "notice" }>; onRecorded: (env: Envelope) => void }) {
  const living = view.characters.filter((c) => !c.dead);
  const [text, setText] = useState(item.text);
  const [to, setTo] = useState<string[]>(living.filter((c) => c.playerId).map((c) => c.id));
  return (
    <div className="form">
      <label>
        The notice, as it will reach them
        <textarea rows={Math.min(8, text.split("\n").length + 1)} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <TableWords text={text} />
      <div className="row tight">
        <span className="small">To:</span>
        {living.map((c) => (
          <label key={c.id} className="check">
            <input type="checkbox" checked={to.includes(c.id)} onChange={(e) => setTo(e.target.checked ? [...to, c.id] : to.filter((x) => x !== c.id))} /> {c.name}
          </label>
        ))}
      </div>
      <Commit
        campaignId={view.campaign.id}
        action={to.length && text.trim() ? { type: "message.send", to, text: text.trim() } : null}
        problem={!to.length ? "Pick who receives it." : !text.trim() ? "The notice needs text." : null}
        names={names}
        label="Send the notice"
        cause={prepCause(item.id)}
        onRecorded={onRecorded}
      />
    </div>
  );
}

function NewNotice({ view, names, onRecorded }: Omit<Props, "engine" | "log">) {
  const [f, setF] = useState({ title: "", group: "", note: "", text: "" });
  const id = `notice-${slug(f.title)}`;
  const taken = view.prep.some((p) => p.id === id);
  const item: PrepItem = { id, kind: "notice", title: f.title.trim(), text: f.text.trim(), ...(f.group.trim() ? { group: f.group.trim() } : {}), ...(f.note.trim() ? { note: f.note.trim() } : {}) };
  return (
    <details className="card">
      <summary>Prepare a System notice</summary>
      <div className="form">
        <div className="row">
          <label>
            Title
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="The gate opens" />
          </label>
          <label>
            Group
            <input value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} placeholder="Session 4" />
          </label>
        </div>
        <label>
          The System's text
          <textarea rows={4} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        </label>
        <TableWords text={f.text} />
        {taken && <p className="warning small">A prepared notice already has this title; saving replaces it.</p>}
        <label>
          When to send it
          <input className="wide" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <Commit
          campaignId={view.campaign.id}
          action={f.title.trim() && f.text.trim() ? { type: "prep.save", items: [item] } : null}
          problem={!f.title.trim() || !f.text.trim() ? "Give it a title and the text." : null}
          names={names}
          label="Prepare the notice"
          onRecorded={(env) => {
            setF({ title: "", group: "", note: "", text: "" });
            onRecorded(env);
          }}
        />
      </div>
    </details>
  );
}

// -------------------------------------------------------- loot and NPCs ---

/** "Healing Pill × 2" per line, into stacks; a line without a count is one. */
export function stacksOf(text: string): { name: string; count: number }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(.*?)\s*[×x]\s*(\d+)$/);
      return m ? { name: m[1]!.trim(), count: Number(m[2]) } : { name: l, count: 1 };
    });
}
const stacksText = (xs: { name: string; count: number }[]) => xs.map((x) => (x.count === 1 ? x.name : `${x.name} × ${x.count}`)).join("\n");

function GiveLoot({ view, names, item, onRecorded }: { view: GmView; names: Names; item: Extract<PrepItem, { kind: "loot" }>; onRecorded: (env: Envelope) => void }) {
  const [to, setTo] = useState<string>(SPOILS);
  return (
    <div className="form">
      <label>
        To
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          <option value={SPOILS}>The spoils, for the party to divide</option>
          {view.characters
            .filter((c) => !c.dead)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <Commit
        campaignId={view.campaign.id}
        action={{ type: "item.give", to, items: item.loot }}
        names={names}
        label={to === SPOILS ? "Put it in the spoils" : `Give it to ${names(to)}`}
        cause={prepCause(item.id)}
        onRecorded={onRecorded}
      />
    </div>
  );
}

/** An NPC with numbers joins the running fight on the side the GM picks. */
function NpcJoins({ view, names, item, onRecorded }: { view: GmView; names: Names; item: Extract<PrepItem, { kind: "npc" }>; onRecorded: (env: Envelope) => void }) {
  const e = view.encounter;
  const [side, setSide] = useState(e?.sides[0]?.id ?? "");
  if (!e) return <p className="muted small">No fight is running.</p>;
  const b = item.npc.block!;
  const spec: CombatantSpec = { combatantId: `${slug(item.title)}-${rid()}`, sideId: side, name: item.title, kind: b.kind ?? "npc" };
  for (const k of ["grade", "maxHp", "beats", "momentumForce", "yields", "offense", "defense"] as const) if (b[k] !== undefined) (spec as unknown as Record<string, unknown>)[k] = b[k];
  return (
    <div className="form">
      <label>
        Side
        <select value={side} onChange={(ev) => setSide(ev.target.value)}>
          {e.sides.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <Commit campaignId={view.campaign.id} action={{ type: "combat.add", combatant: spec }} names={names} label={`${item.title} joins ${e.name}`} cause={prepCause(item.id)} onRecorded={onRecorded} />
    </div>
  );
}

const int = (s: string) => (s.trim() === "" ? undefined : Math.trunc(Number(s)));

/** Edits a prepared item in place: its title, group, and cue, and what it holds. A fight or a quest edits in its own form. */
function EditItem({ view, names, item, onRecorded, onFire, onDone }: { view: GmView; names: Names; item: PrepItem; onRecorded: (env: Envelope) => void; onFire: (f: Firing) => void; onDone: () => void }) {
  const [f, setF] = useState({
    title: item.title,
    group: item.group ?? "",
    note: item.note ?? "",
    text: item.kind === "notice" ? item.text : "",
    loot: item.kind === "loot" ? stacksText(item.loot) : "",
    who: item.kind === "npc" ? item.npc.who : "",
    line: item.kind === "npc" ? (item.npc.line ?? "") : "",
    grade: item.kind === "npc" ? (item.npc.block?.grade ?? "F") : "F",
    hp: item.kind === "npc" && item.npc.block?.maxHp !== undefined ? String(item.npc.block.maxHp) : "",
    beats: item.kind === "npc" && item.npc.block?.beats !== undefined ? String(item.npc.block.beats) : "2",
    momentum: item.kind === "npc" && item.npc.block?.momentumForce !== undefined ? String(item.npc.block.momentumForce) : "",
    force: item.kind === "npc" && item.npc.block?.offense?.[0] ? String(item.npc.block.offense[0].force) : "",
  });
  if (item.kind === "quest" || item.kind === "encounter")
    return (
      <p className="small">
        {item.kind === "quest" ? "A quest edits in the Quests form" : "A fight edits in Combat's setup"}, where saving to Prep keeps its place here.{" "}
        <button className="link" onClick={() => onFire(item.kind === "quest" ? { prepId: item.id, kind: "quest", quest: item.quest } : { prepId: item.id, kind: "encounter", encounter: item.encounter })}>
          Open it there
        </button>
      </p>
    );
  const base = { id: item.id, title: f.title.trim(), ...(f.group.trim() ? { group: f.group.trim() } : {}), ...(f.note.trim() ? { note: f.note.trim() } : {}) };
  let next: PrepItem;
  if (item.kind === "notice") next = { ...base, kind: "notice", text: f.text.trim() };
  else if (item.kind === "loot") next = { ...base, kind: "loot", loot: stacksOf(f.loot) };
  else {
    const hp = int(f.hp);
    const force = int(f.force);
    const block = hp
      ? {
          kind: "npc" as const,
          grade: f.grade,
          maxHp: hp,
          beats: int(f.beats) ?? 2,
          momentumForce: int(f.momentum) ?? 0,
          ...(force !== undefined ? { offense: [{ force, stat: "STR" }], defense: [{ force, stat: "DEX" }] } : {}),
        }
      : undefined;
    next = { ...base, kind: "npc", npc: { who: f.who.trim(), ...(f.line.trim() ? { line: f.line.trim() } : {}), ...(block ? { block } : {}) } };
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="form">
      <div className="row">
        <label>
          {item.kind === "npc" ? "Name" : "Title"}
          <input value={f.title} onChange={set("title")} />
        </label>
        <label>
          Group
          <input value={f.group} onChange={set("group")} />
        </label>
      </div>
      {item.kind === "notice" && (
        <>
          <label>
            The System's text
            <textarea rows={4} value={f.text} onChange={set("text")} />
          </label>
          <TableWords text={f.text} />
        </>
      )}
      {item.kind === "loot" && (
        <label>
          What it holds, one per line ("Healing Pill × 2")
          <textarea rows={Math.min(10, f.loot.split("\n").length + 1)} value={f.loot} onChange={set("loot")} />
        </label>
      )}
      {item.kind === "npc" && (
        <>
          <label>
            Who they are
            <input className="wide" value={f.who} onChange={set("who")} />
          </label>
          <label>
            Their line: their condition, and how the party treated them
            <input className="wide" value={f.line} onChange={set("line")} />
          </label>
          <div className="row">
            <label>
              Grade
              <input className="narrow-input" value={f.grade} onChange={set("grade")} />
            </label>
            <label title="Leave empty for an NPC who does not fight">
              HP
              <input type="number" className="narrow-input" value={f.hp} onChange={set("hp")} />
            </label>
            <label>
              Beats
              <input type="number" className="narrow-input" value={f.beats} onChange={set("beats")} />
            </label>
            <label title="The higher of their HRT and PER Force">
              Momentum
              <input type="number" className="narrow-input" value={f.momentum} onChange={set("momentum")} />
            </label>
            <label title="One Force for their attack and defense; the tracker takes others typed in">
              Force
              <input type="number" className="narrow-input" value={f.force} onChange={set("force")} />
            </label>
          </div>
        </>
      )}
      <label>
        {item.kind === "npc" ? "Where they come in" : "The cue: when to fire it"}
        <input className="wide" value={f.note} onChange={set("note")} />
      </label>
      <Commit
        campaignId={view.campaign.id}
        action={f.title.trim() ? { type: "prep.save", items: [next] } : null}
        problem={f.title.trim() ? null : "It needs a title."}
        names={names}
        label="Save the changes"
        onRecorded={(env) => {
          onRecorded(env);
          onDone();
        }}
      />
    </div>
  );
}

function NewItem({ view, names, onRecorded, kind }: Omit<Props, "engine" | "log"> & { kind: "loot" | "npc" }) {
  const [title, setTitle] = useState("");
  const id = `${kind}-${slug(title)}`;
  const taken = view.prep.some((p) => p.id === id);
  const blank: PrepItem = kind === "loot" ? { id, kind, title: "", loot: [] } : { id, kind, title: "", npc: { who: "" } };
  return (
    <details className="card">
      <summary>{kind === "loot" ? "Prepare loot" : "Prepare an NPC"}</summary>
      <label>
        {kind === "loot" ? "Title" : "Name"}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "loot" ? "The depot locker" : "Mara"} />
      </label>
      {taken && <p className="warning small">Something prepared already has this {kind === "loot" ? "title" : "name"}; saving replaces it.</p>}
      {title.trim() && <EditItem key={id} view={view} names={names} item={{ ...blank, title: title.trim() }} onRecorded={onRecorded} onFire={() => {}} onDone={() => setTitle("")} />}
    </details>
  );
}

// ------------------------------------------------------------- packs ---

/** A pack from a file in `rules/tutorial.yaml`'s shape, YAML or JSON, checked before it loads. */
function PackFile({ view, names, onRecorded }: Omit<Props, "engine" | "log">) {
  const [loaded, setLoaded] = useState<{ name: string; items: PrepItem[]; pack: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = async (file: File) => {
    setError(null);
    setLoaded(null);
    try {
      const text = await file.text();
      const data = (file.name.endsWith(".json") ? JSON.parse(text) : parseYaml(text)) as PackData;
      setLoaded({ name: file.name, items: packItems(data), pack: data.pack });
    } catch (e) {
      setError(`${file.name}: ${(e as Error).message}`);
    }
  };
  const count = (k: PrepItem["kind"]) => loaded?.items.filter((x) => x.kind === k).length ?? 0;
  return (
    <details className="small">
      <summary>Load a pack from a file</summary>
      <p className="muted">A YAML or JSON file shaped like the tutorial's (`rules/tutorial.yaml`): a `pack` name, then notices, quests, encounters, loot, and npcs, each with its group.</p>
      <input type="file" accept=".yaml,.yml,.json" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
      {error && <p className="error">{error}</p>}
      {loaded && (
        <>
          <p>
            <strong>{loaded.pack}</strong> from {loaded.name}: {count("notice")} notices, {count("quest")} quests, {count("encounter")} fights, {count("loot")} loot, {count("npc")} NPCs.
            {loaded.items.some((x) => view.prep.some((p) => p.id === x.id)) && <span className="warning"> Some are in Prep already; loading replaces them.</span>}
          </p>
          <Commit campaignId={view.campaign.id} action={{ type: "prep.save", items: loaded.items, pack: loaded.pack }} names={names} label={`Load ${loaded.pack}`} onRecorded={onRecorded} />
        </>
      )}
    </details>
  );
}

// ---------------------------------------------------------- the section ---

const KIND = { encounter: "Fight", quest: "Quest", notice: "Notice", loot: "Loot", npc: "NPC" } as const;

function ItemCard({ view, engine, names, onRecorded, item, fired, onFire }: Omit<Props, "log"> & { item: PrepItem; fired: number; onFire: (f: Firing) => void }) {
  const [open, setOpen] = useState<null | "fire" | "edit">(null);
  const toggle = (what: "fire" | "edit") => setOpen(open === what ? null : what);
  const joins = item.kind === "npc" && item.npc.block?.maxHp !== undefined && view.encounter;
  return (
    <div className="prep-item">
      <div className="row">
        <span className="tag">{KIND[item.kind]}</span>
        <strong className="grow">{item.title}</strong>
        {fired > 0 && <span className="muted small">fired {fired === 1 ? "once" : `${fired} times`}</span>}
        {item.kind === "notice" && <button onClick={() => toggle("fire")}>{open === "fire" ? "Close" : "Send…"}</button>}
        {item.kind === "loot" && <button onClick={() => toggle("fire")}>{open === "fire" ? "Close" : "Give…"}</button>}
        {joins && <button onClick={() => toggle("fire")}>{open === "fire" ? "Close" : "Joins the fight…"}</button>}
        {item.kind === "encounter" && engine && <button onClick={() => onFire({ prepId: item.id, kind: "encounter", encounter: item.encounter })}>Set up the fight</button>}
        {item.kind === "quest" && <button onClick={() => onFire({ prepId: item.id, kind: "quest", quest: item.quest })}>Issue…</button>}
        <button onClick={() => toggle("edit")}>{open === "edit" ? "Close" : "Edit…"}</button>
      </div>
      {item.note && <p className="muted small">{item.note}</p>}
      {item.kind === "notice" && !open && <p className="small sys-sample-line">{item.text}</p>}
      {item.kind === "loot" && <p className="small">{item.loot.map((x) => `${x.count > 1 ? `${x.count} × ` : ""}${x.name}`).join(", ")}</p>}
      {item.kind === "npc" && (
        <p className="small">
          {item.npc.who}
          {item.npc.line ? <strong> · {item.npc.line}</strong> : ""}
          {item.npc.block?.maxHp ? <span className="muted"> · {item.npc.block.maxHp} HP</span> : ""}
        </p>
      )}
      {item.kind === "encounter" && (
        <p className="small">
          {item.encounter.creatures.map((c) => `${c.count && c.count > 1 ? `${c.count} × ` : ""}${c.name ?? c.creature}`).join(", ")} · Zones: {item.encounter.zones.join(", ")}
        </p>
      )}
      {item.kind === "quest" && (
        <p className="small">
          {item.quest.category} · {item.quest.difficulty} · {item.quest.objective}
        </p>
      )}
      {open === "fire" && item.kind === "notice" && <FireNotice view={view} names={names} item={item} onRecorded={onRecorded} />}
      {open === "fire" && item.kind === "loot" && <GiveLoot view={view} names={names} item={item} onRecorded={onRecorded} />}
      {open === "fire" && item.kind === "npc" && <NpcJoins view={view} names={names} item={item} onRecorded={onRecorded} />}
      {open === "edit" && <EditItem view={view} names={names} item={item} onRecorded={onRecorded} onFire={onFire} onDone={() => setOpen(null)} />}
      <details className="small">
        <summary>Remove from Prep</summary>
        <Commit campaignId={view.campaign.id} action={{ type: "prep.remove", prepIds: [item.id] }} names={names} label={`Remove ${item.title}`} onRecorded={onRecorded} />
      </details>
    </div>
  );
}

export function PrepSection(props: Props & { onFire: (f: Firing) => void }) {
  const { view, engine, names, log, onRecorded, onFire } = props;
  const fired = new Map<string, number>();
  for (const env of log) if (env.cause?.startsWith("prep:")) fired.set(env.cause.slice(5), (fired.get(env.cause.slice(5)) ?? 0) + 1);
  const groups = new Map<string, PrepItem[]>();
  for (const p of view.prep) {
    const g = p.group ?? "Unsorted";
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const pack = engine?.rules.tutorial ? tutorialPack(engine) : [];
  const loaded = pack.filter((p) => view.prep.some((x) => x.id === p.id)).length;
  return (
    <main className="page">
      <section className="card">
        <h2>Prep</h2>
        <p className="muted small">
          Fights, quests, System notices, loot, and NPCs made ready before a session. Firing one records the real thing at the table; the prepared item stays until you remove it. Save a fight
          from Combat's setup and a quest from the Quests form; write a notice, loot, or an NPC below, or load a pack from a file.
        </p>
        {pack.length > 0 && (
          <div className="prep-pack">
            <p>
              <strong>The tutorial pack</strong>: {pack.filter((p) => p.kind === "notice").length} notices, {pack.filter((p) => p.kind === "quest").length} quests,{" "}
              {pack.filter((p) => p.kind === "encounter").length} fights, {pack.filter((p) => p.kind === "loot").length} loot lists, and {pack.filter((p) => p.kind === "npc").length} recurring NPCs from The
              Tutorial, by phase.{" "}
              {loaded > 0 && <span className="muted">{loaded === pack.length ? "Loaded." : `${loaded} of ${pack.length} in Prep.`}</span>}
            </p>
            {loaded ? (
              <details className="small">
                <summary>Load it again, replacing its items with the book's</summary>
                <Commit campaignId={view.campaign.id} action={{ type: "prep.save", items: pack, pack: "tutorial" }} names={names} label="Load the tutorial pack again" onRecorded={onRecorded} />
              </details>
            ) : (
              <Commit campaignId={view.campaign.id} action={{ type: "prep.save", items: pack, pack: "tutorial" }} names={names} label="Load the tutorial pack" onRecorded={onRecorded} />
            )}
          </div>
        )}
      </section>
      {[...groups].sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([g, items]) => (
        <section key={g} className="card">
          <h3>{g}</h3>
          {items.map((item) => (
            <ItemCard key={item.id} {...props} item={item} fired={fired.get(item.id) ?? 0} onFire={onFire} />
          ))}
        </section>
      ))}
      <NewNotice view={view} names={names} onRecorded={onRecorded} />
      <NewItem view={view} names={names} onRecorded={onRecorded} kind="loot" />
      <NewItem view={view} names={names} onRecorded={onRecorded} kind="npc" />
      <section className="card">
        <PackFile view={view} names={names} onRecorded={onRecorded} />
      </section>
    </main>
  );
}
