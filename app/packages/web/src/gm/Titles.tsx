/**
 * The GM's side of titles (Titles): grant one from the F-Grade catalog, the tutorial's list, or
 * written fresh; release a negative title, converting it if the release was earned; tick the
 * counts only the fiction knows; and grant or pass on each catalog title whose count is met.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, DERIVED_COUNTERS, type Envelope, type GmView, type Sheet, type TitleCategory, type TitleSpec, catalogSpec, counted, tickedCounters } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import { ATTRIBUTES, counterLabel, type Names } from "../text.ts";
import { TableWords } from "./TableWords.tsx";
import { Commit } from "./Commit.tsx";

const CATEGORIES: TitleCategory[] = ["Achievement", "Hidden Achievement", "HVE-Resonant", "Bestowed"];

/** A title's stat points in words: "+1 STR, +2 DEX". */
export function bonusLine(bonus: Record<string, number>, choice?: number): string {
  const parts = Object.entries(bonus)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v > 0 ? "+" : "−"}${Math.abs(v)} ${k}`);
  if (choice) parts.push(`+${choice} to a stat of the player's choice`);
  return parts.join(", ");
}

function catalogGroups(engine: Engine): [string, string[]][] {
  const t = engine.rules.titles;
  const groups = Object.entries(t.achievement_catalog as Record<string, { title: string }[]>).map(([g, rows]) => [g, rows.map((r) => r.title)] as [string, string[]]);
  return [...groups, ["The tutorial", (t.tutorial_titles as { title: string }[]).map((r) => r.title)]];
}

function useRun(campaignId: string, onRecorded: (env: Envelope) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      onRecorded((await submit(campaignId, newActionId(), action)).envelope);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error };
}

// ------------------------------------------------------------- grant ---

export function TitlesForm({ view, engine, names, onRecorded }: { view: GmView; engine: Engine; names: Names; onRecorded: (env: Envelope) => void }) {
  const [characterId, setCharacterId] = useState(view.characters[0]?.id ?? "");
  const [source, setSource] = useState<"catalog" | "custom">("catalog");
  const groups = catalogGroups(engine);
  const [catalog, setCatalog] = useState(groups[0]?.[1][0] ?? "");
  const [custom, setCustom] = useState({ name: "", category: "Achievement" as TitleCategory, effect: "", negative: false, release: "", choice: "", poleA: "", poleB: "" });
  const [bonus, setBonus] = useState<Record<string, string>>({});
  const c = view.characters.find((x) => x.id === characterId) ?? view.characters[0];
  if (!c) return <p className="muted">No characters yet.</p>;
  const poles: string[] = engine.rules.hve.axes.flatMap((a: { poles: { name: string }[] }) => a.poles.map((p) => p.name));

  let spec: TitleSpec;
  let problem: string | null = null;
  if (source === "catalog") {
    spec = { catalog };
  } else {
    const stats = Object.fromEntries(
      Object.entries(bonus)
        .map(([k, v]) => [k, Math.trunc(Number(v))] as const)
        .filter(([, v]) => v),
    );
    spec = { name: custom.name.trim(), category: custom.category };
    if (Object.keys(stats).length) spec.bonus = stats;
    if (Math.trunc(Number(custom.choice)) > 0) spec.choice = Math.trunc(Number(custom.choice));
    if (custom.effect.trim()) spec.effect = custom.effect.trim();
    if (custom.category === "HVE-Resonant") spec.axisPair = `${custom.poleA} + ${custom.poleB}`;
    if (custom.category === "Bestowed" && custom.negative) {
      spec.negative = true;
      if (custom.release.trim()) spec.release = custom.release.trim();
    }
    if (!custom.name.trim()) problem = "Name the title.";
    else if (custom.category === "HVE-Resonant" && (!custom.poleA || !custom.poleB)) problem = "Pick the axis pair.";
    else if (spec.negative && !spec.release) problem = "Write the release condition when the title is granted.";
  }
  let preview = "";
  if (source === "catalog") {
    try {
      const s = catalogSpec(engine, catalog);
      preview = [s.category + (s.negative ? ", negative" : ""), bonusLine(s.bonus ?? {}, s.choice), s.effect, s.release ? `Released by: ${s.release}` : ""].filter(Boolean).join(" · ");
    } catch {
      preview = "";
    }
  }
  const action: Action = { type: "title.grant", characterId: c.id, title: spec };
  return (
    <div className="form">
      <div className="row">
        <label>
          Character
          <select value={c.id} onChange={(e) => setCharacterId(e.target.value)}>
            {view.characters.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="radio" checked={source === "catalog"} onChange={() => setSource("catalog")} /> From the book
        </label>
        <label>
          <input type="radio" checked={source === "custom"} onChange={() => setSource("custom")} /> Written fresh
        </label>
      </div>
      {source === "catalog" ? (
        <>
          <div className="row">
            <label>
              Title
              <select value={catalog} onChange={(e) => setCatalog(e.target.value)}>
                {groups.map(([g, titles]) => (
                  <optgroup key={g} label={g}>
                    {titles.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </div>
          {preview && <p className="small">{preview}</p>}
        </>
      ) : (
        <>
          <div className="row">
            <label>
              Name
              <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Cornerless" />
            </label>
            <label>
              Category
              <select value={custom.category} onChange={(e) => setCustom({ ...custom, category: e.target.value as TitleCategory })}>
                {CATEGORIES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            {custom.category === "HVE-Resonant" && (
              <label>
                Axis pair
                <span className="row tight">
                  {(["poleA", "poleB"] as const).map((k) => (
                    <select key={k} value={custom[k]} onChange={(e) => setCustom({ ...custom, [k]: e.target.value })}>
                      <option value="">Pole</option>
                      {poles.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  ))}
                </span>
              </label>
            )}
            {custom.category === "Bestowed" && (
              <label className="check">
                <input type="checkbox" checked={custom.negative} onChange={(e) => setCustom({ ...custom, negative: e.target.checked })} /> Negative
              </label>
            )}
          </div>
          <TableWords text={custom.name} />
          <div className="row tight">
            {ATTRIBUTES.map((a) => (
              <label key={a}>
                {a}
                <input type="number" className="narrow-input" value={bonus[a] ?? ""} onChange={(e) => setBonus({ ...bonus, [a]: e.target.value })} placeholder="0" />
              </label>
            ))}
            <label title="Points the player places in one stat of their choice">
              Player's choice
              <input type="number" className="narrow-input" min={0} value={custom.choice} onChange={(e) => setCustom({ ...custom, choice: e.target.value })} placeholder="0" />
            </label>
          </div>
          <label>
            Other effects (conditional, triggered, social)
            <input className="wide" value={custom.effect} onChange={(e) => setCustom({ ...custom, effect: e.target.value })} placeholder="At a quarter of Max HP or less, +5 STR and +5 DEX." />
          </label>
          {custom.category === "Bestowed" && custom.negative && (
            <label>
              Release condition
              <input className="wide" value={custom.release} onChange={(e) => setCustom({ ...custom, release: e.target.value })} placeholder="Fulfil a new sworn oath under witness." />
            </label>
          )}
          <p className="muted small">Bonus sizes by title class are in Titles, "Bonus Magnitudes". A flat bonus lands on the sheet once; points past the stat cap are lost.</p>
        </>
      )}
      <Commit campaignId={view.campaign.id} action={action} problem={problem} names={names} label={`Confer ${source === "catalog" ? catalog : custom.name.trim() || "the title"} on ${c.name}`} onRecorded={onRecorded} />
      <HeldTitles view={view} engine={engine} c={c} onRecorded={onRecorded} />
    </div>
  );
}

/** A character's titles, with the release of a negative one. */
function HeldTitles({ view, engine, c, onRecorded }: { view: GmView; engine: Engine; c: Sheet; onRecorded: (env: Envelope) => void }) {
  const { run, busy, error } = useRun(view.campaign.id, onRecorded);
  const [replacement, setReplacement] = useState<Record<string, string>>({});
  if (!c.titles.length) return null;
  const titles = catalogGroups(engine).flatMap(([, t]) => t);
  return (
    <div className="held-titles">
      <h4>{c.name}'s titles</h4>
      <ul className="items">
        {c.titles.map((t) => (
          <li key={t.id}>
            <strong>{t.name}</strong>
            <span className="muted small">
              {t.category}
              {t.negative ? ", negative" : ""}
              {t.status !== "active" ? `, ${t.status}` : ""}
              {t.worn === false ? ", hidden" : ""}
              {t.revealed === false ? ", unrevealed" : ""}
              {bonusLine(t.bonus, t.choice) ? ` · ${bonusLine(t.bonus, t.choice)}` : ""}
            </span>
            {t.negative && t.status === "active" && (
              <span className="item-actions">
                <select value={replacement[t.id] ?? ""} onChange={(e) => setReplacement({ ...replacement, [t.id]: e.target.value })} aria-label="Converts into">
                  <option value="">Released, no conversion</option>
                  {titles.map((x) => (
                    <option key={x} value={x}>
                      Converts into {x}
                    </option>
                  ))}
                </select>
                <button
                  disabled={busy}
                  onClick={() =>
                    run({ type: "title.release", characterId: c.id, titleId: t.id, ...(replacement[t.id] ? { replacement: { catalog: replacement[t.id]! } } : {}) })
                  }
                >
                  Release
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------- counts ---

/** Every count toward a catalog title: the record's own, and the ones the GM ticks. */
export function CountersForm({ view, engine, onRecorded }: { view: GmView; engine: Engine; onRecorded: (env: Envelope) => void }) {
  const { run, busy, error } = useRun(view.campaign.id, onRecorded);
  const living = view.characters.filter((c) => !c.dead);
  const [characterId, setCharacterId] = useState(living[0]?.id ?? "");
  const c = living.find((x) => x.id === characterId) ?? living[0];
  if (!c) return <p className="muted">No characters yet.</p>;
  const counters = [...DERIVED_COUNTERS, ...tickedCounters(engine)];
  const titlesFor = (counter: string) =>
    Object.entries(counted(engine))
      .filter(([, v]) => v.counter === counter)
      .map(([name, v]) => `${name} at ${v.at}`)
      .join(", ");
  return (
    <div className="form">
      <label>
        Character
        <select value={c.id} onChange={(e) => setCharacterId(e.target.value)}>
          {living.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      <table className="rows">
        <tbody>
          {counters.map((k) => (
            <tr key={k}>
              <td>{counterLabel(k)}</td>
              <td className="num">{c.counters[k] ?? 0}</td>
              <td className="muted small">{titlesFor(k)}</td>
              <td>
                {DERIVED_COUNTERS.has(k) ? (
                  <span className="muted small">from the record</span>
                ) : (
                  <button disabled={busy} onClick={() => run({ type: "counter.tick", characterId: c.id, counter: k, count: 1 })}>
                    +1
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Players never see these counts or thresholds. Undo a mistaken tick from the campaign log.</p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- due ---

/** Catalog titles whose count is met: nothing reaches a player until the GM grants it. */
export function TitlesDueCard({ view, engine, onRecorded }: { view: GmView; engine: Engine; onRecorded: (env: Envelope) => void }) {
  const { run, busy, error } = useRun(view.campaign.id, onRecorded);
  const due = view.characters.flatMap((c) => c.titlesDue.map((t) => ({ c, t })));
  if (!due.length) return null;
  return (
    <article className="sheet-card due">
      <header>
        <h3>Titles due</h3>
        <span className="muted small">A count reached its trigger.</span>
      </header>
      <ul className="items">
        {due.map(({ c, t }) => {
          const s = catalogSpec(engine, t);
          return (
            <li key={`${c.id}:${t}`}>
              <span>
                <strong>{c.name}</strong>: {t} <span className="muted small">{bonusLine(s.bonus ?? {}, s.choice)}</span>
              </span>
              <span className="item-actions">
                <button className="primary" disabled={busy} onClick={() => run({ type: "title.grant", characterId: c.id, title: { catalog: t } })}>
                  Confer
                </button>
                <button disabled={busy} onClick={() => run({ type: "title.dismiss", characterId: c.id, catalog: t })}>
                  Pass
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {error && <p className="error">{error}</p>}
    </article>
  );
}
