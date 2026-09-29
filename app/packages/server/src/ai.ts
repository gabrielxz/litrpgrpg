/**
 * The language model behind the app's AI features (app/DESIGN.md, "AI sits behind adapters").
 *
 * The GM brings their own key, held on the server per campaign: sealed at rest with the
 * server's AI_KEY_SECRET, never returned to any browser, the GM's included (they see its last
 * four characters). A setup check asks the provider about the chosen model, which costs no
 * tokens. Every request records what it spent against the campaign and the feature that asked.
 *
 * `LanguageModel` is the seam: the Anthropic adapter below, and a scripted model in the tests.
 * The game's features ask it for a draft that matches a schema; nothing here knows the game.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { Db } from "./db.ts";

/** The models a GM can choose. Claude Opus 5.5 unless the GM picks another (Gabriel, 2026-09-28). */
export const MODELS = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
  { id: "claude-opus-5", name: "Claude Opus 5" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
] as const;
export const DEFAULT_MODEL = "claude-opus-5-5";

/** Why a request or a check failed, in terms the GM can act on. */
export type Problem = "key" | "permission" | "billing" | "model" | "rate" | "unreachable" | "refused" | "cut-off" | "unparsed" | "other";

export class ModelError extends Error {
  readonly problem: Problem;
  constructor(problem: Problem, message: string) {
    super(message);
    this.problem = problem;
  }
}

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface DraftRequest<T> {
  /** The stable part: instructions and standing context. Cached between requests. */
  system: string;
  /** This request's material: the lines, the scene, the question. */
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  /** How hard the model thinks, and so its latency and cost. Absent, the model's default (Claude Opus 5.5: medium). */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

export interface LanguageModel {
  readonly model: string;
  /** Resolves if the key reaches the model; throws a ModelError naming the problem otherwise. */
  check(): Promise<void>;
  draft<T>(req: DraftRequest<T>): Promise<{ output: T; usage: Usage }>;
}

/** The SDK's typed errors as problems, most specific first (a connection error is an APIError too). */
export function problemOf(err: unknown): ModelError {
  if (err instanceof ModelError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new ModelError("key", "the provider refused the key");
  if (err instanceof Anthropic.PermissionDeniedError) return new ModelError("permission", "the key may not use this model");
  if (err instanceof Anthropic.NotFoundError) return new ModelError("model", "the provider does not offer this model to this key");
  if (err instanceof Anthropic.RateLimitError) return new ModelError("rate", "the provider is limiting requests; try again shortly");
  if (err instanceof Anthropic.APIConnectionError) return new ModelError("unreachable", "the provider could not be reached");
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402) return new ModelError("billing", "the provider's account needs credit");
    // Overloaded or down on the provider's side (500, 503, 529): a wait, like a limit.
    if (err.status !== undefined && err.status >= 500) return new ModelError("unreachable", "the provider is unavailable for the moment; try again shortly");
    return new ModelError("other", `the provider answered ${err.status ?? "with an error"}`);
  }
  return new ModelError("other", err instanceof Error ? err.message : String(err));
}

export function anthropicModel(apiKey: string, model: string): LanguageModel {
  const client = new Anthropic({ apiKey });
  // A request the safety classifiers decline is re-run on a model the API picks by the decline's category.
  const fallback = model.startsWith("claude-opus-5") ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {};
  return {
    model,
    async check() {
      try {
        await client.models.retrieve(model);
      } catch (err) {
        throw problemOf(err);
      }
    },
    async draft<T>(req: DraftRequest<T>) {
      let res;
      try {
        res = await client.beta.messages.parse({
          model,
          max_tokens: req.maxTokens ?? 16000,
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: req.prompt }],
          output_config: { format: betaZodOutputFormat(req.schema), ...(req.effort ? { effort: req.effort } : {}) },
          ...fallback,
        });
      } catch (err) {
        throw problemOf(err);
      }
      const u = res.usage;
      const usage: Usage = {
        model: res.model,
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      };
      if (res.stop_reason === "refusal") throw Object.assign(new ModelError("refused", "the model declined the request"), { usage });
      if (res.stop_reason === "max_tokens") throw Object.assign(new ModelError("cut-off", "the draft ran past its length"), { usage });
      if (res.parsed_output == null) throw Object.assign(new ModelError("unparsed", "the draft did not match its shape"), { usage });
      return { output: res.parsed_output as T, usage };
    },
  };
}

// ------------------------------------------------------------ sealing ---

/** Seals a key with AES-256-GCM under a key derived from the server's secret. */
export function seal(secret: string, plain: string): string {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

export function unseal(secret: string, sealed: string): string {
  const [v, iv, tag, body] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("not a sealed key");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

// ------------------------------------------------------ per campaign ---

export interface AiStatus {
  /** False when the server has no AI_KEY_SECRET: no key can be stored. */
  available: boolean;
  configured: boolean;
  models: { id: string; name: string }[];
  model?: string;
  keyHint?: string;
  setAt?: string;
  check?: { at: string; ok: boolean; problem?: Problem; message?: string };
}

export interface UsageSummary {
  /** Each window: requests, failed requests, and tokens, by feature and in all. */
  windows: { name: "session" | "30 days" | "all time"; since: string | null; features: FeatureUsage[]; total: FeatureUsage }[];
}

export interface FeatureUsage {
  feature: string;
  requests: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export type ModelFactory = (apiKey: string, model: string) => LanguageModel;

export class CampaignAi {
  private readonly db: Db;
  private readonly secret: string | undefined;
  private readonly factory: ModelFactory;

  constructor(db: Db, secret: string | undefined, factory: ModelFactory = anthropicModel) {
    this.db = db;
    this.secret = secret;
    this.factory = factory;
  }

  async status(campaignId: string): Promise<AiStatus> {
    const out: AiStatus = { available: Boolean(this.secret), configured: false, models: MODELS.map((m) => ({ ...m })) };
    const [row] = await this.db.query("select * from campaign_ai where campaign_id = $1", [campaignId]);
    if (!row) return out;
    out.configured = true;
    out.model = row.model;
    out.keyHint = row.key_hint;
    out.setAt = new Date(row.set_at).toISOString();
    if (row.checked_at) {
      out.check = { at: new Date(row.checked_at).toISOString(), ok: !row.check_problem };
      if (row.check_problem) Object.assign(out.check, { problem: row.check_problem, message: row.check_message });
    }
    return out;
  }

  /**
   * Stores the GM's key after checking it. A key the provider refuses is not stored; one that
   * could not be checked (rate, unreachable) is stored with the check's problem shown.
   */
  async setKey(campaignId: string, userId: string, apiKey: string, model: string = DEFAULT_MODEL): Promise<AiStatus> {
    const secret = this.requireSecret();
    this.requireModel(model);
    const key = apiKey.trim();
    if (key.length < 8) throw new ModelError("key", "that does not look like a key");
    const problem = await this.factory(key, model).check().then(
      () => null,
      (err) => problemOf(err),
    );
    if (problem && (problem.problem === "key" || problem.problem === "permission" || problem.problem === "model")) throw problem;
    await this.db.query(
      `insert into campaign_ai (campaign_id, model, sealed_key, key_hint, set_by, checked_at, check_problem, check_message)
       values ($1, $2, $3, $4, $5, now(), $6, $7)
       on conflict (campaign_id) do update set model = $2, sealed_key = $3, key_hint = $4, set_by = $5, set_at = now(),
         checked_at = now(), check_problem = $6, check_message = $7`,
      [campaignId, model, seal(secret, key), key.slice(-4), userId, problem?.problem ?? null, problem?.message ?? null],
    );
    return this.status(campaignId);
  }

  /** Changes the model and checks the stored key against it. */
  async setModel(campaignId: string, model: string): Promise<AiStatus> {
    this.requireModel(model);
    const found = await this.db.query("update campaign_ai set model = $2 where campaign_id = $1 returning campaign_id", [campaignId, model]);
    if (!found.length) throw new ModelError("key", "no key is set for this campaign");
    return this.check(campaignId);
  }

  async check(campaignId: string): Promise<AiStatus> {
    const m = await this.modelFor(campaignId);
    const problem = await m.check().then(
      () => null,
      (err) => problemOf(err),
    );
    await this.db.query("update campaign_ai set checked_at = now(), check_problem = $2, check_message = $3 where campaign_id = $1", [
      campaignId,
      problem?.problem ?? null,
      problem?.message ?? null,
    ]);
    return this.status(campaignId);
  }

  async removeKey(campaignId: string): Promise<AiStatus> {
    await this.db.query("delete from campaign_ai where campaign_id = $1", [campaignId]);
    return this.status(campaignId);
  }

  /**
   * Drafts through the campaign's model and records what the request spent, or its problem.
   * The only way a feature reaches a model, so no request goes unrecorded.
   */
  async draft<T>(campaignId: string, feature: string, req: DraftRequest<T>): Promise<T> {
    const m = await this.modelFor(campaignId);
    try {
      const { output, usage } = await m.draft(req);
      await this.record(campaignId, feature, usage);
      return output;
    } catch (err) {
      const e = problemOf(err);
      const spent = (err as { usage?: Usage }).usage;
      await this.record(campaignId, feature, spent ?? { model: m.model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, e.problem);
      throw e;
    }
  }

  /** Requests and tokens by feature: since `sessionStart` when a session is running, the last 30 days, and all time. */
  async usage(campaignId: string, sessionStart?: string): Promise<UsageSummary> {
    const month = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const windows: UsageSummary["windows"] = [];
    const spans: [UsageSummary["windows"][number]["name"], string | null][] = [
      ...(sessionStart ? [["session", sessionStart] as [UsageSummary["windows"][number]["name"], string]] : []),
      ["30 days", month],
      ["all time", null],
    ];
    for (const [name, since] of spans) {
      const rows = await this.db.query(
        `select feature, count(*)::int as requests, count(problem)::int as failed,
           coalesce(sum(input_tokens), 0)::int as input, coalesce(sum(output_tokens), 0)::int as output,
           coalesce(sum(cache_read_tokens), 0)::int as cache_read
         from ai_usage where campaign_id = $1 and ($2::timestamptz is null or at >= $2::timestamptz)
         group by feature order by feature`,
        [campaignId, since],
      );
      const features: FeatureUsage[] = rows.map((r) => ({
        feature: r.feature,
        requests: r.requests,
        failed: r.failed,
        inputTokens: r.input,
        outputTokens: r.output,
        cacheReadTokens: r.cache_read,
      }));
      const total = features.reduce<FeatureUsage>(
        (t, f) => ({
          feature: "all",
          requests: t.requests + f.requests,
          failed: t.failed + f.failed,
          inputTokens: t.inputTokens + f.inputTokens,
          outputTokens: t.outputTokens + f.outputTokens,
          cacheReadTokens: t.cacheReadTokens + f.cacheReadTokens,
        }),
        { feature: "all", requests: 0, failed: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
      );
      windows.push({ name, since, features, total });
    }
    return { windows };
  }

  private async modelFor(campaignId: string): Promise<LanguageModel> {
    const secret = this.requireSecret();
    const [row] = await this.db.query("select model, sealed_key from campaign_ai where campaign_id = $1", [campaignId]);
    if (!row) throw new ModelError("key", "no key is set for this campaign");
    return this.factory(unseal(secret, row.sealed_key), row.model);
  }

  private async record(campaignId: string, feature: string, u: Usage, problem?: Problem) {
    await this.db.query(
      `insert into ai_usage (campaign_id, feature, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, problem)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [campaignId, feature, u.model, u.inputTokens, u.outputTokens, u.cacheReadTokens, u.cacheWriteTokens, problem ?? null],
    );
  }

  private requireSecret(): string {
    if (!this.secret) throw new ModelError("other", "this server has no AI_KEY_SECRET, so it cannot hold a key");
    return this.secret;
  }

  private requireModel(model: string) {
    if (!MODELS.some((m) => m.id === model)) throw new ModelError("model", `${model} is not one of the models on offer`);
  }
}
