import type { Effect, FeedItem, GmView } from "@gradebreaker/record";
import { useEffect, useRef, useState } from "react";

/**
 * The moments (Decisions, "the makeover"): the notices that mark a character's advancement, and
 * Downed. Motion is spent on these and nowhere else; each is framed as a moment in the notices.
 */
export type Moment = "level" | "title" | "technique" | "class" | "distillation" | "quest" | "downed";

export function momentOf(e: Effect): Moment | null {
  switch (e.kind) {
    case "level":
      return "level";
    case "title-conferred":
      return "title";
    case "mark":
      return e.marks === 1 || e.advanced ? "technique" : null;
    case "classification":
    case "class-accepted":
      return "class";
    case "distilled":
      return "distillation";
    case "quest-offered":
    case "quest-completed":
      return "quest";
    case "combat-downed":
    case "vital-coherence":
      return "downed";
    default:
      return null;
  }
}

/** How long each moment plays, from the canvas's Moments artboard, with a little slack. */
const PLAYS: Record<Moment, number> = { level: 1900, title: 1400, technique: 1200, class: 2300, distillation: 1700, quest: 2300, downed: 2400 };

export interface Playing {
  moment: Moment;
  effect: Effect;
  /** The feed item that brought it, so a notice can rise with it. */
  key: string;
}

/**
 * The moments that land while the screen is open: each character's newest, for as long as it
 * plays. What was already in the feed when the page loaded rests in its end state (a reload or a
 * late join shows the result, not the motion).
 */
export function useMoments(feed: FeedItem[]): Map<string, Playing> {
  const seen = useRef<Set<string> | null>(null);
  const [playing, setPlaying] = useState<Map<string, Playing>>(new Map());
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(feed.map((f) => f.key));
      return;
    }
    const fresh = feed.filter((f) => !seen.current!.has(f.key));
    for (const f of fresh) seen.current.add(f.key);
    // The feed is newest first: the first moment found for a character is its newest.
    const next = new Map<string, Playing>();
    for (const f of fresh) {
      const moment = momentOf(f.effect);
      if (moment && !next.has(f.characterId)) next.set(f.characterId, { moment, effect: f.effect, key: f.key });
    }
    if (!next.size) return;
    setPlaying((cur) => new Map([...cur, ...next]));
    const timers = [...next].map(([id, p]) =>
      setTimeout(
        () =>
          setPlaying((cur) => {
            if (cur.get(id)?.key !== p.key) return cur;
            const out = new Map(cur);
            out.delete(id);
            return out;
          }),
        PLAYS[p.moment],
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [feed]);
  return playing;
}

export interface Echo {
  text: string;
  danger?: boolean;
  at: number;
}

/**
 * The GM's quiet echo of a player's moment: one line in the table bar, from what changed between
 * two views of the record, gone after 8 seconds or when the next replaces it.
 */
export function useEcho(view: GmView): Echo | null {
  const last = useRef<GmView | null>(null);
  const [echo, setEcho] = useState<Echo | null>(null);
  useEffect(() => {
    const before = last.current;
    last.current = view;
    if (!before) return;
    const line = echoLine(before, view);
    if (!line) return;
    const e = { ...line, at: Date.now() };
    setEcho(e);
    const t = setTimeout(() => setEcho((cur) => (cur?.at === e.at ? null : cur)), 8000);
    return () => clearTimeout(t);
  }, [view]);
  return echo;
}

function echoLine(a: GmView, b: GmView): { text: string; danger?: boolean } | null {
  const was = new Map(a.characters.map((c) => [c.id, c]));
  for (const c of b.characters) {
    const p = was.get(c.id);
    if (!p) continue;
    if (c.downed && !p.downed) return { text: `${c.name} is Downed`, danger: true };
    if (c.level > p.level) return { text: `${c.name} reached Level ${c.level}` };
    const titles = new Set(p.titles.map((t) => t.id));
    const title = c.titles.find((t) => !titles.has(t.id));
    if (title) return { text: `${c.name} holds ${title.name}` };
    if (c.class && !p.class) return { text: `${c.name} holds ${c.class.name}` };
    if (c.classOffers.length && !p.classOffers.length) return { text: `${c.name} is offered ${c.classOffers.length} classes` };
    for (const pr of c.proficiencies) {
      const q = p.proficiencies.find((x) => x.shape === pr.shape);
      if (!q || q.tier !== pr.tier) return { text: `${c.name}: ${pr.shape}, ${pr.tier}` };
    }
  }
  const status = new Map(a.quests.map((q) => [q.id, q.status]));
  const done = b.quests.find((q) => q.status === "completed" && status.get(q.id) !== "completed");
  if (done) return { text: `[${done.code}] complete: ${done.holders.map((h) => b.characters.find((c) => c.id === h)?.name ?? h).join(", ")}` };
  return null;
}
