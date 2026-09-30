/**
 * The GM's quests (System Quests): issue a quest in any of the five categories with the book's
 * entry fields, then run the log: advance a count, complete it with each holder's VE and its
 * items, fail it, let it expire, move a Hidden quest to a partial reveal, and answer an offer for
 * a player away from their screen. Personal Opportunity refusals show by flavor.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type Effect, type Envelope, type GmView, QUEST_CATEGORIES, questForHolder, type Quest, type QuestCategory, type QuestSpec, clockLine, nextQuestCode, prepCause, questTableVe } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import { catalogNames } from "../items.ts";
import { type Names, duration, noticeLine } from "../text.ts";
import { TableWords } from "./TableWords.tsx";
import { type Firing, savedTo } from "./Prep.tsx";
import { Commit } from "./Commit.tsx";

const OFFERED: QuestCategory[] = ["Routine", "Faction", "Personal Opportunity"];
const int = (s: string) => (s.trim() === "" ? undefined : Math.trunc(Number(s)));

function useRun(campaignId: string, onRecorded: (env: Envelope) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      onRecorded((await submit(campaignId, newActionId(), action)).envelope);
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

/** The next free code: Q-101 onward, M-01 onward for Mandates. */
const nextCode = (quests: Quest[], category: QuestCategory) => nextQuestCode(quests, category);

// ------------------------------------------------------------ issue ---

function IssueForm({
  view,
  engine,
  names,
  onRecorded,
  firing,
  onFired,
}: {
  view: GmView;
  engine: Engine;
  names: Names;
  onRecorded: (env: Envelope) => void;
  firing?: Extract<Firing, { kind: "quest" }>;
  onFired?: () => void;
}) {
  const from = firing?.quest;
  const living = view.characters.filter((c) => !c.dead);
  const difficulties: string[] = engine.rules.resolution.resistance_card.map((r: { difficulty: string }) => r.difficulty);
  const grades: string[] = engine.rules.grades.grades.map((g: { code: string }) => g.code);
  const [f, setF] = useState({
    id: from?.id ?? "",
    category: (from?.category ?? "Routine") as QuestCategory,
    title: from?.title ?? "",
    issuer: from?.issuer && from.issuer !== "System" ? from.issuer : "",
    grade: from?.grade ?? "F",
    difficulty: from?.difficulty ?? "Moderate",
    objective: from?.objective ?? "",
    count: from?.count ? String(from.count) : "",
    countFixed: from?.countFixed ?? false,
    ve: from?.ve !== undefined ? String(from.ve) : "",
    scaled: from?.scaled ?? false,
    rewardText: from?.rewardText ?? "",
    time: from?.time ?? "",
    hours: from?.hours ? String(from.hours) : "",
    flavor: (from?.flavor ?? "combat") as "combat" | "social" | "exploration",
    hidden: (from?.hidden ?? "obscured") as "obscured" | "partial" | "post-completion",
    hiddenName: from?.hiddenName ?? "",
    note: from?.note ?? "",
  });
  const [to, setTo] = useState<string[]>(firing && "to" in firing ? firing.to : living[0] ? [living[0].id] : []);
  const [items, setItems] = useState<{ name: string; count: string }[]>(() => (from?.items ?? []).map((i) => ({ name: i.name, count: String(i.count) })));
  const single = OFFERED.includes(f.category);
  const code = f.id.trim() || nextCode(view.quests, f.category);
  const table = questTableVe(engine, f.category, f.difficulty, f.grade);
  const targets = single ? to.slice(0, 1) : to;

  const spec: QuestSpec = { id: code, category: f.category, title: f.title.trim(), grade: f.grade, difficulty: f.difficulty, objective: f.objective.trim() };
  if (f.category === "Faction" && f.issuer.trim()) spec.issuer = f.issuer.trim();
  const count = int(f.count);
  if (count) spec.count = count;
  if (count && f.countFixed) spec.countFixed = true;
  if (f.scaled) spec.scaled = true;
  else if (int(f.ve) !== undefined) spec.ve = int(f.ve)!;
  const stacks = items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), count: int(i.count) ?? 1 }));
  if (stacks.length) spec.items = stacks;
  if (f.rewardText.trim()) spec.rewardText = f.rewardText.trim();
  if (f.time.trim()) spec.time = f.time.trim();
  if (int(f.hours)) spec.hours = int(f.hours)!;
  if (f.category === "Personal Opportunity") spec.flavor = f.flavor;
  if (f.note.trim()) spec.note = f.note.trim();
  if (f.category === "Hidden") {
    spec.hidden = f.hidden;
    if (f.hidden === "partial") spec.hiddenName = f.hiddenName.trim();
  }
  const problem = !f.title.trim() ? "Title the quest." : !targets.length ? "Pick who receives it." : null;
  const action: Action = { type: "quest.issue", quest: spec, to: targets };
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });

  return (
    <section className="card">
      <h2>Issue a quest</h2>
      {firing && (
        <p className="muted small">
          {"draftId" in firing ? "Drafted. Edit what you like, check who receives it, and issue it." : "From Prep. Check the code, pick who receives it, and issue it."}
        </p>
      )}
      <div className="form">
        <div className="form-row">
          <label>
            Category
            <select value={f.category} onChange={(e) => set("category", e.target.value)}>
              {QUEST_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c === "Faction" ? "Faction or Bestowed" : c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Code
            <input className="narrow-input" value={f.id} onChange={(e) => set("id", e.target.value)} placeholder={nextCode(view.quests, f.category)} />
          </label>
          <label>
            Title
            <input className="wide" value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Glow-Mote Cluster Containment" />
          </label>
          {f.category === "Faction" && (
            <label>
              Issuer
              <input value={f.issuer} onChange={(e) => set("issuer", e.target.value)} placeholder="the Flats co-op" />
            </label>
          )}
        </div>
        <div className="form-row">
          <label>
            Grade
            <select value={f.grade} onChange={(e) => set("grade", e.target.value)}>
              {grades.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label>
            Difficulty
            <select value={f.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
              {difficulties.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          {f.category === "Personal Opportunity" && (
            <label>
              Flavor
              <select value={f.flavor} onChange={(e) => set("flavor", e.target.value)}>
                <option value="combat">combat</option>
                <option value="social">social</option>
                <option value="exploration">exploration</option>
              </select>
            </label>
          )}
          {f.category === "Hidden" && (
            <label>
              The log shows
              <select value={f.hidden} onChange={(e) => set("hidden", e.target.value)}>
                <option value="obscured">nothing readable (fully obscured)</option>
                <option value="partial">a suggestive name (partial reveal)</option>
                <option value="post-completion">nothing until complete</option>
              </select>
            </label>
          )}
          {f.category === "Hidden" && f.hidden === "partial" && (
            <label>
              Suggestive name
              <input value={f.hiddenName} onChange={(e) => set("hiddenName", e.target.value)} placeholder="Let It Finish" />
            </label>
          )}
        </div>
        <label>
          Objective
          <input className="wide" value={f.objective} onChange={(e) => set("objective", e.target.value)} placeholder="Eliminate Glow-Mote swarms reported near the eastern perimeter." />
        </label>
        <div className="form-row">
          <label title="A counted objective; sharing multiplies it by the holders unless it cannot scale">
            Count
            <input type="number" className="narrow-input" min={1} value={f.count} onChange={(e) => set("count", e.target.value)} placeholder="3" />
          </label>
          {int(f.count) !== undefined && (
            <label className="check" title="A place reached, a person protected, a thing recovered: sharing leaves the count as written">
              <input type="checkbox" checked={f.countFixed} onChange={(e) => set("countFixed", e.target.checked)} />
              Stays as written when shared
            </label>
          )}
          <label>
            VE
            <input
              type="number"
              className="narrow-input"
              min={0}
              disabled={f.scaled}
              value={f.ve}
              onChange={(e) => set("ve", e.target.value)}
              placeholder={table === null ? "none" : String(table)}
            />
          </label>
          <label className="check" title="Reward proportional to threat, elegance, or style: set at completion, up to half again or half">
            <input type="checkbox" checked={f.scaled} onChange={(e) => set("scaled", e.target.checked)} /> Proportional
          </label>
          <label>
            Time
            <input value={f.time} onChange={(e) => set("time", e.target.value)} placeholder="within 6 hours" />
          </label>
          <label title={view.clock ? "Counted on the in-game clock from the moment the quest is issued" : "Set the in-game clock to give a limit in hours"}>
            Limit (hours)
            <input type="number" min={1} disabled={!view.clock} value={f.hours} onChange={(e) => set("hours", e.target.value)} />
          </label>
        </div>
        <datalist id="quest-items">
          {catalogNames(engine).map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        {items.map((it, i) => (
          <div key={i} className="form-row tight">
            <input list="quest-items" value={it.name} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Stuttering Tincture" aria-label="Reward item" />
            <input type="number" className="narrow-input" min={1} value={it.count} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))} aria-label="How many" />
            <button onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <div className="form-row">
          <button onClick={() => setItems([...items, { name: "", count: "1" }])}>Add a reward item</button>
          <label>
            Other reward
            <input className="wide" value={f.rewardText} onChange={(e) => set("rewardText", e.target.value)} placeholder="Standing with the co-op improves" />
          </label>
        </div>
        <TableWords text={[f.title, f.issuer, f.objective, f.rewardText, f.hiddenName].join(" ")} />
        <label>
          GM note (never on their log)
          <textarea rows={2} maxLength={1000} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="A hidden alternative outcome; what a refusal closes" />
        </label>
        <div className="form-row tight">
          <span className="small">{single ? "Offered to:" : "Binds:"}</span>
          {living.map((c) =>
            single ? (
              <label key={c.id} className="check">
                <input type="radio" checked={to[0] === c.id} onChange={() => setTo([c.id])} /> {c.name}
              </label>
            ) : (
              <label key={c.id} className="check">
                <input type="checkbox" checked={to.includes(c.id)} onChange={(e) => setTo(e.target.checked ? [...to, c.id] : to.filter((x) => x !== c.id))} /> {c.name}
              </label>
            ),
          )}
        </div>
        <Commit
          campaignId={view.campaign.id}
          action={action}
          problem={problem}
          names={names}
          label={`Issue [${code}]`}
          {...(firing && "prepId" in firing ? { cause: prepCause(firing.prepId) } : {})}
          {...(firing && "draftId" in firing ? { submitWith: firing.submitWith } : {})}
          onRecorded={(env) => {
            onRecorded(env);
            onFired?.();
          }}
        />
        {firing && "prepId" in firing && f.title.trim() && (
          <details>
            <summary>Save the changes to Prep instead</summary>
            <Commit
              campaignId={view.campaign.id}
              action={{ type: "prep.save", items: [savedTo(view, firing.prepId, { kind: "quest", title: `[${code}] ${spec.title}`, quest: spec })] }}
              names={names}
              label="Save to Prep"
              onRecorded={(env) => {
                onRecorded(env);
                onFired?.();
              }}
            />
          </details>
        )}
        {!firing && f.title.trim() && (
          <details>
            <summary>Save this quest to Prep instead</summary>
            <Commit
              campaignId={view.campaign.id}
              action={{ type: "prep.save", items: [{ id: `quest-${code.toLowerCase()}`, kind: "quest", title: `[${code}] ${spec.title}`, quest: spec }] }}
              names={names}
              label="Save to Prep"
              onRecorded={onRecorded}
            />
          </details>
        )}
      </div>
    </section>
  );
}

// -------------------------------------------------------------- log ---

function QuestCard({ q, view, engine, names, onRecorded }: { q: Quest; view: GmView; engine: Engine; names: Names; onRecorded: (env: Envelope) => void }) {
  const { run, busy, error } = useRun(view.campaign.id, onRecorded);
  const [completing, setCompleting] = useState(false);
  const [awards, setAwards] = useState<Record<string, string>>({});
  const [took, setTook] = useState<Set<string>>(new Set(q.holders));
  const [itemsTo, setItemsTo] = useState("spoils");
  const [revealName, setRevealName] = useState("");
  const reward = [q.scaled ? "proportional" : q.ve === null ? "" : `${q.ve} VE`, ...(q.items ?? []).map((i) => (i.count === 1 ? i.name : `${i.count} ${i.name}`)), q.rewardText ?? ""].filter(Boolean).join(", ");
  const open = q.status === "offered" || q.status === "active";
  const holders = q.holders.filter((h) => took.has(h));
  // Every participating holder collects the stated award; a holder above the quest's Grade collects nothing (Quests; Gabriel, 2026-09-26).
  const stated = (h: string) => {
    const grade = view.characters.find((c) => c.id === h)?.grade ?? q.grade;
    return engine.gradeOrder(grade) > engine.gradeOrder(q.grade) ? 0 : (q.ve ?? 0);
  };
  const completeAction: Action = {
    type: "quest.complete",
    questId: q.id,
    awards: holders.map((h) => ({ characterId: h, ve: Math.max(0, int(awards[h] ?? "") ?? stated(h)) })),
    ...(q.items?.length ? { itemsTo } : {}),
  };
  // A button that reaches the players says what they will read (Decisions, "the makeover": the
  // GM's press is the tap, so the notice shows beside it rather than behind a second step).
  const receives = (kind: Effect["kind"], to: string[] = q.holders, extra: Record<string, unknown> = {}) => {
    const shown = questForHolder(q);
    if (!shown || !to.length) return undefined;
    const text = noticeLine({ kind, characterId: to[0]!, questId: shown.id, line: `[${shown.code}] ${shown.title}`, ...extra } as Effect);
    return text ? `${to.map(names).join(", ")} ${to.length > 1 ? "each receive" : "receives"}: ${text}` : undefined;
  };
  return (
    <article className={`panel quest-card ${q.status}`} aria-label={`[${q.code}] ${q.title}`}>
      <dl className="quest">
        <div className="quest__id">
          <span className="num">[{q.code}]</span>
          <b>{q.title}</b>
          {q.hidden && (
            <span className="tag">
              <i className="ic ic-hidden" aria-hidden="true" />
              hidden: {q.hidden}
              {q.hiddenName ? `, "${q.hiddenName}"` : ""}
            </span>
          )}
        </div>
        <dt>Issuer</dt>
        <dd>
          <span className={q.issuer === "System" ? undefined : "world"}>{q.issuer}</span>
          {q.category === "Faction" ? "" : ` · ${q.category}`}
        </dd>
        <dt>Grade</dt>
        <dd>
          {q.grade} · Difficulty: {q.difficulty}
        </dd>
        <dt>Objective</dt>
        <dd>
          {q.objective}
          {q.count && <span className="num"> ({q.count.done}/{q.count.of})</span>}
        </dd>
        <dt>Reward</dt>
        <dd>{reward || "none"}</dd>
        {q.time && (
          <>
            <dt>Time</dt>
            <dd>{q.time}</dd>
          </>
        )}
        {q.due !== undefined && (
          <>
            <dt>Due</dt>
            <dd className="num">
              {clockLine(q.due)}
              {open && view.clock ? (view.clock.at >= q.due ? " · time limit reached" : ` · ${duration(q.due - view.clock.at)} left`) : ""}
            </dd>
          </>
        )}
        <dt>Status</dt>
        <dd>
          {q.status[0]!.toUpperCase() + q.status.slice(1)}
          {q.flavor ? ` · ${q.flavor}` : ""}
        </dd>
      </dl>
      <div className="quest-card__body stack">
      {q.note && <p className="small muted">GM note: {q.note}</p>}
      <p className="small">
        {q.status === "offered" ? "Offered to" : "Held by"} {q.holders.map(names).join(", ") || "nobody"}
        {q.sharedIn ? " (shared with the party)" : ""}
        {q.refusedBy.length ? ` · refused by ${q.refusedBy.map(names).join(", ")}` : ""}
      </p>
      {open && (
        <div className="form-row tight">
          {q.status === "offered" && (
            <>
              <button disabled={busy} onClick={() => run({ type: "quest.answer", questId: q.id, characterId: q.holders[0]!, accept: true })} title={`For a player away from their screen. ${receives("quest-accepted", [q.holders[0]!]) ?? ""}`}>
                Accept for {names(q.holders[0]!)}
              </button>
              <button disabled={busy} onClick={() => run({ type: "quest.answer", questId: q.id, characterId: q.holders[0]!, accept: false })} title={receives("quest-refused", [q.holders[0]!])}>
                Refuse for {names(q.holders[0]!)}
              </button>
            </>
          )}
          {q.status === "active" && q.count && (
            <>
              <button disabled={busy} onClick={() => run({ type: "quest.progress", questId: q.id, by: -1 })} title={receives("quest-progress", q.holders, { done: q.count.done - 1, of: q.count.of })}>
                −1
              </button>
              <button disabled={busy} onClick={() => run({ type: "quest.progress", questId: q.id, by: 1 })} title={receives("quest-progress", q.holders, { done: q.count.done + 1, of: q.count.of })}>
                +1
              </button>
            </>
          )}
          {q.status === "active" && (
            <>
              <button className="primary" disabled={busy} aria-expanded={completing} onClick={() => setCompleting(!completing)}>
                Complete…
              </button>
              <button disabled={busy} onClick={() => run({ type: "quest.fail", questId: q.id })} title={receives("quest-failed")}>
                Failed
              </button>
            </>
          )}
          <button disabled={busy} onClick={() => run({ type: "quest.withdraw", questId: q.id })} title="Expires silently: no refusal is counted">
            Expire
          </button>
          {q.status === "active" && q.hidden === "obscured" && (
            <>
              <input value={revealName} onChange={(e) => setRevealName(e.target.value)} placeholder="Suggestive name" aria-label="Suggestive name" />
              <button disabled={busy || !revealName.trim()} onClick={() => run({ type: "quest.reveal", questId: q.id, name: revealName })}>
                Partial reveal
              </button>
              <TableWords text={revealName} />
            </>
          )}
        </div>
      )}
      </div>
      {completing && (
        <div className="quest-card__complete stack">
          <p className="small">
            Every holder who meaningfully took part collects the stated award; a holder above the quest's Grade collects nothing.{q.scaled ? " Proportional: exceptional performance pays up to half again, poor performance half." : ""}
          </p>
          {q.holders.map((h) => (
            <div key={h} className="form-row tight">
              <label className="check">
                <input
                  type="checkbox"
                  checked={took.has(h)}
                  onChange={(e) => {
                    const next = new Set(took);
                    if (e.target.checked) next.add(h);
                    else next.delete(h);
                    setTook(next);
                  }}
                />{" "}
                {names(h)}
              </label>
              <input
                type="number"
                className="narrow-input"
                min={0}
                value={awards[h] ?? ""}
                placeholder={String(stated(h))}
                onChange={(e) => setAwards({ ...awards, [h]: e.target.value })}
                aria-label={`${names(h)}'s VE`}
              />
              <span className="small">VE</span>
            </div>
          ))}
          {q.items?.length ? (
            <label>
              Items go to
              <select value={itemsTo} onChange={(e) => setItemsTo(e.target.value)}>
                <option value="spoils">the spoils</option>
                {q.holders.map((h) => (
                  <option key={h} value={h}>
                    {names(h)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <Commit
            campaignId={view.campaign.id}
            action={completeAction}
            names={names}
            label={`Complete [${q.code}]`}
            onRecorded={(env) => {
              setCompleting(false);
              onRecorded(env);
            }}
          />
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </article>
  );
}

function Refusals({ view }: { view: GmView }) {
  const rows = view.characters.filter((c) => Object.keys(c.refusals).length);
  if (!rows.length) return null;
  const note = (n: number) => (n >= 6 ? "stops appearing" : n >= 3 ? "half as often" : "");
  return (
    <section className="card">
      <h3>Personal Opportunities refused</h3>
      <ul className="items">
        {rows.map((c) => (
          <li key={c.id}>
            <strong>{c.name}</strong>
            {Object.entries(c.refusals)
              .map(([flavor, n]) => `${flavor} ${n}${note(n) ? ` (${note(n)})` : ""}`)
              .join(", ")}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function QuestsSection({
  view,
  engine,
  names,
  onRecorded,
  firing,
  onFired,
}: {
  view: GmView;
  engine: Engine | null;
  names: Names;
  onRecorded: (env: Envelope) => void;
  firing?: Extract<Firing, { kind: "quest" }>;
  onFired?: () => void;
}) {
  if (!engine) return <p className="muted pad">Loading rules…</p>;
  const open = view.quests.filter((q) => q.status === "offered" || q.status === "active");
  const closed = view.quests.filter((q) => q.status !== "offered" && q.status !== "active");
  return (
    <main className="page quests">
      <IssueForm key={firing ? ("prepId" in firing ? firing.prepId : firing.draftId) : "new"} view={view} engine={engine} names={names} onRecorded={onRecorded} {...(firing ? { firing } : {})} {...(onFired ? { onFired } : {})} />
      <Refusals view={view} />
      <h2>Open quests</h2>
      {open.length === 0 && <p className="muted">None.</p>}
      {open.map((q) => (
        <QuestCard key={q.id} q={q} view={view} engine={engine} names={names} onRecorded={onRecorded} />
      ))}
      {closed.length > 0 && (
        <details>
          <summary>Completed, failed, refused, and expired ({closed.length})</summary>
          {closed.map((q) => (
            <QuestCard key={q.id} q={q} view={view} engine={engine} names={names} onRecorded={onRecorded} />
          ))}
        </details>
      )}
    </main>
  );
}
