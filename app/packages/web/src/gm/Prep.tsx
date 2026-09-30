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
  packSetup,
  prepCause,
  tutorialPack,
} from "@gradebreaker/record";
import { Fragment, useState } from "react";
import { parse as parseYaml } from "yaml";
import "../css/prep-bestiary.css";
import { submit } from "../api.ts";
import { type Names } from "../text.ts";
import { Icon } from "../ui.tsx";
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
    <>
      <div className="prep-form stack">
        <label className="field">
          <span>The notice, as it will reach them</span>
          <textarea className="textarea" rows={Math.min(8, text.split("\n").length + 1)} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <TableWords text={text} />
        <div className="cluster prep-to" role="group" aria-label="Who receives it">
          <span className="small">To:</span>
          {living.map((c) => (
            <label key={c.id} className="check">
              <input type="checkbox" checked={to.includes(c.id)} onChange={(e) => setTo(e.target.checked ? [...to, c.id] : to.filter((x) => x !== c.id))} />
              {c.name}
            </label>
          ))}
        </div>
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
    </>
  );
}

function NewNotice({ view, names, onRecorded }: Omit<Props, "engine" | "log">) {
  const [f, setF] = useState({ title: "", group: "", note: "", text: "" });
  const id = `notice-${slug(f.title)}`;
  const taken = view.prep.some((p) => p.id === id);
  const item: PrepItem = { id, kind: "notice", title: f.title.trim(), text: f.text.trim(), ...(f.group.trim() ? { group: f.group.trim() } : {}), ...(f.note.trim() ? { note: f.note.trim() } : {}) };
  return (
    <details className="panel prep-new">
      <summary className="panel__head">
        <Icon name="next" />
        <h2>Prepare a System notice</h2>
      </summary>
      <div className="panel__body stack">
        <div className="prep-pair">
          <label className="field">
            <span>Title</span>
            <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="The gate opens" />
          </label>
          <label className="field">
            <span>Group</span>
            <input className="input" value={f.group} onChange={(e) => setF({ ...f, group: e.target.value })} placeholder="Session 4" />
          </label>
        </div>
        <label className="field">
          <span>The System's text</span>
          <textarea className="textarea" rows={4} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        </label>
        <TableWords text={f.text} />
        {taken && (
          <p className="warning small">
            <Icon name="warning" />
            A prepared notice already has this title; saving replaces it.
          </p>
        )}
        <label className="field">
          <span>When to send it</span>
          <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
      </div>
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
    <>
      <div className="prep-form stack">
        <label className="field">
          <span>To</span>
          <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
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
      </div>
      <Commit
        campaignId={view.campaign.id}
        action={{ type: "item.give", to, items: item.loot }}
        names={names}
        label={to === SPOILS ? "Put it in the spoils" : `Give it to ${names(to)}`}
        cause={prepCause(item.id)}
        onRecorded={onRecorded}
      />
    </>
  );
}

/** An NPC with numbers joins the running fight on the side the GM picks. */
function NpcJoins({ view, names, item, onRecorded }: { view: GmView; names: Names; item: Extract<PrepItem, { kind: "npc" }>; onRecorded: (env: Envelope) => void }) {
  const e = view.encounter;
  const [side, setSide] = useState(e?.sides[0]?.id ?? "");
  if (!e)
    return (
      <div className="prep-form">
        <p className="small dim">No fight is running.</p>
      </div>
    );
  const b = item.npc.block!;
  const spec: CombatantSpec = { combatantId: `${slug(item.title)}-${rid()}`, sideId: side, name: item.title, kind: b.kind ?? "npc" };
  for (const k of ["grade", "maxHp", "beats", "momentumForce", "yields", "offense", "defense"] as const) if (b[k] !== undefined) (spec as unknown as Record<string, unknown>)[k] = b[k];
  return (
    <>
      <div className="prep-form stack">
        <label className="field">
          <span>Side</span>
          <select className="select" value={side} onChange={(ev) => setSide(ev.target.value)}>
            {e.sides.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Commit campaignId={view.campaign.id} action={{ type: "combat.add", combatant: spec }} names={names} label={`${item.title} joins ${e.name}`} cause={prepCause(item.id)} onRecorded={onRecorded} />
    </>
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
      <div className="prep-form">
        <p className="small">
          {item.kind === "quest" ? "A quest edits in the Quests form" : "A fight edits in Combat's setup"}, where saving to Prep keeps its place here.{" "}
          <button className="btn-link" onClick={() => onFire(item.kind === "quest" ? { prepId: item.id, kind: "quest", quest: item.quest } : { prepId: item.id, kind: "encounter", encounter: item.encounter })}>
            Open it there
          </button>
        </p>
      </div>
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
    <>
      <div className="prep-form stack">
        <div className="prep-pair">
          <label className="field">
            <span>{item.kind === "npc" ? "Name" : "Title"}</span>
            <input className="input" value={f.title} onChange={set("title")} />
          </label>
          <label className="field">
            <span>Group</span>
            <input className="input" value={f.group} onChange={set("group")} />
          </label>
        </div>
        {item.kind === "notice" && (
          <>
            <label className="field">
              <span>The System's text</span>
              <textarea className="textarea" rows={4} value={f.text} onChange={set("text")} />
            </label>
            <TableWords text={f.text} />
          </>
        )}
        {item.kind === "loot" && (
          <label className="field">
            <span>What it holds, one per line ("Healing Pill × 2")</span>
            <textarea className="textarea" rows={Math.min(10, f.loot.split("\n").length + 1)} value={f.loot} onChange={set("loot")} />
          </label>
        )}
        {item.kind === "npc" && (
          <>
            <label className="field">
              <span>Who they are</span>
              <input className="input" value={f.who} onChange={set("who")} />
            </label>
            <label className="field">
              <span>Their line: their condition, and how the party treated them</span>
              <input className="input" value={f.line} onChange={set("line")} />
            </label>
            <div className="cluster prep-numbers">
              <label className="field">
                <span>Grade</span>
                <input className="input" value={f.grade} onChange={set("grade")} />
              </label>
              <label className="field" title="Leave empty for an NPC who does not fight">
                <span>HP</span>
                <input type="number" className="input num" value={f.hp} onChange={set("hp")} />
              </label>
              <label className="field">
                <span>Beats</span>
                <input type="number" className="input num" value={f.beats} onChange={set("beats")} />
              </label>
              <label className="field" title="The higher of their HRT and PER Force">
                <span>Momentum</span>
                <input type="number" className="input num" value={f.momentum} onChange={set("momentum")} />
              </label>
              <label className="field" title="One Force for their attack and defense; the tracker takes others typed in">
                <span>Force</span>
                <input type="number" className="input num" value={f.force} onChange={set("force")} />
              </label>
            </div>
          </>
        )}
        <label className="field">
          <span>{item.kind === "npc" ? "Where they come in" : "The cue: when to fire it"}</span>
          <input className="input" value={f.note} onChange={set("note")} />
        </label>
      </div>
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
    </>
  );
}

function NewItem({ view, names, onRecorded, kind }: Omit<Props, "engine" | "log"> & { kind: "loot" | "npc" }) {
  const [title, setTitle] = useState("");
  const id = `${kind}-${slug(title)}`;
  const taken = view.prep.some((p) => p.id === id);
  const blank: PrepItem = kind === "loot" ? { id, kind, title: "", loot: [] } : { id, kind, title: "", npc: { who: "" } };
  return (
    <details className="panel prep-new">
      <summary className="panel__head">
        <Icon name="next" />
        <h2>{kind === "loot" ? "Prepare loot" : "Prepare an NPC"}</h2>
      </summary>
      <div className="panel__body stack">
        <label className="field">
          <span>{kind === "loot" ? "Title" : "Name"}</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "loot" ? "The depot locker" : "Mara"} />
        </label>
        {taken && (
          <p className="warning small">
            <Icon name="warning" />
            Something prepared already has this {kind === "loot" ? "title" : "name"}; saving replaces it.
          </p>
        )}
      </div>
      {title.trim() && <EditItem key={id} view={view} names={names} item={{ ...blank, title: title.trim() }} onRecorded={onRecorded} onFire={() => {}} onDone={() => setTitle("")} />}
    </details>
  );
}

// ------------------------------------------------------------- packs ---

/** A pack from a file in `rules/tutorial.yaml`'s shape, YAML or JSON, checked before it loads. */
/**
 * Records a pack's setup, one action at a time in its order. Each keeps its id, so recording
 * again after a stop records only what is missing; the first refusal stops the run with its reason.
 */
function PackSetup({ view, setup, onRecorded }: { view: GmView; setup: { id: string; action: Action }[]; onRecorded: (env: Envelope) => void }) {
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creates = setup.filter((s) => s.action.type === "character.create" || s.action.type === "character.pregen").length;
  const run = async () => {
    setBusy(true);
    setError(null);
    let i = 0;
    try {
      for (; i < setup.length; i++) {
        const out = await submit(view.campaign.id, setup[i]!.id, setup[i]!.action);
        onRecorded(out.envelope);
        setDone(i + 1);
      }
    } catch (e) {
      setError(`${setup[i]?.id ?? ""}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack prep-setup">
      <p className="small">
        Its setup: {setup.length} actions{creates ? `, making ${creates} characters` : ""}. Recorded once, in order; each is undone from the campaign log like any other. Afterward, give the characters to their
        players from the Party section.
      </p>
      <div className="cluster">
        <button className="btn btn--primary" disabled={busy || done === setup.length} onClick={run}>
          <Icon name="confirm" />
          {busy ? `Recording ${done} of ${setup.length}…` : done === setup.length ? "Setup recorded" : "Record the setup"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function PackFile({ view, names, onRecorded }: Omit<Props, "engine" | "log">) {
  const [loaded, setLoaded] = useState<{ name: string; items: PrepItem[]; pack: string; setup: { id: string; action: Action }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = async (file: File) => {
    setError(null);
    setLoaded(null);
    try {
      const text = await file.text();
      const data = (file.name.endsWith(".json") ? JSON.parse(text) : parseYaml(text)) as PackData;
      setLoaded({ name: file.name, items: packItems(data), pack: data.pack, setup: packSetup(data) });
    } catch (e) {
      setError(`${file.name}: ${(e as Error).message}`);
    }
  };
  const count = (k: PrepItem["kind"]) => loaded?.items.filter((x) => x.kind === k).length ?? 0;
  return (
    <details className="prep-new">
      <summary className="panel__head">
        <Icon name="next" />
        <h2>Load a pack from a file</h2>
      </summary>
      <div className="panel__body stack">
        <p className="small dim">
          A YAML or JSON file shaped like the tutorial's (<code>rules/tutorial.yaml</code>): a <code>pack</code> name, then notices, quests, encounters, loot, and npcs, each with its group.
        </p>
        <input type="file" className="prep-file" accept=".yaml,.yml,.json" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
        {error && <p className="error">{error}</p>}
        {loaded && (
          <>
            <p className="small">
              <strong>{loaded.pack}</strong> from {loaded.name}: {count("notice")} notices, {count("quest")} quests, {count("encounter")} fights, {count("loot")} loot, {count("npc")} NPCs.
              {loaded.items.some((x) => view.prep.some((p) => p.id === x.id)) && <span className="warn"> Some are in Prep already; loading replaces them.</span>}
            </p>
            <Commit campaignId={view.campaign.id} action={{ type: "prep.save", items: loaded.items, pack: loaded.pack }} names={names} label={`Load ${loaded.pack}`} onRecorded={onRecorded} />
            {loaded.setup.length > 0 && <PackSetup view={view} setup={loaded.setup} onRecorded={onRecorded} />}
          </>
        )}
      </div>
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
    <article className="prep-card" aria-label={item.title}>
      <div className="prep-card__body stack">
        <div className="cluster prep-card__head">
          <span className="tag">{KIND[item.kind]}</span>
          <b className={`grow prep-card__title${item.kind === "npc" ? " world" : ""}`}>{item.title}</b>
          {fired > 0 && <span className="small dim">fired {fired === 1 ? "once" : `${fired} times`}</span>}
          {item.kind === "notice" && (
            <button className="btn btn--sm" aria-expanded={open === "fire"} onClick={() => toggle("fire")}>
              {open === "fire" ? "Close" : "Send…"}
            </button>
          )}
          {item.kind === "loot" && (
            <button className="btn btn--sm" aria-expanded={open === "fire"} onClick={() => toggle("fire")}>
              {open === "fire" ? "Close" : "Give…"}
            </button>
          )}
          {joins && (
            <button className="btn btn--sm" aria-expanded={open === "fire"} onClick={() => toggle("fire")}>
              {open === "fire" ? "Close" : "Joins the fight…"}
            </button>
          )}
          {item.kind === "encounter" && engine && (
            <button className="btn btn--sm" onClick={() => onFire({ prepId: item.id, kind: "encounter", encounter: item.encounter })}>
              <Icon name="clash" />
              Set up the fight
            </button>
          )}
          {item.kind === "quest" && (
            <button className="btn btn--sm" onClick={() => onFire({ prepId: item.id, kind: "quest", quest: item.quest })}>
              <Icon name="quest" />
              Issue…
            </button>
          )}
          <button className="btn btn--sm" aria-expanded={open === "edit"} onClick={() => toggle("edit")}>
            {open === "edit" ? "Close" : "Edit…"}
          </button>
        </div>
        {item.note && <p className="small dim">{item.note}</p>}
        {item.kind === "notice" && !open && <p className="voice prep-card__text">{item.text}</p>}
        {item.kind === "loot" && (
          <p className="small">
            {item.loot.map((x, i) => (
              <Fragment key={i}>
                {i > 0 && ", "}
                {x.count > 1 && (
                  <>
                    <span className="num">{x.count}</span> ×{" "}
                  </>
                )}
                {x.name}
              </Fragment>
            ))}
          </p>
        )}
        {item.kind === "npc" && (
          <p className="prose prep-card__who">
            {item.npc.who}
            {item.npc.line ? <strong> · {item.npc.line}</strong> : ""}
            {item.npc.block?.maxHp ? <span className="num small dim"> · {item.npc.block.maxHp} HP</span> : ""}
          </p>
        )}
        {item.kind === "encounter" && (
          <p className="small">
            {item.encounter.creatures.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && ", "}
                {c.count !== undefined && c.count > 1 && (
                  <>
                    <span className="num">{c.count}</span> ×{" "}
                  </>
                )}
                {c.name ?? c.creature}
              </Fragment>
            ))}{" "}
            · Zones:{" "}
            {item.encounter.zones.map((z, i) => (
              <Fragment key={i}>
                {i > 0 && ", "}
                <span className="world">{z}</span>
              </Fragment>
            ))}
          </p>
        )}
        {item.kind === "quest" && (
          <p className="small">
            {item.quest.category} · {item.quest.difficulty} · {item.quest.objective}
          </p>
        )}
      </div>
      {open === "fire" && item.kind === "notice" && <FireNotice view={view} names={names} item={item} onRecorded={onRecorded} />}
      {open === "fire" && item.kind === "loot" && <GiveLoot view={view} names={names} item={item} onRecorded={onRecorded} />}
      {open === "fire" && item.kind === "npc" && <NpcJoins view={view} names={names} item={item} onRecorded={onRecorded} />}
      {open === "edit" && <EditItem view={view} names={names} item={item} onRecorded={onRecorded} onFire={onFire} onDone={() => setOpen(null)} />}
      <div className="prep-card__foot">
        <details className="small">
          <summary className="dim">Remove from Prep</summary>
          <Commit campaignId={view.campaign.id} action={{ type: "prep.remove", prepIds: [item.id] }} names={names} label={`Remove ${item.title}`} onRecorded={onRecorded} />
        </details>
      </div>
    </article>
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
    <main className="screen screen--side prep-screen">
      <div className="stack prep-screen__main">
        <header className="stack prep-screen__intro">
          <h1 className="cluster">
            <i className="ic ic-prep dim" aria-hidden="true" />
            Prep
          </h1>
          <p className="small dim">
            Fights, quests, System notices, loot, and NPCs made ready before a session. Firing one records the real thing at the table; the prepared item stays until you remove it. Save a fight
            from Combat's setup and a quest from the Quests form; write a notice, loot, or an NPC below, or load a pack from a file.
          </p>
        </header>
        {pack.length > 0 && (
          <section className="panel prep-pack" aria-label="The tutorial pack">
            <div className="panel__body stack">
              <p>
                <strong>The tutorial pack</strong>: {pack.filter((p) => p.kind === "notice").length} notices, {pack.filter((p) => p.kind === "quest").length} quests,{" "}
                {pack.filter((p) => p.kind === "encounter").length} fights, {pack.filter((p) => p.kind === "loot").length} loot lists, and {pack.filter((p) => p.kind === "npc").length} recurring NPCs from The
                Tutorial, by phase.{" "}
                {loaded > 0 && <span className="dim">{loaded === pack.length ? "Loaded." : `${loaded} of ${pack.length} in Prep.`}</span>}
              </p>
              {loaded > 0 && (
                <details className="small">
                  <summary className="dim">Load it again, replacing its items with the book's</summary>
                  <Commit campaignId={view.campaign.id} action={{ type: "prep.save", items: pack, pack: "tutorial" }} names={names} label="Load the tutorial pack again" onRecorded={onRecorded} />
                </details>
              )}
            </div>
            {loaded === 0 && <Commit campaignId={view.campaign.id} action={{ type: "prep.save", items: pack, pack: "tutorial" }} names={names} label="Load the tutorial pack" onRecorded={onRecorded} />}
          </section>
        )}
        {[...groups]
          .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
          .map(([g, items], i) => (
            <section key={g} className="panel prep-group" aria-labelledby={`prep-group-${i}`}>
              <div className="panel__head">
                <h2 id={`prep-group-${i}`}>{g}</h2>
              </div>
              {items.map((item) => (
                <ItemCard key={item.id} {...props} item={item} fired={fired.get(item.id) ?? 0} onFire={onFire} />
              ))}
            </section>
          ))}
      </div>
      <aside className="stack prep-screen__side" aria-label="Prepare something new">
        <NewNotice view={view} names={names} onRecorded={onRecorded} />
        <NewItem view={view} names={names} onRecorded={onRecorded} kind="loot" />
        <NewItem view={view} names={names} onRecorded={onRecorded} kind="npc" />
        <section className="panel" aria-label="Load a pack from a file">
          <PackFile view={view} names={names} onRecorded={onRecorded} />
        </section>
      </aside>
    </main>
  );
}
