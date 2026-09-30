/**
 * The GM's side of the inventory: grant items to a character or the spoils, remove what was
 * used up or lost, record an Attribute Treasure absorbed, and hand out the spoils when the
 * table has divided them.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type Envelope, type GmView, type Stack, treasurePoints, treasureSizes } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import { catalogNames, stackLine } from "../items.ts";
import { ATTRIBUTES, ATTRIBUTE_NAMES, type Names } from "../text.ts";
import { Commit } from "./Commit.tsx";

const SPOILS = "spoils";

type FormProps = { view: GmView; engine: Engine; names: Names; onRecorded: (env: Envelope) => void };

/** Grant items, take them away, or record a treasure absorbed. */
export function ItemsForm(props: FormProps) {
  const [mode, setMode] = useState<"give" | "remove" | "absorb">("give");
  const modes = (
    <div className="form-row">
      <label>
        <input type="radio" checked={mode === "give"} onChange={() => setMode("give")} /> Give
      </label>
      <label>
        <input type="radio" checked={mode === "remove"} onChange={() => setMode("remove")} /> Used up or lost
      </label>
      <label>
        <input type="radio" checked={mode === "absorb"} onChange={() => setMode("absorb")} /> Attribute Treasure absorbed
      </label>
    </div>
  );
  return mode === "absorb" ? <TreasureForm {...props} modes={modes} /> : <GiveOrRemove {...props} mode={mode} modes={modes} />;
}

function GiveOrRemove({ view, engine, names, onRecorded, mode, modes }: FormProps & { mode: "give" | "remove"; modes: React.ReactNode }) {
  const [holder, setHolder] = useState(view.characters[0]?.id ?? SPOILS);
  const [name, setName] = useState("");
  const [count, setCount] = useState("1");
  const held: Stack[] = view.inventory[holder] ?? [];
  const n = Math.trunc(Number(count));
  const problem = !name.trim() ? "Name the item." : !(n >= 1) ? "A count is a whole number from 1." : null;
  const action: Action =
    mode === "give" ? { type: "item.give", to: holder, items: [{ name: name.trim(), count: n }] } : { type: "item.remove", from: holder, name: name.trim(), count: n };
  const holderLabel = holder === SPOILS ? "the spoils" : names(holder);
  return (
    <div className="form">
      {modes}
      <div className="form-row">
        <label>
          {mode === "give" ? "To" : "From"}
          <select value={holder} onChange={(e) => setHolder(e.target.value)}>
            {view.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={SPOILS}>The spoils</option>
          </select>
        </label>
        <label>
          Item
          {mode === "give" ? (
            <>
              <input list="gm-item-catalog" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lesser Healing Pill" />
              <datalist id="gm-item-catalog">
                {catalogNames(engine).map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </>
          ) : (
            <select value={name} onChange={(e) => setName(e.target.value)}>
              <option value="">Choose</option>
              {held.map((s) => (
                <option key={s.name} value={s.name}>
                  {stackLine(s)}
                </option>
              ))}
            </select>
          )}
        </label>
        <label>
          How many
          <input type="number" className="narrow-input" min={1} value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
      </div>
      <Commit
        campaignId={view.campaign.id}
        action={action}
        problem={problem}
        names={names}
        label={mode === "give" ? `Give ${holderLabel} ${name.trim() || "the item"}` : `Remove from ${holderLabel}`}
        onRecorded={onRecorded}
      />
    </div>
  );
}

/** A size named in a stack's name ("Standard Attribute Treasure"), when it names one. */
const sizeIn = (engine: Engine, name: string) => treasureSizes(engine).find((t) => new RegExp(`\\b${t.name}\\b`, "i").test(name))?.name;

/**
 * An Attribute Treasure absorbed (Items): the chosen Attribute's Raw value rises by the
 * treasure's points, past the Grade cap lost; a treasure of another Grade does nothing. The
 * hour is spent defenseless, so the record refuses it in a running fight; the clock is not moved.
 */
function TreasureForm({ view, engine, names, onRecorded, modes }: FormProps & { modes: React.ReactNode }) {
  const living = view.characters.filter((c) => !c.dead);
  const [who, setWho] = useState(living[0]?.id ?? "");
  const sheet = living.find((c) => c.id === who);
  const held: Stack[] = view.inventory[who] ?? [];
  const [item, setItem] = useState("");
  const [size, setSize] = useState(treasureSizes(engine)[1]?.name ?? treasureSizes(engine)[0]!.name);
  const [grade, setGrade] = useState(sheet?.grade ?? "F");
  const [attribute, setAttribute] = useState<string>("STR");
  const grades: string[] = engine.rules.grades.grades.map((g: { code: string }) => g.code);
  const pickItem = (name: string) => {
    setItem(name);
    const named = sizeIn(engine, name);
    if (named) setSize(named);
  };
  const pickWho = (id: string) => {
    setWho(id);
    setItem("");
    setGrade(living.find((c) => c.id === id)?.grade ?? grade);
  };
  const points = treasurePoints(engine, size, grade);
  const action: Action | null = sheet
    ? { type: "treasure.absorb", characterId: sheet.id, treasure: size, grade, attribute, ...(item ? { item } : {}) }
    : null;
  return (
    <div className="form">
      {modes}
      <div className="form-row">
        <label>
          Who absorbs it
          <select value={who} onChange={(e) => pickWho(e.target.value)}>
            {living.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From the pack
          <select value={item} onChange={(e) => pickItem(e.target.value)}>
            <option value="">Not in the pack</option>
            {held.map((s) => (
              <option key={s.name} value={s.name}>
                {stackLine(s)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-row">
        <label>
          Size
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            {treasureSizes(engine).map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} (+{treasurePoints(engine, t.name, grade)})
              </option>
            ))}
          </select>
        </label>
        <label>
          Its Grade
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            {grades.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          The Attribute the player chose
          <select value={attribute} onChange={(e) => setAttribute(e.target.value)}>
            {ATTRIBUTES.map((a) => (
              <option key={a} value={a}>
                {ATTRIBUTE_NAMES[a]} ({sheet?.raw[a] ?? "?"})
              </option>
            ))}
          </select>
        </label>
      </div>
      {sheet && grade !== sheet.grade && <p className="small warning">A {grade}-Grade treasure does nothing for {sheet.name}'s {sheet.grade}-Grade body; it is used up all the same.</p>}
      <p className="muted small">An hour spent defenseless. The clock is not moved; move it if the hour was not part of a rest.</p>
      <Commit
        campaignId={view.campaign.id}
        action={action}
        problem={sheet ? null : "Nobody living to absorb it."}
        names={names}
        label={sheet ? `${sheet.name} absorbs it: ${ATTRIBUTE_NAMES[attribute]} +${points}` : "Absorb"}
        onRecorded={onRecorded}
      />
    </div>
  );
}

/** What the party has not divided yet, with a way to hand each item out. */
export function SpoilsCard({ view, onRecorded }: { view: GmView; onRecorded: (env: Envelope) => void }) {
  const spoils = view.inventory[SPOILS] ?? [];
  const living = view.characters.filter((c) => !c.dead);
  const [to, setTo] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  if (!spoils.length) return null;
  const give = async (s: Stack) => {
    setError(null);
    try {
      const r = await submit(view.campaign.id, newActionId(), { type: "item.move", from: SPOILS, to: to[s.name] ?? living[0]!.id, name: s.name, count: 1 });
      onRecorded(r.envelope);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="panel" aria-label="The spoils">
      <div className="panel__head">
        <i className="ic ic-spoils dim" aria-hidden="true" />
        <h2>The spoils</h2>
        <span className="small dim">Players can claim these on their screens.</span>
      </div>
      <ul className="rows panel__rows">
        {spoils.map((s) => (
          <li key={s.name}>
            <span className="row__main">{stackLine(s)}</span>
            {living.length > 0 && (
              <>
                <select className="select select--sm" value={to[s.name] ?? living[0]!.id} onChange={(e) => setTo({ ...to, [s.name]: e.target.value })} aria-label={`Who gets ${s.name}`}>
                  {living.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button className="btn btn--sm" onClick={() => give(s)}>
                  Give one
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error panel__error">{error}</p>}
    </section>
  );
}
