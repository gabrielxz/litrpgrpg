/**
 * Runs the scripted sessions through a drafter and reports precision and recall (app/DESIGN.md,
 * "Testing the listening", text evaluation). Each run spends real tokens.
 *
 *   pnpm draft-eval [--drafter events|actions|suggestions|offers|voice|classes] [--runs 3] [--script id] [--effort medium] [--campaign name]
 *
 * The key comes from one of two places:
 *   ANTHROPIC_API_KEY (app/.env)   used directly, with the model from --model; tokens are tallied here
 *   --campaign name                a campaign's sealed key, through `CampaignAi.draft` under the
 *                                  drafter's feature ("draft-events", "draft-actions", "draft-suggestions", "draft-opportunity",
 *                                  "draft-message", "draft-vision", "draft-classes"), so the requests
 *                                  show in its AI card. The database is DATABASE_URL (the development one
 *                                  by default), and AI_KEY_SECRET must be the secret that database's keys
 *                                  were sealed with.
 *
 * Writes the full runs (every draft, the scorer's report, the tokens) to build/listening/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import {
  DRAFT_ACTIONS_FEATURE,
  DRAFT_CLASSES_FEATURE,
  DRAFT_EVENTS_FEATURE,
  DRAFT_MESSAGE_FEATURE,
  DRAFT_OPPORTUNITY_FEATURE,
  DRAFT_SUGGESTIONS_FEATURE,
  DRAFT_VISION_FEATURE,
  type Drafter,
  type Effort,
  evaluateActions,
  evaluateClasses,
  evaluateEvents,
  evaluateOffer,
  evaluateSuggestions,
  evaluateVoice,
  formatActionSummary,
  formatClasses,
  formatOffer,
  formatSummary,
  formatVoice,
  loadClassFixtures,
  loadOffers,
  loadScripts,
  loadVoiceFixtures,
} from "@gradebreaker/listening";
import { CampaignAi, DEFAULT_MODEL, type Usage, anthropicModel } from "../src/ai.ts";
import { postgresDb } from "../src/db.ts";

const { values } = parseArgs({
  options: {
    campaign: { type: "string" },
    model: { type: "string", default: DEFAULT_MODEL },
    runs: { type: "string", default: "3" },
    script: { type: "string" },
    effort: { type: "string", default: "medium" },
    drafter: { type: "string", default: "events" },
  },
});
const FEATURES: Record<string, string> = { events: DRAFT_EVENTS_FEATURE, actions: DRAFT_ACTIONS_FEATURE, suggestions: DRAFT_SUGGESTIONS_FEATURE, offers: DRAFT_OPPORTUNITY_FEATURE, voice: "draft-voice", classes: DRAFT_CLASSES_FEATURE };
const FEATURE = FEATURES[values.drafter!];
if (!FEATURE) throw new Error("--drafter is events, actions, suggestions, offers, voice, or classes");
/** The feature a request is recorded under: the voice fixtures switch between a message and a vision. */
let feature = FEATURE;
const featuresOf = () => (values.drafter === "voice" ? [DRAFT_MESSAGE_FEATURE, DRAFT_VISION_FEATURE] : [FEATURE]);
const DEV_DATABASE = "postgres://gradebreaker:gradebreaker@localhost:54340/gradebreaker";

/** The drafter and where its spending is read back from. */
async function drafterFor(): Promise<{ drafter: Drafter; model: string; spent: (since: string) => Promise<Record<string, unknown>[]>; close: () => Promise<void> }> {
  if (!values.campaign) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("set ANTHROPIC_API_KEY in app/.env, or name a campaign whose key to use with --campaign");
    const m = anthropicModel(key, values.model);
    const tally: Usage[] = [];
    return {
      model: m.model,
      drafter: async (req) => {
        try {
          const { output, usage } = await m.draft(req);
          tally.push(usage);
          return output;
        } catch (err) {
          const usage = (err as { usage?: Usage }).usage;
          if (usage) tally.push(usage);
          throw err;
        }
      },
      spent: async () => {
        const sum = (k: keyof Usage) => tally.reduce((n, u) => n + (u[k] as number), 0);
        return [{ model: m.model, requests: tally.length, input: sum("inputTokens"), output: sum("outputTokens"), cache_read: sum("cacheReadTokens"), cache_write: sum("cacheWriteTokens") }];
      },
      close: async () => {},
    };
  }
  const db = postgresDb(process.env.DATABASE_URL ?? DEV_DATABASE);
  const ai = new CampaignAi(db, process.env.AI_KEY_SECRET);
  const found = await db.query<{ id: string }>("select id from campaigns where name = $1", [values.campaign]);
  if (found.length !== 1) throw new Error(`${found.length} campaigns are named ${values.campaign}`);
  const campaignId = found[0]!.id;
  const status = await ai.status(campaignId);
  if (!status.configured) throw new Error(`${values.campaign} has no key`);
  return {
    model: status.model!,
    drafter: (req) => ai.draft(campaignId, feature, req),
    spent: (since) =>
      db.query(
        `select model, count(*)::int as requests, count(problem)::int as failed,
           sum(input_tokens)::int as input, sum(output_tokens)::int as output,
           sum(cache_read_tokens)::int as cache_read, sum(cache_write_tokens)::int as cache_write
         from ai_usage where campaign_id = $1 and feature = any($2::text[]) and at >= $3 group by model`,
        [campaignId, featuresOf(), since],
      ),
    close: () => db.close(),
  };
}

const source = await drafterFor();
try {
  const engine = new Engine(loadRules());
  const offers = values.drafter === "offers";
  const voice = values.drafter === "voice";
  const voices = voice ? loadVoiceFixtures().filter((v) => !values.script || v.id === values.script) : [];
  const classes = values.drafter === "classes" ? loadClassFixtures().filter((v) => !values.script || v.id === values.script) : [];
  const scripts = offers || voice || classes.length || values.drafter === "classes" ? [] : loadScripts().filter((s) => !values.script || s.id === values.script);
  const fixtures = offers ? loadOffers().filter((o) => !values.script || o.id === values.script) : [];
  if (!scripts.length && !fixtures.length && !voices.length && !classes.length) throw new Error(`no script ${values.script}`);
  const started = new Date().toISOString();
  console.log(`${values.drafter}: ${scripts.length || fixtures.length || voices.length || classes.length} ${scripts.length ? "scripts" : "fixtures"} × ${values.runs} runs on ${source.model}, effort ${values.effort}\n`);

  const evaluations = [];
  for (const fixture of fixtures) {
    const e = await evaluateOffer(engine, fixture, source.drafter, Number(values.runs), { effort: values.effort as Effort });
    console.log(`${formatOffer(e)}\n`);
    evaluations.push(e);
  }
  for (const fixture of classes) {
    const e = await evaluateClasses(engine, fixture, source.drafter, Number(values.runs), { effort: values.effort as Effort });
    console.log(`${formatClasses(e)}\n`);
    evaluations.push(e);
  }
  for (const fixture of voices) {
    feature = fixture.kind === "message" ? DRAFT_MESSAGE_FEATURE : DRAFT_VISION_FEATURE;
    const e = await evaluateVoice(engine, fixture, source.drafter, Number(values.runs), { effort: values.effort as Effort });
    console.log(`${formatVoice(e)}\n`);
    evaluations.push(e);
  }
  for (const script of scripts) {
    const opts = { effort: values.effort as Effort };
    const e =
      values.drafter === "actions"
        ? await evaluateActions(engine, script, source.drafter, Number(values.runs), opts)
        : values.drafter === "suggestions"
          ? await evaluateSuggestions(engine, script, source.drafter, Number(values.runs), opts)
          : await evaluateEvents(engine, script, source.drafter, Number(values.runs), opts);
    console.log("byCategory" in e.summary ? formatActionSummary(e.summary) : formatSummary(e.summary));
    for (const r of e.runs) if (r.error) console.log(`  run ${r.run} failed: ${r.error}`);
    console.log();
    evaluations.push(e);
  }

  const usage = await source.spent(started);
  for (const u of usage)
    console.log(`${u.model}: ${u.requests} requests; input ${u.input} (cache read ${u.cache_read}, written ${u.cache_write}), output ${u.output}`);

  const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../build/listening");
  mkdirSync(out, { recursive: true });
  const file = join(out, `${FEATURE}-${started.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ started, drafter: values.drafter, model: source.model, effort: values.effort, usage, evaluations }, null, 2));
  console.log(`\nthe runs: ${file}`);
} finally {
  await source.close();
}
