/**
 * What the listening heard this session, in the GM's Events section: each person's lines as the
 * speech-to-text returned them, newest last. The GM puts the lines not yet used into the drafting
 * box, where they read as typed talk does (a time, a name, the words). Players never see these.
 */
import type { GmView, HeardLine } from "@gradebreaker/record";
import { useEffect, useRef, useState } from "react";
import { useAiConfigured } from "./useAi.ts";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export function HeardCard({ view, heard, onUse }: { view: GmView; heard: HeardLine[]; onUse: (text: string) => void }) {
  // The view lists sessions newest first: the running one, or the last to end.
  const session = view.sessions.find((s) => !s.endedAt) ?? view.sessions[0];
  const lines = session ? heard.filter((l) => l.sessionId === session.id) : [];
  const [usedThrough, setUsedThrough] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const configured = useAiConfigured(view.campaign.id);
  const speaker = (userId: string) => view.members.find((m) => m.userId === userId)?.displayName ?? "Someone";
  const at = usedThrough ? lines.findIndex((l) => l.id === usedThrough) + 1 : 0;
  const fresh = lines.slice(at);

  useEffect(() => {
    const el = list.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  if (!session) return null;
  return (
    <section className="card heard">
      <h2>Heard this session</h2>
      {lines.length === 0 ? (
        <p className="muted">Nothing yet. Lines appear here while the table listens.</p>
      ) : (
        <ol className="heard-lines" ref={list}>
          {lines.map((l, i) => (
            <li key={l.id} className={i < at ? "used" : ""}>
              <span className="muted small">{time(l.startedAt)}</span> <strong>{speaker(l.userId)}:</strong> {l.text}
            </li>
          ))}
        </ol>
      )}
      <div className="row">
        {configured === false ? (
          <span className="muted small">Drafting from these needs the campaign's key (the AI card in the Table section). Kept 30 days, then deleted.</span>
        ) : (
          <>
            <button
              disabled={!fresh.length}
              onClick={() => {
                onUse(fresh.map((l) => `${time(l.startedAt)} ${speaker(l.userId)}: ${l.text}`).join("\n"));
                setUsedThrough(fresh.at(-1)!.id);
              }}
            >
              Put {fresh.length || "no"} new line{fresh.length === 1 ? "" : "s"} in the drafting box
            </button>
            <span className="muted small">Kept 30 days, then deleted.</span>
          </>
        )}
      </div>
    </section>
  );
}
