/**
 * The GM's side of the inventory: grant items to a character or the spoils, remove what was
 * used up or lost, and hand out the spoils when the table has divided them.
 */
import type { Engine } from "@gradebreaker/engine";
import type { Action, Envelope, GmView, Stack } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import { catalogNames, stackLine } from "../items.ts";
import type { Names } from "../text.ts";
import { Commit } from "./Commit.tsx";

const SPOILS = "spoils";

/** Grant items, or take them away. */
export function ItemsForm({ view, engine, names, onRecorded }: { view: GmView; engine: Engine; names: Names; onRecorded: (env: Envelope) => void }) {
  const [mode, setMode] = useState<"give" | "remove">("give");
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
      <div className="row">
        <label>
          <input type="radio" checked={mode === "give"} onChange={() => setMode("give")} /> Give
        </label>
        <label>
          <input type="radio" checked={mode === "remove"} onChange={() => setMode("remove")} /> Used up or lost
        </label>
      </div>
      <div className="row">
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
    <article className="sheet-card spoils">
      <header>
        <h3>The spoils</h3>
        <span className="muted small">Players can claim these on their screens.</span>
      </header>
      <ul className="items">
        {spoils.map((s) => (
          <li key={s.name}>
            {stackLine(s)}
            {living.length > 0 && (
              <>
                <select value={to[s.name] ?? living[0]!.id} onChange={(e) => setTo({ ...to, [s.name]: e.target.value })} aria-label={`Who gets ${s.name}`}>
                  {living.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button onClick={() => give(s)}>Give one</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </article>
  );
}
