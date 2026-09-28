/**
 * The GM's Prep section: fights, quests, and System notices prepared before a session and fired
 * live. A notice fires here, to the characters the GM picks, its text editable for the counts the
 * moment fills in. A fight opens in Combat's setup and a quest in the Quests form, filled in, so
 * the GM places characters or picks holders and records it there. Whatever is fired carries the
 * prepared item as its cause, so Prep shows what has gone out. The tutorial loads as a pack.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type Appended, type CombatantSpec, type Envelope, type GmView, type PrepCreature, type PrepItem, type QuestSpec, prepCause, tutorialPack } from "@gradebreaker/record";
import { useState } from "react";
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

// ---------------------------------------------------------- the section ---

function ItemCard({ view, engine, names, onRecorded, item, fired, onFire }: Omit<Props, "log"> & { item: PrepItem; fired: number; onFire: (f: Firing) => void }) {
  const [open, setOpen] = useState(false);
  const kind = item.kind === "encounter" ? "Fight" : item.kind === "quest" ? "Quest" : "Notice";
  return (
    <div className="prep-item">
      <div className="row">
        <span className="tag">{kind}</span>
        <strong className="grow">{item.title}</strong>
        {fired > 0 && <span className="muted small">fired {fired === 1 ? "once" : `${fired} times`}</span>}
        {item.kind === "notice" && <button onClick={() => setOpen(!open)}>{open ? "Close" : "Send…"}</button>}
        {item.kind === "encounter" && engine && <button onClick={() => onFire({ prepId: item.id, kind: "encounter", encounter: item.encounter })}>Set up the fight</button>}
        {item.kind === "quest" && <button onClick={() => onFire({ prepId: item.id, kind: "quest", quest: item.quest })}>Issue…</button>}
      </div>
      {item.note && <p className="muted small">{item.note}</p>}
      {item.kind === "notice" && !open && <p className="small sys-sample-line">{item.text}</p>}
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
      {open && item.kind === "notice" && <FireNotice view={view} names={names} item={item} onRecorded={onRecorded} />}
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
          Fights, quests, and System notices made ready before a session. Firing one records the real thing at the table; the prepared item stays until you remove it. Save a fight from Combat's
          setup and a quest from the Quests form; write a notice below.
        </p>
        {pack.length > 0 && (
          <div className="prep-pack">
            <p>
              <strong>The tutorial pack</strong>: {pack.filter((p) => p.kind === "notice").length} notices, {pack.filter((p) => p.kind === "quest").length} quests, and{" "}
              {pack.filter((p) => p.kind === "encounter").length} fights from The Tutorial, by phase.{" "}
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
      {[...groups].map(([g, items]) => (
        <section key={g} className="card">
          <h3>{g}</h3>
          {items.map((item) => (
            <ItemCard key={item.id} {...props} item={item} fired={fired.get(item.id) ?? 0} onFire={onFire} />
          ))}
        </section>
      ))}
      <NewNotice view={view} names={names} onRecorded={onRecorded} />
    </main>
  );
}
