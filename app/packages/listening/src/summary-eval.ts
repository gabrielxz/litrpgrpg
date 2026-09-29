/**
 * Evaluating the summaries on the scripted sessions (app/DESIGN.md, "Testing the listening"). A
 * script's expected record, replayed, stands for what the table logged: its setup comes first,
 * then a session starts, the scene's actions follow, and the session ends. The session's summary
 * and each player character's System summary are drafted from that record. The scorer checks the
 * rules a reader can count (three sentences; the observation's voice and length); the prose is
 * for Gabriel's read.
 */
import type { Engine } from "@gradebreaker/engine";
import { CampaignRecord } from "@gradebreaker/record";
import type { Drafter, Effort } from "./draft-events.ts";
import { type CharacterSummaryDraft, SESSION_SENTENCES, draftCharacterSummary, draftSessionSummary } from "./draft-summaries.ts";
import { type Script, replay } from "./script.ts";

/** The scripts whose records have enough in them to summarize. */
export const SUMMARY_SCRIPTS = ["tutorial-node-scarcity", "wild-den", "gate-crossing", "camp-coercion", "long-session", "civic-tribunal"];

/** The script's record inside one session: the setup, the session's start, the scene, its end. */
export function sessionRecordOf(engine: Engine, script: Script): { record: CampaignRecord; sessionId: string } {
  const played = replay(engine, script);
  const setup = new Set(script.setup.map((s) => s.id));
  const record = new CampaignRecord(engine);
  const players = script.speakers.flatMap((s) => s.characters ?? []);
  for (const env of played.log.filter((e) => setup.has(e.id))) record.append(env);
  const sessionId = `${script.id}-session`;
  record.append({ id: sessionId, at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action: { type: "session.start", label: script.title, present: players } });
  for (const env of played.log.filter((e) => !setup.has(e.id))) record.append(env);
  record.append({ id: `${script.id}-end`, at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action: { type: "session.end" } });
  return { record, sessionId };
}

export interface SummaryRun {
  run: number;
  summary?: string;
  sentences?: number;
  characters?: (CharacterSummaryDraft & { characterId: string })[];
  error?: string;
}

export interface SummaryEvaluation {
  scriptId: string;
  runs: SummaryRun[];
  summary: { runs: number; returned: number; threeSentences: number; observations: number; flagged: number };
}

const sentencesIn = (t: string) => t.split(/(?<=[.?!]["”']?)\s+/).filter((s) => s.trim()).length;

export async function evaluateSummaries(engine: Engine, script: Script, drafter: Drafter, runs: number, opts: { effort?: Effort } = {}): Promise<SummaryEvaluation> {
  const { record, sessionId } = sessionRecordOf(engine, script);
  const players = script.speakers.flatMap((s) => s.characters ?? []);
  const out: SummaryRun[] = [];
  for (let run = 1; run <= runs; run++) {
    try {
      const { summary } = await draftSessionSummary(drafter, record, sessionId, opts);
      const characters = [];
      for (const id of players) characters.push({ characterId: id, ...(await draftCharacterSummary(engine, drafter, record, id, opts)) });
      out.push({ run, summary, sentences: sentencesIn(summary), characters });
    } catch (err) {
      out.push({ run, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const got = out.filter((r) => r.summary);
  const observations = got.flatMap((r) => r.characters ?? []);
  return {
    scriptId: script.id,
    runs: out,
    summary: {
      runs: out.length,
      returned: got.length,
      threeSentences: got.filter((r) => r.sentences === SESSION_SENTENCES).length,
      observations: observations.length,
      flagged: observations.filter((c) => c.flags.length).length,
    },
  };
}

export function formatSummaries(e: SummaryEvaluation): string {
  const s = e.summary;
  const rows = [`${e.scriptId}: ${s.returned} of ${s.runs} returned; ${SESSION_SENTENCES} sentences ${s.threeSentences}/${s.returned}; observations flagged ${s.flagged}/${s.observations}`];
  for (const r of e.runs) {
    if (r.error) {
      rows.push(`  run ${r.run}: ${r.error}`);
      continue;
    }
    rows.push(`  run ${r.run}, the session (${r.sentences} sentences): ${r.summary}`);
    for (const c of r.characters ?? []) {
      rows.push(`    ${c.characterId}${c.flags.length ? ` [${c.flags.join("; ")}]` : ""}:`);
      for (const l of c.text.split("\n")) rows.push(`      ${l}`);
    }
  }
  return rows.join("\n");
}
