/**
 * The GM's language-model key and usage, end to end on PGlite with a scripted model in place of
 * the provider: the key is checked before it is stored, sealed at rest, never returned, and the
 * GM's alone; every draft records what it spent, and a failed one its problem.
 */
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { loadRules } from "@gradebreaker/engine/node";
import Anthropic from "@anthropic-ai/sdk";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { CampaignAi, type LanguageModel, ModelError, type Problem, problemOf, seal, unseal } from "../src/ai.ts";
import { createApp } from "../src/app.ts";
import { jwtVerifier } from "../src/auth.ts";
import { type Db, migrate, pgliteDb } from "../src/db.ts";
import { Service } from "../src/service.ts";

const rules = loadRules();
const ISSUER = "https://test-project.supabase.co/auth/v1";
const { privateKey, publicKey } = await generateKeyPair("ES256");
const verifier = jwtVerifier(createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: "ES256" }] }), ISSUER);
const signIn = (name: string) =>
  new SignJWT({ email: `${name.toLowerCase()}@example.com`, role: "authenticated", user_metadata: { full_name: name } })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(randomUUID())
    .setIssuer(ISSUER)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

const KEY = "sk-ant-test-0123456789-abcd";
const SECRET = "a server secret for the tests";

/** What the scripted provider does next: each check and draft takes the next outcome, or succeeds. */
let checks: (Problem | null)[] = [];
let drafts: ({ output: unknown } | { problem: Problem; spent?: number })[] = [];
const seen: { key: string; model: string }[] = [];
const scripted = (key: string, model: string): LanguageModel => {
  seen.push({ key, model });
  const usage = (input: number, output: number) => ({ model, inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0 });
  return {
    model,
    async check() {
      const p = checks.shift();
      if (p) throw new ModelError(p, `scripted ${p}`);
    },
    async draft<T>(req: { schema: z.ZodType<T> }) {
      const next = drafts.shift() ?? { output: {} };
      if ("problem" in next) throw Object.assign(new ModelError(next.problem, `scripted ${next.problem}`), next.spent ? { usage: usage(next.spent, 0) } : {});
      return { output: req.schema.parse(next.output), usage: usage(1200, 300) };
    },
  };
};

let db: Db;
let ai: CampaignAi;
let app: ReturnType<typeof createApp>;

async function open(secret?: string) {
  db = await pgliteDb(new PGlite());
  await migrate(db);
  const service = await Service.open(db, rules, verifier);
  ai = new CampaignAi(db, secret, scripted);
  app = createApp(service, { ai });
}

async function call(method: string, path: string, token: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null, text };
}

async function table() {
  const gm = await signIn("Gabriel");
  const campaignId = (await call("POST", "/campaigns", gm, { name: "The Valley" })).json.campaign.id as string;
  const code = (await call("POST", `/campaigns/${campaignId}/invites`, gm, {})).json.code;
  const player = await signIn("Ana");
  await call("POST", `/invites/${code}/accept`, player);
  return { gm, player, campaignId };
}

beforeEach(() => {
  checks = [];
  drafts = [];
  seen.length = 0;
});

describe("the GM's key", () => {
  beforeEach(() => open(SECRET));

  it("is checked, stored sealed, shown by its last four characters, and never returned", async () => {
    const { gm, campaignId } = await table();
    expect((await call("GET", `/campaigns/${campaignId}/ai`, gm)).json).toMatchObject({ available: true, configured: false });
    const set = await call("PUT", `/campaigns/${campaignId}/ai/key`, gm, { key: `  ${KEY}  ` });
    expect(set.status).toBe(200);
    expect(set.json).toMatchObject({ configured: true, model: "claude-opus-5", keyHint: "abcd", check: { ok: true } });
    expect(set.text).not.toContain(KEY);
    expect(seen.at(-1)).toEqual({ key: KEY, model: "claude-opus-5" });
    const [row] = await db.query("select sealed_key from campaign_ai");
    expect(row!.sealed_key).not.toContain(KEY);
    expect(unseal(SECRET, row!.sealed_key)).toBe(KEY);
  });

  it("is the GM's alone", async () => {
    const { player, campaignId } = await table();
    expect((await call("GET", `/campaigns/${campaignId}/ai`, player)).status).toBe(403);
    expect((await call("PUT", `/campaigns/${campaignId}/ai/key`, player, { key: KEY })).status).toBe(403);
  });

  it("is refused when the provider refuses it, and kept with the problem when the provider cannot be asked", async () => {
    const { gm, campaignId } = await table();
    checks = ["key"];
    const bad = await call("PUT", `/campaigns/${campaignId}/ai/key`, gm, { key: KEY });
    expect(bad).toMatchObject({ status: 422, json: { problem: "key" } });
    expect(await db.query("select * from campaign_ai")).toEqual([]);
    checks = ["rate"];
    const later = await call("PUT", `/campaigns/${campaignId}/ai/key`, gm, { key: KEY });
    expect(later.json).toMatchObject({ configured: true, check: { ok: false, problem: "rate" } });
    const again = await call("POST", `/campaigns/${campaignId}/ai/check`, gm);
    expect(again.json.check).toEqual({ at: expect.any(String), ok: true });
  });

  it("changes model among those on offer, checking the key against it, and is removed on request", async () => {
    const { gm, campaignId } = await table();
    await call("PUT", `/campaigns/${campaignId}/ai/key`, gm, { key: KEY });
    expect((await call("PUT", `/campaigns/${campaignId}/ai/model`, gm, { model: "claude-sonnet-5" })).json).toMatchObject({ model: "claude-sonnet-5" });
    expect(seen.at(-1)).toEqual({ key: KEY, model: "claude-sonnet-5" });
    expect((await call("PUT", `/campaigns/${campaignId}/ai/model`, gm, { model: "gpt-5" })).status).toBe(422);
    expect((await call("DELETE", `/campaigns/${campaignId}/ai/key`, gm)).json).toMatchObject({ configured: false });
  });

  it("cannot be stored on a server with no secret", async () => {
    await open(undefined);
    const { gm, campaignId } = await table();
    expect((await call("GET", `/campaigns/${campaignId}/ai`, gm)).json).toMatchObject({ available: false });
    expect((await call("PUT", `/campaigns/${campaignId}/ai/key`, gm, { key: KEY })).json.error).toMatch(/AI_KEY_SECRET/);
  });
});

describe("drafting and usage", () => {
  beforeEach(() => open(SECRET));

  it("records every request's tokens by feature, and a failure's problem", async () => {
    const { gm, campaignId } = await table();
    await call("PUT", `/campaigns/${campaignId}/ai/key`, gm, { key: KEY });
    const schema = z.object({ events: z.array(z.string()) });
    drafts = [{ output: { events: ["Kara gives the pill to Ray"] } }, { problem: "refused", spent: 900 }, { problem: "unreachable" }];
    await expect(ai.draft(campaignId, "draft-events", { system: "s", prompt: "p", schema })).resolves.toEqual({ events: ["Kara gives the pill to Ray"] });
    await expect(ai.draft(campaignId, "draft-events", { system: "s", prompt: "p", schema })).rejects.toMatchObject({ problem: "refused" });
    await expect(ai.draft(campaignId, "sweep", { system: "s", prompt: "p", schema })).rejects.toMatchObject({ problem: "unreachable" });
    const usage = (await call("GET", `/campaigns/${campaignId}/ai`, gm)).json.usage;
    const allTime = usage.windows.find((w: { name: string }) => w.name === "all time");
    expect(allTime.features).toEqual([
      { feature: "draft-events", requests: 2, failed: 1, inputTokens: 2100, outputTokens: 300, cacheReadTokens: 0 },
      { feature: "sweep", requests: 1, failed: 1, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    ]);
    expect(allTime.total).toMatchObject({ requests: 3, failed: 2, inputTokens: 2100 });
    expect(usage.windows.map((w: { name: string }) => w.name)).toEqual(["30 days", "all time"]);
  });

  it("counts the running session apart", async () => {
    const { gm, campaignId } = await table();
    await call("PUT", `/campaigns/${campaignId}/ai/key`, gm, { key: KEY });
    await call("POST", `/campaigns/${campaignId}/actions`, gm, { id: "s1", action: { type: "session.start", present: [] } });
    const usage = (await call("GET", `/campaigns/${campaignId}/ai`, gm)).json.usage;
    expect(usage.windows.map((w: { name: string }) => w.name)).toEqual(["session", "30 days", "all time"]);
  });
});

describe("the adapter's pieces", () => {
  it("seals with the server's secret and opens with nothing else", () => {
    const sealed = seal(SECRET, KEY);
    expect(sealed).not.toBe(seal(SECRET, KEY));
    expect(unseal(SECRET, sealed)).toBe(KEY);
    expect(() => unseal("another secret", sealed)).toThrow();
  });

  it("names the provider's errors as problems the GM can act on", () => {
    const headers = new Headers();
    expect(problemOf(new Anthropic.AuthenticationError(401, undefined, "no", headers)).problem).toBe("key");
    expect(problemOf(new Anthropic.NotFoundError(404, undefined, "no", headers)).problem).toBe("model");
    expect(problemOf(new Anthropic.RateLimitError(429, undefined, "no", headers)).problem).toBe("rate");
    expect(problemOf(new Anthropic.APIConnectionError({ message: "down" })).problem).toBe("unreachable");
    expect(problemOf(new Anthropic.APIError(402, undefined, "pay", headers)).problem).toBe("billing");
  });
});
