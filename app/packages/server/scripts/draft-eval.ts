/**
 * Runs the scripted sessions through the events drafter and reports precision and recall
 * (app/DESIGN.md, "Testing the listening", text evaluation). Each run spends real tokens.
 *
 *   pnpm draft-eval [--runs 3] [--script id] [--effort medium] [--campaign name]
 *
 * The key comes from one of two places:
 *   ANTHROPIC_API_KEY (app/.env)   used directly, with the model from --model; tokens are tallied here
 *   --campaign name                a campaign's sealed key, through `CampaignAi.draft` under the feature
 *                                  "draft-events", so the requests show in its AI card. The database is
 *                                  DATABASE_URL (the development one by default), and AI_KEY_SECRET must
 *                                  be the secret that database's keys were sealed with.
 *
 * Writes the full runs (every draft, the scorer's report, the tokens) to build/listening/.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { DRAFT_EVENTS_FEATURE, type Drafter, type Effort, evaluateEvents, formatSummary, loadScripts } from "@gradebreaker/listening";
import { CampaignAi, DEFAULT_MODEL, type Usage, anthropicModel } from "../src/ai.ts";
import { postgresDb } from "../src/db.ts";

const { values } = parseArgs({
  options: {
    campaign: { type: "string" },
    model: { type: "string", default: DEFAULT_MODEL },
    runs: { type: "string", default: "3" },
    script: { type: "string" },
    effort: { type: "string", default: "medium" },
  },
});
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
    drafter: (req) => ai.draft(campaignId, DRAFT_EVENTS_FEATURE, req),
    spent: (since) =>
      db.query(
        `select model, count(*)::int as requests, count(problem)::int as failed,
           sum(input_tokens)::int as input, sum(output_tokens)::int as output,
           sum(cache_read_tokens)::int as cache_read, sum(cache_write_tokens)::int as cache_write
         from ai_usage where campaign_id = $1 and feature = $2 and at >= $3 group by model`,
        [campaignId, DRAFT_EVENTS_FEATURE, since],
      ),
    close: () => db.close(),
  };
}

const source = await drafterFor();
try {
  const engine = new Engine(loadRules());
  const scripts = loadScripts().filter((s) => !values.script || s.id === values.script);
  if (!scripts.length) throw new Error(`no script ${values.script}`);
  const started = new Date().toISOString();
  console.log(`${scripts.length} scripts × ${values.runs} runs on ${source.model}, effort ${values.effort}\n`);

  const evaluations = [];
  for (const script of scripts) {
    const e = await evaluateEvents(engine, script, source.drafter, Number(values.runs), { effort: values.effort as Effort });
    console.log(formatSummary(e.summary));
    for (const r of e.runs) if (r.error) console.log(`  run ${r.run} failed: ${r.error}`);
    console.log();
    evaluations.push(e);
  }

  const usage = await source.spent(started);
  for (const u of usage)
    console.log(`${u.model}: ${u.requests} requests; input ${u.input} (cache read ${u.cache_read}, written ${u.cache_write}), output ${u.output}`);

  const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../build/listening");
  mkdirSync(out, { recursive: true });
  const file = join(out, `draft-events-${started.replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ started, model: source.model, effort: values.effort, usage, evaluations }, null, 2));
  console.log(`\nthe runs: ${file}`);
} finally {
  await source.close();
}
