/**
 * What the listening heard this session, in the GM's Events section: each person's lines as the
 * speech-to-text returned them, newest last. While the table talks the server drafts them a window
 * at a time (live-drafting.ts) into the drafts below, which the GM switches off or runs now; the
 * GM can instead put the lines not yet drafted into the drafting box, where they read as typed
 * talk does (a time, a name, the words). Players never see these.
 */
import {
  WINDOW_LINES,
  WINDOW_QUIET_MS,
} from "@gradebreaker/listening/window-sizes";
import type { GmView, HeardLine } from "@gradebreaker/record";
import { useEffect, useRef, useState } from "react";
import { draftHeardNow, setLiveDrafting } from "../api.ts";
import type { DraftRuns } from "./Drafts.tsx";
import { useAiConfigured } from "./useAi.ts";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export function HeardCard({
  view,
  heard,
  drafts,
  onUse,
}: {
  view: GmView;
  heard: HeardLine[];
  drafts: DraftRuns;
  onUse: (text: string) => void;
}) {
  // The view lists sessions newest first: the running one, or the last to end.
  const session = view.sessions.find((s) => !s.endedAt) ?? view.sessions[0];
  const lines = session ? heard.filter((l) => l.sessionId === session.id) : [];
  const [usedThrough, setUsedThrough] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const configured = useAiConfigured(view.campaign.id);
  const speaker = (userId: string) =>
    view.members.find((m) => m.userId === userId)?.displayName ?? "Someone";
  // Lines are drafted in the order they were stored: through the last window's line, or put in the box by hand.
  const draftedThrough = Math.max(
    0,
    ...drafts.runs
      .filter((r) => r.talk.heard?.sessionId === session?.id)
      .map((r) => r.talk.heard!.through),
  );
  const through = Math.max(draftedThrough, usedThrough);
  const drafted = (l: HeardLine) => Number(l.id) <= through;
  const fresh = lines.filter((l) => !drafted(l));
  const on = drafts.live?.on ?? false;

  const toggle = async () => {
    setError(null);
    try {
      drafts.setLive((await setLiveDrafting(view.campaign.id, !on)).live);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const now = async () => {
    setBusy(true);
    setError(null);
    try {
      await draftHeardNow(view.campaign.id);
      await drafts.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80)
      el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  if (!session) return null;
  return (
    <section className="card heard">
      <h2>Heard this session</h2>
      {lines.length === 0 ? (
        <p className="muted">
          Nothing yet. Lines appear here while the table listens.
        </p>
      ) : (
        <ol className="heard-lines" ref={list}>
          {lines.map((l) => (
            <li key={l.id} className={drafted(l) ? "used" : ""}>
              <span className="muted small">{time(l.startedAt)}</span>{" "}
              <strong>{speaker(l.userId)}:</strong> {l.text}
            </li>
          ))}
        </ol>
      )}
      <div className="row">
        {configured === false ? (
          <span className="muted small">
            Drafting from these needs the campaign's key (the AI card in the
            Table section). Kept 30 days, then deleted.
          </span>
        ) : (
          <>
            {drafts.live && (
              <label className="check">
                <input type="checkbox" checked={on} onChange={toggle} /> Draft
                as the table talks
              </label>
            )}
            <button
              disabled={!fresh.length || busy || drafts.drafting}
              onClick={now}
            >
              Draft {fresh.length || "no"} new line
              {fresh.length === 1 ? "" : "s"} now
            </button>
            {!on && (
              <button
                disabled={!fresh.length}
                onClick={() => {
                  onUse(
                    fresh
                      .map(
                        (l) =>
                          `${time(l.startedAt)} ${speaker(l.userId)}: ${l.text}`,
                      )
                      .join("\n"),
                  );
                  setUsedThrough(Math.max(...fresh.map((l) => Number(l.id))));
                }}
              >
                Put them in the drafting box
              </button>
            )}
          </>
        )}
      </div>
      {configured !== false && (
        <p className="muted small">
          {on
            ? `Drafted at a pause of ${WINDOW_QUIET_MS / 1000} s once ${WINDOW_LINES} new lines have arrived, and when the listening pauses or stops. `
            : ""}
          Kept 30 days, then deleted.
        </p>
      )}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
