/**
 * The server's game-facing operations over the database: people (Supabase Auth identities),
 * campaigns and invites, and each campaign's action log with its record held in memory.
 *
 * One process serves a campaign. Appends to a campaign run one at a time behind an in-process
 * lock; the (campaign, seq) primary key refuses a second writer, and a failed insert drops
 * the cached record so the next request reloads it from the log.
 */
import { Engine, type RulesSnapshot } from "@gradebreaker/engine";
import {
  type Action,
  type Appended,
  CampaignRecord,
  type Draft,
  type Envelope,
  IdConflict,
  type Preview,
  RecordError,
  type Submission,
  pointBuyProblems,
} from "@gradebreaker/record";
import type { Identity, Verifier } from "./auth.ts";
import type { Db } from "./db.ts";
import { contentHash, newId, newInviteCode } from "./tokens.ts";
import { type CampaignInfo, type Member, type PlayerView, type Role, type View, viewFor } from "./views.ts";

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface User {
  id: string;
  displayName: string;
}

export interface Invite {
  code: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  revokedAt: string | null;
}

/** How a character outside any campaign is built: point buy, or one of the book's ready-made characters. */
export type CharacterSpec =
  | { kind: "custom"; name: string; background: string; stats: Record<string, number> }
  | { kind: "pregen"; pregen: string };

export interface UnassignedCharacter {
  id: string;
  name: string;
  spec: CharacterSpec;
  createdAt: string;
}

export type ServiceEvent =
  | { kind: "appended"; campaignId: string; appended: Appended }
  | { kind: "members"; campaignId: string };

const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString());

export class Service {
  readonly db: Db;
  /** The rules version new campaigns pin. */
  readonly rulesVersion: string;
  private readonly verifier: Verifier;
  /** People already recorded, by Supabase user id. */
  private readonly people = new Map<string, User>();
  private readonly engines = new Map<string, Engine>();
  private readonly records = new Map<string, CampaignRecord>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly listeners = new Set<(e: ServiceEvent) => void>();

  private constructor(db: Db, rulesVersion: string, verifier: Verifier) {
    this.db = db;
    this.rulesVersion = rulesVersion;
    this.verifier = verifier;
  }

  /** Stores the current rules snapshot under its version and returns a service that pins new campaigns to it. */
  static async open(db: Db, rules: RulesSnapshot, verifier: Verifier, log: (msg: string) => void = () => {}): Promise<Service> {
    const version: string = rules.version.version;
    const text = JSON.stringify(rules);
    const hash = contentHash(text);
    const [stored] = await db.query<{ content_hash: string }>("select content_hash from rules_snapshots where version = $1", [version]);
    if (!stored) {
      await db.query("insert into rules_snapshots (version, content_hash, snapshot) values ($1, $2, $3::json)", [version, hash, text]);
    } else if (stored.content_hash !== hash) {
      // The version number is bumped whenever a number or table changes, so a same-version
      // difference is wording or an added key; campaigns on this version take the new text.
      await db.query("update rules_snapshots set content_hash = $2, snapshot = $3::json, stored_at = now() where version = $1", [version, hash, text]);
      log(`rules ${version}: stored snapshot replaced by the current rules/ (same version, different content)`);
    }
    return new Service(db, version, verifier);
  }

  on(listener: (e: ServiceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: ServiceEvent) {
    for (const l of this.listeners) l(e);
  }

  // ----------------------------------------------------------- people ---

  /** The person a Supabase access token belongs to, recorded on first sight; null if the token does not verify. */
  async authenticate(token: string | undefined): Promise<User | null> {
    if (!token) return null;
    const identity = await this.verifier.verify(token);
    return identity && this.person(identity);
  }

  private async person(identity: Identity): Promise<User> {
    const known = this.people.get(identity.id);
    if (known) return known;
    const fallback = identity.name ?? identity.email?.split("@")[0] ?? "Player";
    await this.db.query(
      "insert into users (id, display_name, email) values ($1, $2, $3) on conflict (id) do nothing",
      [identity.id, fallback.slice(0, 60), identity.email],
    );
    const [row] = await this.db.query<{ display_name: string }>("select display_name from users where id = $1", [identity.id]);
    const user = { id: identity.id, displayName: row!.display_name };
    this.people.set(user.id, user);
    return user;
  }

  /** The name the table sees; it starts as the Google profile name. */
  async rename(user: User | null, displayName: string): Promise<User> {
    if (!user) throw new HttpError(401, "sign in first");
    const name = displayName.trim();
    if (!name) throw new HttpError(400, "a display name is required");
    if (name.length > 60) throw new HttpError(400, "a display name is at most 60 characters");
    await this.db.query("update users set display_name = $2 where id = $1", [user.id, name]);
    const renamed = { id: user.id, displayName: name };
    this.people.set(user.id, renamed);
    for (const c of await this.campaignsOf(user.id)) this.emit({ kind: "members", campaignId: c.id });
    return renamed;
  }

  // -------------------------------------------------------- campaigns ---

  /** Creates a campaign with `user` as its GM. */
  async createCampaign(user: User | null, name: string) {
    if (!user) throw new HttpError(401, "sign in first");
    const title = name?.trim();
    if (!title) throw new HttpError(400, "a campaign needs a name");
    if (title.length > 100) throw new HttpError(400, "a campaign name is at most 100 characters");
    return this.db.tx(async (q) => {
      const campaign: CampaignInfo = { id: newId(), name: title, rulesVersion: this.rulesVersion };
      await q.query("insert into campaigns (id, name, rules_version) values ($1, $2, $3)", [campaign.id, title, this.rulesVersion]);
      await q.query("insert into memberships (campaign_id, user_id, role) values ($1, $2, 'gm')", [campaign.id, user.id]);
      return { campaign };
    });
  }

  async campaignsOf(userId: string): Promise<(CampaignInfo & { role: Role })[]> {
    const rows = await this.db.query<{ id: string; name: string; rules_version: string; role: Role }>(
      `select c.id, c.name, c.rules_version, m.role from campaigns c
       join memberships m on m.campaign_id = c.id where m.user_id = $1 order by c.created_at`,
      [userId],
    );
    return rows.map((r) => ({ id: r.id, name: r.name, rulesVersion: r.rules_version, role: r.role }));
  }

  async campaign(campaignId: string): Promise<CampaignInfo> {
    const [row] = await this.db.query<{ id: string; name: string; rules_version: string }>(
      "select id, name, rules_version from campaigns where id = $1",
      [campaignId],
    );
    if (!row) throw new HttpError(404, "no such campaign");
    return { id: row.id, name: row.name, rulesVersion: row.rules_version };
  }

  async roleIn(campaignId: string, userId: string): Promise<Role | null> {
    const [row] = await this.db.query<{ role: Role }>(
      "select role from memberships where campaign_id = $1 and user_id = $2",
      [campaignId, userId],
    );
    return row?.role ?? null;
  }

  /** The caller's role, or 404: a campaign someone does not belong to is not acknowledged. */
  async requireMember(campaignId: string, user: User | null): Promise<Role> {
    if (!user) throw new HttpError(401, "sign in first");
    const role = await this.roleIn(campaignId, user.id);
    if (!role) throw new HttpError(404, "no such campaign");
    return role;
  }

  async requireGm(campaignId: string, user: User | null): Promise<void> {
    if ((await this.requireMember(campaignId, user)) !== "gm") throw new HttpError(403, "only the GM can do that");
  }

  async members(campaignId: string): Promise<Member[]> {
    const rows = await this.db.query<{ user_id: string; display_name: string; role: Role }>(
      `select m.user_id, u.display_name, m.role from memberships m join users u on u.id = m.user_id
       where m.campaign_id = $1 order by m.role, m.joined_at`,
      [campaignId],
    );
    return rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, role: r.role }));
  }

  // ---------------------------------------------------------- invites ---

  async createInvite(campaignId: string, creator: User, opts: { maxUses?: number; expiresInHours?: number } = {}): Promise<Invite> {
    const code = newInviteCode();
    const expires = opts.expiresInHours ? new Date(Date.now() + opts.expiresInHours * 3_600_000) : null;
    const [row] = await this.db.query(
      `insert into invites (code, campaign_id, created_by, expires_at, max_uses) values ($1, $2, $3, $4, $5)
       returning code, created_at, expires_at, max_uses, uses, revoked_at`,
      [code, campaignId, creator.id, expires, opts.maxUses ?? null],
    );
    return inviteOf(row!);
  }

  async invites(campaignId: string): Promise<Invite[]> {
    const rows = await this.db.query(
      "select code, created_at, expires_at, max_uses, uses, revoked_at from invites where campaign_id = $1 order by created_at",
      [campaignId],
    );
    return rows.map(inviteOf);
  }

  async revokeInvite(campaignId: string, code: string): Promise<void> {
    const rows = await this.db.query(
      "update invites set revoked_at = coalesce(revoked_at, now()) where campaign_id = $1 and code = $2 returning code",
      [campaignId, code],
    );
    if (!rows.length) throw new HttpError(404, "no such invite");
  }

  /** What an invite link shows before anyone accepts it. */
  async inviteInfo(code: string): Promise<{ campaignName: string; usable: boolean }> {
    const [row] = await this.db.query(
      `select c.name, i.expires_at, i.max_uses, i.uses, i.revoked_at from invites i
       join campaigns c on c.id = i.campaign_id where i.code = $1`,
      [code],
    );
    if (!row) throw new HttpError(404, "no such invite");
    return { campaignName: row.name, usable: unusableReason(row) === null };
  }

  /** Joins a campaign as a player. Accepting a campaign one already belongs to changes nothing. */
  async acceptInvite(code: string, user: User | null) {
    if (!user) throw new HttpError(401, "sign in first");
    const out = await this.db.tx(async (q) => {
      const [inv] = await q.query("select * from invites where code = $1 for update", [code]);
      if (!inv) throw new HttpError(404, "no such invite");
      const [m] = await q.query<{ role: Role }>(
        "select role from memberships where campaign_id = $1 and user_id = $2",
        [inv.campaign_id, user.id],
      );
      if (m) return { campaignId: inv.campaign_id as string, role: m.role, joined: false };
      const why = unusableReason(inv);
      if (why) throw new HttpError(410, why);
      await q.query("insert into memberships (campaign_id, user_id, role) values ($1, $2, 'player')", [inv.campaign_id, user.id]);
      await q.query("update invites set uses = uses + 1 where code = $1", [code]);
      return { campaignId: inv.campaign_id as string, role: "player" as Role, joined: true };
    });
    if (out.joined) this.emit({ kind: "members", campaignId: out.campaignId });
    return out;
  }

  // ------------------------------------------------------- the record ---

  /** The stored rules snapshot for a version. */
  async rules(version: string): Promise<RulesSnapshot> {
    try {
      return (await this.engine(version)).rules;
    } catch {
      throw new HttpError(404, `no rules ${version}`);
    }
  }

  private async engine(version: string): Promise<Engine> {
    let e = this.engines.get(version);
    if (!e) {
      const [row] = await this.db.query<{ snapshot: RulesSnapshot }>("select snapshot from rules_snapshots where version = $1", [version]);
      if (!row) throw new Error(`rules ${version} is not stored`);
      e = new Engine(row.snapshot);
      this.engines.set(version, e);
    }
    return e;
  }

  async record(campaignId: string): Promise<CampaignRecord> {
    const cached = this.records.get(campaignId);
    if (cached) return cached;
    const campaign = await this.campaign(campaignId);
    const rows = await this.db.query(
      "select seq, id, at, actor, source, cause, action from actions where campaign_id = $1 order by seq",
      [campaignId],
    );
    const log: Envelope[] = rows.map((r) => ({
      id: r.id,
      seq: r.seq,
      at: iso(r.at)!,
      actor: r.actor,
      source: r.source,
      ...(r.cause === null ? {} : { cause: r.cause }),
      action: r.action,
    }));
    const record = new CampaignRecord(await this.engine(campaign.rulesVersion), log);
    this.records.set(campaignId, record);
    return record;
  }

  /** Runs `fn` with the campaign's appends serialized. */
  private async locked<T>(campaignId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(campaignId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => {});
    this.locks.set(campaignId, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(campaignId) === tail) this.locks.delete(campaignId);
    }
  }

  private async draftFor(campaignId: string, user: User, role: Role, s: Submission): Promise<Draft> {
    const a = s.action;
    const namesPlayer = a.type === "character.create" || a.type === "character.pregen" || a.type === "character.assign";
    if (namesPlayer && a.playerId !== undefined) {
      if ((await this.roleIn(campaignId, a.playerId)) !== "player")
        throw new HttpError(422, "a character's player must be a player in this campaign");
    }
    return {
      id: s.id,
      at: new Date().toISOString(),
      actor: { role, userId: user.id },
      source: s.source,
      ...(s.cause === undefined ? {} : { cause: s.cause }),
      action: a,
    };
  }

  async submit(campaignId: string, user: User | null, s: Submission): Promise<Appended> {
    const role = await this.requireMember(campaignId, user);
    if (role !== "gm" && s.source !== "manual") throw new HttpError(403, "only the GM records suggestions, voice, and counters");
    const draft = await this.draftFor(campaignId, user!, role, s);
    const appended = await this.locked(campaignId, async () => {
      const record = await this.record(campaignId);
      let out: Appended;
      try {
        out = record.append(draft);
      } catch (e) {
        if (e instanceof IdConflict) throw new HttpError(409, e.message);
        if (e instanceof RecordError) throw new HttpError(422, e.message);
        throw e;
      }
      if (out.duplicate) return out;
      const env = out.envelope;
      try {
        await this.db.query(
          `insert into actions (campaign_id, seq, id, at, actor, source, cause, action)
           values ($1, $2, $3, $4, $5::json, $6, $7, $8::json)`,
          [campaignId, env.seq, env.id, env.at, JSON.stringify(env.actor), env.source, env.cause ?? null, JSON.stringify(env.action)],
        );
      } catch (e) {
        this.records.delete(campaignId); // memory ran ahead of the log; reload on next use
        throw e;
      }
      return out;
    });
    if (!appended.duplicate) this.emit({ kind: "appended", campaignId, appended });
    return appended;
  }

  async preview(campaignId: string, user: User | null, s: Submission): Promise<Preview> {
    await this.requireGm(campaignId, user);
    const draft = await this.draftFor(campaignId, user!, "gm", s);
    return (await this.record(campaignId)).preview(draft);
  }

  /** A player's screen exactly as they see it, for the GM. */
  async viewAs(campaignId: string, gm: User | null, playerId: string): Promise<PlayerView> {
    await this.requireGm(campaignId, gm);
    if ((await this.roleIn(campaignId, playerId)) !== "player") throw new HttpError(404, "no such player in this campaign");
    return (await this.view(campaignId, { userId: playerId, role: "player" })) as PlayerView;
  }

  // ------------------------------------------- characters outside campaigns ---

  async unassigned(user: User | null): Promise<UnassignedCharacter[]> {
    if (!user) throw new HttpError(401, "sign in first");
    const rows = await this.db.query(
      "select id, name, spec, created_at from unassigned_characters where owner_id = $1 order by created_at",
      [user.id],
    );
    return rows.map((r) => ({ id: r.id, name: r.name, spec: r.spec, createdAt: iso(r.created_at)! }));
  }

  /** Builds a character outside any campaign, checked against the rules new campaigns use. */
  async createUnassigned(user: User | null, spec: CharacterSpec): Promise<UnassignedCharacter> {
    if (!user) throw new HttpError(401, "sign in first");
    const engine = await this.engine(this.rulesVersion);
    let name: string;
    if (spec.kind === "pregen") {
      try {
        name = engine.pregen(spec.pregen).name;
      } catch {
        throw new HttpError(422, `no ready-made character named ${spec.pregen}`);
      }
    } else {
      name = spec.name.trim();
      const problems = pointBuyProblems(engine, spec.stats);
      if (!name) problems.unshift("a character needs a name");
      if (!spec.background.trim()) problems.push("a character needs a Background");
      if (problems.length) throw new HttpError(422, problems.join("; "));
    }
    const row = { id: newId(), name, spec, createdAt: new Date().toISOString() };
    await this.db.query("insert into unassigned_characters (id, owner_id, name, spec, created_at) values ($1, $2, $3, $4::json, $5)", [
      row.id,
      user.id,
      name,
      JSON.stringify(spec),
      row.createdAt,
    ]);
    return row;
  }

  async deleteUnassigned(user: User | null, id: string): Promise<void> {
    if (!user) throw new HttpError(401, "sign in first");
    const rows = await this.db.query("delete from unassigned_characters where id = $1 and owner_id = $2 returning id", [id, user.id]);
    if (!rows.length) throw new HttpError(404, "no such character");
  }

  /**
   * Moves a character from the pool into a campaign the owner belongs to: a player's character
   * is theirs there, a GM's is held by the GM. The append's id is derived from the character,
   * so a retry after a failed delete records it once.
   */
  async joinCampaign(user: User | null, id: string, campaignId: string): Promise<{ campaignId: string; characterId: string }> {
    if (!user) throw new HttpError(401, "sign in first");
    const [row] = await this.db.query("select name, spec from unassigned_characters where id = $1 and owner_id = $2", [id, user.id]);
    if (!row) throw new HttpError(404, "no such character");
    const role = await this.requireMember(campaignId, user);
    const spec = row.spec as CharacterSpec;
    const characterId = `${slugify(row.name)}-${id.slice(0, 4)}`;
    const owner = role === "player" ? { playerId: user.id } : {};
    const action: Action =
      spec.kind === "pregen"
        ? { type: "character.pregen", characterId, pregen: spec.pregen, ...owner }
        : { type: "character.create", characterId, name: spec.name.trim(), stats: spec.stats, background: spec.background, ...owner };
    await this.submit(campaignId, user, { id: `join-${id}`, source: "manual", action });
    await this.db.query("delete from unassigned_characters where id = $1", [id]);
    return { campaignId, characterId };
  }

  async view(campaignId: string, who: { userId: string; role: Role }): Promise<View> {
    const [record, campaign, members] = await Promise.all([this.record(campaignId), this.campaign(campaignId), this.members(campaignId)]);
    return viewFor(record, campaign, members, who);
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "character"
  );
}

function inviteOf(r: Record<string, any>): Invite {
  return {
    code: r.code,
    createdAt: iso(r.created_at)!,
    expiresAt: iso(r.expires_at),
    maxUses: r.max_uses,
    uses: r.uses,
    revokedAt: iso(r.revoked_at),
  };
}

function unusableReason(r: Record<string, any>): string | null {
  if (r.revoked_at) return "this invite was revoked";
  if (r.expires_at && new Date(r.expires_at) <= new Date()) return "this invite has expired";
  if (r.max_uses !== null && r.uses >= r.max_uses) return "this invite has been used up";
  return null;
}
