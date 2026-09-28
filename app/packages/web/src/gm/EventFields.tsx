/**
 * The event editor the GM's Events section shares between logging by hand and reviewing a
 * draft: what happened, the context, the characters in it, an HVE entry per character, and the
 * GM's notes. Both produce the same `event.log` action.
 */
import type { Engine } from "@gradebreaker/engine";
import { type GmView, type HveEntry, type LogEvent, axes, intensities, weights } from "@gradebreaker/record";

/** An intensity as the table reads it: the sweep's weight name, or the reminder tier. */
export function intensityName(engine: Engine, n: number): string {
  const w = weights(engine).find((x) => x.tallies === n);
  return w ? `${n}: ${w.name}` : `${n}: below the sweep's threshold (a reminder)`;
}

export interface EventValue {
  summary: string;
  context: string;
  notes: string;
  participants: string[];
  entries: Record<string, HveEntry>;
}

export const emptyEvent = (): EventValue => ({ summary: "", context: "", notes: "", participants: [], entries: {} });

export function eventValueOf(a: LogEvent): EventValue {
  return {
    summary: a.summary,
    context: a.context ?? "",
    notes: a.notes ?? "",
    participants: [...a.participants],
    entries: Object.fromEntries((a.entries ?? []).map((x) => [x.characterId, x])),
  };
}

/** The action the editor describes, or null until it says what happened. */
export function eventActionOf(v: EventValue): LogEvent | null {
  if (!v.summary.trim()) return null;
  const chosen = v.participants.filter((id) => v.entries[id]).map((id) => v.entries[id]!);
  return {
    type: "event.log",
    summary: v.summary.trim(),
    participants: v.participants,
    ...(v.context.trim() ? { context: v.context.trim() } : {}),
    ...(v.notes.trim() ? { notes: v.notes.trim() } : {}),
    ...(chosen.length ? { entries: chosen } : {}),
  };
}

function EntryFields({ engine, entry, onChange }: { engine: Engine; entry: HveEntry; onChange: (x: HveEntry) => void }) {
  const ax = axes(engine);
  const axisOf = (p: string) => ax.find((a) => a.poles.includes(p))!.name;
  const set = (patch: Partial<HveEntry>) => {
    const next: HveEntry = { ...entry, ...patch };
    if (next.secondary === "" || (next.secondary && (next.intensity < 2 || axisOf(next.secondary) === axisOf(next.pole)))) delete next.secondary;
    if (next.intent === "") delete next.intent;
    if (next.outcome === "") delete next.outcome;
    if (!next.coercion) delete next.coercion;
    onChange(next);
  };
  return (
    <div className="moment-form">
      <label>
        Side
        <select value={entry.pole} onChange={(e) => set({ pole: e.target.value })}>
          {ax.map((a) => (
            <optgroup key={a.name} label={a.name}>
              {a.poles.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label>
        Intensity
        <select value={entry.intensity} onChange={(e) => set({ intensity: Number(e.target.value) })}>
          {intensities(engine).map((n) => (
            <option key={n} value={n}>
              {intensityName(engine, n)}
            </option>
          ))}
        </select>
      </label>
      <label title="A moment that clearly reads on two axes tallies its secondary one weight lower">
        Also reads on
        <select value={entry.secondary ?? ""} disabled={entry.intensity < 2} onChange={(e) => set({ secondary: e.target.value })}>
          <option value="">nothing else</option>
          {ax
            .filter((a) => a.name !== axisOf(entry.pole))
            .map((a) => (
              <optgroup key={a.name} label={a.name}>
                {a.poles.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
      </label>
      <label className="grow">
        Intent
        <input value={entry.intent ?? ""} maxLength={300} onChange={(e) => set({ intent: e.target.value })} placeholder="What they were after" />
      </label>
      <label className="grow">
        Outcome
        <input value={entry.outcome ?? ""} maxLength={300} onChange={(e) => set({ outcome: e.target.value })} placeholder="What came of it" />
      </label>
      <label className="check">
        <input type="checkbox" checked={Boolean(entry.coercion)} onChange={(e) => set({ coercion: e.target.checked })} />
        Coercion of a player character
      </label>
    </div>
  );
}

export function EventFields({
  view,
  engine,
  value,
  onChange,
  why,
}: {
  view: GmView;
  engine: Engine;
  value: EventValue;
  onChange: (v: EventValue) => void;
  /** The drafter's reason for each character's entry, shown under it. */
  why?: Record<string, string>;
}) {
  const shown = view.characters.filter((c) => !c.dead || value.participants.includes(c.id));
  const first = axes(engine)[0]!.poles[0];
  const set = (patch: Partial<EventValue>) => onChange({ ...value, ...patch });
  const toggle = (id: string, on: boolean) => {
    const { [id]: _, ...rest } = value.entries;
    set(on ? { participants: [...value.participants, id] } : { participants: value.participants.filter((p) => p !== id), entries: rest });
  };
  return (
    <div className="form">
      <label>
        What happened
        <input value={value.summary} maxLength={300} onChange={(e) => set({ summary: e.target.value })} placeholder="Took the party's only healing pill while the others argued" />
      </label>
      <label>
        Context
        <input value={value.context} maxLength={300} onChange={(e) => set({ context: e.target.value })} placeholder="Recycling Node loot split" />
      </label>
      <fieldset className="participants">
        <legend>Who was in it</legend>
        {shown.length === 0 && <p className="muted">No characters yet.</p>}
        {shown.map((c) => (
          <div key={c.id} className="participant">
            <label className="check">
              <input type="checkbox" checked={value.participants.includes(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} />
              {c.name}
            </label>
            {value.participants.includes(c.id) && (
              <label className="check small">
                <input
                  type="checkbox"
                  checked={Boolean(value.entries[c.id])}
                  onChange={(e) => {
                    const { [c.id]: _, ...rest } = value.entries;
                    set({ entries: e.target.checked ? { ...value.entries, [c.id]: { characterId: c.id, pole: first, intensity: weights(engine)[0]!.tallies } } : rest });
                  }}
                />
                HVE entry
              </label>
            )}
            {value.entries[c.id] && <EntryFields engine={engine} entry={value.entries[c.id]!} onChange={(x) => set({ entries: { ...value.entries, [c.id]: x } })} />}
            {value.entries[c.id] && why?.[c.id] && <p className="muted small why">Drafted because: {why[c.id]}</p>}
          </div>
        ))}
      </fieldset>
      <label>
        GM notes
        <textarea value={value.notes} maxLength={2000} rows={2} onChange={(e) => set({ notes: e.target.value })} />
      </label>
    </div>
  );
}
