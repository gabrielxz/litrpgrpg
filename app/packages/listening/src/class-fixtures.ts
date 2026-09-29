/**
 * Class fixtures: a character at Level 10 with a record, and what the book's rules decide about
 * the three offers drafted for them (app/DESIGN.md, "Testing the listening"). A fixture's setup is
 * the record's own actions; `levelTo` stands for the VE, rests, and placements that bring a
 * character to a level, so a fixture need not spell out nine of them. The scorer counts the book's
 * rules an offer breaks (`packageProblems`), the advice it crosses and the voice flags on its
 * notice, a guarded power drafted unasked or missing when asked, and whether an offer leads with
 * an Attribute the record's dominant pattern runs on. The classes themselves are for Gabriel's read.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ATTRIBUTES, type Engine } from "@gradebreaker/engine";
import { readYaml } from "@gradebreaker/engine/node";
import { type Action, CampaignRecord, actionSchema, leadOf } from "@gradebreaker/record";
import { z } from "zod";
import { type ClassOffersDraft, draftClasses } from "./draft-classes.ts";
import type { Drafter, Effort } from "./draft-events.ts";

export const CLASSES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../classes");

const stats = z.partialRecord(z.enum(ATTRIBUTES), z.number().int());

const step = z.union([
  z.object({ id: z.string(), action: actionSchema }),
  /** Brings a character to `level`: each level's VE and rest, its assigned points as `assigned`, its free points as `free`. */
  z.object({ levelTo: z.object({ characterId: z.string(), level: z.number().int(), assigned: stats, free: stats }) }),
]);

export const classFixtureSchema = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  notes: z.string().optional(),
  setup: z.array(step),
  characterId: z.string(),
  keepsDoing: z.string().default(""),
  guarded: z.boolean().default(false),
  expected: z.object({
    /** At least one offer leads with one of these: the dominant pattern's Attributes. Absent, any. */
    anyLead: z.array(z.enum(ATTRIBUTES)).optional(),
    why: z.string().optional(),
  }),
});

export type ClassFixture = z.infer<typeof classFixtureSchema>;

export function loadClassFixtures(dir: string = CLASSES_DIR): ClassFixture[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => classFixtureSchema.parse(readYaml(join(dir, f))));
}

/** The fixture's record, every action the GM's; `levelTo` expanded into the actions it stands for. */
export function classRecordOf(engine: Engine, fixture: ClassFixture): CampaignRecord {
  const record = new CampaignRecord(engine);
  let n = 0;
  const append = (id: string, action: Action) => {
    record.append({ id, at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: "gm" }, source: "manual", action });
    const refused = record.state.rejected.at(-1);
    if (refused?.envelope.id === id) throw new Error(`${fixture.id}: ${id} is refused: ${refused.reason}`);
  };
  const perLevel = engine.rules.cultivation.level_cost.base as number;
  for (const s of fixture.setup) {
    if ("action" in s) {
      append(s.id, s.action as Action);
      continue;
    }
    const { characterId, level, assigned, free } = s.levelTo;
    const classLevel = engine.rules.character.leveling.class_level as number;
    while (record.sheets().get(characterId)!.level < level) {
      append(`level-${++n}`, { type: "ve.award", basis: { kind: "other", note: "levelling a fixture" }, awards: [{ characterId, ve: perLevel }] });
      append(`level-${++n}`, { type: "consolidation.rest", highDensity: false, rests: [{ characterId, hours: 6 }] });
      const c = record.sheets().get(characterId)!;
      for (const lv of c.pendingSystemLevels.filter((l) => l < classLevel)) append(`level-${++n}`, { type: "points.system", characterId, level: lv, placement: assigned });
      const after = record.sheets().get(characterId)!;
      const spend = Object.values(free).reduce((a, b) => a + b, 0);
      if (after.freePoints >= spend && spend > 0) append(`level-${++n}`, { type: "points.free", characterId, placement: free });
    }
  }
  return record;
}

// ------------------------------------------------------------ runs ---

export interface ClassRun {
  run: number;
  ms?: number;
  draft?: ClassOffersDraft;
  error?: string;
  /** Book rules broken, across the three offers and between them. */
  problems?: string[];
  warnings?: string[];
  /** An offer leads with an Attribute the fixture expects. */
  leadOk?: boolean;
  /** Different leads among the three. */
  leads?: number;
  guardedOk?: boolean;
}

export interface ClassEvaluation {
  fixtureId: string;
  runs: ClassRun[];
  summary: { runs: number; returned: number; clean: number; lead: number; guarded: number; warned: number; ms: number };
}

export function scoreClasses(fixture: ClassFixture, d: ClassOffersDraft): Pick<ClassRun, "problems" | "warnings" | "leadOk" | "leads" | "guardedOk"> {
  const leads = d.offers.map((o) => leadOf(o.offer));
  const guarded = d.offers.filter((o) => o.offer.guarded).length;
  return {
    problems: [...d.problems, ...d.offers.flatMap((o) => o.problems)],
    warnings: d.offers.flatMap((o) => o.warnings),
    leadOk: !fixture.expected.anyLead || leads.some((l) => fixture.expected.anyLead!.includes(l as (typeof ATTRIBUTES)[number])),
    leads: new Set(leads).size,
    guardedOk: fixture.guarded ? guarded === 1 : guarded === 0,
  };
}

export async function evaluateClasses(engine: Engine, fixture: ClassFixture, drafter: Drafter, runs: number, opts: { effort?: Effort } = {}): Promise<ClassEvaluation> {
  const out: ClassRun[] = [];
  for (let run = 1; run <= runs; run++) {
    const t = Date.now();
    try {
      const d = await draftClasses(engine, drafter, classRecordOf(engine, fixture), fixture.characterId, { keepsDoing: fixture.keepsDoing, guarded: fixture.guarded, ...opts });
      out.push({ run, ms: Date.now() - t, draft: d, ...scoreClasses(fixture, d) });
    } catch (err) {
      out.push({ run, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const got = out.filter((r) => r.draft);
  return {
    fixtureId: fixture.id,
    runs: out,
    summary: {
      runs: out.length,
      returned: got.length,
      clean: got.filter((r) => !r.problems!.length).length,
      lead: got.filter((r) => r.leadOk).length,
      guarded: got.filter((r) => r.guardedOk).length,
      warned: got.filter((r) => r.warnings!.length).length,
      ms: got.length ? Math.round(got.reduce((n, r) => n + r.ms!, 0) / got.length) : 0,
    },
  };
}

/** The scores, then each offer as the GM would read it. */
export function formatClasses(e: ClassEvaluation): string {
  const s = e.summary;
  const rows = [`${e.fixtureId}: ${s.returned} of ${s.runs} returned; within the rules ${s.clean}/${s.returned}, lead ${s.lead}/${s.returned}, guarded as asked ${s.guarded}/${s.returned}, warned ${s.warned}/${s.returned}; ${(s.ms / 1000).toFixed(1)} s each`];
  for (const r of e.runs) {
    if (r.error) {
      rows.push(`  run ${r.run}: ${r.error}`);
      continue;
    }
    rows.push(`  run ${r.run}: ${r.leads} different leads${r.problems!.length ? `; problems: ${r.problems!.join("; ")}` : ""}${r.warnings!.length ? `; warnings: ${r.warnings!.join("; ")}` : ""}`);
    for (const o of r.draft!.offers) {
      const p = o.offer;
      rows.push(`    ${p.name}${p.book ? " (the book's)" : ""}${p.guarded ? " [guarded]" : ""}: ${o.role}. Weighs: ${o.weighs}`);
      rows.push(`      Notice: ${p.notice}`);
      rows.push(`      Profile: ${p.profile.shape}, ${p.profile.points.map((x) => `${x.points} ${x.attribute}`).join(", ")}`);
      rows.push(`      Technique: ${p.technique.name} (${p.technique.cost}${p.technique.hook ? `, ${p.technique.hook.kind === "clash" ? `+${p.technique.hook.bonus} ${p.technique.hook.side}` : `heal ${p.technique.hook.amount} ${p.technique.hook.reach}`}` : ""}): ${p.technique.effect}`);
      rows.push(`      Permission: ${p.permission.name}${p.permission.onceADay ? " (once a day)" : ""}: ${p.permission.effect}`);
    }
  }
  return rows.join("\n");
}
