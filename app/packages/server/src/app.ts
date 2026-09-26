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
import type { DevSignIn } from "./devauth.ts";
import { HttpError, type Service, type User } from "./service.ts";

type Env = { Variables: { user: User | null } };

const createCampaign = z.object({ name: z.string() });
const rename = z.object({ displayName: z.string() });
const devName = z.object({ name: z.string().trim().min(1).max(40) });
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
}

export function createApp(service: Service, opts: AppOptions = {}) {
  const connected = opts.connected ?? (() => 0);
  const app = new Hono<Env>().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as ContentfulStatusCode);
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
