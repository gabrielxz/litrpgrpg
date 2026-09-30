/**
 * The GM's Principles section (The Principle System): the Battle Memory Cards the rules make due,
 * to grant or (for a Downing that taught nothing) withhold; cards granted from the fiction; and,
 * per character, the meditation on a held card, Insight from the other sources, naming the
 * Principle a family crystallizes into, and Distillation (in the player's words, or on the Quiet
 * Path as an offer the player confirms). Players see their cards, Insight, and Principle.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Envelope, type GmView, type Sheet, families, ipSources, weights } from "@gradebreaker/record";
import { useState } from "react";
import { type DistillationReading, type VisionDraft, draftDistillation, draftVision } from "../api.ts";
import type { Names } from "../text.ts";
import { TableWords } from "./TableWords.tsx";
import { Commit } from "./Commit.tsx";
import { useAiConfigured } from "./useAi.ts";

type Props = { view: GmView; engine: Engine; names: Names; onRecorded: (env: Envelope) => void };

/** The family the character's Deep leads toward, as a default for an award. */
function leadingFamily(engine: Engine, c: Sheet): string {
  const fam = families(engine);
  const lead = [...c.hve.leads].sort((a, b) => b.by - a.by).find((l) => l.pole);
  return fam.find((f) => f.pole === lead?.pole)?.name ?? fam[0]!.name;
}

function FamilySelect({ engine, value, onChange }: { engine: Engine; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      Family
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {families(engine).map((f) => (
          <option key={f.name} value={f.name}>
            {f.name} ({f.pole})
          </option>
        ))}
      </select>
    </label>
  );
}

/** The cards the rules make due, granted with the card's words or withheld. */
export function MemoriesDueCard({ view, names, onRecorded }: Omit<Props, "engine">) {
  const due = view.characters.flatMap((c) => c.principles.due.map((d) => ({ c, d })));
  const [text, setText] = useState<Record<string, string>>({});
  if (!due.length) return null;
  return (
    <section className="card">
      <h2>Battle Memory Cards due</h2>
      {due.map(({ c, d }) => (
        <div key={d.key} className="due-memory">
          <p>
            <strong>{c.name}</strong>: {d.label}
            {d.reason === "downed" && <span className="muted small"> (withhold it if the Downing taught nothing)</span>}
          </p>
          <label>
            What the card says
            <input value={text[d.key] ?? ""} maxLength={300} onChange={(e) => setText({ ...text, [d.key]: e.target.value })} placeholder="The moment, in a line" />
          </label>
          <Commit
            campaignId={view.campaign.id}
            action={text[d.key]?.trim() ? { type: "memory.grant", characterId: c.id, text: text[d.key]!.trim(), due: d.key } : null}
            problem={text[d.key]?.trim() ? null : "Write the card."}
            names={names}
            label={`Grant ${c.name} the card`}
            onRecorded={onRecorded}
          />
          {d.reason === "downed" && (
            <Commit campaignId={view.campaign.id} action={{ type: "memory.pass", characterId: c.id, due: d.key }} names={names} label="Withhold it" onRecorded={onRecorded} />
          )}
        </div>
      ))}
    </section>
  );
}

function GrantForm({ view, names, onRecorded }: Omit<Props, "engine">) {
  const living = view.characters.filter((c) => !c.dead);
  const [who, setWho] = useState(living[0]?.id ?? "");
  const [text, setText] = useState("");
  if (!living.length) return null;
  return (
    <section className="card">
      <h2>Grant a Battle Memory</h2>
      <p className="muted small">For a moment of extreme stress the System deems statistically improbable.</p>
      <div className="form">
        <label>
          Character
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            {living.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          What the card says
          <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Held the slab while the ceiling came down" />
        </label>
      </div>
      <Commit
        campaignId={view.campaign.id}
        action={text.trim() ? { type: "memory.grant", characterId: who, text: text.trim() } : null}
        problem={text.trim() ? null : "Write the card."}
        names={names}
        label="Grant the card"
        onRecorded={(env) => {
          setText("");
          onRecorded(env);
        }}
      />
    </section>
  );
}

function MeditateForm({ view, engine, names, onRecorded, c, memoryId }: Props & { c: Sheet; memoryId: string }) {
  const row = ipSources(engine).find((s) => s.source === "Battle Memory meditation")!;
  const [family, setFamily] = useState(leadingFamily(engine, c));
  const [ip, setIp] = useState(row.ip_min);
  const [words, setWords] = useState("");
  const [vision, setVision] = useState("");
  const procedure = engine.rules.principles.visions.procedure as string;
  const ai = useAiConfigured(view.campaign.id);
  const [drafted, setDrafted] = useState<VisionDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const draft = async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const { draft: d } = await draftVision(view.campaign.id, { characterId: c.id, memoryId, family, words: words.trim() });
      setVision(d.vision);
      setIp(Math.min(Math.max(d.ip, row.ip_min), row.ip_max));
      setDrafted(d);
    } catch (e) {
      setDraftError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  };
  // The drafter's reason and flags hold for its text; an edit leaves the table-words warning.
  const note = drafted && drafted.vision === vision.trim() ? drafted : null;
  const flags = note?.flags.filter((f) => !f.startsWith("table word")) ?? [];
  return (
    <div className="form">
      <div className="row tight">
        <FamilySelect engine={engine} value={family} onChange={setFamily} />
        <label>
          Insight
          <select value={ip} onChange={(e) => setIp(Number(e.target.value))}>
            {Array.from({ length: row.ip_max - row.ip_min + 1 }, (_, i) => row.ip_min + i).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        What the player said
        <input value={words} maxLength={500} onChange={(e) => setWords(e.target.value)} placeholder="What they felt, noticed, or glimpsed" />
      </label>
      <label title={procedure}>
        The System's vision
        <textarea value={vision} maxLength={1000} rows={2} onChange={(e) => setVision(e.target.value)} placeholder="Three images: the moment with one detail changed, the Principle in a pure or alien form, one image that misleads" />
      </label>
      {ai && (
        <div className="row">
          <button disabled={drafting} onClick={draft}>
            {drafting ? "Drafting…" : "Draft the vision"}
          </button>
          <span className="muted small">From the card, the family, and what the player said; it proposes the Insight too.</span>
        </div>
      )}
      {draftError && <p className="error">{draftError}</p>}
      {note && <p className="muted small">{note.why}</p>}
      {flags.length > 0 && <p className="warning small">The draft may break the voice: {flags.join(", ")}.</p>}
      <TableWords text={vision} />
      <Commit
        campaignId={view.campaign.id}
        action={{ type: "memory.meditate", characterId: c.id, memoryId, family, ip, ...(words.trim() ? { words: words.trim() } : {}), ...(vision.trim() ? { vision: vision.trim() } : {}) }}
        names={names}
        label="Record the meditation"
        onRecorded={onRecorded}
      />
    </div>
  );
}

function AwardForm({ view, engine, names, onRecorded, c }: Props & { c: Sheet }) {
  const sources = ipSources(engine).filter((s) => s.source !== "Battle Memory meditation");
  const [source, setSource] = useState(sources[0]!.source);
  const row = sources.find((s) => s.source === source)!;
  const [family, setFamily] = useState(leadingFamily(engine, c));
  const [ip, setIp] = useState(row.ip_min);
  const amount = Math.min(Math.max(ip, row.ip_min), row.ip_max);
  return (
    <details>
      <summary>Award Insight</summary>
      <div className="form">
        <label>
          Source
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {sources.map((s) => (
              <option key={s.source} value={s.source}>
                {s.source} ({s.ip_min === s.ip_max ? s.ip_min : `${s.ip_min} to ${s.ip_max}`})
              </option>
            ))}
          </select>
        </label>
        <div className="row tight">
          <FamilySelect engine={engine} value={family} onChange={setFamily} />
          <label>
            Insight
            <select value={amount} onChange={(e) => setIp(Number(e.target.value))}>
              {Array.from({ length: row.ip_max - row.ip_min + 1 }, (_, i) => row.ip_min + i).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Commit
          campaignId={view.campaign.id}
          action={{ type: "insight.award", characterId: c.id, source, family, ip: amount }}
          names={names}
          label={`Award ${amount} Insight`}
          onRecorded={onRecorded}
        />
      </div>
    </details>
  );
}

function NameForm({ view, engine, names, onRecorded, c, family }: Props & { c: Sheet; family: string }) {
  const [name, setName] = useState("");
  const [passive, setPassive] = useState("");
  const circledWeights = new Set(weights(engine).filter((w) => w.circled).map((w) => w.tallies));
  const circled = c.hve.sweeps.flatMap((s) => s.moments.filter((m) => circledWeights.has(m.weight) && m.note).map((m) => m.note!));
  const words = c.principles.memories.filter((m) => m.meditation?.family === family && m.meditation.words).map((m) => m.meditation!.words!);
  return (
    <div className="crystallizing">
      <p>
        <strong>{family}</strong> has reached {engine.rules.principles.crystallizes_at_ip} Insight: name the Principle. Say it to the player first; they may ask
        once for another reading.
      </p>
      {circled.length > 0 && <p className="small">Circled: {circled.join(" · ")}</p>}
      {words.length > 0 && <p className="small">In the player's words: {words.join(" · ")}</p>}
      <div className="form">
        <label>
          Principle
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Weight" />
        </label>
        <TableWords text={name} />
        <label>
          Minor passive
          <input value={passive} maxLength={300} onChange={(e) => setPassive(e.target.value)} placeholder={engine.rules.principles.initial_insight_passive_example} />
        </label>
      </div>
      <Commit
        campaignId={view.campaign.id}
        action={name.trim() ? { type: "principle.name", characterId: c.id, family, name: name.trim(), ...(passive.trim() ? { passive: passive.trim() } : {}) } : null}
        problem={name.trim() ? null : "Name it: the plainer word."}
        names={names}
        label={name.trim() ? `Name it ${name.trim()}` : "Name it"}
        onRecorded={onRecorded}
      />
    </div>
  );
}

function DistillForm({ view, engine, names, onRecorded, c, x, refine }: Props & { c: Sheet; x: Sheet["principles"]["principles"][number]; refine: boolean }) {
  const [quiet, setQuiet] = useState(false);
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [grant, setGrant] = useState("");
  const [text, setText] = useState("");
  const [attune, setAttune] = useState("");
  const [rename, setRename] = useState("");
  const tier = refine ? x.tier : x.next?.tier;
  const ai = useAiConfigured(view.campaign.id);
  const [words, setWords] = useState("");
  const [drafted, setDrafted] = useState<{ readings: DistillationReading[]; attunements?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = async () => {
    setBusy(true);
    setError(null);
    try {
      setDrafted((await draftDistillation(view.campaign.id, { characterId: c.id, family: x.family, ...(words.trim() ? { words: words.trim() } : {}), ...(refine ? { refine: true } : {}) })).draft);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  /** A reading into the form: the articulation, its second phrasing on the Quiet Path, and its grant. */
  const take = (r: DistillationReading) => {
    setA1(r.articulation);
    setA2(r.phrasing);
    if (refine) setRename(r.name);
    else {
      setGrant(r.name);
      setText(r.effect);
      if (drafted?.attunements) setAttune(drafted.attunements);
    }
  };
  const articulations = [a1, ...(quiet ? [a2] : [])].map((s) => s.trim()).filter(Boolean);
  const test = (engine.rules.principles.distillation_test as string[]).join(", ");
  const problem = !articulations.length ? "State the articulation." : refine && !rename.trim() ? "Name the new identity." : null;
  return (
    <div className="form">
      <p className="small">
        {refine ? `Reshaping at ${x.tier}: same slot, same Insight, a shifted identity.` : `Distillation to ${tier}.`} The articulation must be {test}.
      </p>
      {ai && (
        <div className="panel">
          <label>
            What the player has said (optional)
            <input className="wide" value={words} maxLength={2000} onChange={(e) => setWords(e.target.value)} placeholder="I hit stuff, and I stand in front of people?" />
          </label>
          <div className="row">
            <button disabled={busy} onClick={draft}>
              {busy ? "Drafting…" : drafted ? "Draft again" : "Draft two readings"}
            </button>
            <span className="muted small">From the circled moments, the meditations, and the player's words.</span>
          </div>
          {error && <p className="error">{error}</p>}
          {drafted && (
            <ol className="small">
              {drafted.readings.map((r, i) => (
                <li key={i}>
                  <strong>{r.articulation}</strong> <span className="muted">Or: {r.phrasing}</span>
                  <br />
                  {refine ? "New identity" : "Grant"}: {r.name}. {r.effect}
                  <br />
                  <span className="muted">
                    Does: {r.test.operational}. Stops: {r.test.bounded}. Seen: {r.test.testable}.
                  </span>
                  {r.flags.map((f) => (
                    <p key={f} className="warning small">
                      {f}
                    </p>
                  ))}
                  <div>
                    <button className="link" onClick={() => take(r)}>
                      Use this reading
                    </button>
                  </div>
                </li>
              ))}
              {drafted.attunements && <li className="muted">Attunements: {drafted.attunements}</li>}
            </ol>
          )}
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> The Quiet Path: offer it for the player to confirm
      </label>
      <label>
        {quiet ? "Phrasing one" : "The articulation"}
        <input value={a1} maxLength={500} onChange={(e) => setA1(e.target.value)} placeholder="The mountain does not strike. It arrives." />
      </label>
      {quiet && (
        <label>
          Phrasing two (optional)
          <input value={a2} maxLength={500} onChange={(e) => setA2(e.target.value)} />
        </label>
      )}
      <label>
        {refine ? "New identity" : "Broadened name (optional)"}
        <input value={rename} maxLength={60} onChange={(e) => setRename(e.target.value)} placeholder={refine ? "Consuming Flame" : "Gravity"} />
      </label>
      <TableWords text={rename} />
      {!refine && (
        <>
          <label>
            {tier === "Mid Fragment" ? "Infusion: what the Principle's force means" : tier === "Peak Fragment" ? "Domain" : "Application"}
            <input value={grant} maxLength={80} onChange={(e) => setGrant(e.target.value)} placeholder={tier === "Seed" ? "Searing Strike" : ""} />
          </label>
          <TableWords text={grant} />
          <label>
            Effect
            <textarea value={text} maxLength={1000} rows={2} onChange={(e) => setText(e.target.value)} placeholder="Within the Modifier Budget: +5 minor, +10 standard, +15 to +20 peak" />
          </label>
          {tier === "Seed" && (
            <label>
              Attunements beyond the baseline
              <input value={attune} maxLength={1000} onChange={(e) => setAttune(e.target.value)} />
            </label>
          )}
        </>
      )}
      <Commit
        campaignId={view.campaign.id}
        action={
          problem
            ? null
            : {
                type: "principle.distill",
                characterId: c.id,
                family: x.family,
                articulations,
                ...(quiet ? { quiet: true } : {}),
                ...(refine ? { refine: true } : {}),
                ...(rename.trim() ? { rename: rename.trim() } : {}),
                ...(grant.trim() ? { name: grant.trim() } : {}),
                ...(text.trim() ? { text: text.trim() } : {}),
                ...(attune.trim() ? { attunements: attune.trim() } : {}),
              }
        }
        problem={problem}
        names={names}
        label={quiet ? "Offer it" : refine ? "Reshape" : `Distill to ${tier}`}
        onRecorded={onRecorded}
      />
    </div>
  );
}

function CharacterCard(props: Props & { c: Sheet }) {
  const { engine, c } = props;
  const p = c.principles;
  const held = p.memories.filter((m) => !m.meditation);
  const rested = (afterRests: number) => (c.counters.consolidations ?? 0) > afterRests;
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (k: string) => setOpen(open === k ? null : k);
  return (
    <section className="card">
      <h3>
        {c.name}
        {c.dead && <span className="tag danger">dead</span>}
      </h3>
      {p.principles.map((x) => (
        <div key={x.family} className="principle-entry">
          <div>
            <strong>{x.name}</strong> <span className="muted small">{x.family} · {x.tier}</span>
          </div>
          <div className="small">
            Insight {x.ip}
            {x.next ? `/${x.next.ip} for ${x.next.tier}` : ""}
            {x.distillable && <span className="tag attention">Distillation available</span>}
            {x.offer && <span className="tag">offered, waiting on the player</span>}
          </div>
          {x.passive && <div className="small">{x.passive}</div>}
          {x.grants.map((g) => (
            <div key={g.id} className="small grant">
              {g.tier}: {g.kind === "refinement" ? `reshaped from ${g.from}` : (g.name ?? g.kind)}
              {g.aether ? ` · ${g.aether} Aether` : ""} · <em>{g.articulation}</em>
            </div>
          ))}
          {!c.dead && !x.offer && (
            <div className="row tight">
              {x.distillable && <button onClick={() => toggle(`d:${x.family}`)}>Distill</button>}
              <button onClick={() => toggle(`r:${x.family}`)}>Reshape</button>
            </div>
          )}
          {open === `d:${x.family}` && x.distillable && !x.offer && <DistillForm {...props} x={x} refine={false} />}
          {open === `r:${x.family}` && !x.offer && <DistillForm {...props} x={x} refine={true} />}
        </div>
      ))}
      {p.crystallizing && !c.dead && <NameForm {...props} family={p.crystallizing} />}
      {Object.entries(p.insight)
        .filter(([f, ip]) => ip > 0 && !p.principles.some((x) => x.family === f))
        .map(([f, ip]) => (
          <div key={f} className="small">
            Resonance: {f} {ip}/{engine.rules.principles.crystallizes_at_ip}
          </div>
        ))}
      {held.length > 0 && (
        <>
          <h4>Battle Memories held</h4>
          <ul className="moments">
            {held.map((m) => (
              <li key={m.id}>
                {m.text} <span className="muted small">({m.source})</span>
                {m.chosen && <span className="tag attention">chosen</span>}{" "}
                {rested(m.afterRests) ? (
                  !c.dead && (
                    <button className="link" onClick={() => toggle(`m:${m.id}`)}>
                      meditation
                    </button>
                  )
                ) : (
                  <span className="muted small">meditation at a later Consolidation</span>
                )}
                {open === `m:${m.id}` && <MeditateForm {...props} memoryId={m.id} />}
              </li>
            ))}
          </ul>
        </>
      )}
      {!c.dead && <AwardForm {...props} />}
    </section>
  );
}

export function PrinciplesSection({ view, engine, names, onRecorded }: { view: GmView; engine: Engine | null; names: Names; onRecorded: (env: Envelope) => void }) {
  if (!engine) return <p className="muted pad">Loading rules…</p>;
  const props = { view, engine, names, onRecorded };
  return (
    <main className="gm">
      <div>
        <MemoriesDueCard view={view} names={names} onRecorded={onRecorded} />
        {view.characters.map((c) => (
          <CharacterCard key={c.id} {...props} c={c} />
        ))}
      </div>
      <aside className="side">
        <GrantForm view={view} names={names} onRecorded={onRecorded} />
      </aside>
    </main>
  );
}

/** What waits on the GM here: cards due, a family to name, a Distillation available. */
export function principlesWaiting(view: GmView): number {
  return view.characters.reduce(
    (n, c) => n + (c.dead ? 0 : c.principles.due.length + (c.principles.crystallizing ? 1 : 0) + c.principles.principles.filter((x) => x.distillable && !x.offer).length),
    0,
  );
}
