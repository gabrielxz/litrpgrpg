/**
 * Voice fixtures: what a GM asks the System to say, and the meditations it answers with a vision
 * (app/DESIGN.md, "Testing the listening"). A fixture is a record set up in the record's own
 * actions and one request: a message (recipients and the GM's words) or a vision (a card, the
 * family, the player's words). The scorer checks the register a message should take, the numbers
 * it must keep, and `voiceFlags`; the prose itself is for Gabriel's read.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Engine } from "@gradebreaker/engine";
import { readYaml } from "@gradebreaker/engine/node";
import { type Action, CampaignRecord, actionSchema } from "@gradebreaker/record";
import { z } from "zod";
import type { Drafter, Effort } from "./draft-events.ts";
import { type MessageDraft, type VisionDraft, draftMessage, draftVision } from "./draft-voice.ts";

export const VOICE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../voice");

const base = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  notes: z.string().optional(),
  setup: z.array(z.object({ id: z.string(), action: actionSchema })),
});

export const voiceFixtureSchema = z.discriminatedUnion("kind", [
  base.extend({
    kind: z.literal("message"),
    to: z.array(z.string()).min(1),
    gist: z.string(),
    expected: z.object({
      /** Every register that fits. */
      registers: z.array(z.string()).min(1),
      /** Strings the text must carry: the GM's numbers. */
      keeps: z.array(z.string()).default([]),
      /** Words the text must not say, beyond the voice flags (a trait the System would be naming). */
      avoids: z.array(z.string()).default([]),
    }),
  }),
  base.extend({
    kind: z.literal("vision"),
    characterId: z.string(),
    /** The setup's `memory.grant` whose card is meditated on. */
    memory: z.string(),
    family: z.string(),
    words: z.string().default(""),
    expected: z.object({
      /** The Insight range the GM would accept. */
      ip: z.array(z.number().int()).min(1),
    }),
  }),
]);

export type VoiceFixture = z.infer<typeof voiceFixtureSchema>;

export function loadVoiceFixtures(dir: string = VOICE_DIR): VoiceFixture[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => voiceFixtureSchema.parse(readYaml(join(dir, f))));
}

export function voiceRecordOf(engine: Engine, fixture: VoiceFixture): CampaignRecord {
  const record = new CampaignRecord(engine);
  for (const s of fixture.setup) record.append({ id: s.id, at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action: s.action as Action });
  const refused = record.state.rejected;
  if (refused.length) throw new Error(`${fixture.id}: the setup's ${refused[0]!.envelope.id} is refused: ${refused[0]!.reason}`);
  return record;
}

/** The card a fixture meditates on: the one its `memory` setup action granted. */
export function memoryIdOf(record: CampaignRecord, fixture: Extract<VoiceFixture, { kind: "vision" }>): string {
  const card = record.sheets().get(fixture.characterId)?.principles.memories.find((m) => m.id === fixture.memory || m.id.startsWith(fixture.memory));
  if (!card) throw new Error(`${fixture.id}: no card from ${fixture.memory}`);
  return card.id;
}

// ------------------------------------------------------------ runs ---

export interface VoiceRun {
  run: number;
  ms?: number;
  message?: MessageDraft;
  vision?: VisionDraft;
  error?: string;
  /** Messages: the register fits and every kept string is there. Visions: the Insight is in range. */
  ok?: boolean;
  misses?: string[];
  flags?: string[];
}

export interface VoiceEvaluation {
  fixtureId: string;
  kind: VoiceFixture["kind"];
  runs: VoiceRun[];
  summary: { runs: number; returned: number; ok: number; flagged: number; flags: Record<string, number>; ms: number };
}

function scoreMessage(fixture: Extract<VoiceFixture, { kind: "message" }>, d: MessageDraft): Pick<VoiceRun, "ok" | "misses" | "flags"> {
  const misses: string[] = [];
  if (!fixture.expected.registers.includes(d.register)) misses.push(`register ${d.register}`);
  for (const k of fixture.expected.keeps) if (!d.text.includes(k)) misses.push(`drops ${k}`);
  const flags = [...d.flags, ...fixture.expected.avoids.filter((w) => new RegExp(`\\b${w}`, "i").test(d.text)).map((w) => `says ${w}`)];
  return { ok: misses.length === 0, misses, flags };
}

/** Drafts the fixture `runs` times, one request after another, and scores each. */
export async function evaluateVoice(engine: Engine, fixture: VoiceFixture, drafter: Drafter, runs: number, opts: { effort?: Effort } = {}): Promise<VoiceEvaluation> {
  const out: VoiceRun[] = [];
  for (let run = 1; run <= runs; run++) {
    const t = Date.now();
    try {
      const record = voiceRecordOf(engine, fixture);
      if (fixture.kind === "message") {
        const d = await draftMessage(engine, drafter, record, fixture.to, fixture.gist, opts);
        out.push({ run, ms: Date.now() - t, message: d, ...scoreMessage(fixture, d) });
      } else {
        const d = await draftVision(engine, drafter, record, fixture.characterId, memoryIdOf(record, fixture), fixture.family, fixture.words, opts);
        const ok = fixture.expected.ip.includes(d.ip);
        out.push({ run, ms: Date.now() - t, vision: d, ok, misses: ok ? [] : [`Insight ${d.ip}`], flags: d.flags });
      }
    } catch (err) {
      out.push({ run, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const got = out.filter((r) => !r.error);
  const flags: Record<string, number> = {};
  for (const f of got.flatMap((r) => r.flags ?? [])) flags[f] = (flags[f] ?? 0) + 1;
  return {
    fixtureId: fixture.id,
    kind: fixture.kind,
    runs: out,
    summary: {
      runs: out.length,
      returned: got.length,
      ok: got.filter((r) => r.ok).length,
      flagged: got.filter((r) => r.flags?.length).length,
      flags,
      ms: got.length ? Math.round(got.reduce((n, r) => n + r.ms!, 0) / got.length) : 0,
    },
  };
}

/** The scores, then each draft as the player would read it, for Gabriel's read. */
export function formatVoice(e: VoiceEvaluation): string {
  const s = e.summary;
  const flags = Object.entries(s.flags).map(([k, n]) => `${k} ×${n}`);
  const rows = [`${e.fixtureId} (${e.kind}): ${s.returned} of ${s.runs} returned, ok ${s.ok}/${s.returned}, flagged ${s.flagged}/${s.returned}${flags.length ? ` (${flags.join(", ")})` : ""}, ${(s.ms / 1000).toFixed(1)} s each`];
  for (const r of e.runs) {
    if (r.error) {
      rows.push(`  run ${r.run}: ${r.error}`);
      continue;
    }
    const miss = r.misses?.length ? ` [${r.misses.join("; ")}]` : "";
    if (r.message) {
      rows.push(`  run ${r.run}: ${r.message.register}${miss}`);
      for (const l of r.message.text.split("\n")) rows.push(`    ${l}`);
      if (r.message.added.length) rows.push(`    added: ${r.message.added.join("; ")}`);
    } else {
      rows.push(`  run ${r.run}: Insight ${r.vision!.ip}${miss}`);
      rows.push(`    ${r.vision!.vision}`);
      rows.push(`    GM: ${r.vision!.why}`);
    }
  }
  return rows.join("\n");
}
