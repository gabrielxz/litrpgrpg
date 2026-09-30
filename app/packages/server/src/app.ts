/**
 * The HTTP API and the web client. Every API route is JSON under /api. A caller identifies
 * themselves with `Authorization: Bearer <Supabase access token>`. The actor on every
 * recorded action comes from the token, never from the request body. Every other path serves
 * the built web client, with unknown paths falling back to its index so deep links load.
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { submissionSchema } from "@gradebreaker/record";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { type CampaignAi, ModelError } from "./ai.ts";
import type { DevSignIn } from "./devauth.ts";
import { type Drafts, MAX_TALK_CHARS } from "./drafts.ts";
import type { LiveDrafting } from "./live-drafting.ts";
import { type Listening, ListeningRefused } from "./listening.ts";
import { HttpError, type Service, type User } from "./service.ts";

type Env = { Variables: { user: User | null } };

const createCampaign = z.object({ name: z.string() });
const rename = z.object({ displayName: z.string() });
const devName = z.object({ name: z.string().trim().min(1).max(40) });
const characterSpec = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("custom"),
    name: z.string().max(100),
    background: z.string().max(500),
    stats: z.record(z.string(), z.number().int()),
  }),
  z.object({ kind: z.literal("pregen"), pregen: z.string().max(100) }),
]);
const joinBody = z.object({ campaignId: z.string().min(1) });
const aiKey = z.object({ key: z.string().min(1).max(500), model: z.string().optional() });
const aiModel = z.object({ model: z.string() });
const draftOpportunityBody = z.object({ characterId: z.string().max(80), situation: z.string().max(2000).optional() });
const liveDraftingBody = z.object({ on: z.boolean() });
const draftTalk = z.object({ text: z.string().max(MAX_TALK_CHARS * 2) });
const draftClassesBody = z.object({ characterId: z.string().max(80), keepsDoing: z.string().max(2000).optional(), guarded: z.boolean().optional() });
const draftSummaryBody = z.object({ characterId: z.string().max(80), integration: z.boolean().optional() });
const draftMessageBody = z.object({ to: z.array(z.string().max(80)).max(50), gist: z.string().max(2000) });
const draftVisionBody = z.object({ characterId: z.string().max(80), memoryId: z.string().max(80), family: z.string().max(40), words: z.string().max(500).optional() });
const consentBody = z.object({ give: z.boolean() });
const listeningBody = z.object({ mode: z.enum(["off", "listening", "paused"]) });
const acceptDraft = submissionSchema.pick({ id: true, action: true });
const createInvite = z.object({
  maxUses: z.number().int().positive().optional(),
  expiresInHours: z.number().positive().optional(),
});

async function body<T>(c: { req: { json: () => Promise<unknown> } }, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HttpError(400, "the body must be JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, z.prettifyError(parsed.error));
  return parsed.data;
}

export interface AppOptions {
  /** Live connections, for the health check the deploy workflow reads. */
  connected?: () => number;
  /** What the browser needs to reach Supabase Auth; both values are public. */
  supabase?: { url: string; publishableKey: string };
  /** Development sign-in, when enabled (devauth.ts). */
  dev?: DevSignIn;
  /** The built web client's directory; absent in tests. */
  webDist?: string;
  /** The campaigns' language-model keys and usage (ai.ts). */
  ai?: CampaignAi;
  /** Drafts from typed table talk (drafts.ts). */
  drafts?: Drafts;
  /** Consent and the table's listening (listening.ts). */
  listening?: Listening;
  /** Drafting what the listening hears, a window at a time (live-drafting.ts). */
  liveDrafting?: LiveDrafting;
}

export function createApp(service: Service, opts: AppOptions = {}) {
  const connected = opts.connected ?? (() => 0);
  const app = new Hono<Env>().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as ContentfulStatusCode);
    // A provider that cannot be reached or is limiting is a wait; every other problem is the GM's to fix.
    if (err instanceof ModelError)
      return c.json({ error: err.message, problem: err.problem }, err.problem === "rate" || err.problem === "unreachable" ? 503 : 422);
    console.error(err);
    return c.json({ error: "server error" }, 500);
  });

  app.use(async (c, next) => {
    const auth = c.req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    c.set("user", await service.authenticate(token));
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true, rulesVersion: service.rulesVersion, connected: connected() }));

  app.get("/config", (c) =>
    c.json({
      supabaseUrl: opts.supabase?.url ?? null,
      supabasePublishableKey: opts.supabase?.publishableKey ?? null,
      devSignIn: Boolean(opts.dev),
      rulesVersion: service.rulesVersion,
    }),
  );

  app.post("/dev/sign-in", async (c) => {
    if (!opts.dev) throw new HttpError(404, "not found");
    const b = await body(c, devName);
    return c.json({ token: await opts.dev.tokenFor(b.name) });
  });

  /** The rules data a campaign pins, so the client runs the same engine for plans and forms. */
  app.get("/rules/:version", async (c) => {
    if (!c.get("user")) throw new HttpError(401, "sign in first");
    return c.json(await service.rules(c.req.param("version")));
  });

  app.get("/me", async (c) => {
    const user = c.get("user");
    if (!user) throw new HttpError(401, "sign in first");
    return c.json({ user, campaigns: await service.campaignsOf(user.id) });
  });

  app.patch("/me", async (c) => {
    const b = await body(c, rename);
    return c.json({ user: await service.rename(c.get("user"), b.displayName) });
  });

  app.post("/campaigns", async (c) => {
    const b = await body(c, createCampaign);
    return c.json(await service.createCampaign(c.get("user"), b.name), 201);
  });

  app.get("/campaigns/:id", async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    const role = await service.requireMember(id, user);
    return c.json(await service.view(id, { userId: user!.id, role }));
  });

  app.get("/campaigns/:id/players/:userId/view", async (c) =>
    c.json(await service.viewAs(c.req.param("id"), c.get("user"), c.req.param("userId"))),
  );

  app.get("/characters", async (c) => c.json({ characters: await service.unassigned(c.get("user")) }));

  app.post("/characters", async (c) => {
    const spec = await body(c, characterSpec);
    return c.json(await service.createUnassigned(c.get("user"), spec), 201);
  });

  app.delete("/characters/:id", async (c) => {
    await service.deleteUnassigned(c.get("user"), c.req.param("id"));
    return c.body(null, 204);
  });

  app.post("/characters/:id/join", async (c) => {
    const b = await body(c, joinBody);
    return c.json(await service.joinCampaign(c.get("user"), c.req.param("id"), b.campaignId), 201);
  });

  app.get("/campaigns/:id/log", async (c) => {
    const id = c.req.param("id");
    await service.requireGm(id, c.get("user"));
    return c.json({ log: (await service.record(id)).log });
  });

  app.post("/campaigns/:id/actions", async (c) => {
    const s = await body(c, submissionSchema);
    const out = await service.submit(c.req.param("id"), c.get("user"), s);
    return c.json(out, out.duplicate ? 200 : 201);
  });

  app.post("/campaigns/:id/preview", async (c) => {
    const s = await body(c, submissionSchema);
    return c.json(await service.preview(c.req.param("id"), c.get("user"), s));
  });

  // Listening: each person's own consent, and the GM's start, pause, and stop.
  const listening = () => {
    if (!opts.listening) throw new HttpError(404, "not found");
    return opts.listening;
  };
  app.post("/campaigns/:id/listening/consent", async (c) => {
    const id = c.req.param("id");
    await service.requireMember(id, c.get("user"));
    const b = await body(c, consentBody);
    await listening().consent(id, c.get("user")!.id, b.give);
    return c.json({ consented: b.give });
  });
  app.get("/campaigns/:id/heard", async (c) => {
    const id = c.req.param("id");
    await service.requireGm(id, c.get("user"));
    return c.json({ lines: await service.heard(id, c.req.query("session") || undefined) });
  });
  app.post("/campaigns/:id/listening", async (c) => {
    const id = c.req.param("id");
    await service.requireGm(id, c.get("user"));
    const b = await body(c, listeningBody);
    try {
      await listening().set(id, b.mode);
    } catch (e) {
      if (e instanceof ListeningRefused) throw new HttpError(409, e.message);
      throw e;
    }
    return c.json({ mode: b.mode });
  });

  // The GM's key and usage. The key goes in and never comes back out: status carries its last four characters.
  const ai = () => {
    if (!opts.ai) throw new HttpError(404, "not found");
    return opts.ai;
  };
  const aiView = async (id: string) => {
    const session = (await service.record(id)).state.sessions;
    const running = [...session.values()].at(-1);
    return { ...(await ai().status(id)), usage: await ai().usage(id, running && !running.endedAt ? running.startedAt : undefined) };
  };
  app.get("/campaigns/:id/ai", async (c) => {
    const id = c.req.param("id");
    await service.requireGm(id, c.get("user"));
    return c.json(await aiView(id));
  });
  app.put("/campaigns/:id/ai/key", async (c) => {
    const id = c.req.param("id");
    await service.requireGm(id, c.get("user"));
    const b = await body(c, aiKey);
    await ai().setKey(id, c.get("user")!.id, b.key, b.model);
    return c.json(await aiView(id));
  });
  app.put("/campaigns/:id/ai/model", async (c) => {
    const id = c.req.param("id");
    await service.requireGm(id, c.get("user"));
    await ai().setModel(id, (await body(c, aiModel)).model);
    return c.json(await aiView(id));
  });
  app.post("/campaigns/:id/ai/check", async (c) => {
    const id = c.req.param("id");
    await service.requireGm(id, c.get("user"));
    await ai().check(id);
    return c.json(await aiView(id));
  });
  app.delete("/campaigns/:id/ai/key", async (c) => {
    const id = c.req.param("id");
    await service.requireGm(id, c.get("user"));
    await ai().removeKey(id);
    return c.json(await aiView(id));
  });

  // Drafts from typed table talk: the GM's alone, apart from the log until accepted.
  const drafts = () => {
    if (!opts.drafts) throw new HttpError(404, "not found");
    return opts.drafts;
  };
  app.get("/campaigns/:id/drafts", async (c) => {
    const id = c.req.param("id");
    const runs = await drafts().list(id, c.get("user"));
    return c.json({ runs, ...(opts.liveDrafting ? { live: { on: opts.liveDrafting.isOn(id) } } : {}) });
  });
  // What the listening heard: drafted a window at a time while the table talks, or now at the GM's word.
  const liveDrafting = () => {
    if (!opts.liveDrafting) throw new HttpError(404, "not found");
    return opts.liveDrafting;
  };
  app.post("/campaigns/:id/drafts/heard", async (c) => {
    const out = await liveDrafting().now(c.req.param("id"), c.get("user"));
    if (out.run) return c.json({ run: out.run }, 202);
    const why = { "no key": "drafting needs the campaign's key", busy: "a draft is still running; wait for it to finish", "no session": "start a session first", "too few lines": "no line heard since the last draft" }[out.skip!];
    throw new HttpError(409, why);
  });
  app.post("/campaigns/:id/drafts/heard/auto", async (c) => {
    const b = await body(c, liveDraftingBody);
    await liveDrafting().setOn(c.req.param("id"), c.get("user"), b.on);
    return c.json({ live: { on: b.on } });
  });
  app.post("/campaigns/:id/drafts", async (c) => {
    const b = await body(c, draftTalk);
    return c.json({ run: await drafts().start(c.req.param("id"), c.get("user"), b.text) }, 202);
  });
  app.post("/campaigns/:id/opportunities", async (c) => {
    const b = await body(c, draftOpportunityBody);
    return c.json({ run: await drafts().opportunity(c.req.param("id"), c.get("user"), b.characterId, b.situation ?? "") }, 202);
  });
  app.post("/campaigns/:id/class-offers", async (c) => {
    const b = await body(c, draftClassesBody);
    return c.json({ run: await drafts().classOffers(c.req.param("id"), c.get("user"), b.characterId, b.keepsDoing ?? "", Boolean(b.guarded)) }, 202);
  });
  // The System's voice: drafted and returned, never stored; the GM's form holds the draft.
  app.post("/campaigns/:id/voice/message", async (c) => {
    const b = await body(c, draftMessageBody);
    return c.json({ draft: await drafts().message(c.req.param("id"), c.get("user"), b.to, b.gist) });
  });
  app.post("/campaigns/:id/voice/summary", async (c) => {
    const b = await body(c, draftSummaryBody);
    return c.json({ draft: await drafts().characterSummary(c.req.param("id"), c.get("user"), b.characterId, Boolean(b.integration)) });
  });
  app.post("/campaigns/:id/sessions/:session/summary-draft", async (c) => {
    return c.json({ draft: await drafts().sessionSummary(c.req.param("id"), c.get("user"), c.req.param("session")) });
  });
  app.post("/campaigns/:id/voice/vision", async (c) => {
    const b = await body(c, draftVisionBody);
    return c.json({ draft: await drafts().vision(c.req.param("id"), c.get("user"), b.characterId, b.memoryId, b.family, b.words ?? "") });
  });
  app.post("/campaigns/:id/drafts/:run/:item/accept", async (c) => {
    const b = await body(c, acceptDraft);
    const { id, run, item } = c.req.param();
    const out = await drafts().accept(id, c.get("user"), run, item, { id: b.id, action: b.action });
    return c.json(out, out.appended.duplicate ? 200 : 201);
  });
  app.post("/campaigns/:id/drafts/:run/:item/dismiss", async (c) => {
    const { id, run, item } = c.req.param();
    return c.json({ item: await drafts().mark(id, c.get("user"), run, item, "dismissed") });
  });
  app.post("/campaigns/:id/drafts/:run/:item/restore", async (c) => {
    const { id, run, item } = c.req.param();
    return c.json({ item: await drafts().mark(id, c.get("user"), run, item, "open") });
  });

  app.get("/campaigns/:id/invites", async (c) => {
    const id = c.req.param("id");
    await service.requireGm(id, c.get("user"));
    return c.json({ invites: await service.invites(id) });
  });

  app.post("/campaigns/:id/invites", async (c) => {
    const id = c.req.param("id");
    const user = c.get("user");
    await service.requireGm(id, user);
    const b = await body(c, createInvite);
    return c.json(await service.createInvite(id, user!, b), 201);
  });

  app.delete("/campaigns/:id/invites/:code", async (c) => {
    const id = c.req.param("id");
    await service.requireGm(id, c.get("user"));
    await service.revokeInvite(id, c.req.param("code"));
    return c.body(null, 204);
  });

  app.get("/invites/:code", async (c) => c.json(await service.inviteInfo(c.req.param("code"))));

  app.post("/invites/:code/accept", async (c) => {
    const out = await service.acceptInvite(c.req.param("code"), c.get("user"));
    return c.json(out, out.joined ? 201 : 200);
  });

  app.all("/*", () => {
    throw new HttpError(404, "not found");
  });

  if (!opts.webDist) return app;
  const root = new Hono();
  root.route("/", app);
  const dir = relative(process.cwd(), opts.webDist) || ".";
  const index = readFileSync(join(opts.webDist, "index.html"), "utf8");
  root.use("/*", serveStatic({ root: dir }));
  root.get("*", (c) => c.html(index));
  return root;
}
