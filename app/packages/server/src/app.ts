/**
 * The HTTP API. Every route is JSON under /api. A caller identifies themselves with
 * `Authorization: Bearer <token>`; the token is issued once, when a person creates a campaign
 * or accepts an invite without one. The actor on every recorded action comes from the token,
 * never from the request body.
 */
import { submissionSchema } from "@gradebreaker/record";
import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { z } from "zod";
import { HttpError, type Service, type User } from "./service.ts";

type Env = { Variables: { user: User | null } };

const createCampaign = z.object({ name: z.string(), displayName: z.string().optional() });
const createInvite = z.object({
  maxUses: z.number().int().positive().optional(),
  expiresInHours: z.number().positive().optional(),
});
const acceptInvite = z.object({ displayName: z.string().optional() });

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

export function createApp(service: Service) {
  const app = new Hono<Env>().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as ContentfulStatusCode);
    console.error(err);
    return c.json({ error: "server error" }, 500);
  });

  app.use(async (c, next) => {
    const auth = c.req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;
    c.set("user", await service.userByToken(token));
    await next();
  });

  app.get("/health", (c) => c.json({ ok: true, rulesVersion: service.rulesVersion }));

  app.get("/me", async (c) => {
    const user = c.get("user");
    if (!user) throw new HttpError(401, "sign-in token required");
    return c.json({ user, campaigns: await service.campaignsOf(user.id) });
  });

  app.post("/campaigns", async (c) => {
    const b = await body(c, createCampaign);
    return c.json(await service.createCampaign(c.get("user"), b.name, b.displayName), 201);
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
    const b = await body(c, acceptInvite);
    const out = await service.acceptInvite(c.req.param("code"), c.get("user"), b.displayName);
    return c.json(out, out.joined ? 201 : 200);
  });

  return app;
}
