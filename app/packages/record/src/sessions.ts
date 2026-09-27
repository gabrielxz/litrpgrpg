/**
 * Sessions: when the table sat down, who was there, and what the GM wrote afterward.
 *
 * The GM starts a session with the characters present, marks a late arrival or an early exit,
 * and ends it, optionally with the summary the standing context carries into the next one (The
 * System AI, "Last session: [three-sentence summary]"). One session runs at a time. Events and
 * sweeps recorded while a session runs belong to it, and the session-end sweep takes the
 * session's name. The GM can write or replace a summary after the session ends. Sessions are
 * the GM's record; nothing here reaches a player.
 */
import type { Envelope } from "./actions.ts";
import { type Effect, Rejected, type World } from "./fold.ts";

/** Starts a session; its id is the id of this action. GM only. */
export interface StartSession {
  type: "session.start";
  label?: string;
  /** The characters at the table. */
  present: string[];
}

/** A character arriving late or leaving early. GM only. */
export interface MarkAttendance {
  type: "session.attend";
  characterId: string;
  present: boolean;
}

/** Ends the running session. GM only. */
export interface EndSession {
  type: "session.end";
  summary?: string;
}

/** Writes or replaces a session's summary, running or ended. GM only. */
export interface SummarizeSession {
  type: "session.summary";
  sessionId: string;
  summary: string;
}

export type SessionAction = StartSession | MarkAttendance | EndSession | SummarizeSession;

export interface CampaignSession {
  id: string;
  /** 1 for the campaign's first session. */
  number: number;
  label?: string;
  startedAt: string;
  endedAt?: string;
  /** Everyone present at any point, in the order they arrived. */
  present: string[];
  /** Characters who left before the end. */
  left: string[];
  summary?: string;
}

export function cloneSession(s: CampaignSession): CampaignSession {
  return { ...s, present: [...s.present], left: [...s.left] };
}

/** A session's name as the table says it. */
export const sessionName = (s: CampaignSession) => s.label ?? `Session ${s.number}`;

/** The session running now, if any. */
export function runningSession(world: World): CampaignSession | undefined {
  const last = [...world.sessions.values()].at(-1);
  return last && !last.endedAt ? last : undefined;
}

export function applySessions(world: World, a: SessionAction, env: Envelope): Effect[] {
  const running = runningSession(world);
  const living = (id: string) => {
    const c = world.characters.get(id);
    if (!c) throw new Rejected(`no character ${id}`);
    if (c.dead) throw new Rejected(`${c.name} is dead`);
  };
  switch (a.type) {
    case "session.start": {
      if (running) throw new Rejected(`${sessionName(running)} is still running`);
      const present = [...new Set(a.present)];
      present.forEach(living);
      const s: CampaignSession = { id: env.id, number: world.sessions.size + 1, startedAt: env.at, present, left: [] };
      if (a.label?.trim()) s.label = a.label.trim();
      world.sessions.set(s.id, s);
      return [{ kind: "session-started", sessionId: s.id, name: sessionName(s) }];
    }
    case "session.attend": {
      if (!running) throw new Rejected("no session is running");
      living(a.characterId);
      const here = running.present.includes(a.characterId) && !running.left.includes(a.characterId);
      if (a.present === here) throw new Rejected(`${world.characters.get(a.characterId)!.name} is already ${here ? "present" : "away"}`);
      if (a.present) {
        running.left = running.left.filter((id) => id !== a.characterId);
        if (!running.present.includes(a.characterId)) running.present.push(a.characterId);
      } else {
        running.left.push(a.characterId);
      }
      return [];
    }
    case "session.end": {
      if (!running) throw new Rejected("no session is running");
      running.endedAt = env.at;
      if (a.summary?.trim()) running.summary = a.summary.trim();
      return [{ kind: "session-ended", sessionId: running.id, name: sessionName(running) }];
    }
    case "session.summary": {
      const s = world.sessions.get(a.sessionId);
      if (!s) throw new Rejected(`no session ${a.sessionId}`);
      const text = a.summary.trim();
      if (text) s.summary = text;
      else delete s.summary;
      return [];
    }
  }
}
