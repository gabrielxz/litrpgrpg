/**
 * Drafting from typed table talk (app/DESIGN.md, M2, "Event drafting"). The GM pastes or types
 * what was said; the server reads the names into speakers and lines, and drafts through the
 * campaign's model in the background: the moments (events and their HVE entries) and the
 * bookkeeping (items, quests, counts, Prep cues), two requests side by side. The drafts wait
 * apart from the action log. The GM accepts each (as drafted or edited), which records the GM's
 * own action with the source `suggestion`, or dismisses it; a Prep cue is fired from Prep.
 * Recording by hand makes the same record.
 *
 * Nothing here reaches a player: every operation is the GM's, and drafts are never in a view.
 * A campaign drafts one run at a time, so a double click does not pay twice.
 */
import { type Action, type Appended, CampaignRecord } from "@gradebreaker/record";
import {
  DRAFT_ACTIONS_FEATURE,
  DRAFT_EVENTS_FEATURE,
  type Drafter,
  type Scene,
  type TypedTalk,
  draftActions,
  draftEvents,
  readTypedTalk,
} from "@gradebreaker/listening";
import { type CampaignAi, ModelError, problemOf } from "./ai.ts";
import type { Db } from "./db.ts";
import { HttpError, type Service, type User } from "./service.ts";
import { newId } from "./tokens.ts";

/** The longest paste a run takes: about an hour of talk. */
export const MAX_TALK_CHARS = 60_000;
export const MAX_TALK_LINES = 800;
/** Runs the GM's list carries, newest first. */
export const RUNS_LISTED = 10;

export type RunStatus = "drafting" | "done" | "failed";
export type ItemStatus = "open" | "accepted" | "dismissed";
export type ItemKind = "event" | "action" | "cue";

/** What each kind of draft may record on accepting. A cue records nothing: the GM fires it from Prep. */
const ACCEPTS: Record<ItemKind, readonly Action["type"][]> = {
  event: ["event.log"],
  action: ["item.give", "item.move", "item.remove", "quest.progress", "quest.complete", "quest.fail", "counter.tick"],
  cue: [],
};

export interface DraftItem {
  runId: string;
  itemId: string;
  kind: ItemKind;
  lines: string[];
  /** The drafted action; a cue has none. */
  action?: Action;
  /** A cue's prepared item. */
  prepId?: string;
  /** An event's reason per character. */
  reasons: { characterId: string; why: string }[];
  /** An action's or a cue's reason. */
  why?: string;
  status: ItemStatus;
  actionId?: string;
  /** Accepted, and the action it recorded has since been undone or corrected away: it can be accepted again. */
  undone?: boolean;
  /** A cue whose prepared item has been fired since the run. */
  fired?: boolean;
  resolvedAt?: string;
}

export interface DraftRun {
  id: string;
  feature: string;
  createdAt: string;
  finishedAt?: string;
  status: RunStatus;
  problem?: string;
  message?: string;
  talk: TypedTalk;
  repaired: string[];
  dropped: { why: string }[];
  items: DraftItem[];
}

const iso = (d: Date | string) => new Date(d).toISOString();

export class Drafts {
  private readonly db: Db;
  private readonly service: Service;
  private readonly ai: CampaignAi;
  /** Runs drafting in this process, for the tests to wait on. */
  private readonly running = new Map<string, Promise<void>>();
  /** Drafts being accepted right now, so two clicks record one event. */
  private readonly accepting = new Set<string>();

  private constructor(db: Db, service: Service, ai: CampaignAi) {
    this.db = db;
    this.service = service;
    this.ai = ai;
  }

  /** A run left drafting by a process that stopped will never finish: it is marked failed. */
  static async open(db: Db, service: Service, ai: CampaignAi): Promise<Drafts> {
    await db.query(
      "update draft_runs set status = 'failed', problem = 'other', message = 'the server restarted while drafting; draft again', finished_at = now() where status = 'drafting'",
    );
    return new Drafts(db, service, ai);
  }

  /** Reads the talk, stores the run, and drafts in the background. Returns the run as it starts. */
  async start(campaignId: string, user: User | null, text: string): Promise<DraftRun> {
    await this.service.requireGm(campaignId, user);
    const status = await this.ai.status(campaignId);
    if (!status.configured) throw new ModelError("key", "no key is set for this campaign");
    if (text.length > MAX_TALK_CHARS) throw new HttpError(413, `that is more than ${MAX_TALK_CHARS.toLocaleString("en-US")} characters; draft it in parts`);

    const record = await this.service.record(campaignId);
    const members = await this.service.members(campaignId);
    const sheets = [...record.sheets().values()];
    const talk = readTypedTalk(text, {
      members: members.map((m) => ({ userId: m.userId, name: m.displayName, role: m.role })),
      characters: sheets.map((s) => ({ id: s.id, name: s.name, playerId: s.playerId })),
    });
    if (!talk.lines.length) throw new HttpError(422, "there are no lines to draft from");
    if (talk.lines.length > MAX_TALK_LINES) throw new HttpError(413, `that is more than ${MAX_TALK_LINES} lines; draft it in parts`);

    const [busy] = await this.db.query("select id from draft_runs where campaign_id = $1 and status = 'drafting'", [campaignId]);
    if (busy) throw new HttpError(409, "a draft is still running; wait for it to finish");

    const id = newId();
    await this.db.query(
      "insert into draft_runs (id, campaign_id, feature, created_by, status, talk) values ($1, $2, $3, $4, 'drafting', $5::jsonb)",
      [id, campaignId, `${DRAFT_EVENTS_FEATURE},${DRAFT_ACTIONS_FEATURE}`, user!.id, JSON.stringify(talk)],
    );
    // The record as it stands: typed talk carries no timing, so what the table recorded in the
    // app during these lines is already in it, and the events logged are listed to the model.
    const scene: Scene = {
      record: new CampaignRecord(record.engine, record.log),
      speakers: talk.speakers,
      lines: talk.lines,
      recorded: [],
    };
    const work = this.draft(campaignId, id, scene).finally(() => this.running.delete(id));
    this.running.set(id, work);
    return (await this.run(campaignId, id))!;
  }

  /** Resolves when a run started in this process has finished drafting. */
  settled(runId: string): Promise<void> {
    return this.running.get(runId) ?? Promise.resolve();
  }

  private async draft(campaignId: string, runId: string, scene: Scene): Promise<void> {
    const engine = scene.record.engine;
    const drafter =
      (feature: string): Drafter =>
      (req) =>
        this.ai.draft(campaignId, feature, req);
    const [events, actions] = await Promise.allSettled([draftEvents(engine, drafter(DRAFT_EVENTS_FEATURE), scene), draftActions(engine, drafter(DRAFT_ACTIONS_FEATURE), scene)]);
    if (events.status === "rejected" && actions.status === "rejected") {
      const p = problemOf(events.reason);
      await this.db.query("update draft_runs set status = 'failed', finished_at = now(), problem = $2, message = $3 where id = $1", [runId, p.problem, p.message]);
      return;
    }
    // One drafter failing leaves the other's drafts, with the failure said on the run.
    const failed = events.status === "rejected" ? ["the moments", events.reason] : actions.status === "rejected" ? ["the bookkeeping", actions.reason] : null;
    const problem = failed ? problemOf(failed[1]) : null;
    const rows: unknown[][] = [];
    if (events.status === "fulfilled")
      for (const d of events.value.drafts) rows.push([d.id, "event", d.lines, d.action, d.reasons, null, null]);
    if (actions.status === "fulfilled")
      for (const d of actions.value.drafts) rows.push([d.id, d.suggestion ? "cue" : "action", d.lines, d.action ?? null, [], d.why, d.suggestion ?? null]);
    const repaired = [...(events.status === "fulfilled" ? events.value.repaired : []), ...(actions.status === "fulfilled" ? actions.value.repaired : [])];
    const dropped = [...(events.status === "fulfilled" ? events.value.dropped : []), ...(actions.status === "fulfilled" ? actions.value.dropped : [])];
    await this.db.tx(async (q) => {
      for (const [id, kind, lines, action, reasons, why, suggestion] of rows) {
        await q.query(
          "insert into draft_items (run_id, item_id, campaign_id, kind, lines, action, reasons, why, suggestion) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9::jsonb)",
          [runId, id, campaignId, kind, JSON.stringify(lines), action === null ? null : JSON.stringify(action), JSON.stringify(reasons), why, suggestion === null ? null : JSON.stringify(suggestion)],
        );
      }
      await q.query(
        "update draft_runs set status = 'done', finished_at = now(), repaired = $2::jsonb, dropped = $3::jsonb, problem = $4, message = $5 where id = $1",
        [runId, JSON.stringify(repaired), JSON.stringify(dropped.map((d) => ({ why: d.why }))), problem?.problem ?? null, problem ? `drafting ${failed![0]} failed: ${problem.message}` : null],
      );
    });
  }

  /** The newest runs with their drafts. */
  async list(campaignId: string, user: User | null): Promise<DraftRun[]> {
    await this.service.requireGm(campaignId, user);
    const runs = await this.db.query("select * from draft_runs where campaign_id = $1 order by created_at desc, id desc limit $2", [campaignId, RUNS_LISTED]);
    if (!runs.length) return [];
    const items = await this.db.query("select * from draft_items where run_id = any($1::text[]) order by run_id, item_id", [runs.map((r) => r.id)]);
    const record = await this.service.record(campaignId);
    return runs.map((r) => this.runOf(r, items.filter((i) => i.run_id === r.id), record));
  }

  private async run(campaignId: string, runId: string): Promise<DraftRun | null> {
    const [r] = await this.db.query("select * from draft_runs where campaign_id = $1 and id = $2", [campaignId, runId]);
    if (!r) return null;
    const items = await this.db.query("select * from draft_items where run_id = $1 order by item_id", [runId]);
    return this.runOf(r, items, await this.service.record(campaignId));
  }

  private runOf(r: Record<string, any>, items: Record<string, any>[], record: CampaignRecord): DraftRun {
    const at = new Map((r.talk as TypedTalk).lines.map((l, i) => [l.id, i]));
    const first = (x: DraftItem) => Math.min(...x.lines.map((l) => at.get(l) ?? Infinity));
    const rank = { event: 0, action: 1, cue: 2 };
    return {
      id: r.id,
      feature: r.feature,
      createdAt: iso(r.created_at),
      ...(r.finished_at ? { finishedAt: iso(r.finished_at) } : {}),
      status: r.status,
      ...(r.problem ? { problem: r.problem, message: r.message } : {}),
      talk: r.talk,
      repaired: r.repaired,
      dropped: r.dropped,
      // In the order the table reached them; on one line, the moment first.
      items: items.map((i) => this.itemOf(i, record, iso(r.created_at))).sort((a, b) => first(a) - first(b) || rank[a.kind] - rank[b.kind]),
    };
  }

  private itemOf(i: Record<string, any>, record: CampaignRecord, since: string): DraftItem {
    const state = record.state;
    const standing = (id: string) => record.log.some((e) => e.id === id) && !state.voided.has(id) && !state.rejected.some((x) => x.envelope.id === id);
    const prepId: string | undefined = i.suggestion?.key;
    const fired =
      i.kind === "cue" && record.log.some((e) => e.cause === `prep:${prepId}` && e.at >= since && standing(e.id));
    return {
      runId: i.run_id,
      itemId: i.item_id,
      kind: i.kind,
      lines: i.lines,
      ...(i.action ? { action: i.action } : {}),
      ...(prepId ? { prepId } : {}),
      reasons: i.reasons,
      ...(i.why ? { why: i.why } : {}),
      status: i.status,
      ...(i.action_id ? { actionId: i.action_id } : {}),
      ...(i.status === "accepted" && i.action_id && !standing(i.action_id) ? { undone: true } : {}),
      ...(fired ? { fired: true } : {}),
      ...(i.resolved_at ? { resolvedAt: iso(i.resolved_at) } : {}),
    };
  }

  private async item(campaignId: string, runId: string, itemId: string): Promise<DraftItem> {
    const [i] = await this.db.query(
      "select i.*, r.created_at as run_created_at from draft_items i join draft_runs r on r.id = i.run_id where i.campaign_id = $1 and i.run_id = $2 and i.item_id = $3",
      [campaignId, runId, itemId],
    );
    if (!i) throw new HttpError(404, "no such draft");
    return this.itemOf(i, await this.service.record(campaignId), iso(i.run_created_at));
  }

  /**
   * Records the GM's action for a draft, as drafted or edited, and marks the draft accepted. An
   * event draft records an event, and an action draft an item, quest, or count action. A retry
   * with the same action id records it once. A draft already accepted takes another only when
   * its action was undone.
   */
  async accept(campaignId: string, user: User | null, runId: string, itemId: string, s: { id: string; action: Action }): Promise<{ appended: Appended; item: DraftItem }> {
    await this.service.requireGm(campaignId, user);
    const key = `${campaignId}/${runId}/${itemId}`;
    if (this.accepting.has(key)) throw new HttpError(409, "this draft is being accepted");
    this.accepting.add(key);
    try {
      const before = await this.item(campaignId, runId, itemId);
      if (!ACCEPTS[before.kind].includes(s.action.type))
        throw new HttpError(422, before.kind === "cue" ? "a Prep cue is fired from Prep" : `this draft is accepted as ${ACCEPTS[before.kind].join(" or ")}`);
      if (before.status === "dismissed") throw new HttpError(409, "this draft was dismissed; restore it first");
      if (before.status === "accepted" && !before.undone && before.actionId !== s.id) throw new HttpError(409, "this draft was already accepted");
      const appended = await this.service.submit(campaignId, user, { id: s.id, source: "suggestion", cause: `draft:${runId}/${itemId}`, action: s.action });
      await this.db.query(
        "update draft_items set status = 'accepted', action_id = $4, resolved_by = $5, resolved_at = now() where campaign_id = $1 and run_id = $2 and item_id = $3",
        [campaignId, runId, itemId, s.id, user!.id],
      );
      return { appended, item: await this.item(campaignId, runId, itemId) };
    } finally {
      this.accepting.delete(key);
    }
  }

  /** Dismisses an open draft (or an accepted one whose event was undone), or restores a dismissed one to open. */
  async mark(campaignId: string, user: User | null, runId: string, itemId: string, to: "dismissed" | "open"): Promise<DraftItem> {
    await this.service.requireGm(campaignId, user);
    const before = await this.item(campaignId, runId, itemId);
    const movable = to === "dismissed" ? before.status === "open" || Boolean(before.undone) : before.status === "dismissed";
    if (!movable) throw new HttpError(409, to === "dismissed" ? "only an open draft can be dismissed" : "only a dismissed draft can be restored");
    await this.db.query(
      "update draft_items set status = $4, resolved_by = $5, resolved_at = case when $4 = 'open' then null else now() end where campaign_id = $1 and run_id = $2 and item_id = $3",
      [campaignId, runId, itemId, to, user!.id],
    );
    return this.item(campaignId, runId, itemId);
  }
}
