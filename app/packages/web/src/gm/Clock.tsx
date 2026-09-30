/**
 * The in-game clock on the GM's bar: the day and hour, an hour forward and to the next dawn at a
 * click (undo from the campaign log), and forms to advance by any span or set the clock. Nothing
 * here reaches a player.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type Envelope, type GmView, MINUTES_PER_DAY, clockLine, dayOf, toNextDawn } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import { type Names, duration } from "../text.ts";
import { Commit } from "./Commit.tsx";

function AdvanceForm({ view, names, onRecorded }: { view: GmView; names: Names; onRecorded: (env: Envelope) => void }) {
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const ok = Number.isInteger(total) && total > 0;
  return (
    <div className="form">
      <div className="form-row tight">
        <label>
          Hours
          <input type="number" min={0} value={hours} onChange={(e) => setHours(e.target.value)} />
        </label>
        <label>
          Minutes
          <input type="number" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </label>
      </div>
      <Commit
        campaignId={view.campaign.id}
        action={ok ? { type: "clock.advance", minutes: total } : null}
        problem={ok ? null : "How far forward?"}
        names={names}
        label={ok ? `Forward ${duration(total)}` : "Forward"}
        onRecorded={onRecorded}
      />
    </div>
  );
}

function SetForm({ view, engine, names, onRecorded }: { view: GmView; engine: Engine; names: Names; onRecorded: (env: Envelope) => void }) {
  const now = view.clock;
  const [day, setDay] = useState(String(now ? dayOf(now.at) : 1));
  const [hour, setHour] = useState(String(now ? Math.floor((now.at % MINUTES_PER_DAY) / 60) : 8));
  const [minute, setMinute] = useState(String(now ? now.at % 60 : 0));
  const rulesDawn = engine.rules.classes.permission.dawn_hour as number;
  const [dawn, setDawn] = useState(String(now?.dawn ?? rulesDawn));
  const action: Action = {
    type: "clock.set",
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    ...(Number(dawn) !== rulesDawn ? { dawnHour: Number(dawn) } : {}),
  };
  return (
    <div className="form">
      <div className="form-row tight">
        <label>
          Day
          <input type="number" min={1} value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <label>
          Hour
          <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(e.target.value)} />
        </label>
        <label>
          Minute
          <input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(e.target.value)} />
        </label>
        <label title={`Where the party is; the rules read dawn at ${String(rulesDawn).padStart(2, "0")}:00`}>
          Dawn at hour
          <input type="number" min={0} max={23} value={dawn} onChange={(e) => setDawn(e.target.value)} />
        </label>
      </div>
      <p className="muted small">Day 1 is the day of Integration.</p>
      <Commit campaignId={view.campaign.id} action={action} names={names} label="Set the clock" onRecorded={onRecorded} />
    </div>
  );
}

export function ClockControls({
  view,
  engine,
  names,
  onRecorded,
}: {
  view: GmView;
  engine: Engine | null;
  names: Names;
  onRecorded: (env: Envelope) => void;
}) {
  const [open, setOpen] = useState<"advance" | "set" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clock = view.clock;
  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      onRecorded((await submit(view.campaign.id, newActionId(), action)).envelope);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (p: typeof open) => setOpen(open === p ? null : p);
  const recorded = (env: Envelope) => {
    setOpen(null);
    onRecorded(env);
  };
  const dawnIn = clock ? toNextDawn(clock) : 0;
  return (
    <>
      <div className="tablebar__part clock">
        <i className="ic ic-time dim" aria-hidden="true" />
        {clock ? (
          <>
            <span className="tablebar__big">{clockLine(clock.at)}</span>
            <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "clock.advance", minutes: 60 })}>
              Forward 1 hour
            </button>
            <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "clock.advance", minutes: dawnIn })} title={`Dawn at ${String(clock.dawn).padStart(2, "0")}:00`}>
              Forward to dawn ({duration(dawnIn)})
            </button>
            <button className="btn btn--sm" aria-expanded={open === "advance"} onClick={() => toggle("advance")}>
              Forward…
            </button>
            <button className="btn btn--sm" aria-expanded={open === "set"} onClick={() => toggle("set")}>
              Set…
            </button>
          </>
        ) : (
          <>
            <span className="dim">No in-game clock.</span>
            <button className="btn btn--sm" aria-expanded={open === "set"} onClick={() => toggle("set")}>
              Set the clock
            </button>
          </>
        )}
        {error && <span className="error">{error}</span>}
      </div>
      {open === "advance" && clock && (
        <div className="tablebar__drawer">
          <AdvanceForm view={view} names={names} onRecorded={recorded} />
        </div>
      )}
      {open === "set" && engine && (
        <div className="tablebar__drawer">
          <SetForm view={view} engine={engine} names={names} onRecorded={recorded} />
        </div>
      )}
    </>
  );
}
