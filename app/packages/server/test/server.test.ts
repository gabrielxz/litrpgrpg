/**
 * The server end to end on PGlite: sign-in, campaigns, invites, the action log through HTTP,
 * what a player may see, persistence across a restart, and the live channel on a real socket.
 * Sign-in tokens are signed with a key made for the test and checked the way Supabase's are.
 */
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { serve } from "@hono/node-server";
import { loadRules } from "@gradebreaker/engine/node";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createApp } from "../src/app.ts";
import { jwtVerifier } from "../src/auth.ts";
import { type Db, migrate, pgliteDb } from "../src/db.ts";
import { LiveHub } from "../src/live.ts";
import { Service } from "../src/service.ts";

const rules = loadRules();
const ISSUER = "https://test-project.supabase.co/auth/v1";
const { privateKey, publicKey } = await generateKeyPair("ES256");
const verifier = jwtVerifier(createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), alg: "ES256" }] }), ISSUER);
const stranger = await generateKeyPair("ES256");

/** A Supabase-shaped access token for a Google sign-in. */
async function signIn(
  fullName: string | null,
  opts: { sub?: string; email?: string; expiresIn?: string; key?: CryptoKey; audience?: string } = {},
) {
  return new SignJWT({
    email: opts.email ?? `${(fullName ?? "someone").toLowerCase().replace(/\W+/g, ".")}@example.com`,
    role: "authenticated",
    user_metadata: fullName ? { full_name: fullName } : {},
  })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(opts.sub ?? randomUUID())
    .setIssuer(ISSUER)
    .setAudience(opts.audience ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "1h")
    .sign(opts.key ?? privateKey);
}

let db: Db;
let service: Service;
let app: ReturnType<typeof createApp>;

async function fresh() {
  db = await pgliteDb(new PGlite());
  await migrate(db);
  service = await Service.open(db, rules, verifier);
  app = createApp(service);
}

async function call(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  const res = await app.request(`/api${path}`, {
    method,
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

/** A campaign with a signed-in GM and one signed-in player. */
async function table() {
  const gm = await signIn("Gabriel");
  const created = await call("POST", "/campaigns", { token: gm, body: { name: "The Valley" } });
  const campaignId = created.json.campaign.id as string;
  const inv = await call("POST", `/campaigns/${campaignId}/invites`, { token: gm, body: {} });
  const player = await signIn("Ana");
  await call("POST", `/invites/${inv.json.code}/accept`, { token: player });
  const playerId = (await call("GET", "/me", { token: player })).json.user.id as string;
  return { campaignId, gm, player, playerId, invite: inv.json.code as string };
}

let n = 0;
const act = (campaignId: string, token: string, action: unknown, id = `act-${++n}`) =>
  call("POST", `/campaigns/${campaignId}/actions`, { token, body: { id, action } });

beforeEach(fresh);

describe("sign-in", () => {
  it("records a person on first sight, named from their Google profile", async () => {
    const token = await signIn("Gabriel Beal");
    const me = await call("GET", "/me", { token });
    expect(me.json).toMatchObject({ user: { displayName: "Gabriel Beal" }, campaigns: [] });
    const unnamed = await signIn(null, { email: "rae.k@example.com" });
    expect((await call("GET", "/me", { token: unnamed })).json.user.displayName).toBe("rae.k");
  });

  it("refuses missing, expired, forged, and wrong-audience tokens", async () => {
    expect((await call("GET", "/me")).status).toBe(401);
    expect((await call("GET", "/me", { token: "not-a-token" })).status).toBe(401);
    expect((await call("GET", "/me", { token: await signIn("Late", { expiresIn: "-1m" }) })).status).toBe(401);
    expect((await call("GET", "/me", { token: await signIn("Forger", { key: stranger.privateKey }) })).status).toBe(401);
    expect((await call("GET", "/me", { token: await signIn("Anon", { audience: "anon" }) })).status).toBe(401);
  });

  it("keeps one person across sessions and lets them rename themselves", async () => {
    const sub = randomUUID();
    const first = await signIn("Gabriel", { sub });
    await call("POST", "/campaigns", { token: first, body: { name: "The Valley" } });
    const renamed = await call("PATCH", "/me", { token: first, body: { displayName: "GM Gabe" } });
    expect(renamed.json.user.displayName).toBe("GM Gabe");
    const later = await signIn("Gabriel", { sub });
    const me = (await call("GET", "/me", { token: later })).json;
    expect(me.user.displayName).toBe("GM Gabe");
    expect(me.campaigns).toHaveLength(1);
    expect((await call("PATCH", "/me", { token: later, body: { displayName: "  " } })).status).toBe(400);
  });
});

describe("the database", () => {
  it("keeps every table in the private schema", async () => {
    const rows = await db.query<{ table_schema: string }>(
      "select distinct table_schema from information_schema.tables where table_name in ('users', 'campaigns', 'actions', 'schema_migrations')",
    );
    expect(rows.map((r) => r.table_schema)).toEqual(["gradebreaker"]);
  });
});

describe("campaigns and invites", () => {
  it("creates a campaign pinned to the current rules, with its creator as GM", async () => {
    const token = await signIn("Gabriel");
    const res = await call("POST", "/campaigns", { token, body: { name: "The Valley" } });
    expect(res.status).toBe(201);
    expect(res.json.campaign.rulesVersion).toBe(rules.version.version);
    const me = await call("GET", "/me", { token });
    expect(me.json.campaigns).toEqual([expect.objectContaining({ name: "The Valley", role: "gm" })]);
    expect((await call("POST", "/campaigns", { body: { name: "No one" } })).status).toBe(401);
    expect((await call("POST", "/campaigns", { token, body: { name: " " } })).status).toBe(400);
  });

  it("joins players by invite link, once each, after they sign in", async () => {
    const { campaignId, gm, player, invite } = await table();
    expect((await call("GET", `/invites/${invite}`)).json).toEqual({ campaignName: "The Valley", usable: true });
    expect((await call("POST", `/invites/${invite}/accept`)).status).toBe(401);
    const again = await call("POST", `/invites/${invite}/accept`, { token: player });
    expect(again.status).toBe(200);
    expect(again.json.joined).toBe(false);
    const gmJoins = await call("POST", `/invites/${invite}/accept`, { token: gm });
    expect(gmJoins.json).toMatchObject({ joined: false, role: "gm" });
    const members = (await call("GET", `/campaigns/${campaignId}`, { token: gm })).json.members;
    expect(members.map((m: { displayName: string; role: string }) => [m.displayName, m.role])).toEqual([
      ["Gabriel", "gm"],
      ["Ana", "player"],
    ]);
  });

  it("refuses revoked, used-up, and expired invites", async () => {
    const { campaignId, gm, invite } = await table();
    await call("DELETE", `/campaigns/${campaignId}/invites/${invite}`, { token: gm });
    const revoked = await call("POST", `/invites/${invite}/accept`, { token: await signIn("Late") });
    expect(revoked).toMatchObject({ status: 410, json: { error: "this invite was revoked" } });

    const once = (await call("POST", `/campaigns/${campaignId}/invites`, { token: gm, body: { maxUses: 1 } })).json.code;
    expect((await call("POST", `/invites/${once}/accept`, { token: await signIn("First") })).status).toBe(201);
    expect((await call("POST", `/invites/${once}/accept`, { token: await signIn("Second") })).status).toBe(410);

    const brief = (await call("POST", `/campaigns/${campaignId}/invites`, { token: gm, body: { expiresInHours: 1 } })).json.code;
    await db.query("update invites set expires_at = now() - interval '1 minute' where code = $1", [brief]);
    expect((await call("GET", `/invites/${brief}`)).json.usable).toBe(false);
    expect((await call("POST", `/invites/${brief}/accept`, { token: await signIn("Late") })).json.error).toBe("this invite has expired");
  });

  it("keeps campaigns private to their members and GM tools to the GM", async () => {
    const { campaignId, player } = await table();
    const outsider = await signIn("Rae");
    expect((await call("GET", `/campaigns/${campaignId}`)).status).toBe(401);
    expect((await call("GET", `/campaigns/${campaignId}`, { token: outsider })).status).toBe(404);
    expect((await call("POST", `/campaigns/${campaignId}/invites`, { token: player, body: {} })).status).toBe(403);
    expect((await call("GET", `/campaigns/${campaignId}/log`, { token: player })).status).toBe(403);
  });
});

describe("the action log over HTTP", () => {
  it("records actions with the caller as actor and shows each person their own view", async () => {
    const { campaignId, gm, player, playerId } = await table();
    expect((await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId })).status).toBe(201);
    await act(campaignId, gm, { type: "character.pregen", characterId: "joe", pregen: "Joe" });
    await act(campaignId, gm, { type: "ve.award", basis: { kind: "other", note: "rats" }, awards: [{ characterId: "kara", ve: 90 }] });

    const gv = (await call("GET", `/campaigns/${campaignId}`, { token: gm })).json;
    expect(gv.role).toBe("gm");
    expect(gv.characters.map((c: { name: string }) => c.name)).toEqual(["Kara", "Joe"]);
    expect(gv.characters[0].saturation.band).toBe("Mild");

    const pv = (await call("GET", `/campaigns/${campaignId}`, { token: player })).json;
    expect(pv.role).toBe("player");
    expect(pv.characters).toHaveLength(1);
    expect(pv.characters[0]).toMatchObject({ name: "Kara", storedVe: 90, tolerance: 80 });
    expect(pv.characters[0]).not.toHaveProperty("saturation");
    expect(pv.characters[0]).not.toHaveProperty("pendingSystemLevels");
    expect(pv).not.toHaveProperty("rejected");

    const log = (await call("GET", `/campaigns/${campaignId}/log`, { token: gm })).json.log;
    expect(log[2].actor).toEqual({ role: "gm", userId: gv.members[0].userId });
  });

  it("answers 422 for an action the rules refuse and 400 for a malformed one", async () => {
    const { campaignId, gm, player } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "joe", pregen: "Joe" });
    const refused = await act(campaignId, gm, { type: "saturation.collapse", characterId: "joe", attribute: "FOR", highDensity: false });
    expect(refused).toMatchObject({ status: 422, json: { error: expect.stringMatching(/not at Critical/) } });
    expect((await act(campaignId, gm, { type: "ve.award", awards: "lots" })).status).toBe(400);
    expect((await act(campaignId, player, { type: "ve.award", basis: { kind: "other", note: "me" }, awards: [{ characterId: "joe", ve: 500 }] })).status).toBe(422);
    const stranger = await act(campaignId, gm, { type: "character.pregen", characterId: "x", pregen: "Andre", playerId: "nobody" });
    expect(stranger.json.error).toMatch(/must be a player in this campaign/);
  });

  it("records a retried id once and refuses an id reused for something else", async () => {
    const { campaignId, gm } = await table();
    const pregen = { type: "character.pregen", characterId: "joe", pregen: "Joe" };
    expect((await act(campaignId, gm, pregen, "same")).status).toBe(201);
    const retry = await act(campaignId, gm, pregen, "same");
    expect(retry).toMatchObject({ status: 200, json: { duplicate: true } });
    expect((await act(campaignId, gm, { ...pregen, pregen: "Andre" }, "same")).status).toBe(409);
  });

  it("lets the player spend their own free points", async () => {
    const { campaignId, gm, player, playerId } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    await act(campaignId, gm, { type: "ve.award", basis: { kind: "other", note: "x" }, awards: [{ characterId: "kara", ve: 120 }] });
    await act(campaignId, gm, { type: "consolidation.rest", highDensity: false, rests: [{ characterId: "kara", hours: 6 }] });
    const spent = await act(campaignId, player, { type: "points.free", characterId: "kara", placement: { DEX: 2 } });
    expect(spent.status).toBe(201);
    expect(spent.json.envelope.actor.role).toBe("player");
    const pv = (await call("GET", `/campaigns/${campaignId}`, { token: player })).json;
    expect(pv.characters[0]).toMatchObject({ level: 2, freePoints: 0 });
    expect(pv.characters[0].raw.DEX).toBe(7);
  });

  it("previews for the GM without recording", async () => {
    const { campaignId, gm, player } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "joe", pregen: "Joe" });
    const body = { id: "p1", action: { type: "ve.award", basis: { kind: "other", note: "x" }, awards: [{ characterId: "joe", ve: 90 }] } };
    const p = await call("POST", `/campaigns/${campaignId}/preview`, { token: gm, body });
    expect(p.json.accepted).toBe(true);
    expect(p.json.changes[0].changes).toContainEqual({ field: "storedVe", before: 0, after: 90 });
    expect((await call("POST", `/campaigns/${campaignId}/preview`, { token: player, body })).status).toBe(403);
    expect((await call("GET", `/campaigns/${campaignId}/log`, { token: gm })).json.log).toHaveLength(1);
  });

  it("rebuilds the same record from the database after a restart", async () => {
    const { campaignId, gm } = await table();
    const award = { type: "ve.award", basis: { kind: "core", core: "minor core" }, awards: [{ characterId: "joe", ve: 5 }] };
    await act(campaignId, gm, { type: "character.pregen", characterId: "joe", pregen: "Joe" });
    await act(campaignId, gm, award, "award-1");
    const before = (await call("GET", `/campaigns/${campaignId}`, { token: gm })).json;

    service = await Service.open(db, rules, verifier);
    app = createApp(service);
    const after = (await call("GET", `/campaigns/${campaignId}`, { token: gm })).json;
    expect(after).toEqual(before);
    // A retry after the restart is still the same action, key order and all.
    const reordered = { awards: award.awards, basis: award.basis, type: award.type };
    expect((await act(campaignId, gm, reordered, "award-1")).json.duplicate).toBe(true);
  });
});

describe("the live channel", () => {
  let server: Server;
  let hub: LiveHub;
  let port: number;
  const sockets: WebSocket[] = [];

  async function listen() {
    hub = new LiveHub(service);
    app = createApp(service, { connected: () => hub.connected });
    server = await new Promise<Server>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0 }, () => resolve(s as Server)) as Server;
    });
    hub.attach(server);
    port = (server.address() as AddressInfo).port;
  }

  /** Opens a socket, authenticates, and collects every message it receives. */
  async function connect(campaignId: string, token: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/campaigns/${campaignId}/live`);
    sockets.push(ws);
    const messages: any[] = [];
    const closed = new Promise<number>((resolve) => ws.on("close", (code) => resolve(code)));
    ws.on("message", (d) => messages.push(JSON.parse(String(d))));
    await new Promise((resolve) => ws.on("open", resolve));
    ws.send(JSON.stringify({ type: "auth", token }));
    const next = async (count: number) => {
      for (let i = 0; i < 100 && messages.length < count; i++) await new Promise((r) => setTimeout(r, 10));
      return messages;
    };
    return { ws, messages, next, closed };
  }

  afterAll(() => {
    for (const s of sockets) s.close();
    hub?.close();
    server?.close();
  });

  it("sends each person their view, then pushes appends to the GM and a player's own changes to them", async () => {
    const { campaignId, gm, player, playerId } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    await act(campaignId, gm, { type: "character.pregen", characterId: "joe", pregen: "Joe" });
    await listen();

    const g = await connect(campaignId, gm);
    const p = await connect(campaignId, player);
    expect((await g.next(1))[0]).toMatchObject({ type: "state", view: { role: "gm" } });
    expect((await p.next(1))[0]).toMatchObject({ type: "state", view: { role: "player" } });

    await act(campaignId, gm, { type: "ve.award", basis: { kind: "other", note: "x" }, awards: [{ characterId: "kara", ve: 90 }] });
    const gm2 = (await g.next(2))[1];
    expect(gm2.type).toBe("appended");
    expect(gm2.effects).toContainEqual({ kind: "saturation", characterId: "kara", from: "None", to: "Mild" });
    const p2 = (await p.next(2))[1];
    expect(p2.type).toBe("update");
    expect(p2.notices).toEqual([{ kind: "ve-acquired", characterId: "kara", ve: 90 }]);
    expect(p2.view.characters[0].storedVe).toBe(90);

    // An award to a character that is not the player's reaches the GM only.
    await act(campaignId, gm, { type: "ve.award", basis: { kind: "other", note: "y" }, awards: [{ characterId: "joe", ve: 10 }] });
    await g.next(3);
    await new Promise((r) => setTimeout(r, 50));
    expect(g.messages).toHaveLength(3);
    expect(p.messages).toHaveLength(2);
  });

  it("tells everyone when a player joins", async () => {
    const { campaignId, gm } = await table();
    await listen();
    const g = await connect(campaignId, gm);
    await g.next(1);
    const code = (await call("POST", `/campaigns/${campaignId}/invites`, { token: gm, body: {} })).json.code;
    await call("POST", `/invites/${code}/accept`, { token: await signIn("Bo") });
    const m = (await g.next(2))[1];
    expect(m.type).toBe("state");
    expect(m.view.members.map((x: { displayName: string }) => x.displayName)).toContain("Bo");
  });

  it("closes a socket that does not authenticate as a member", async () => {
    const { campaignId } = await table();
    await listen();
    const bad = await connect(campaignId, "not-a-token");
    expect(await bad.closed).toBe(4401);
    const other = await connect(campaignId, await signIn("Rae"));
    expect(await other.closed).toBe(4404);
  });

  it("reports on the health check how many people are connected", async () => {
    const { campaignId, gm } = await table();
    await listen();
    const health = () => fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
    expect((await health()).connected).toBe(0);
    const g = await connect(campaignId, gm);
    await g.next(1);
    expect((await health()).connected).toBe(1);
    g.ws.close();
    await g.closed;
    await new Promise((r) => setTimeout(r, 50));
    expect((await health()).connected).toBe(0);
  });
});
