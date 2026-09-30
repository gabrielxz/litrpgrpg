/**
 * "Set up the table" on a new campaign's Party section (the makeover canvas's first run): invite
 * players, start a session, set the clock. Each step shows done once the record shows it, and the
 * panel goes when all three are done or the GM hides it (kept in this browser only: a table that
 * keeps no clock never sets one).
 */
import type { GmView } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { Icon } from "../ui.tsx";

/** Asks the table bar to open one of its forms (Sessions.tsx and Clock.tsx listen). */
export const TABLEBAR_OPEN = "gb:tablebar-open";
export const openTablebar = (form: "start" | "set") => window.dispatchEvent(new CustomEvent(TABLEBAR_OPEN, { detail: form }));

/** Opens a table bar form when the checklist asks for it. */
export function useTablebarOpen(form: "start" | "set", open: () => void) {
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent).detail === form) open();
    };
    window.addEventListener(TABLEBAR_OPEN, on);
    return () => window.removeEventListener(TABLEBAR_OPEN, on);
  });
}

const hiddenKey = (campaignId: string) => `gradebreaker.setupHidden.${campaignId}`;
const readHidden = (campaignId: string) => {
  try {
    return window.localStorage.getItem(hiddenKey(campaignId)) === "1";
  } catch {
    return false;
  }
};

export function SetupChecklist({ view, onTable }: { view: GmView; onTable: () => void }) {
  const [hidden, setHidden] = useState(() => readHidden(view.campaign.id));
  const steps = [
    {
      title: "Invite players",
      text: "Make an invite link in the Table section and send it. Each link lets whoever holds it join as a player. Players can build their own characters once they join.",
      done: view.members.some((m) => m.role === "player"),
      act: (
        <button className="btn-link small" type="button" onClick={onTable}>
          Go to the Table
        </button>
      ),
    },
    {
      title: "Start a session",
      text: "Name it, or keep Session 1, and tick who is at the table.",
      done: view.sessions.length > 0,
      act: (
        <button className="btn btn--sm" type="button" onClick={() => openTablebar("start")}>
          <Icon name="session" />
          Start a session
        </button>
      ),
    },
    {
      title: "Set the clock",
      text: "Set the day, the hour, and the hour of dawn where the party is. Day 1 is the day of Integration.",
      done: view.clock !== null,
      act: (
        <button className="btn btn--sm" type="button" onClick={() => openTablebar("set")}>
          <Icon name="time" />
          Set the clock
        </button>
      ),
    },
  ];
  if (hidden || steps.every((s) => s.done)) return null;
  const hide = () => {
    try {
      window.localStorage.setItem(hiddenKey(view.campaign.id), "1");
    } catch {
      // Storage refused: hidden until the page reloads.
    }
    setHidden(true);
  };
  return (
    <section className="panel table-setup" aria-labelledby="setup-h">
      <div className="panel__head">
        <h2 id="setup-h">Set up the table</h2>
        <span className="grow" />
        <a className="btn-link small dim" href="/guide/gm-setup" target="_blank" rel="noreferrer">
          Guide
        </a>
        <button className="btn-link small dim" type="button" onClick={hide}>
          Hide
        </button>
      </div>
      <ol className="table-setup__steps">
        {steps.map((s, i) => (
          <li key={s.title} className={`table-setup__step${s.done ? " table-setup__step--done" : ""}`}>
            <span className="num table-setup__num">{s.done ? <Icon name="confirm" /> : i + 1}</span>
            <h3>{s.title}</h3>
            <p className="small dim">{s.text}</p>
            <div>{s.done ? <span className="tag tag--ok">Done</span> : s.act}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
