/**
 * The suggestion panel (app/DESIGN.md, M2): everything waiting on the GM in one place. From the
 * record: catalog titles whose count is met, the Battle Memory Cards the rules make due, and
 * pointers to the other sections where something is due (assigned points, class offers, a
 * Principle, a quest whose time ran out). From table talk: the titles the fiction earns, Battle
 * Memory Cards, Hidden Achievements, quests (a partial reveal among them), and Prep cues the drafter raised, each accepted as the grant
 * it names (edited or not) or dismissed. A dismissed suggestion stays dismissed and can be
 * restored; drafting the same talk again raises nothing the GM has already seen.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type Envelope, type GmView, catalogSpec, questTableVe } from "@gradebreaker/record";
import { useState } from "react";
import { type DraftItem, type DraftRun, acceptDraft } from "../api.ts";
import { ATTRIBUTES, ATTRIBUTE_NAMES, type Names } from "../text.ts";
import { classesWaiting } from "./Classes.tsx";
import { Commit } from "./Commit.tsx";
import { CueCard } from "./DraftActions.tsx";
import { Cited, type DraftRuns, isSuggestion, settled, waitingOn } from "./Drafts.tsx";
import { MemoriesDueCard } from "./Principles.tsx";
import { TableWords } from "./TableWords.tsx";
import type { Firing } from "./Prep.tsx";
import { TitlesDueCard, bonusLine } from "./Titles.tsx";

type Props = { view: GmView; engine: Engine | null; names: Names; onRecorded: (env: Envelope) => void; drafts: DraftRuns; onFire: (f: Firing) => void };

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
  // Rewards the record shows as earned and not yet paid.
  for (const q of view.quests.filter((x) => x.status === "active" && x.count && x.count.done >= x.count.of))
    out.push({ line: `[${q.code}] ${q.title}: its count is met and its reward unpaid (${q.holders.map(names).join(", ")})`, section: "quests", label: "Quests" });
  if (view.aftermath) out.push({ line: `${view.aftermath.name}: the fight ended and its kills and loot are not recorded`, section: "combat", label: "Combat" });
  return out;
}

/** How many things wait in the panel, for the section's badge. */
export function suggestionsWaiting(view: GmView, engine: Engine | null, names: Names, runs: DraftRun[]): number {
  const record = view.characters.reduce((n, c) => n + (c.dead ? 0 : c.titlesDue.length + c.principles.due.length), 0);
  const drafted = runs.reduce((n, r) => n + r.items.filter((i) => isSuggestion(i) && waitingOn(i)).length, 0);
  return record + drafted + elsewhere(view, engine, names).length;
}

const HEADING = { title: "Title", "battle-memory": "Battle Memory Card", "hidden-achievement": "Hidden Achievement", "personal-opportunity": "Personal Opportunity", quest: "Quest", "class-offers": "Class offers" } as const;

/** A warning when player-facing text names a side of a behavioral axis as the sheet does (capitalized): the System never shows how it keeps count. */
function SheetWords({ engine, text }: { engine: Engine; text: string }) {
  const poles = (engine.rules.hve.axes as { poles: { name: string }[] }[]).flatMap((a) => a.poles.map((p) => p.name));
  const named = poles.filter((p) => new RegExp(`\\b${p}\\b`).test(text));
  if (!named.length) return null;
  return <p className="warning small">Names the sheet's sides: {named.join(", ")}. The player never sees how the System keeps count.</p>;
}

/**
 * A drafted quest to issue: a Personal Opportunity from the sweep (with the System's words and the
 * GM's note) or a quest from table talk (Routine, Faction, or Hidden), shown as its log entry. It
 * opens in the Quests form to edit and issue; issuing there accepts the draft. The System's words
 * go to the player only when the GM sends them.
 */
function QuestCard({ view, engine, names, run, item, drafts, onRecorded, onFire }: Omit<Props, "engine"> & { engine: Engine; run?: DraftRun; item: DraftItem }) {
  const s = item.suggestion!;
  const issue = item.action as Extract<Action, { type: "quest.issue" }>;
  const q = issue.quest;
  const who = names(s.characterId);
  const table = questTableVe(engine, q.category, q.difficulty, q.grade ?? "F");
  const ve = q.scaled ? "proportional" : q.ve !== undefined || table !== null ? `${q.ve ?? table} VE` : "";
  return (
    <li className="draft">
      <h4 className="draft-kind">
        {s.kind === "personal-opportunity" ? "Personal Opportunity" : `${q.category} quest`} for {who}
        <span className="muted">
          : {q.title}
          {s.kind === "personal-opportunity" ? ` (${q.flavor}, drafted to ${s.stance})` : q.hidden ? " (fully obscured on the log)" : q.issuer ? ` (asked by ${q.issuer})` : ""}
        </span>
      </h4>
      {run && <Cited view={view} run={run} item={item} names={names} />}
      {item.why && (
        <p className="why">
          <b>Drafted because:</b> {item.why}
        </p>
      )}
      {item.undone && <p className="small warning">Issued, and the offer was undone in the log. Issue it again or dismiss it.</p>}
      <pre className="quest-entry">
        {`[${q.id}] ${q.title}
Grade:      ${q.grade} · Difficulty: ${q.difficulty}
Objective:  ${q.objective}${q.count ? ` (0/${q.count})` : ""}
Reward:     ${[ve, q.rewardText ?? ""].filter(Boolean).join(", ")}${q.time ? `\nTime:       ${q.time}` : q.hours ? `\nTime:       ${q.hours} hours` : ""}`}
      </pre>
      {s.notice && (
        <div className="systemvoice small">
          <em>{s.notice}</em>
        </div>
      )}
      {q.note && <p className="small muted">GM note: {q.note}</p>}
      <TableWords text={[q.title, q.objective, q.rewardText ?? "", s.notice ?? ""].join(" ")} />
      <SheetWords engine={engine} text={[q.title, q.objective, q.rewardText ?? "", s.notice ?? ""].join(" ")} />
      <div className="form-row">
        <button
          className="btn btn--sm btn--primary"
          onClick={() =>
            onFire({
              kind: "quest",
              draftId: `${item.runId}/${item.itemId}`,
              quest: q,
              to: issue.to,
              submitWith: async (id, a) => {
                const out = await acceptDraft(view.campaign.id, item, id, a);
                drafts.replace(out.item);
                return out.appended;
              },
            })
          }
        >
          Open in Quests to issue
        </button>
        <button className="btn btn--sm" onClick={() => drafts.mark(item, "dismiss")}>Dismiss</button>
      </div>
      {s.notice && (
        <details>
          <summary className="small">Send the System's words to {who}</summary>
          <Commit campaignId={view.campaign.id} action={{ type: "message.send", to: [s.characterId], text: s.notice }} names={names} label={`Send to ${who}`} onRecorded={onRecorded} />
        </details>
      )}
    </li>
  );
}

/** A drafted partial reveal of a fully obscured Hidden quest: the suggestive name, editable, recorded as drafted or edited. */
function RevealCard({ view, names, run, item, drafts, onRecorded }: Pick<Props, "view" | "names" | "drafts" | "onRecorded"> & { run: DraftRun; item: DraftItem }) {
  const drafted = item.action as Extract<Action, { type: "quest.reveal" }>;
  const [name, setName] = useState(drafted.name);
  const q = view.quests.find((x) => x.id === drafted.questId);
  const who = names(item.suggestion!.characterId);
  return (
    <li className="draft">
      <h4 className="draft-kind">
        Partial reveal for {who}
        <span className="muted">: [{q?.code ?? drafted.questId}] {q?.title ?? ""}</span>
      </h4>
      <Cited view={view} run={run} item={item} names={names} />
      {item.why && (
        <p className="why">
          <b>Drafted because:</b> {item.why}
        </p>
      )}
      {q && <p className="small">Objective, still hidden from {who}: {q.objective}</p>}
      <label>
        The name the log shows
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      <TableWords text={name} />
      <Commit
        campaignId={view.campaign.id}
        action={name.trim() ? { ...drafted, name: name.trim() } : null}
        problem={name.trim() ? null : "Name it."}
        names={names}
        label={`Reveal it to ${who}`}
        submitWith={async (id, a) => {
          const out = await acceptDraft(view.campaign.id, item, id, a);
          drafts.replace(out.item);
          return out.appended;
        }}
        onRecorded={onRecorded}
        actions={
          <button className="btn" onClick={() => drafts.mark(item, "dismiss")}>
            Dismiss
          </button>
        }
      />
    </li>
  );
}

/** A drafted suggestion: its grant, editable, with the lines it cites and the drafter's reason. */
function SuggestionCard({ view, engine, names, run, item, drafts, onRecorded }: Omit<Props, "engine" | "onFire"> & { engine: Engine; run: DraftRun; item: DraftItem }) {
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
      {item.why && (
        <p className="why">
          <b>Drafted because:</b> {item.why}
        </p>
      )}
      {item.undone && <p className="small warning">Accepted, and its grant was undone in the log. Accept it again or dismiss it.</p>}
      {catalog && <p className="small">{bonusLine(catalog.bonus ?? {}, catalog.choice)}{catalog.effect ? `; ${catalog.effect}` : ""}</p>}
      {s.kind === "battle-memory" && (
        <label>
          What the card says
          <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
        </label>
      )}
      {s.kind === "hidden-achievement" &&
        s.alternatives?.map((alt) => {
          const altStat = Object.keys((alt.accept as Extract<Action, { type: "title.grant" }>).title.bonus ?? {})[0];
          return (
            <p key={alt.label} className="small">
              Another reading: {alt.label}. {alt.why}{" "}
              {altStat && altStat !== stat && (
                <button className="link" onClick={() => setStat(altStat)}>
                  Take it
                </button>
              )}
            </p>
          );
        })}
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
          <div className="form-row">
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
        actions={
          <button className="btn" onClick={() => drafts.mark(item, "dismiss")}>
            Dismiss
          </button>
        }
      />
    </li>
  );
}

const summaryOf = (view: GmView, names: Names, i: DraftItem) =>
  i.kind === "cue"
    ? `Prep cue: ${view.prep.find((p) => p.id === i.prepId)?.title ?? i.prepId}${i.fired ? " (fired)" : ""}`
    : `${HEADING[i.suggestion!.kind]} for ${names(i.suggestion!.characterId)}: ${i.suggestion!.key}`;

export function SuggestionsSection({ view, engine, names, onRecorded, drafts, onFire }: Props) {
  if (!engine) return <p className="muted pad">Loading rules…</p>;
  const { runs } = drafts;
  const waiting = runs.flatMap((run) => run.items.filter((i) => isSuggestion(i) && waitingOn(i)).map((item) => ({ run, item })));
  const dismissed = runs.flatMap((run) => run.items.filter((i) => isSuggestion(i) && i.status === "dismissed").map((item) => ({ run, item })));
  const accepted = runs.flatMap((run) => run.items.filter((i) => isSuggestion(i) && settled(i)).map((item) => ({ run, item })));
  const pointers = elsewhere(view, engine, names);
  const due = view.characters.some((c) => !c.dead && (c.titlesDue.length || c.principles.due.length));
  return (
    <main className="gm-split">
      <div>
        <section className="stack suggestions">
          <h1 className="cluster">
            <i className="ic ic-suggestion dim" aria-hidden="true" />
            From the table talk
          </h1>
          {waiting.length === 0 ? (
            <p className="muted">
              Nothing waiting. Drafting from table talk (the <a href="#events">Events</a> section) raises the titles the fiction earns, Battle Memory Cards,
              Hidden Achievements, quests, and Prep cues here.
            </p>
          ) : (
            <ul className="drafts">
              {waiting.map(({ run, item }) => {
                const key = `${item.runId}/${item.itemId}/${item.status}`;
                if (item.kind === "cue")
                  return <CueCard key={key} view={view} item={item} cited={<Cited view={view} run={run} item={item} names={names} />} onDismiss={() => drafts.mark(item, "dismiss")} />;
                if (item.suggestion?.kind === "class-offers")
                  return (
                    <li key={key} className="draft">
                      <h4 className="draft-kind">
                        Class offers for {names(item.suggestion.characterId)}
                        <span className="muted">: {item.suggestion.key}</span>
                      </h4>
                      <p className="small">
                        Drafted in the <a href="#classes">Classes</a> section, where they load into the three offers to edit and record.
                      </p>
                      <div className="draft__decide">
                        <button className="btn" onClick={() => drafts.mark(item, "dismiss")}>
                          Dismiss
                        </button>
                      </div>
                    </li>
                  );
                if (item.action?.type === "quest.issue")
                  return <QuestCard key={key} view={view} engine={engine} names={names} run={run} item={item} drafts={drafts} onRecorded={onRecorded} onFire={onFire} />;
                if (item.action?.type === "quest.reveal") return <RevealCard key={key} view={view} names={names} run={run} item={item} drafts={drafts} onRecorded={onRecorded} />;
                return <SuggestionCard key={key} view={view} engine={engine} names={names} run={run} item={item} drafts={drafts} onRecorded={onRecorded} />;
              })}
            </ul>
          )}
          {drafts.error && <p className="error">{drafts.error}</p>}
          {accepted.length > 0 && (
            <details className="panel folded">
              <summary>Accepted ({accepted.length})</summary>
              <ul className="small">
                {accepted.map(({ item }) => (
                  <li key={`${item.runId}/${item.itemId}`}>{summaryOf(view, names, item)}</li>
                ))}
              </ul>
            </details>
          )}
          {dismissed.length > 0 && (
            <details className="panel folded">
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
        <section className="panel">
          <div className="panel__head">
            <h2>Due from the record</h2>
          </div>
          {!due && !pointers.length && <p className="dim panel__body">Nothing is due.</p>}
          {pointers.length > 0 && (
            <ul className="rows panel__rows">
              {pointers.map((x) => (
                <li key={x.line}>
                  <span className="row__main">{x.line}</span>
                  <a className="small" href={`#${x.section}`}>
                    {x.label}
                  </a>
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
