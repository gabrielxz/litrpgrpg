/**
 * The suggestion panel (app/DESIGN.md, M2): everything waiting on the GM in one place. From the
 * record: catalog titles whose count is met, the Battle Memory Cards the rules make due, and
 * pointers to the other sections where something is due (assigned points, class offers, a
 * Principle, a quest whose time ran out). From table talk: the titles the fiction earns, Battle
 * Memory Cards, Hidden Achievements, and Prep cues the drafter raised, each accepted as the grant
 * it names (edited or not) or dismissed. A dismissed suggestion stays dismissed and can be
 * restored; drafting the same talk again raises nothing the GM has already seen.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type Envelope, type GmView, catalogSpec } from "@gradebreaker/record";
import { useState } from "react";
import { type DraftItem, type DraftRun, acceptDraft } from "../api.ts";
import { ATTRIBUTES, ATTRIBUTE_NAMES, type Names } from "../text.ts";
import { classesWaiting } from "./Classes.tsx";
import { Commit } from "./Commit.tsx";
import { CueCard } from "./DraftActions.tsx";
import { Cited, type DraftRuns, isSuggestion, settled, waitingOn } from "./Drafts.tsx";
import { MemoriesDueCard } from "./Principles.tsx";
import { TableWords } from "./TableWords.tsx";
import { TitlesDueCard, bonusLine } from "./Titles.tsx";

type Props = { view: GmView; engine: Engine | null; names: Names; onRecorded: (env: Envelope) => void; drafts: DraftRuns };

/** Pointers to what is due elsewhere, each with the section that settles it. */
function elsewhere(view: GmView, engine: Engine | null, names: Names): { line: string; section: string; label: string }[] {
  const out: { line: string; section: string; label: string }[] = [];
  for (const c of view.characters.filter((x) => !x.dead)) {
    if (c.pendingSystemLevels.length && !c.class)
      out.push({ line: `${c.name}: assigned points for Level ${c.pendingSystemLevels.join(", ")}`, section: "party", label: "Party, Assigned points" });
    if (c.principles.crystallizing) out.push({ line: `${c.name}: a Principle crystallizes`, section: "principles", label: "Principles" });
    for (const x of c.principles.principles.filter((p) => p.distillable && !p.offer)) out.push({ line: `${c.name}: ${x.name} can be distilled`, section: "principles", label: "Principles" });
  }
  if (engine && classesWaiting(view, engine)) {
    const level = engine.rules.classes.selection.level as number;
    for (const c of view.characters.filter((x) => !x.dead && x.level >= level && !x.class && !x.classOffers.length))
      out.push({ line: `${c.name}: class offers due at Level ${level}`, section: "classes", label: "Classes" });
  }
  const now = view.clock?.at;
  if (now !== undefined)
    for (const q of view.quests.filter((x) => x.status === "active" && x.due !== undefined && x.due <= now))
      out.push({ line: `[${q.code}] ${q.title}: its time ran out (${q.holders.map(names).join(", ")})`, section: "quests", label: "Quests" });
  return out;
}

/** How many things wait in the panel, for the section's badge. */
export function suggestionsWaiting(view: GmView, engine: Engine | null, names: Names, runs: DraftRun[]): number {
  const record = view.characters.reduce((n, c) => n + (c.dead ? 0 : c.titlesDue.length + c.principles.due.length), 0);
  const drafted = runs.reduce((n, r) => n + r.items.filter((i) => isSuggestion(i) && waitingOn(i)).length, 0);
  return record + drafted + elsewhere(view, engine, names).length;
}

const HEADING = { title: "Title", "battle-memory": "Battle Memory Card", "hidden-achievement": "Hidden Achievement" } as const;

/** A drafted suggestion: its grant, editable, with the lines it cites and the drafter's reason. */
function SuggestionCard({ view, engine, names, run, item, drafts, onRecorded }: Omit<Props, "engine"> & { engine: Engine; run: DraftRun; item: DraftItem }) {
  const s = item.suggestion!;
  const drafted = item.action as Extract<Action, { type: "title.grant" | "memory.grant" }>;
  const [text, setText] = useState(drafted.type === "memory.grant" ? drafted.text : "");
  const spec = drafted.type === "title.grant" ? drafted.title : {};
  const [name, setName] = useState(spec.name ?? "");
  const [deed, setDeed] = useState(spec.effect ?? "");
  const [stat, setStat] = useState(Object.keys(spec.bonus ?? {})[0] ?? "HRT");
  const [bonus, setBonus] = useState(String(Object.values(spec.bonus ?? {})[0] ?? ""));
  const who = names(s.characterId);

  let action: Action | null = null;
  let problem: string | null = null;
  let shown = "";
  if (s.kind === "battle-memory") {
    action = text.trim() ? { type: "memory.grant", characterId: s.characterId, text: text.trim() } : null;
    problem = text.trim() ? null : "Write the card.";
    shown = text;
  } else if (s.kind === "hidden-achievement") {
    const n = Number(bonus);
    action = name.trim() && n > 0 ? { type: "title.grant", characterId: s.characterId, title: { name: name.trim(), category: "Hidden Achievement", bonus: { [stat]: n }, ...(deed.trim() ? { effect: deed.trim() } : {}) } } : null;
    problem = !name.trim() ? "Name the title." : n > 0 ? null : "Give it a bonus.";
    shown = name;
  } else {
    action = drafted;
  }
  const catalog = s.kind === "title" ? catalogSpec(engine, s.key) : null;

  return (
    <li className="draft">
      <h4 className="draft-kind">
        {HEADING[s.kind]} for {who}
        {s.kind === "title" && <span className="muted">: {s.key}</span>}
      </h4>
      <Cited view={view} run={run} item={item} names={names} />
      {item.why && <p className="muted small">Drafted because: {item.why}</p>}
      {item.undone && <p className="small warning">Accepted, and its grant was undone in the log. Accept it again or dismiss it.</p>}
      {catalog && <p className="small">{bonusLine(catalog.bonus ?? {}, catalog.choice)}{catalog.effect ? `; ${catalog.effect}` : ""}</p>}
      {s.kind === "battle-memory" && (
        <label>
          What the card says
          <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      {s.kind === "hidden-achievement" && (
        <div className="form">
          <label>
            Name
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Trigger
            <input className="wide" value={deed} maxLength={300} onChange={(e) => setDeed(e.target.value)} />
          </label>
          <div className="row">
            <label>
              Attribute
              <select value={stat} onChange={(e) => setStat(e.target.value)}>
                {ATTRIBUTES.map((a) => (
                  <option key={a} value={a}>
                    {ATTRIBUTE_NAMES[a]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bonus
              <input type="number" className="narrow-input" min={1} value={bonus} onChange={(e) => setBonus(e.target.value)} />
            </label>
          </div>
        </div>
      )}
      {shown && <TableWords text={shown} />}
      <Commit
        campaignId={view.campaign.id}
        action={action}
        problem={problem}
        names={names}
        label={s.kind === "battle-memory" ? `Grant ${who} the card` : `Confer on ${who}`}
        submitWith={async (id, a) => {
          const out = await acceptDraft(view.campaign.id, item, id, a);
          drafts.replace(out.item);
          return out.appended;
        }}
        onRecorded={onRecorded}
      />
      <div className="row">
        <button onClick={() => drafts.mark(item, "dismiss")}>Dismiss</button>
      </div>
    </li>
  );
}

const summaryOf = (view: GmView, names: Names, i: DraftItem) =>
  i.kind === "cue"
    ? `Prep cue: ${view.prep.find((p) => p.id === i.prepId)?.title ?? i.prepId}${i.fired ? " (fired)" : ""}`
    : `${HEADING[i.suggestion!.kind]} for ${names(i.suggestion!.characterId)}: ${i.suggestion!.key}`;

export function SuggestionsSection({ view, engine, names, onRecorded, drafts }: Props) {
  if (!engine) return <p className="muted pad">Loading rules…</p>;
  const { runs } = drafts;
  const waiting = runs.flatMap((run) => run.items.filter((i) => isSuggestion(i) && waitingOn(i)).map((item) => ({ run, item })));
  const dismissed = runs.flatMap((run) => run.items.filter((i) => isSuggestion(i) && i.status === "dismissed").map((item) => ({ run, item })));
  const accepted = runs.flatMap((run) => run.items.filter((i) => isSuggestion(i) && settled(i)).map((item) => ({ run, item })));
  const pointers = elsewhere(view, engine, names);
  const due = view.characters.some((c) => !c.dead && (c.titlesDue.length || c.principles.due.length));
  return (
    <main className="gm">
      <div>
        <section className="card">
          <h2>From the table talk</h2>
          {waiting.length === 0 ? (
            <p className="muted">
              Nothing waiting. Drafting from table talk (the <a href="#events">Events</a> section) raises the titles the fiction earns, Battle Memory Cards,
              Hidden Achievements, and Prep cues here.
            </p>
          ) : (
            <ul className="drafts">
              {waiting.map(({ run, item }) => {
                const key = `${item.runId}/${item.itemId}/${item.status}`;
                if (item.kind === "cue")
                  return <CueCard key={key} view={view} item={item} cited={<Cited view={view} run={run} item={item} names={names} />} onDismiss={() => drafts.mark(item, "dismiss")} />;
                return <SuggestionCard key={key} view={view} engine={engine} names={names} run={run} item={item} drafts={drafts} onRecorded={onRecorded} />;
              })}
            </ul>
          )}
          {drafts.error && <p className="error">{drafts.error}</p>}
          {accepted.length > 0 && (
            <details className="panel">
              <summary>Accepted ({accepted.length})</summary>
              <ul className="small">
                {accepted.map(({ item }) => (
                  <li key={`${item.runId}/${item.itemId}`}>{summaryOf(view, names, item)}</li>
                ))}
              </ul>
            </details>
          )}
          {dismissed.length > 0 && (
            <details className="panel">
              <summary>Dismissed ({dismissed.length})</summary>
              <ul className="small">
                {dismissed.map(({ item }) => (
                  <li key={`${item.runId}/${item.itemId}`}>
                    {summaryOf(view, names, item)}{" "}
                    <button className="link" onClick={() => drafts.mark(item, "restore")}>
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
      <aside className="side">
        <section className="card">
          <h2>Due from the record</h2>
          {!due && !pointers.length && <p className="muted">Nothing is due.</p>}
          {pointers.length > 0 && (
            <ul className="items">
              {pointers.map((x) => (
                <li key={x.line}>
                  <span>{x.line}</span>
                  <a href={`#${x.section}`}>{x.label}</a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <TitlesDueCard view={view} engine={engine} onRecorded={onRecorded} />
        <MemoriesDueCard view={view} names={names} onRecorded={onRecorded} />
      </aside>
    </main>
  );
}
