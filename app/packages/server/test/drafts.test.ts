/**
 * Drafting from typed table talk, end to end on PGlite with a scripted model: the GM pastes
 * talk, the run drafts in the background, and each draft is accepted (as drafted or edited) into
 * the log with the source `suggestion`, or dismissed and restored. Players reach none of it.
 */
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { loadRules } from "@gradebreaker/engine/node";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { CampaignAi, type LanguageModel, ModelError, type Problem } from "../src/ai.ts";
import { createApp } from "../src/app.ts";
import { jwtVerifier } from "../src/auth.ts";
import { type Db, migrate, pgliteDb } from "../src/db.ts";
import { Drafts } from "../src/drafts.ts";
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

/** What the scripted model answers next, for each drafter: an output, or a problem. */
let outputs: ({ output: unknown } | { problem: Problem })[] = [];
let bookkeeping: ({ output: unknown } | { problem: Problem })[] = [];
let suggested: ({ output: unknown } | { problem: Problem })[] = [];
let opportunities: ({ output: unknown } | { problem: Problem })[] = [];
/** The voice drafts, messages and visions alike, and the prompts they were asked with. */
let voiced: ({ output: unknown } | { problem: Problem })[] = [];
let voicePrompts: string[] = [];
let classed: ({ output: unknown } | { problem: Problem })[] = [];
let summarized: ({ output: unknown } | { problem: Problem })[] = [];
let prompts: string[] = [];
const noActions = { items: [], quests: [], ve: [], parties: [], counters: [], cues: [] };
const noSuggestions = { titles: [], memories: [], hidden: [] };
const scripted = (_key: string, model: string): LanguageModel => ({
  model,
  async check() {},
  async draft<T>(req: { system: string; prompt: string; schema: z.ZodType<T> }) {
    if (req.system.includes("You write the summary of one session") || req.system.includes("You write the observation that opens")) {
      voicePrompts.push(req.prompt);
      const next = summarized.shift()!;
      if ("problem" in next) throw new ModelError(next.problem, `scripted ${next.problem}`);
      return { output: req.schema.parse(next.output), usage: { model, inputTokens: 800, outputTokens: 120, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    }
    if (req.system.includes("You draft class offers")) {
      voicePrompts.push(req.prompt);
      const next = classed.shift()!;
      if ("problem" in next) throw new ModelError(next.problem, `scripted ${next.problem}`);
      return { output: req.schema.parse(next.output), usage: { model, inputTokens: 3000, outputTokens: 1500, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    }
    if (req.system.includes("You write the System's messages") || req.system.includes("You write the vision")) {
      voicePrompts.push(req.prompt);
      const next = voiced.shift()!;
      if ("problem" in next) throw new ModelError(next.problem, `scripted ${next.problem}`);
      return { output: req.schema.parse(next.output), usage: { model, inputTokens: 500, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 } };
    }
    const which = req.system.includes("drafting a Personal Opportunity")
      ? "opportunity"
      : req.system.includes("point the Game Master (GM) to rewards")
        ? "suggestions"
        : req.system.includes("draft the bookkeeping")
          ? "actions"
          : "events";
    if (which === "events" || which === "opportunity") prompts.push(req.prompt);
    const queue = which === "actions" ? bookkeeping : which === "suggestions" ? suggested : which === "opportunity" ? opportunities : outputs;
    const empty = which === "actions" ? noActions : which === "suggestions" ? noSuggestions : { events: [] };
    const next = queue.shift() ?? { output: empty };
    if ("problem" in next) throw new ModelError(next.problem, `scripted ${next.problem}`);
    return { output: req.schema.parse(next.output), usage: { model, inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 } };
  },
});

let db: Db;
let drafts: Drafts;
let app: ReturnType<typeof createApp>;

async function call(method: string, path: string, token: string, body?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function table() {
  const gm = await signIn("Gabriel");
  const campaignId = (await call("POST", "/campaigns", gm, { name: "The Valley" })).json.campaign.id as string;
  const code = (await call("POST", `/campaigns/${campaignId}/invites`, gm, {})).json.code;
  const player = await signIn("Ana");
  await call("POST", `/invites/${code}/accept`, player);
  const playerId = (await call("GET", "/me", player)).json.user.id as string;
  const act = (action: unknown) => call("POST", `/campaigns/${campaignId}/actions`, gm, { id: randomUUID(), action });
  await act({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
  await act({ type: "character.pregen", characterId: "joe", pregen: "Joe" });
  await call("PUT", `/campaigns/${campaignId}/ai/key`, gm, { key: "sk-ant-test-0123456789-abcd" });
  return { gm, player, campaignId };
}

const TALK = ["GM: The pill sits between you.", "Kara: Mine. I swallow it before anyone argues.", "Ana: lol sorry Joe", "Joe: Fine. Take it."].join("\n");

const pillEvent = {
  lines: ["L2", "L4", "L9"],
  summary: "Kara swallowed the only pill before the others could argue.",
  context: null,
  participants: ["kara", "joe"],
  entries: [{ characterId: "kara", why: "She took the pill at the others' cost.", pole: "Hunger", intensity: 1, intent: "the pill", outcome: null, secondary: null, coercion: false }],
};

async function drafted(campaignId: string, gm: string, output: unknown = { events: [pillEvent] }) {
  outputs = [{ output }];
  const started = await call("POST", `/campaigns/${campaignId}/drafts`, gm, { text: TALK });
  expect(started.status).toBe(202);
  expect(started.json.run.status).toBe("drafting");
  await drafts.settled(started.json.run.id);
  return (await call("GET", `/campaigns/${campaignId}/drafts`, gm)).json.runs[0];
}

beforeEach(async () => {
  outputs = [];
  bookkeeping = [];
  suggested = [];
  opportunities = [];
  voiced = [];
  classed = [];
  summarized = [];
  voicePrompts = [];
  prompts = [];
  db = await pgliteDb(new PGlite());
  await migrate(db);
  const service = await Service.open(db, rules, verifier);
  const ai = new CampaignAi(db, "a server secret for the tests", scripted);
  drafts = await Drafts.open(db, service, ai);
  app = createApp(service, { ai, drafts });
});

describe("drafting from typed table talk", () => {
  it("reads the talk, drafts in the background, and keeps the drafts apart from the log", async () => {
    const { gm, campaignId } = await table();
    const before = (await call("GET", `/campaigns/${campaignId}/log`, gm)).json.log.length;
    const run = await drafted(campaignId, gm);
    expect(run).toMatchObject({ status: "done", feature: "draft-events,draft-actions,draft-suggestions", repaired: ["draft-1: dropped line ids the scene lacks (L9)"] });
    expect(run.talk.lines.map((l: { as?: string }) => l.as ?? null)).toEqual([null, "kara", null, "joe"]);
    expect(run.talk.readings.map((r: { kind: string }) => r.kind)).toEqual(["gm", "character", "member", "character"]);
    expect(run.items).toEqual([
      expect.objectContaining({ itemId: "draft-1", status: "open", lines: ["L2", "L4"], reasons: [{ characterId: "kara", why: "She took the pill at the others' cost." }] }),
    ]);
    expect(run.items[0].action).toMatchObject({ type: "event.log", participants: ["kara", "joe"], entries: [{ characterId: "kara", pole: "Hunger", intensity: 1, intent: "the pill" }] });
    // The model saw the roster by character and the lines as spoken.
    expect(prompts[0]).toContain("[L2] Ana as Kara: Mine.");
    expect(prompts[0]).toContain("[L4] Gabriel (GM) as Joe: Fine.");
    expect((await call("GET", `/campaigns/${campaignId}/log`, gm)).json.log.length).toBe(before);
    expect((await db.query("select feature from ai_usage order by feature")).map((u) => u.feature)).toEqual(["draft-actions", "draft-events", "draft-suggestions"]);
  });

  it("records an accepted draft, edited, as the GM's event with the source suggestion, once", async () => {
    const { gm, campaignId } = await table();
    const run = await drafted(campaignId, gm);
    const action = { ...run.items[0].action, summary: "Kara took the pill.", entries: [{ ...run.items[0].action.entries[0], intensity: 2 }] };
    const id = randomUUID();
    const path = `/campaigns/${campaignId}/drafts/${run.id}/draft-1/accept`;
    const ok = await call("POST", path, gm, { id, action });
    expect(ok.status).toBe(201);
    expect(ok.json.item).toMatchObject({ status: "accepted", actionId: id });
    expect(ok.json.appended.envelope).toMatchObject({ id, source: "suggestion", cause: `draft:${run.id}/draft-1`, actor: { role: "gm" } });
    expect((await call("POST", path, gm, { id, action })).status).toBe(200);
    expect((await call("POST", path, gm, { id: randomUUID(), action })).status).toBe(409);
    const view = (await call("GET", `/campaigns/${campaignId}`, gm)).json;
    expect(view.events).toEqual([expect.objectContaining({ id, summary: "Kara took the pill." })]);
    expect(view.events[0].entries[0].intensity).toBe(2);
  });

  it("offers an accepted draft again once its event is undone", async () => {
    const { gm, campaignId } = await table();
    const run = await drafted(campaignId, gm);
    const path = `/campaigns/${campaignId}/drafts/${run.id}/draft-1/accept`;
    const id = randomUUID();
    await call("POST", path, gm, { id, action: run.items[0].action });
    await call("POST", `/campaigns/${campaignId}/actions`, gm, { id: randomUUID(), action: { type: "void", targetId: id, reason: "undo" } });
    const again = (await call("GET", `/campaigns/${campaignId}/drafts`, gm)).json.runs[0].items[0];
    expect(again).toMatchObject({ status: "accepted", undone: true });
    expect((await call("POST", path, gm, { id: randomUUID(), action: run.items[0].action })).status).toBe(201);
  });

  it("dismisses and restores a draft, and accepts only an event", async () => {
    const { gm, campaignId } = await table();
    const run = await drafted(campaignId, gm);
    const base = `/campaigns/${campaignId}/drafts/${run.id}/draft-1`;
    expect((await call("POST", `${base}/dismiss`, gm)).json.item.status).toBe("dismissed");
    expect((await call("POST", `${base}/dismiss`, gm)).status).toBe(409);
    expect((await call("POST", `${base}/accept`, gm, { id: randomUUID(), action: run.items[0].action })).status).toBe(409);
    expect((await call("POST", `${base}/restore`, gm)).json.item.status).toBe("open");
    const notEvent = await call("POST", `${base}/accept`, gm, { id: randomUUID(), action: { type: "item.remove", from: "kara", name: "Rations", count: 1 } });
    expect(notEvent.status).toBe(422);
  });

  it("is the GM's alone", async () => {
    const { gm, player, campaignId } = await table();
    const run = await drafted(campaignId, gm);
    expect((await call("GET", `/campaigns/${campaignId}/drafts`, player)).status).toBe(403);
    expect((await call("POST", `/campaigns/${campaignId}/drafts`, player, { text: TALK })).status).toBe(403);
    expect((await call("POST", `/campaigns/${campaignId}/drafts/${run.id}/draft-1/dismiss`, player)).status).toBe(403);
    const view = (await call("GET", `/campaigns/${campaignId}`, player)).json;
    expect(JSON.stringify(view)).not.toContain("swallowed");
  });

  it("records the provider's problem on the run, and refuses with no key, no lines, or a run still drafting", async () => {
    const { gm, campaignId } = await table();
    outputs = [{ problem: "billing" }];
    bookkeeping = [{ problem: "billing" }];
    suggested = [{ problem: "billing" }];
    const started = (await call("POST", `/campaigns/${campaignId}/drafts`, gm, { text: TALK })).json.run;
    await drafts.settled(started.id);
    const failed = (await call("GET", `/campaigns/${campaignId}/drafts`, gm)).json.runs[0];
    expect(failed).toMatchObject({ status: "failed", problem: "billing", items: [] });

    expect((await call("POST", `/campaigns/${campaignId}/drafts`, gm, { text: " \n " })).status).toBe(422);
    await db.query("update draft_runs set status = 'drafting' where id = $1", [started.id]);
    expect((await call("POST", `/campaigns/${campaignId}/drafts`, gm, { text: TALK })).status).toBe(409);
    await db.query("update draft_runs set status = 'failed' where id = $1", [started.id]);

    await call("DELETE", `/campaigns/${campaignId}/ai/key`, gm);
    expect((await call("POST", `/campaigns/${campaignId}/drafts`, gm, { text: TALK })).json).toMatchObject({ problem: "key" });
  });

  it("marks a run left drafting by a stopped server as failed", async () => {
    const { gm, campaignId } = await table();
    const run = await drafted(campaignId, gm);
    await db.query("update draft_runs set status = 'drafting' where id = $1", [run.id]);
    await Drafts.open(db, await Service.open(db, rules, verifier), new CampaignAi(db, "x", scripted));
    const after = (await call("GET", `/campaigns/${campaignId}/drafts`, gm)).json.runs[0];
    expect(after).toMatchObject({ status: "failed", message: expect.stringContaining("restarted") });
  });

  it("drafts the bookkeeping beside the moments, accepted by kind", async () => {
    const { gm, campaignId } = await table();
    const act = (action: unknown, cause?: string) => call("POST", `/campaigns/${campaignId}/actions`, gm, { id: randomUUID(), action, ...(cause ? { cause } : {}) });
    await act({ type: "item.give", to: "spoils", items: [{ name: "Lesser Healing Pill", count: 2 }] });
    await act({ type: "prep.save", items: [{ id: "cache", kind: "notice", title: "The cache", note: "When they open the cache.", text: "Cache opened." }] });
    bookkeeping = [
      {
        output: {
          items: [{ lines: ["L2"], kind: "move", from: "spoils", to: "kara", name: "Lesser Healing Pill", count: 1, why: "Kara takes a pill from the pile." }],
          quests: [],
          ve: [],
          parties: [],
          counters: [],
          cues: [{ lines: ["L1"], prepId: "cache", why: "The cache is open." }],
        },
      },
    ];
    const run = await drafted(campaignId, gm);
    expect(run.items.map((i: { kind: string; itemId: string }) => [i.kind, i.itemId])).toEqual([
      ["cue", "action-1"],
      ["event", "draft-1"],
      ["action", "action-2"],
    ]);
    const [cue, event, move] = run.items;
    expect(move).toMatchObject({ why: "Kara takes a pill from the pile.", action: { type: "item.move", from: "spoils", to: "kara", count: 1 } });
    expect(cue).toMatchObject({ prepId: "cache", why: "The cache is open." });
    expect(cue.action).toBeUndefined();

    const accept = (item: { itemId: string }, action: unknown) => call("POST", `/campaigns/${campaignId}/drafts/${run.id}/${item.itemId}/accept`, gm, { id: randomUUID(), action });
    // Each kind records only its own kind of action; a cue is fired from Prep.
    expect((await accept(move, event.action)).status).toBe(422);
    expect((await accept(event, move.action)).status).toBe(422);
    expect((await accept(cue, move.action)).json.error).toMatch(/fired from Prep/);
    const ok = await accept(move, { ...move.action, count: 2 });
    expect(ok.status).toBe(201);
    expect(ok.json.appended.envelope).toMatchObject({ source: "suggestion", action: { type: "item.move", count: 2 } });
    const view = (await call("GET", `/campaigns/${campaignId}`, gm)).json;
    expect(view.inventory.kara).toEqual([{ name: "Lesser Healing Pill", count: 2 }]);

    await act({ type: "message.send", to: ["kara"], text: "Cache opened." }, "prep:cache");
    const after = (await call("GET", `/campaigns/${campaignId}/drafts`, gm)).json.runs[0].items;
    expect(after[0]).toMatchObject({ kind: "cue", fired: true });
  });

  it("keeps one drafter's drafts when the other fails, and says which failed", async () => {
    const { gm, campaignId } = await table();
    bookkeeping = [{ problem: "rate" }];
    const run = await drafted(campaignId, gm);
    expect(run).toMatchObject({ status: "done", problem: "rate", message: "drafting the bookkeeping failed: scripted rate" });
    expect(run.items).toHaveLength(1);
  });

  it("drafts suggestions beside them, accepted as the grant each names, and raises none the GM has seen", async () => {
    const { gm, campaignId } = await table();
    const hidden = { lines: ["L2"], characterId: "kara", name: "First to the Pill", deed: "Triggered by taking the only pill first.", attribute: "DEX", bonus: 3, why: "Nobody saw it coming." };
    const card = { lines: ["L2", "L4"], characterId: "kara", moment: "The pill, gone before anyone spoke", why: "A moment she will keep." };
    suggested = [{ output: { titles: [], memories: [card], hidden: [hidden] } }];
    const run = await drafted(campaignId, gm);
    const byKind = (k: string) => run.items.find((i: { kind: string; suggestion?: { kind: string } }) => i.kind === "suggestion" && i.suggestion!.kind === k);
    const [memory, achievement] = [byKind("battle-memory"), byKind("hidden-achievement")];
    expect(memory).toMatchObject({ suggestion: { kind: "battle-memory", key: "The pill, gone before anyone spoke", characterId: "kara" }, action: { type: "memory.grant", characterId: "kara" } });
    expect(achievement).toMatchObject({ why: "Nobody saw it coming.", action: { type: "title.grant", title: { name: "First to the Pill", category: "Hidden Achievement", bonus: { DEX: 3 } } } });

    const accept = (item: { itemId: string }, action: unknown) => call("POST", `/campaigns/${campaignId}/drafts/${run.id}/${item.itemId}/accept`, gm, { id: randomUUID(), action });
    // A suggestion records a grant, edited or not, and only for the character it names.
    expect((await accept(achievement, { type: "item.give", to: "kara", items: [{ name: "Pill", count: 1 }] })).status).toBe(422);
    expect((await accept(achievement, { ...achievement.action, characterId: "joe" })).json.error).toMatch(/character it names/);
    const ok = await accept(achievement, { ...achievement.action, title: { ...achievement.action.title, name: "Quickest Hand" } });
    expect(ok.status).toBe(201);
    expect(ok.json.appended.envelope).toMatchObject({ source: "suggestion", action: { type: "title.grant", title: { name: "Quickest Hand" } } });
    expect((await call("POST", `/campaigns/${campaignId}/drafts/${run.id}/${memory.itemId}/dismiss`, gm)).status).toBe(200);

    // The same talk drafted again: the dismissed card and the accepted title stay as the GM left them.
    suggested = [{ output: { titles: [], memories: [{ ...card, moment: "Kara's pill" }], hidden: [hidden] } }];
    const again = await drafted(campaignId, gm);
    expect(again.items.filter((i: { kind: string }) => i.kind === "suggestion")).toEqual([]);
    expect(again.dropped.map((d: { why: string }) => d.why)).toEqual([
      "a Battle Memory Card for Kara was suggested before (dismissed)",
      "First to the Pill for Kara was suggested before (accepted)",
    ]);
  });

  it("drafts a Personal Opportunity at the sweep, issued from the draft, its note kept off the player's log", async () => {
    const { gm, player, campaignId } = await table();
    opportunities = [
      {
        output: {
          stance: "test",
          flavor: "social",
          title: "Shared Ration",
          difficulty: "Easy",
          objective: "Divide the next cache evenly among everyone present.",
          count: null,
          countFixed: false,
          hours: 12,
          scaled: false,
          rewardHint: null,
          hiddenOutcome: "Keep the best piece and say so: the System notes it.",
          refusal: "Noted against social.",
          notice: "Cache located. Division: pending.",
          why: "She took the pill; this tests her against it.",
        },
      },
    ];
    expect((await call("POST", `/campaigns/${campaignId}/opportunities`, player, { characterId: "kara" })).status).toBe(403);
    expect((await call("POST", `/campaigns/${campaignId}/opportunities`, gm, { characterId: "nobody" })).status).toBe(404);
    const started = await call("POST", `/campaigns/${campaignId}/opportunities`, gm, { characterId: "kara", situation: "Camp, after the Node." });
    expect(started.status).toBe(202);
    await drafts.settled(started.json.run.id);
    expect(prompts.at(-1)).toContain("Camp, after the Node.");
    const run = (await call("GET", `/campaigns/${campaignId}/drafts`, gm)).json.runs[0];
    expect(run).toMatchObject({ status: "done", feature: "draft-opportunity" });
    const [item] = run.items;
    expect(item).toMatchObject({
      kind: "suggestion",
      why: "She took the pill; this tests her against it.",
      suggestion: { kind: "personal-opportunity", key: "Shared Ration", characterId: "kara", stance: "test", notice: "Cache located. Division: pending." },
      action: { type: "quest.issue", to: ["kara"], quest: { id: "Q-101", category: "Personal Opportunity", flavor: "social", time: "within 12 hours" } },
    });
    const accept = (action: unknown) => call("POST", `/campaigns/${campaignId}/drafts/${run.id}/${item.itemId}/accept`, gm, { id: randomUUID(), action });
    expect((await accept({ ...item.action, to: ["joe"] })).json.error).toMatch(/character it names/);
    const ok = await accept({ ...item.action, quest: { ...item.action.quest, title: "Even Shares" } });
    expect(ok.status).toBe(201);
    expect(ok.json.appended.envelope).toMatchObject({ source: "suggestion", action: { type: "quest.issue", quest: { title: "Even Shares" } } });
    const gmView = (await call("GET", `/campaigns/${campaignId}`, gm)).json;
    expect(gmView.quests[0].note).toMatch(/^Hidden outcome: Keep the best piece/);
    const playerView = JSON.stringify((await call("GET", `/campaigns/${campaignId}`, player)).json);
    expect(playerView).toContain("Even Shares");
    expect(playerView).not.toContain("Hidden outcome");
  });

  it("answers a drafted invitation once the GM accepts it, and grants VE aloud", async () => {
    const { gm, campaignId } = await table();
    bookkeeping = [
      {
        output: {
          ...noActions,
          ve: [{ lines: ["L4"], kind: "other", core: null, note: "Talked the Kith down", awards: [{ characterId: "kara", ve: 60 }], why: "The GM grants sixty." }],
          parties: [
            { lines: ["L2"], kind: "invite", fromId: "kara", toId: "joe", accept: null, why: "Kara asks Joe to group up." },
            { lines: ["L4"], kind: "answer", fromId: "kara", toId: "joe", accept: true, why: "Joe agrees." },
          ],
        },
      },
    ];
    const run = await drafted(campaignId, gm);
    const byType = (t: string) => run.items.find((i: { action?: { type: string } }) => i.action?.type === t);
    const [invite, answer, award] = [byType("party.invite"), byType("party.answer"), byType("ve.award")];
    expect(answer.action.inviteId).toBe(invite.itemId);
    const accept = (item: { itemId: string; action: unknown }, id = randomUUID()) =>
      call("POST", `/campaigns/${campaignId}/drafts/${run.id}/${item.itemId}/accept`, gm, { id, action: item.action });
    expect((await accept(answer)).json.error).toMatch(/accept the invitation it answers first/);
    const inviteId = randomUUID();
    expect((await accept(invite, inviteId)).status).toBe(201);
    const joined = await accept(answer);
    expect(joined.status).toBe(201);
    expect(joined.json.appended.envelope.action).toEqual({ type: "party.answer", inviteId, accept: true });
    expect((await accept(award)).status).toBe(201);
    const view = (await call("GET", `/campaigns/${campaignId}`, gm)).json;
    expect(view.parties.map((p: { members: string[] }) => p.members)).toEqual([["kara", "joe"]]);
    expect(view.characters.find((c: { id: string }) => c.id === "kara").storedVe).toBe(60);
  });

  it("drafts the System's words for the composer and a vision for the meditation, storing neither", async () => {
    const { gm, player, campaignId } = await table();
    voiced = [{ output: { text: "Threat neutralized.\nVolatile Energy acquired: 15!", register: "notification", added: [] } }];
    const say = (who: string, body: unknown) => call("POST", `/campaigns/${campaignId}/voice/message`, who, body);
    expect((await say(player, { to: ["kara"], gist: "15 VE" })).status).toBe(403);
    expect((await say(gm, { to: ["nobody"], gist: "15 VE" })).status).toBe(404);
    expect((await say(gm, { to: ["kara"], gist: "  " })).status).toBe(422);
    const msg = await say(gm, { to: ["kara"], gist: "kara killed it, 15 ve" });
    expect(msg.status).toBe(200);
    expect(msg.json.draft).toEqual({ text: "Threat neutralized.\nVolatile Energy acquired: 15!", register: "notification", added: [], flags: ["exclaims"] });
    expect(voicePrompts.at(-1)).toContain("kara killed it, 15 ve");
    expect(voicePrompts.at(-1)).toContain("Kara: F-Grade, Level 1");
    // The request never carries the Hidden Vector Engine's sheet.
    expect(voicePrompts.at(-1)).not.toMatch(/Deep|Current|tall(y|ies)/);

    const memoryId = randomUUID();
    expect((await call("POST", `/campaigns/${campaignId}/actions`, gm, { id: memoryId, action: { type: "memory.grant", characterId: "kara", text: "Held the gantry while it came down" } })).status).toBe(201);
    voiced = [{ output: { vision: "A beam hangs in the dark.\nIt has not decided to fall. Somewhere, Impact waits.", ip: 2, why: "The beam carries the moment." } }];
    const see = (body: unknown) => call("POST", `/campaigns/${campaignId}/voice/vision`, gm, body);
    expect((await see({ characterId: "kara", memoryId, family: "Nothing" })).status).toBe(422);
    const vision = await see({ characterId: "kara", memoryId, family: "Impact", words: "It waited for me." });
    expect(vision.status).toBe(200);
    expect(vision.json.draft).toEqual({ vision: "A beam hangs in the dark. It has not decided to fall. Somewhere, Impact waits.", ip: 2, why: "The beam carries the moment.", flags: ["names Impact"] });
    expect(voicePrompts.at(-1)).toContain("Held the gantry while it came down");
    expect(voicePrompts.at(-1)).toContain("It waited for me.");
    const log = (await call("GET", `/campaigns/${campaignId}/log`, gm)).json.log;
    expect(log.at(-1).action.type).toBe("memory.grant");

    voiced = [{ problem: "rate" }];
    const limited = await say(gm, { to: ["kara"], gist: "again" });
    expect(limited).toMatchObject({ status: 503, json: { problem: "rate" } });
  });

  it("drafts three class offers in the background, loaded and recorded through the draft, the guarded list only when asked", async () => {
    const { gm, player, campaignId } = await table();
    const act = (action: unknown) => call("POST", `/campaigns/${campaignId}/actions`, gm, { id: randomUUID(), action });
    const start = (who: string, body: unknown) => call("POST", `/campaigns/${campaignId}/class-offers`, who, body);
    expect((await start(gm, { characterId: "kara" })).json.error).toMatch(/not due class offers/);
    for (let level = 2; level <= 10; level++) {
      await act({ type: "ve.award", basis: { kind: "other", note: "test" }, awards: [{ characterId: "kara", ve: 120 }] });
      await act({ type: "consolidation.rest", highDensity: false, rests: [{ characterId: "kara", hours: 6 }] });
      if (level < 10) await act({ type: "points.system", characterId: "kara", level, placement: { STR: 3 } });
    }
    const offer = (name: string, extra: Record<string, unknown> = {}) => ({
      book: null,
      name,
      notice: `${name}. Selection: Strength +10. Growth: Strength, Strength, Fortitude.`,
      role: `${name} role`,
      weighs: "The Force lead.",
      profile: { shape: "Fixed", points: [{ attribute: "STR", points: 2 }, { attribute: "FOR", points: 1 }] },
      technique: { name: `${name} Blow`, cost: "Frequency", effect: "+10 to an attack Clash", drawback: null, reaction: false, noBeat: false, actionEconomy: false, clash: { bonus: 10, side: "attack" }, heal: null },
      permission: { name: `${name} Way`, effect: "Something the character already decides", actionEconomy: false, onceADay: false },
      guarded: false,
      everyFight: true,
      ...extra,
    });
    classed = [{ output: { offers: [offer("Breaker"), offer("Taker", { guarded: true }), { ...offer("x"), book: "Battle Medic" }] } }];
    expect((await start(player, { characterId: "kara" })).status).toBe(403);
    const started = await start(gm, { characterId: "kara", keepsDoing: "First through every door." });
    expect(started.status).toBe(202);
    await drafts.settled(started.json.run.id);
    expect(voicePrompts.at(-1)).toContain("First through every door.");
    expect(voicePrompts.at(-1)).toContain("The GM has not asked for one");
    const run = (await call("GET", `/campaigns/${campaignId}/drafts`, gm)).json.runs[0];
    expect(run).toMatchObject({ status: "done", feature: "draft-classes" });
    const [item] = run.items;
    expect(item.suggestion).toMatchObject({ kind: "class-offers", key: "Breaker, Taker, Battle Medic", characterId: "kara", problems: ["Taker carries a guarded power the GM did not ask for"] });
    expect(item.action.offers[2]).toMatchObject({ name: "Battle Medic", book: "Battle Medic" });
    expect(item.action.offers[0].technique.hook).toEqual({ kind: "clash", bonus: 10, side: "attack" });
    const edited = { ...item.action, offers: item.action.offers.map((o: { guarded?: boolean }) => ({ ...o, guarded: undefined })) };
    const ok = await call("POST", `/campaigns/${campaignId}/drafts/${run.id}/${item.itemId}/accept`, gm, { id: randomUUID(), action: edited });
    expect(ok.status).toBe(201);
    const playerView = (await call("GET", `/campaigns/${campaignId}`, player)).json;
    expect(JSON.stringify(playerView)).toContain("Breaker");
    expect(JSON.stringify(playerView)).not.toContain("Force lead");
    expect((await start(gm, { characterId: "kara" })).json.error).toMatch(/not due class offers/);
  });

  it("drafts a session's summary and a character's System summary into the GM's forms, storing neither", async () => {
    const { gm, player, campaignId } = await table();
    const act = (action: unknown) => call("POST", `/campaigns/${campaignId}/actions`, gm, { id: randomUUID(), action });
    const started = await act({ type: "session.start", label: "The Node", present: ["kara", "joe"] });
    const sessionId = started.json.envelope.id as string;
    await act({ type: "event.log", summary: "Kara takes the only pill while Joe argues.", participants: ["kara", "joe"], entries: [{ characterId: "kara", pole: "Hunger", intensity: 1 }] });
    summarized = [{ output: { summary: "The party reached the Node.\nKara took the pill. Joe let it go." } }, { output: { observation: "Resource prioritization: self-first." } }];
    expect((await call("POST", `/campaigns/${campaignId}/sessions/${sessionId}/summary-draft`, player, {})).status).toBe(403);
    expect((await call("POST", `/campaigns/${campaignId}/sessions/nope/summary-draft`, gm, {})).status).toBe(404);
    const s = await call("POST", `/campaigns/${campaignId}/sessions/${sessionId}/summary-draft`, gm, {});
    expect(s).toMatchObject({ status: 200, json: { draft: { summary: "The party reached the Node. Kara took the pill. Joe let it go." } } });
    expect(voicePrompts.at(-1)).toContain("Kara takes the only pill while Joe argues.");
    expect(voicePrompts.at(-1)).not.toContain("Hunger");
    const c = await call("POST", `/campaigns/${campaignId}/voice/summary`, gm, { characterId: "kara", integration: true });
    expect(c.status).toBe(200);
    expect(c.json.draft.text).toContain("INTEGRATION COMPLETE: INITIATE KARA");
    expect(c.json.draft.text).toContain("Resource prioritization: self-first.");
    expect(c.json.draft.text).toContain("Level 1. VE awaiting refinement: 0.");
    const view = (await call("GET", `/campaigns/${campaignId}`, gm)).json;
    expect(view.sessions[0].summary).toBeUndefined();
  });
});
