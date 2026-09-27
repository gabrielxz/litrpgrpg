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
import { devSignIn, eitherVerifier } from "../src/devauth.ts";
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

describe("configuration and rules", () => {
  it("hands the browser its public settings and keeps dev sign-in off unless asked", async () => {
    app = createApp(service, { supabase: { url: "https://x.supabase.co", publishableKey: "sb_publishable_test" } });
    expect((await call("GET", "/config")).json).toEqual({
      supabaseUrl: "https://x.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
      devSignIn: false,
      rulesVersion: rules.version.version,
    });
    expect((await call("POST", "/dev/sign-in", { body: { name: "GM" } })).status).toBe(404);
    expect((await call("GET", "/no-such-route")).json).toEqual({ error: "not found" });
  });

  it("serves a campaign's rules snapshot to anyone signed in", async () => {
    const version = rules.version.version;
    expect((await call("GET", `/rules/${version}`)).status).toBe(401);
    const got = await call("GET", `/rules/${version}`, { token: await signIn("Gabriel") });
    expect(got.json.character.point_buy).toEqual(rules.character.point_buy);
    expect((await call("GET", "/rules/0.0.0", { token: await signIn("Gabriel") })).status).toBe(404);
  });

  it("signs in named test people when development sign-in is on", async () => {
    const dev = await devSignIn();
    service = await Service.open(db, rules, eitherVerifier(verifier, dev.verifier));
    app = createApp(service, { dev });
    const a = (await call("POST", "/dev/sign-in", { body: { name: "Player One" } })).json.token;
    const b = (await call("POST", "/dev/sign-in", { body: { name: "player one" } })).json.token;
    const me = (await call("GET", "/me", { token: a })).json.user;
    expect(me.displayName).toBe("Player One");
    expect((await call("GET", "/me", { token: b })).json.user.id).toBe(me.id);
    expect((await call("GET", "/me", { token: await signIn("Still Google") })).status).toBe(200);
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

describe("characters", () => {
  const brawler = { STR: 10, DEX: 6, FOR: 8, HRT: 4, POW: 3, PER: 5, CHA: 4 };

  it("lets a player create their own character in a campaign, and the GM reassign it", async () => {
    const { campaignId, gm, player, playerId } = await table();
    const mine = await act(campaignId, player, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    expect(mine.status).toBe(201);
    const theirs = await act(campaignId, player, { type: "character.pregen", characterId: "joe", pregen: "Joe" });
    expect(theirs.json.error).toMatch(/only their own character/);
    const nobody = await act(campaignId, gm, { type: "character.assign", characterId: "kara", playerId: "nobody" });
    expect(nobody.json.error).toMatch(/must be a player in this campaign/);
    expect((await act(campaignId, gm, { type: "character.assign", characterId: "kara" })).status).toBe(201);
    expect((await call("GET", `/campaigns/${campaignId}`, { token: player })).json.characters).toEqual([]);
  });

  it("builds characters outside any campaign and moves one into a campaign", async () => {
    const { campaignId, gm, player } = await table();
    const bad = await call("POST", "/characters", { token: player, body: { kind: "custom", name: "Bo", background: "Line cook", stats: { ...brawler, CHA: 9 } } });
    expect(bad).toMatchObject({ status: 422, json: { error: expect.stringMatching(/total 45/) } });
    const bo = (await call("POST", "/characters", { token: player, body: { kind: "custom", name: "Bo", background: "Line cook", stats: brawler } })).json;
    const andre = (await call("POST", "/characters", { token: player, body: { kind: "pregen", pregen: "andre" } })).json;
    expect(andre.name).toBe("Andre");
    expect((await call("GET", "/characters", { token: player })).json.characters.map((c: { name: string }) => c.name)).toEqual(["Bo", "Andre"]);
    expect((await call("GET", "/characters", { token: gm })).json.characters).toEqual([]);

    expect((await call("POST", `/characters/${bo.id}/join`, { token: gm, body: { campaignId } })).status).toBe(404);
    const joined = await call("POST", `/characters/${bo.id}/join`, { token: player, body: { campaignId } });
    expect(joined.status).toBe(201);
    const pv = (await call("GET", `/campaigns/${campaignId}`, { token: player })).json;
    expect(pv.characters.map((c: { name: string }) => c.name)).toEqual(["Bo"]);
    expect((await call("GET", "/characters", { token: player })).json.characters.map((c: { name: string }) => c.name)).toEqual(["Andre"]);
    expect((await call("POST", `/characters/${bo.id}/join`, { token: player, body: { campaignId } })).status).toBe(404);

    const elsewhere = (await call("POST", "/campaigns", { token: await signIn("Rae"), body: { name: "Elsewhere" } })).json.campaign.id;
    expect((await call("POST", `/characters/${andre.id}/join`, { token: player, body: { campaignId: elsewhere } })).status).toBe(404);
    expect((await call("DELETE", `/characters/${andre.id}`, { token: player })).status).toBe(204);
    expect((await call("GET", "/characters", { token: player })).json.characters).toEqual([]);
  });

  it("holds a GM's own character for the GM when it joins", async () => {
    const { campaignId, gm } = await table();
    const npc = (await call("POST", "/characters", { token: gm, body: { kind: "pregen", pregen: "Joe" } })).json;
    await call("POST", `/characters/${npc.id}/join`, { token: gm, body: { campaignId } });
    const joe = (await call("GET", `/campaigns/${campaignId}`, { token: gm })).json.characters[0];
    expect(joe.name).toBe("Joe");
    expect(joe.playerId).toBeUndefined();
  });

  it("shows the GM a player's screen exactly as the player sees it", async () => {
    const { campaignId, gm, player, playerId } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    await act(campaignId, gm, { type: "character.pregen", characterId: "joe", pregen: "Joe" });
    const asPlayer = await call("GET", `/campaigns/${campaignId}/players/${playerId}/view`, { token: gm });
    expect(asPlayer.json).toEqual((await call("GET", `/campaigns/${campaignId}`, { token: player })).json);
    expect((await call("GET", `/campaigns/${campaignId}/players/${playerId}/view`, { token: player })).status).toBe(403);
    const gmId = (await call("GET", "/me", { token: gm })).json.user.id;
    expect((await call("GET", `/campaigns/${campaignId}/players/${gmId}/view`, { token: gm })).status).toBe(404);
  });
});

describe("the party and the System's notices", () => {
  /** The table plus a second player, each with a character. */
  async function twoPlayers() {
    const t = await table();
    const code = (await call("POST", `/campaigns/${t.campaignId}/invites`, { token: t.gm, body: {} })).json.code;
    const bo = await signIn("Bo");
    await call("POST", `/invites/${code}/accept`, { token: bo });
    const boId = (await call("GET", "/me", { token: bo })).json.user.id as string;
    await act(t.campaignId, t.gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId: t.playerId });
    await act(t.campaignId, t.gm, { type: "character.pregen", characterId: "joe", pregen: "Joe", playerId: boId });
    await act(t.campaignId, t.gm, { type: "character.pregen", characterId: "andre", pregen: "Andre" });
    const view = async (token: string) => (await call("GET", `/campaigns/${t.campaignId}`, { token })).json;
    return { ...t, bo, view };
  }

  it("lets players invite and answer on their own screens, then shows each the party frame", async () => {
    const { campaignId, gm, player, bo, view } = await twoPlayers();
    const ana = await view(player);
    // The roster names the characters other players hold; the GM's are left out.
    expect(ana.roster).toEqual([{ id: "joe", name: "Joe" }]);
    expect((await act(campaignId, player, { type: "party.invite", fromId: "kara", toId: "joe" }, "inv-1")).status).toBe(201);
    expect((await view(player)).characters[0].invited).toEqual([{ id: "inv-1", toId: "joe", toName: "Joe" }]);
    expect((await view(bo)).characters[0].invitations).toEqual([{ id: "inv-1", fromId: "kara", fromName: "Kara" }]);
    expect((await act(campaignId, player, { type: "party.answer", inviteId: "inv-1", accept: true })).status).toBe(422);
    expect((await act(campaignId, bo, { type: "party.answer", inviteId: "inv-1", accept: true })).status).toBe(201);
    await act(campaignId, gm, { type: "hp.change", characterId: "joe", delta: -5 });

    const frame = (await view(player)).characters[0].party;
    expect(frame.members).toEqual([
      { id: "kara", name: "Kara", hp: 14, maxHp: 14, aether: 6, downed: false },
      { id: "joe", name: "Joe", hp: 9, maxHp: 14, aether: 4, downed: false },
    ]);
    // The frame carries Health, Aether, and Downed, and nothing else.
    expect(Object.keys(frame.members[1]).sort()).toEqual(["aether", "downed", "hp", "id", "maxHp", "name"]);
    expect((await view(gm)).parties).toEqual([{ id: frame.id, members: ["kara", "joe"] }]);
  });

  it("rebuilds each player's notices from the log, their own only, without held or voided messages", async () => {
    const { campaignId, gm, player, bo, view } = await twoPlayers();
    await act(campaignId, gm, { type: "message.send", to: ["kara", "joe"], text: "Anomaly logged." }, "m1");
    await act(campaignId, gm, { type: "message.send", to: ["kara"], text: "Quest available.", hold: true }, "m2");
    await act(campaignId, gm, { type: "message.send", to: ["kara"], text: "Mistake." }, "m3");
    await act(campaignId, gm, { type: "void", targetId: "m3", reason: "undo" });
    await act(campaignId, gm, { type: "ve.award", basis: { kind: "other", note: "x" }, awards: [{ characterId: "joe", ve: 10 }] });

    const text = (v: { feed: { effect: { kind: string; text?: string; ve?: number } }[] }) =>
      v.feed.map((f) => f.effect.text ?? `${f.effect.kind} ${f.effect.ve ?? ""}`.trim());
    expect(text(await view(player))).toEqual(["Anomaly logged."]);
    expect(text(await view(bo))).toEqual(["ve-acquired 10", "Anomaly logged."]);
    expect((await view(gm)).held).toEqual([{ id: "m2", to: ["kara"], text: "Quest available." }]);

    await act(campaignId, gm, { type: "message.release", messageId: "m2" });
    expect(text(await view(player))).toEqual(["Quest available.", "Anomaly logged."]);
    expect((await act(campaignId, player, { type: "message.send", to: ["joe"], text: "Hi" })).status).toBe(422);
  });
});

describe("dice", () => {
  it("rolls on the server, keeps a retry to one roll, and shows players only the open rolls", async () => {
    const { campaignId, gm, player, playerId } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    const roll = { type: "dice.roll", roller: { kind: "character", characterId: "kara", attribute: "STR" }, rollKind: "clash", modifier: 5 };

    const first = await act(campaignId, player, roll, "roll-1");
    expect(first.status).toBe(201);
    const natural: number[] = first.json.envelope.action.natural;
    expect(natural[0]).toBeGreaterThanOrEqual(1);
    expect(natural[0]).toBeLessThanOrEqual(100);
    expect(first.json.envelope.action.entered).toBeUndefined();
    const again = await act(campaignId, player, roll, "roll-1");
    expect(again.status).toBe(200);
    expect(again.json.envelope.action.natural).toEqual(natural);

    await act(campaignId, gm, { ...roll, roller: { kind: "other", name: "Frenzy Rat", grade: "F" }, private: true, modifier: 6 });
    await act(campaignId, gm, { ...roll, rollKind: "check", resistance: 90, natural: [97, 12] }, "roll-3");

    const pv = (await call("GET", `/campaigns/${campaignId}`, { token: player })).json;
    expect(pv.rolls.map((r: { roller: string }) => r.roller)).toEqual(["Kara", "Kara"]);
    expect(pv.rolls[0]).toMatchObject({ natural: [97, 12], total: 97 + 12 + 8 + 5, exploded: true, entered: true, by: "Gabriel" });
    expect(pv.rolls[0]).not.toHaveProperty("resistance");
    expect(pv.rolls[0]).not.toHaveProperty("outcome");
    expect(pv.rolls[1]).toMatchObject({ natural, by: "Ana", attribute: "STR", total: natural.reduce((a, b) => a + b, 0) + 13 });

    const gv = (await call("GET", `/campaigns/${campaignId}`, { token: gm })).json;
    expect(gv.rolls.map((r: { roller: string }) => r.roller)).toEqual(["Kara", "Frenzy Rat", "Kara"]);
    expect(gv.rolls[0]).toMatchObject({ resistance: 90, outcome: "exceptional", battleMemory: false });
    expect(gv.rolls[1].private).toBe(true);

    // A roll stands for the player; the GM can take one back.
    expect((await act(campaignId, player, { type: "void", targetId: "roll-1", reason: "undo" })).status).toBe(422);
    expect((await act(campaignId, gm, { type: "void", targetId: "roll-1", reason: "undo" })).status).toBe(201);
    expect((await call("GET", `/campaigns/${campaignId}`, { token: player })).json.rolls).toHaveLength(1);
  });
});

describe("the combat tracker", () => {
  it("rolls Momentum on the server and shows players the fight's shape without a creature's numbers", async () => {
    const { campaignId, gm, player, playerId } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    await act(campaignId, gm, {
      type: "combat.start",
      encounterId: "e1",
      name: "The treeline",
      sides: [
        { id: "party", name: "The party" },
        { id: "hostiles", name: "Hostiles" },
      ],
      combatants: [
        { combatantId: "kara", sideId: "party", characterId: "kara" },
        { combatantId: "rat", sideId: "hostiles", name: "Frenzy Rat", grade: "F", maxHp: 12, momentumForce: 8, beats: 1 },
      ],
    });
    expect((await act(campaignId, player, { type: "combat.momentum" })).status).toBe(422);
    const m = await act(campaignId, gm, { type: "combat.momentum" });
    expect(m.status).toBe(201);
    expect(m.json.envelope.action.attempts.length).toBeGreaterThanOrEqual(1);

    const gv = (await call("GET", `/campaigns/${campaignId}`, { token: gm })).json;
    expect(gv.encounter.round).toBe(1);
    expect(gv.encounter.combatants.find((c: { id: string }) => c.id === "rat")).toMatchObject({ hp: 12, maxHp: 12, momentumForce: 8 });
    expect(gv.encounter.combatants.find((c: { id: string }) => c.id === "kara")).toMatchObject({ hp: 14, momentumForce: 5 });

    const pv = (await call("GET", `/campaigns/${campaignId}`, { token: player })).json;
    expect(pv.combat.round).toBe(1);
    expect(pv.combat.order.map((s: { name: string }) => s.name).sort()).toEqual(["Hostiles", "The party"]);
    const rat = pv.combat.combatants.find((c: { id: string }) => c.id === "rat");
    expect(Object.keys(rat).sort()).toEqual(["acted", "acting", "downed", "exposed", "id", "name", "out", "sideId", "stabilized", "suppressed", "surprise", "zoneId"]);
    expect(pv.combat.combatants.find((c: { id: string }) => c.id === "kara")).toMatchObject({ beats: 2, beatsPerTurn: 2 });
    // The Momentum dice are the table's, and players see them.
    const labels = pv.rolls.map((r: { label: string }) => r.label);
    expect(labels.filter((l: string) => l === "Momentum").length).toBeGreaterThanOrEqual(2);

    await act(campaignId, gm, { type: "combat.end" });
    expect((await call("GET", `/campaigns/${campaignId}`, { token: player })).json.combat).toBeNull();
  });

  it("tells a Downed player their vital coherence, and lets an ally stabilize them from their own screen", async () => {
    const { campaignId, gm, player, playerId } = await table();
    const inv = (await call("POST", `/campaigns/${campaignId}/invites`, { token: gm, body: {} })).json.code;
    const bo = await signIn("Bo");
    await call("POST", `/invites/${inv}/accept`, { token: bo });
    const boId = (await call("GET", "/me", { token: bo })).json.user.id as string;
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    await act(campaignId, gm, { type: "character.pregen", characterId: "joe", pregen: "Joe", playerId: boId });
    await act(campaignId, gm, {
      type: "combat.start",
      encounterId: "e1",
      name: "The treeline",
      sides: [
        { id: "party", name: "The party" },
        { id: "hostiles", name: "Hostiles" },
      ],
      combatants: [
        { combatantId: "kara", sideId: "party", characterId: "kara" },
        { combatantId: "joe", sideId: "party", characterId: "joe" },
        { combatantId: "rat", sideId: "hostiles", name: "Frenzy Rat", grade: "F", maxHp: 12, momentumForce: 1, beats: 1 },
      ],
    });
    await act(campaignId, gm, { type: "combat.momentum" });
    await act(campaignId, gm, { type: "combat.hp", combatantId: "kara", delta: -14 });
    const kv = (await call("GET", `/campaigns/${campaignId}`, { token: player })).json;
    expect(kv.characters[0]).toMatchObject({ downed: true, dead: false, vitalCoherence: 3 });
    expect(kv.feed[0].effect).toMatchObject({ kind: "combat-downed", coherence: 3 });
    expect(kv.combat.combatants.find((c: { id: string }) => c.id === "kara")).toMatchObject({ downed: true, stabilized: false });

    // Whoever holds Momentum, Joe acts on his side's turn; the GM moves the turn along if the rat has it.
    const gv = (await call("GET", `/campaigns/${campaignId}`, { token: gm })).json;
    if (gv.encounter.order[0] === "hostiles") {
      await act(campaignId, gm, { type: "combat.act", combatantId: "rat" });
      await act(campaignId, gm, { type: "combat.done", combatantId: "rat" });
    }
    expect((await act(campaignId, bo, { type: "combat.act", combatantId: "joe" })).status).toBe(201);
    const st = await act(campaignId, bo, { type: "combat.stabilize", combatantId: "joe", targetId: "kara", advantage: true });
    expect(st.status).toBe(201);
    expect(st.json.envelope.action.dice.natural.length).toBeGreaterThanOrEqual(1);
    const bv = (await call("GET", `/campaigns/${campaignId}`, { token: bo })).json;
    expect(bv.rolls[0]).toMatchObject({ roller: "Joe", rollKind: "check", label: "Stabilize Kara" });
  });

  it("keeps a hidden quest's code, title, and objective out of its holder's view until it completes", async () => {
    const { campaignId, gm, player, playerId } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    await act(campaignId, gm, {
      type: "quest.issue",
      quest: { id: "Q-HID-014", category: "Hidden", title: "Let It Finish", difficulty: "Hard", objective: "Spare a surrendered foe three times.", hidden: "obscured" },
      to: ["kara"],
    });
    const raw = JSON.stringify((await call("GET", `/campaigns/${campaignId}`, { token: player })).json);
    for (const secret of ["Q-HID-014", "Let It Finish", "Spare a surrendered"]) expect(raw).not.toContain(secret);
    expect(raw).toContain("Hidden Objective: ???");
    await act(campaignId, gm, { type: "quest.complete", questId: "Q-HID-014", awards: [{ characterId: "kara", ve: 60 }] });
    const pv = (await call("GET", `/campaigns/${campaignId}`, { token: player })).json;
    expect(pv.characters[0].quests[0]).toMatchObject({ id: "Q-HID-014", title: "Let It Finish", status: "completed" });
  });

  it("settles a fight: the kill and the VE reach the player, and the spoils wait for them to claim", async () => {
    const { campaignId, gm, player, playerId } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    await act(campaignId, gm, {
      type: "combat.start",
      encounterId: "e1",
      name: "The treeline",
      sides: [
        { id: "party", name: "The party" },
        { id: "hostiles", name: "Hostiles" },
      ],
      combatants: [
        { combatantId: "kara", sideId: "party", characterId: "kara" },
        { combatantId: "rat", sideId: "hostiles", name: "Frenzy Rat", creature: "Frenzy Rat", grade: "F", maxHp: 12, momentumForce: 8, beats: 1 },
      ],
    });
    await act(campaignId, gm, { type: "combat.momentum" });
    await act(campaignId, gm, { type: "combat.hp", combatantId: "rat", delta: -12 });
    await act(campaignId, gm, { type: "combat.end" });
    const gv = (await call("GET", `/campaigns/${campaignId}`, { token: gm })).json;
    expect(gv.encounter).toBeNull();
    expect(gv.aftermath).toMatchObject({ id: "e1", combatants: expect.arrayContaining([expect.objectContaining({ id: "rat", dead: true })]) });
    const loot = await act(campaignId, gm, { type: "encounter.loot", encounterId: "e1", kills: [{ combatantId: "rat", tier: "Easy" }] });
    expect(loot.status).toBe(201);
    expect(loot.json.envelope.action.dice[0]).toBeGreaterThanOrEqual(1);
    const settled = await act(campaignId, gm, {
      type: "encounter.settle",
      encounterId: "e1",
      participants: ["kara"],
      kills: [{ combatantId: "rat", tier: "Easy" }],
      awards: [{ characterId: "kara", ve: 5 }],
      spoils: [{ name: "Stuttering Tincture", count: 1 }],
    });
    expect(settled.status).toBe(201);
    expect((await call("GET", `/campaigns/${campaignId}`, { token: gm })).json.aftermath).toBeNull();

    const pv = (await call("GET", `/campaigns/${campaignId}`, { token: player })).json;
    expect(pv.feed.map((f: { effect: { kind: string } }) => f.effect.kind)).toEqual(expect.arrayContaining(["kill-confirmed", "ve-acquired"]));
    expect(pv.spoils).toEqual([{ name: "Stuttering Tincture", count: 1 }]);
    expect((await act(campaignId, player, { type: "item.move", from: "spoils", to: "kara", name: "Stuttering Tincture", count: 1 })).status).toBe(201);
    const after = (await call("GET", `/campaigns/${campaignId}`, { token: player })).json;
    expect(after.characters[0].items).toEqual([{ name: "Stuttering Tincture", count: 1 }]);
    expect(after.spoils).toEqual([]);
  });

  it("lets the player defend and Yield from their own screen, with the server rolling the Clash", async () => {
    const { campaignId, gm, player, playerId } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    await act(campaignId, gm, {
      type: "combat.start",
      encounterId: "e1",
      name: "Treeline",
      sides: [
        { id: "party", name: "The party" },
        { id: "hostiles", name: "Hostiles" },
      ],
      combatants: [
        { combatantId: "kara", sideId: "party", characterId: "kara" },
        { combatantId: "boss", sideId: "hostiles", name: "Rival Initiate", grade: "F", maxHp: 56, momentumForce: 12, beats: 2, yields: true },
      ],
    });
    await act(campaignId, gm, { type: "combat.momentum" });
    const holder = (await call("GET", `/campaigns/${campaignId}`, { token: gm })).json.encounter.order[0];
    const attacker = holder === "party" ? "kara" : "boss";
    const defender = holder === "party" ? "boss" : "kara";
    await act(campaignId, holder === "party" ? player : gm, { type: "combat.act", combatantId: attacker });
    const attack = holder === "party" ? { attribute: "STR", modifier: 0 } : { force: 12, modifier: 60 };
    expect((await act(campaignId, holder === "party" ? player : gm, { type: "combat.attack", attackerId: attacker, defenderId: defender, attack })).status).toBe(201);
    const defense = defender === "kara" ? { attribute: "DEX", modifier: 0 } : { force: 10, modifier: 0 };
    const d = await act(campaignId, defender === "kara" ? player : gm, { type: "combat.defend", defense });
    expect(d.status).toBe(201);
    expect(d.json.envelope.action.attackDice.natural.length).toBeGreaterThanOrEqual(1);
    const pv = (await call("GET", `/campaigns/${campaignId}`, { token: player })).json;
    const rolls = pv.rolls.map((r: { label: string }) => r.label);
    expect(rolls).toContain("Defense");
    if (pv.combat.clash?.stage === "yield") {
      expect(pv.combat.clash.defenderName).toBe(defender === "kara" ? "Kara" : "Rival Initiate");
      const r = await act(campaignId, defender === "kara" ? player : gm, { type: "combat.resolve", yield: 0 });
      expect(r.status).toBe(201);
    }
    const after = (await call("GET", `/campaigns/${campaignId}`, { token: player })).json.combat;
    expect(after.clash).toBeNull();
    expect(after.lastClash.stage).toBe("resolved");
  });
});

describe("the Hidden Vector Engine", () => {
  it("keeps the sweep on the GM's side: no player view, feed, or live update carries it", async () => {
    const { campaignId, gm, player, playerId } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    const before = await call("GET", `/campaigns/${campaignId}`, { token: player });
    expect((await act(campaignId, gm, { type: "session.start", label: "The Node", present: ["kara"] })).status).toBe(201);
    expect((await act(campaignId, player, { type: "session.end" })).status).toBe(422);
    const swept = await act(campaignId, gm, {
      type: "hve.sweep",
      label: "Session 1",
      sheets: [{ characterId: "kara", moments: [{ pole: "Hunger", weight: 3, note: "Took the pill while the others argued." }] }],
    });
    expect(swept.status).toBe(201);
    const logged = await act(campaignId, gm, {
      type: "event.log",
      summary: "Bribed the warden in front of the others",
      participants: ["kara"],
      notes: "Ana grinned.",
      entries: [{ characterId: "kara", pole: "Hunger", intensity: 0.5 }],
    });
    expect(logged.status).toBe(201);
    expect((await act(campaignId, player, { type: "event.log", summary: "x", participants: ["kara"] })).status).toBe(422);
    expect((await act(campaignId, gm, { type: "session.end", summary: "Kara bargained her way past the warden." })).status).toBe(201);
    expect((await act(campaignId, player, { type: "hve.deep", characterId: "kara", deep: { Force: 9 } })).status).toBe(422);
    const view = await call("GET", `/campaigns/${campaignId}`, { token: player });
    expect(view.json.feed).toEqual(before.json.feed);
    const text = JSON.stringify(view.json);
    for (const leak of ["hve", "Hunger", "argued", "Scattered", "Session 1", "events", "warden", "grinned", "sessions", "The Node", "bargained"]) expect(text).not.toContain(leak);
    const gmView = await call("GET", `/campaigns/${campaignId}`, { token: gm });
    expect(gmView.json.characters[0].hve.deep.Hunger).toBe(1);
    expect(gmView.json.events[0]).toMatchObject({ summary: "Bribed the warden in front of the others", notes: "Ana grinned." });
    expect(gmView.json.sessions[0]).toMatchObject({ label: "The Node", summary: "Kara bargained her way past the warden." });
    expect(gmView.json.events[0].sessionId).toBe(gmView.json.sessions[0].id);
  });
});

describe("the in-game clock", () => {
  it("shows a quest's holder the hours left and nothing of the clock itself", async () => {
    const { campaignId, gm, player, playerId } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    await act(campaignId, gm, { type: "clock.set", day: 2, hour: 9 });
    await act(campaignId, gm, {
      type: "quest.issue",
      to: ["kara"],
      quest: { id: "M-04", category: "Mandate", title: "Report", difficulty: "Moderate", objective: "Report to the coordinates", hours: 72 },
    });
    await act(campaignId, gm, { type: "clock.advance", minutes: 70 * 60 + 30 });
    const view = await call("GET", `/campaigns/${campaignId}`, { token: player });
    expect(view.json.characters[0].quests[0]).toMatchObject({ id: "M-04", time: "72 hours", hoursLeft: 2 });
    const text = JSON.stringify(view.json);
    for (const leak of ['"clock"', '"due"', "Day 2"]) expect(text).not.toContain(leak);
    expect((await act(campaignId, player, { type: "clock.advance", minutes: 60 })).status).toBe(422);
    expect((await call("GET", `/campaigns/${campaignId}`, { token: gm })).json.clock.at).toBe(24 * 60 + 9 * 60 + 70 * 60 + 30);
  });
});

describe("Battle Memories and Principles", () => {
  it("shows the player their cards, visions, and resonance, and keeps the GM's bookkeeping", async () => {
    const { campaignId, gm, player, playerId } = await table();
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
    const card = await act(campaignId, gm, { type: "memory.grant", characterId: "kara", text: "Held the slab while the ceiling came down" });
    expect((await act(campaignId, player, { type: "memory.choose", characterId: "kara", memoryId: card.json.envelope.id, chosen: true })).status).toBe(201);
    await act(campaignId, gm, { type: "consolidation.rest", highDensity: false, rests: [{ characterId: "kara", hours: 1 }] });
    expect((await act(campaignId, player, { type: "memory.meditate", characterId: "kara", memoryId: card.json.envelope.id, family: "Impact", ip: 3 })).status).toBe(422);
    await act(campaignId, gm, {
      type: "memory.meditate",
      characterId: "kara",
      memoryId: card.json.envelope.id,
      family: "Impact",
      ip: 2,
      words: "She stopped fighting the weight",
      vision: "A mountain hangs from a thread.",
    });
    const view = await call("GET", `/campaigns/${campaignId}`, { token: player });
    const p = view.json.characters[0].principle;
    expect(p.resonance).toEqual([{ family: "Impact", ip: 2, of: 3 }]);
    expect(p.memories).toEqual([{ id: card.json.envelope.id, text: "Held the slab while the ceiling came down", chosen: false, spent: true, vision: "A mountain hangs from a thread." }]);
    expect(view.json.feed.map((f: { effect: { kind: string } }) => f.effect.kind)).toEqual(expect.arrayContaining(["memory-granted", "vision", "resonance"]));
    const text = JSON.stringify(view.json);
    for (const leak of ["stopped fighting", "afterRests", '"due"']) expect(text).not.toContain(leak);
  });
});

describe("the rules version", () => {
  it("moves every campaign to the current rules when the server starts, replaying its log under them", async () => {
    const { campaignId, gm } = await table();
    // An older snapshot in which Kara was built with one point moved from FOR to STR.
    const old = structuredClone(rules);
    old.version.version = "0.0.1-old";
    const kara = old.character.pregens.find((p: { name: string }) => p.name === "Kara");
    kara.stats = { ...kara.stats, FOR: kara.stats.FOR - 1, STR: kara.stats.STR + 1 };
    await db.query("insert into rules_snapshots (version, content_hash, snapshot) values ($1, 'old', $2::json)", ["0.0.1-old", JSON.stringify(old)]);
    await db.query("update campaigns set rules_version = '0.0.1-old' where id = $1", [campaignId]);
    service = await Service.open(db, old, verifier);
    app = createApp(service);
    await act(campaignId, gm, { type: "character.pregen", characterId: "kara", pregen: "Kara" });
    expect((await call("GET", `/campaigns/${campaignId}`, { token: gm })).json.characters[0].raw.FOR).toBe(kara.stats.FOR);

    const lines: string[] = [];
    service = await Service.open(db, rules, verifier, (m) => lines.push(m));
    app = createApp(service);
    const after = await call("GET", `/campaigns/${campaignId}`, { token: gm });
    expect(after.json.campaign.rulesVersion).toBe(rules.version.version);
    expect(after.json.characters[0].raw.FOR).toBe(kara.stats.FOR + 1);
    expect(lines).toContain(`rules ${rules.version.version}: 1 campaign(s) moved to the current rules`);
  });
});

describe("the live channel", () => {
  let server: Server;
  let hub: LiveHub;
  let port: number;
  const sockets: WebSocket[] = [];

  async function listen(heartbeatMs?: number) {
    hub = new LiveHub(service, undefined, heartbeatMs);
    app = createApp(service, { connected: () => hub.connected });
    server = await new Promise<Server>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0 }, () => resolve(s as Server)) as Server;
    });
    hub.attach(server);
    port = (server.address() as AddressInfo).port;
  }

  /** Opens a socket, authenticates, and collects every message it receives. */
  async function connect(campaignId: string, token: string, opts: { autoPong?: boolean } = {}) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/campaigns/${campaignId}/live`, opts);
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
    expect(p2.view.feed.map((f: { effect: unknown }) => f.effect)).toEqual([{ kind: "ve-acquired", characterId: "kara", ve: 90 }]);
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

  it("stops counting a peer that no longer answers the heartbeat", async () => {
    const { campaignId, gm, player } = await table();
    await listen(40);
    const health = () => fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json());
    const live = await connect(campaignId, gm);
    const dead = await connect(campaignId, player, { autoPong: false });
    await live.next(1);
    await dead.next(1);
    expect((await health()).connected).toBe(2);
    await dead.closed;
    await new Promise((r) => setTimeout(r, 100));
    expect((await health()).connected).toBe(1);
  });
});
