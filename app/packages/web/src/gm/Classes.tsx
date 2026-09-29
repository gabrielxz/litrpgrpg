/**
 * The GM's Classes section (Classes, "Building a Class for a Specific Human"). A character at
 * Level 10 without a class is due three offers: the GM reads the record beside the writer, starts
 * each offer from one of the book's classes or writes it fresh, and records the three together.
 * The player accepts one on their own screen, or the GM records the choice for a player away.
 * Classes held are listed with their once-a-day permission against dawn on the clock. With the
 * campaign's key, the model drafts the three from the same record and they load into the writer.
 */
import type { Engine } from "@gradebreaker/engine";
import {
  type ClassPackage,
  type CostShape,
  type Envelope,
  type GmView,
  MINUTES_PER_DAY,
  type ProfileShape,
  type Sheet,
  type TechniqueHook,
  bookClasses,
  packageProblems,
  packageWarnings,
  weights,
} from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { type DraftItem, acceptDraft, startClassOffers } from "../api.ts";
import { costLine, profileLine, returnedOf, selectionLine, techniqueOffer } from "../classes.ts";
import { ATTRIBUTES, type Names } from "../text.ts";
import { TableWords } from "./TableWords.tsx";
import { Commit } from "./Commit.tsx";
import { type DraftRuns, waitingOn } from "./Drafts.tsx";
import { useAiConfigured } from "./useAi.ts";

type Props = { view: GmView; engine: Engine | null; names: Names; onRecorded: (env: Envelope) => void; drafts?: DraftRuns };

const blank = (): ClassPackage => ({
  name: "",
  notice: "",
  profile: { shape: "Fixed", points: [{ attribute: "STR", points: 3 }] },
  technique: { name: "", cost: "Aether", effect: "" },
  permission: { name: "", effect: "" },
});

/** Classes held or offered in the campaign that carry a guarded power. */
function guardedInPlay(view: GmView): number {
  return view.characters.reduce((n, c) => n + Number(Boolean(c.class?.guarded)) + c.classOffers.filter((o) => o.guarded).length, 0);
}

/** The book's classes whose two poles both lead the character's Deep. */
function fitsDeep(engine: Engine, c: Sheet): Set<string> {
  const leading = new Set(c.hve.leads.map((l) => l.pole).filter(Boolean));
  const out = new Set<string>();
  for (const k of engine.rules.classes.classes as { name: string; poles: string[] }[]) if (k.poles.every((p) => leading.has(p))) out.add(k.name);
  return out;
}

// ------------------------------------------------------------ the record ---

/** What the offers are read from (Classes, "Building a Class for a Specific Human", step 1). */
function RecordRead({ engine, c }: { engine: Engine; c: Sheet }) {
  const ws = weights(engine);
  const circled = c.hve.sweeps.flatMap((s) => s.moments.filter((m) => ws.find((w) => w.tallies === m.weight)?.circled && m.note).map((m) => ({ label: s.label, m })));
  const principle = c.principles.principles[0];
  const insight = Object.entries(c.principles.insight).sort((a, b) => b[1] - a[1]);
  return (
    <div className="class-record">
      <h3>{c.name}'s record</h3>
      <p className="small">
        {ATTRIBUTES.map((a) => `${a} ${c.raw[a]}`).join(" · ")}
      </p>
      <p className="small">Background: {c.background}</p>
      <p className="small">
        Deep leads:{" "}
        {c.hve.leads.map((l) => (l.pole ? `${l.pole} by ${l.by}` : `${l.axis} even`)).join(", ")}
        {c.hve.archetype ? ` · ${c.hve.archetype}` : ""} · Coherence {c.hve.coherence.profile}
      </p>
      {circled.length > 0 && (
        <div className="small">
          Circled:
          <ul>
            {circled.map(({ label, m }, i) => (
              <li key={i}>
                {m.pole}: {m.note} <span className="muted">({label})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="small">
        Principle: {principle ? `${principle.name}, ${principle.tier}` : insight.length ? `none yet; Insight ${insight.map(([f, n]) => `${f} ${n}`).join(", ")}` : "none"}
      </p>
      {c.proficiencies.length > 0 && <p className="small">Proficiencies: {c.proficiencies.map((p) => `${p.shape} ${p.tier}`).join(", ")}</p>}
      {c.titles.some((t) => t.status === "active") && (
        <p className="small">
          Titles:{" "}
          {c.titles
            .filter((t) => t.status === "active")
            .map((t) => t.name)
            .join(", ")}
        </p>
      )}
      <p className="small muted">And the thing the player keeps doing that no rule asked for.</p>
    </div>
  );
}

// ------------------------------------------------------------ one offer ---

function OfferEditor({ engine, c, value, onChange, index }: { engine: Engine; c: Sheet; value: ClassPackage; onChange: (p: ClassPackage) => void; index: number }) {
  const book = bookClasses(engine);
  const meta = engine.rules.classes.classes as { name: string; built_for: string; poles: string[] }[];
  const fits = fitsDeep(engine, c);
  const shapes = (engine.rules.classes.profile.shapes as { shape: ProfileShape; system: number }[]).map((s) => s);
  const costs = (engine.rules.classes.technique.cost_shapes as { shape: CostShape }[]).map((s) => s.shape);
  const set = (patch: Partial<ClassPackage>) => onChange({ ...value, ...patch });
  const points = value.profile.points;
  const setPoints = (next: ClassPackage["profile"]["points"]) => set({ profile: { ...value.profile, points: next } });
  const shape = shapes.find((s) => s.shape === value.profile.shape);
  const assigned = points.reduce((s, x) => s + (x.points || 0), 0);
  return (
    <fieldset className="class-editor">
      <legend>Offer {index + 1}</legend>
      <label>
        Start from
        <select
          value={value.book ?? ""}
          onChange={(e) => {
            const picked = book.find((b) => b.name === e.target.value);
            onChange(picked ? structuredClone(picked) : blank());
          }}
        >
          <option value="">Written fresh</option>
          {meta.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name} ({m.poles.join(", ")}; built for {m.built_for}){fits.has(m.name) ? " · fits the Deep leads" : ""}
              {book.find((b) => b.name === m.name)?.guarded ? " · guarded" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Name
        <input value={value.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label>
        The System's notice
        <textarea rows={3} maxLength={1000} value={value.notice} onChange={(e) => set({ notice: e.target.value })} placeholder="In the System's units: Attributes, levels, Health, Aether, hours, meters." />
      </label>
      <TableWords text={value.notice} />

      <div className="row">
        <label>
          Profile
          <select value={value.profile.shape} onChange={(e) => set({ profile: { ...value.profile, shape: e.target.value as ProfileShape } })}>
            {shapes.map((s) => (
              <option key={s.shape} value={s.shape}>
                {s.shape} ({s.system} assigned)
              </option>
            ))}
          </select>
        </label>
        <span className="small muted">
          {assigned} of {shape?.system ?? "?"} assigned
          {returnedOf(engine, value) ? `, ${returnedOf(engine, value)} returned to the player` : ""}
        </span>
      </div>
      {points.map((x, i) => (
        <div key={i} className="row">
          <label>
            {i === 0 ? "Lead" : "Then"}
            <select value={x.attribute} onChange={(e) => setPoints(points.map((y, j) => (j === i ? { ...y, attribute: e.target.value } : y)))}>
              {ATTRIBUTES.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            Points
            <input
              type="number"
              min={1}
              max={3}
              value={x.points || ""}
              onChange={(e) => setPoints(points.map((y, j) => (j === i ? { ...y, points: Number(e.target.value) || 0 } : y)))}
            />
          </label>
          {points.length > 1 && (
            <button className="link" onClick={() => setPoints(points.filter((_, j) => j !== i))}>
              Remove
            </button>
          )}
        </div>
      ))}
      {points.length < 3 && (
        <button className="link" onClick={() => setPoints([...points, { attribute: ATTRIBUTES.find((a) => !points.some((p) => p.attribute === a))!, points: 1 }])}>
          Add an Attribute
        </button>
      )}

      <div className="row">
        <label>
          Technique
          <input value={value.technique.name} maxLength={60} onChange={(e) => set({ technique: { ...value.technique, name: e.target.value } })} />
        </label>
        <label>
          Cost
          <select value={value.technique.cost} onChange={(e) => set({ technique: { ...value.technique, cost: e.target.value as CostShape } })}>
            {costs.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        What it does <span className="muted small">({costLine(engine, value)})</span>
        <textarea rows={2} maxLength={600} value={value.technique.effect} onChange={(e) => set({ technique: { ...value.technique, effect: e.target.value } })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={Boolean(value.technique.actionEconomy)} onChange={(e) => set({ technique: { ...value.technique, actionEconomy: e.target.checked || undefined } })} />
        The technique changes the action economy (a reaction, a free or combined act)
      </label>
      <label className="check">
        <input type="checkbox" checked={Boolean(value.technique.noBeat)} onChange={(e) => set({ technique: { ...value.technique, noBeat: e.target.checked || undefined } })} />
        It takes no Beat of its own (a reaction, or part of a Clash)
      </label>
      {value.technique.cost === "Drawback" && (
        <label>
          Its drawback
          <select
            value={value.technique.drawback ?? ""}
            onChange={(e) => {
              const { drawback: _, ...rest } = value.technique;
              set({ technique: e.target.value ? { ...rest, drawback: e.target.value as "health" | "exposed" } : rest });
            }}
          >
            <option value="">The player chooses each time</option>
            <option value="health">10 Health</option>
            <option value="exposed">Exposed until the next turn</option>
          </select>
        </label>
      )}
      <HookFields engine={engine} value={value} onChange={onChange} />
      <label>
        Permission
        <input value={value.permission.name} maxLength={60} onChange={(e) => set({ permission: { ...value.permission, name: e.target.value } })} />
      </label>
      <label>
        What it permits
        <textarea rows={2} maxLength={600} value={value.permission.effect} onChange={(e) => set({ permission: { ...value.permission, effect: e.target.value } })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={Boolean(value.permission.actionEconomy)} onChange={(e) => set({ permission: { ...value.permission, actionEconomy: e.target.checked || undefined } })} />
        The permission changes the action economy
      </label>
      <label className="check">
        <input type="checkbox" checked={Boolean(value.permission.onceADay)} onChange={(e) => set({ permission: { ...value.permission, onceADay: e.target.checked || undefined } })} />
        Once a day, ready again at dawn
      </label>
      <label className="check">
        <input type="checkbox" checked={Boolean(value.guarded)} onChange={(e) => set({ guarded: e.target.checked || undefined })} />
        Carries a guarded power (known to the GM only)
      </label>
    </fieldset>
  );
}

/** What the app applies of the technique itself: a Clash bonus, a heal, or nothing (the GM applies it). */
function HookFields({ engine, value, onChange }: { engine: Engine; value: ClassPackage; onChange: (p: ClassPackage) => void }) {
  const h = value.technique.hook;
  const cap = engine.rules.classes.technique.bonus_cap as number;
  const def = engine.rules.classes.technique.bonus_default as number;
  const heal = engine.rules.classes.technique.reference.class_heal as number;
  const setHook = (hook: TechniqueHook | undefined) => {
    const { hook: _, ...rest } = value.technique;
    onChange({ ...value, technique: hook ? { ...rest, hook } : rest });
  };
  return (
    <div className="row tight">
      <label>
        The app applies
        <select
          value={h?.kind ?? ""}
          onChange={(e) =>
            setHook(e.target.value === "clash" ? { kind: "clash", bonus: def, side: "attack" } : e.target.value === "heal" ? { kind: "heal", amount: heal, reach: "zone" } : undefined)
          }
        >
          <option value="">Nothing: the GM applies it</option>
          <option value="clash">A bonus to a Clash</option>
          <option value="heal">Health restored to someone</option>
        </select>
      </label>
      {h?.kind === "clash" && (
        <>
          <label>
            Bonus
            <input type="number" className="narrow-input" min={1} max={cap} value={h.bonus} onChange={(e) => setHook({ ...h, bonus: Number(e.target.value) || 0 })} />
          </label>
          <label>
            On
            <select value={h.side} onChange={(e) => setHook({ ...h, side: e.target.value as "attack" | "defense" | "either" })}>
              <option value="attack">an attack</option>
              <option value="defense">a defense</option>
              <option value="either">either</option>
            </select>
          </label>
        </>
      )}
      {h?.kind === "heal" && (
        <>
          <label>
            Health
            <input type="number" className="narrow-input" min={1} value={h.amount} onChange={(e) => setHook({ ...h, amount: Number(e.target.value) || 0 })} />
          </label>
          <label>
            Reach
            <select value={h.reach} onChange={(e) => setHook({ ...h, reach: e.target.value as "zone" | "adjacent" })}>
              <option value="zone">your Zone</option>
              <option value="adjacent">your Zone or the next</option>
            </select>
          </label>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------- the writer ---

const draftKey = (campaignId: string, characterId: string) => `gradebreaker.classDraft.${campaignId}.${characterId}`;

function readDraft(key: string, n: number): ClassPackage[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as ClassPackage[]) : null;
    if (Array.isArray(parsed) && parsed.length === n) return parsed;
  } catch {
    // A draft is a convenience; start over without one.
  }
  return Array.from({ length: n }, blank);
}

/** Drafting the three offers from the record (Classes, "Building a Class for a Specific Human"), loaded into the writer on the GM's click. */
function OfferDrafter({ view, c, drafts, onLoad }: { view: GmView; c: Sheet; drafts: DraftRuns; onLoad: (item: DraftItem) => void }) {
  const ai = useAiConfigured(view.campaign.id);
  const [keepsDoing, setKeepsDoing] = useState("");
  const [guarded, setGuarded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ai) return null;
  const mine = drafts.runs.filter((r) => r.feature === "draft-classes");
  const running = mine.some((r) => r.status === "drafting");
  const failed = mine[0]?.status === "failed" ? mine[0] : null;
  const item = mine.flatMap((r) => r.items).find((i) => i.suggestion?.characterId === c.id && waitingOn(i));
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const { run } = await startClassOffers(view.campaign.id, c.id, keepsDoing, guarded);
      drafts.setRuns((rs) => [run, ...rs]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const notes = item?.suggestion?.offers ?? [];
  const offered = item?.action?.type === "class.offer" ? item.action.offers : [];
  return (
    <details className="class-drafter" open={Boolean(item)}>
      <summary>Draft the three offers from the record</summary>
      <label>
        What the player keeps doing that no rule asked for
        <textarea rows={2} value={keepsDoing} maxLength={2000} onChange={(e) => setKeepsDoing(e.target.value)} placeholder="First through every door; names the loot she wants before the fight is over" />
      </label>
      <label className="check">
        <input type="checkbox" checked={guarded} onChange={(e) => setGuarded(e.target.checked)} /> Ask for a guarded power (one offer may carry one)
      </label>
      <div className="row">
        <button disabled={busy || running || drafts.drafting} onClick={start}>
          {running ? "Drafting…" : "Draft three offers"}
        </button>
        <span className="muted small">The model reads the record at the left; the drafts load into the offers below when you say.</span>
      </div>
      {error && <p className="error">{error}</p>}
      {failed && !running && <p className="error">The last draft failed: {failed.message}</p>}
      {item && (
        <div className="class-drafted">
          <ul className="small">
            {offered.map((o, i) => (
              <li key={o.name}>
                <strong>{o.name}</strong>
                {o.book ? " (the book's)" : ""}
                {o.guarded ? " (guarded)" : ""}: {notes[i]?.role}. <span className="muted">Weighs: {notes[i]?.weighs}</span>
                {[...(notes[i]?.problems ?? []), ...(notes[i]?.warnings ?? [])].map((w) => (
                  <div key={w} className="warning">
                    {w}
                  </div>
                ))}
              </li>
            ))}
          </ul>
          {(item.suggestion?.problems ?? []).map((p) => (
            <p key={p} className="warning small">
              {p}
            </p>
          ))}
          <div className="row">
            <button className="primary" onClick={() => onLoad(item)}>
              Load them into the three offers
            </button>
            <button onClick={() => drafts.mark(item, "dismiss")}>Dismiss</button>
          </div>
        </div>
      )}
    </details>
  );
}

function OfferWriter({ view, engine, names, onRecorded, c, drafts }: Props & { engine: Engine; c: Sheet }) {
  const n = engine.rules.classes.selection.offers as number;
  const key = draftKey(view.campaign.id, c.id);
  const [offers, setOffers] = useState<ClassPackage[]>(() => readDraft(key, n));
  // The drafted offers loaded into the editors: recording them accepts the draft.
  const [loaded, setLoaded] = useState<DraftItem | null>(null);
  const [generation, setGeneration] = useState(0);
  const load = (item: DraftItem) => {
    if (item.action?.type !== "class.offer") return;
    const drafted = item.action.offers.map((o) => structuredClone(o));
    setOffers([...drafted, ...Array.from({ length: Math.max(0, n - drafted.length) }, blank)].slice(0, n));
    setLoaded(item);
    setGeneration((g) => g + 1);
  };
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(offers));
    } catch {
      // Kept in memory only.
    }
  }, [key, offers]);
  const clean = offers.map((o) => ({ ...o, name: o.name.trim(), notice: o.notice.trim() }));
  const problems = clean.flatMap((o) => packageProblems(engine, o));
  const names3 = clean.map((o) => o.name.toLowerCase()).filter(Boolean);
  if (new Set(names3).size !== names3.length) problems.push("The offers need different names.");
  const warnings = clean.flatMap((o) => (o.name ? packageWarnings(engine, o) : []));
  const guarded = guardedInPlay(view);
  const draftGuarded = clean.filter((o) => o.guarded).length;
  if (draftGuarded && guarded + draftGuarded > 1)
    warnings.push(`${guarded + draftGuarded} guarded classes would be in play. The book: offer a guarded power with great care; one in a campaign is plenty.`);
  const bonus = engine.rules.classes.selection.lead_attribute_bonus as number;
  return (
    <section className="card class-writer">
      <h2>{c.name} is due three class offers</h2>
      <p className="muted small">
        Level {c.level}. The offers differ in role and in which part of the record they weigh; one may amplify the dominant pattern,
        one formalize the secondary, one combine them. The player accepts one; the selection adds {bonus} to its lead Attribute and the
        profile places the held assigned points.
      </p>
      <div className="class-writer-body">
        <RecordRead engine={engine} c={c} />
        <div className="class-editors">
          {drafts && <OfferDrafter view={view} c={c} drafts={drafts} onLoad={load} />}
          {offers.map((o, i) => (
            <OfferEditor key={`${generation}-${i}`} index={i} engine={engine} c={c} value={o} onChange={(p) => setOffers(offers.map((x, j) => (j === i ? p : x)))} />
          ))}
        </div>
      </div>
      {warnings.map((w) => (
        <p key={w} className="warning small">
          {w}
        </p>
      ))}
      <Commit
        campaignId={view.campaign.id}
        action={{ type: "class.offer", characterId: c.id, offers: clean.map((o) => (o.book === undefined ? (({ book: _b, ...rest }) => rest)(o) : o)) }}
        problem={problems.length ? problems.join(" ") : null}
        names={names}
        label={`Offer ${c.name} these three classes`}
        {...(loaded && drafts && waitingOn(loaded)
          ? {
              submitWith: async (id: string, a: Parameters<typeof acceptDraft>[3]) => {
                const out = await acceptDraft(view.campaign.id, loaded, id, a);
                drafts.replace(out.item);
                return out.appended;
              },
            }
          : {})}
        onRecorded={(env) => {
          try {
            window.localStorage.removeItem(key);
          } catch {
            // Nothing to clear.
          }
          onRecorded(env);
        }}
      />
    </section>
  );
}

// ------------------------------------------------- offers and classes ---

function PackageLines({ engine, p, bonus }: { engine: Engine | null; p: ClassPackage; bonus?: number }) {
  const selection = selectionLine(engine, p, bonus);
  return (
    <>
      <p className="small">
        <em>{p.notice}</em>
      </p>
      <ul className="small">
        <li>
          Profile: {profileLine(engine, p)}
          {selection ? ` Selection: ${selection}.` : ""}
        </li>
        <li>
          {p.technique.name}: {costLine(engine, p)}. {p.technique.effect}
          {p.technique.actionEconomy ? " (action economy)" : ""}
          {p.technique.hook?.kind === "clash" && ` The app adds +${p.technique.hook.bonus} to ${p.technique.hook.side === "either" ? "an attack or a defense" : `a${p.technique.hook.side === "attack" ? "n attack" : " defense"}`} declared with it.`}
          {p.technique.hook?.kind === "heal" && ` The app restores ${p.technique.hook.amount} Health to the ally named.`}
        </li>
        <li>
          {p.permission.name}: {p.permission.effect}
          {p.permission.actionEconomy ? " (action economy)" : ""}
          {p.permission.onceADay ? " (once a day)" : ""}
        </li>
      </ul>
    </>
  );
}

function Standing({ view, engine, names, onRecorded, c }: Props & { c: Sheet }) {
  const from = (engine?.rules.character.leveling.class_level as number | undefined) ?? 0;
  const held = c.pendingSystemLevels.filter((l) => l >= from);
  return (
    <section className="card">
      <h2>{c.name}'s offers stand</h2>
      <p className="muted small">They wait on the player's choice{held.length ? `, and Level ${held.join(", ")}'s assigned points wait with them` : ""}. Undo the offer in the campaign log to write others.</p>
      {c.classOffers.map((o) => (
        <div key={o.name} className="class-offer">
          <h3>
            {o.name}
            {o.guarded && <span className="tag attention">guarded</span>}
          </h3>
          <PackageLines engine={engine} p={o} />
          <Commit
            campaignId={view.campaign.id}
            action={{ type: "class.accept", characterId: c.id, name: o.name }}
            names={names}
            label={`Record that ${c.name} accepts ${o.name}`}
            onRecorded={onRecorded}
          />
        </div>
      ))}
    </section>
  );
}

/** The technique used outside a fight, recorded by the GM: its cost paid, a heal applied. */
function TechniqueOutside({ view, engine, names, onRecorded, c }: Props & { c: Sheet }) {
  const k = c.class!;
  const living = view.characters.filter((x) => !x.dead);
  const [target, setTarget] = useState(c.id);
  const inFight = Boolean(view.encounter?.combatants.some((x) => x.characterId === c.id && !x.out));
  const t = techniqueOffer(engine, k, { aether: c.aether, inFight: false });
  if (c.dead || t.hook?.kind === "clash" || k.technique.cost === "Frequency") return null;
  if (inFight) return <p className="small muted">{k.technique.name} is used from the fight's tracker while {c.name} is in it.</p>;
  return (
    <div className="row tight">
      {t.hook?.kind === "heal" && (
        <label>
          {k.technique.name} restores {t.hook.amount} Health to
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {living.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <Commit
        campaignId={view.campaign.id}
        action={{
          type: "class.technique",
          characterId: c.id,
          ...(t.hook?.kind === "heal" ? { targetId: target } : {}),
          ...(t.chooseDrawback ? { drawback: "health" as const } : {}),
        }}
        problem={t.blocked}
        names={names}
        label={`Record ${c.name}'s ${k.technique.name} (${t.cost})`}
        onRecorded={onRecorded}
      />
    </div>
  );
}

function Held({ view, engine, names, onRecorded }: Props) {
  const held = view.characters.filter((c) => c.class);
  if (!held.length) return null;
  const clock = view.clock;
  const today = clock ? Math.floor((clock.at - clock.dawn * 60) / MINUTES_PER_DAY) : null;
  return (
    <section className="card">
      <h2>Classes held</h2>
      <p className="muted small">A class is not published: inspection never shows it, and only its holder's player sees it.</p>
      {held.map((c) => {
        const k = c.class!;
        const used = today !== null && c.classUsedDay === today;
        return (
          <div key={c.id} className="class-offer">
            <h3>
              {c.name}: {k.name}
              {k.guarded && <span className="tag attention">guarded</span>}
            </h3>
            <PackageLines engine={engine} p={k} bonus={k.bonus} />
            {k.lost ? <p className="small muted">{k.lost} of the selection bonus was lost past the stat cap.</p> : null}
            <TechniqueOutside view={view} engine={engine} names={names} onRecorded={onRecorded} c={c} />
            {k.permission.onceADay && (
              <>
                <p className="small">
                  {k.permission.name}: {today === null ? "set the clock to track it against dawn; until then you keep the count" : used ? "used since dawn" : "ready"}
                </p>
                {!used && (
                  <Commit
                    campaignId={view.campaign.id}
                    action={{ type: "class.use", characterId: c.id }}
                    names={names}
                    label={`Record ${c.name}'s use of ${k.permission.name}`}
                    onRecorded={onRecorded}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Characters due offers: at the class level, with no class and no offers standing. */
export function classesWaiting(view: GmView, engine: Engine | null): number {
  if (!engine) return 0;
  const level = engine.rules.classes.selection.level as number;
  return view.characters.filter((c) => !c.dead && c.level >= level && !c.class && !c.classOffers.length).length;
}

export function ClassesSection(props: Props) {
  const { view, engine } = props;
  if (!engine) return <p className="muted pad">Loading rules…</p>;
  const level = engine.rules.classes.selection.level as number;
  const due = view.characters.filter((c) => !c.dead && c.level >= level && !c.class && !c.classOffers.length);
  const standing = view.characters.filter((c) => c.classOffers.length);
  return (
    <main className="page">
      {due.map((c) => (
        <OfferWriter key={c.id} {...props} engine={engine} c={c} />
      ))}
      {standing.map((c) => (
        <Standing key={c.id} {...props} c={c} />
      ))}
      <Held {...props} />
      {!due.length && !standing.length && !view.characters.some((c) => c.class) && (
        <section className="card">
          <p className="muted">
            No character has reached Level {level}. At Level {level} the System offers three classes, and they are written here.
          </p>
        </section>
      )}
    </main>
  );
}
