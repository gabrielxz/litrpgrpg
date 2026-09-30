/**
 * Drafting from typed table talk (app/DESIGN.md, M2, "Event drafting"). The GM pastes or types
 * what was said; the server reads the names into speakers and lines, and drafts through the
 * campaign's model in the background: the moments (events and their HVE entries), the
 * bookkeeping (items, quests, counts, Prep cues), and the suggestions (titles the fiction earns,
 * Battle Memory Cards, Hidden Achievements), three requests side by side. The drafts wait
 * apart from the action log. The GM accepts each (as drafted or edited), which records the GM's
 * own action with the source `suggestion`, or dismisses it; a Prep cue is fired from Prep.
 * Recording by hand makes the same record. The System's voice (a message for the composer, a
 * vision for a meditation) is drafted and returned to the GM's form, never stored.
 *
 * What the listening heard is drafted the same way, a window of lines at a time (`startHeard`,
 * closed by live-drafting.ts): the lines not yet drafted with the ones before them as context, the
 * record as it stood at the first of them, and what the table recorded since, placed by time.
 *
 * Nothing here reaches a player: every operation is the GM's, and drafts are never in a view.
 * A campaign drafts one run at a time, so a double click does not pay twice.
 */
import { type Action, type Appended, CampaignRecord, type Envelope, type HeardLine, runningSession } from "@gradebreaker/record";
import {
  DRAFT_ACTIONS_FEATURE,
  DRAFT_CHARACTER_SUMMARY_FEATURE,
  DRAFT_CLASSES_FEATURE,
  DRAFT_EVENTS_FEATURE,
  DRAFT_MESSAGE_FEATURE,
  DRAFT_OPPORTUNITY_FEATURE,
  DRAFT_SESSION_SUMMARY_FEATURE,
  DRAFT_SUGGESTIONS_FEATURE,
  DRAFT_VISION_FEATURE,
  type Drafter,
  type CharacterSummaryDraft,
  type MessageDraft,
  type Scene,
  type SuggestionDraft,
  type TypedTalk,
  type VisionDraft,
  draftActions,
  draftCharacterSummary,
  draftClasses,
  draftEvents,
  draftMessage,
  draftOpportunity,
  draftSessionSummary,
  draftSuggestions,
  draftVision,
  type DraftMark,
  EARLIER_LINES,
  dueOffers,
  flavorsFor,
  SHADOW_TYPES,
  type ShadowDraft,
  type ShadowReport,
  compareShadow,
  markOf,
  readTypedTalk,
  repeats,
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
export type ItemKind = "event" | "action" | "cue" | "suggestion";

/** What each kind of draft may record on accepting. A cue records nothing: the GM fires it from Prep. */
const ACCEPTS: Record<ItemKind, readonly Action["type"][]> = {
  event: ["event.log"],
  action: ["item.give", "item.move", "item.remove", "quest.progress", "quest.complete", "quest.fail", "ve.award", "party.invite", "party.answer", "counter.tick"],
  cue: [],
  suggestion: ["title.grant", "memory.grant", "quest.issue", "quest.reveal", "class.offer"],
};

/** A suggestion as the panel names it: a title, a Battle Memory Card, or a Hidden Achievement for a character. */
export interface Suggested {
  kind: string;
  key: string;
  characterId?: string;
  /** A Personal Opportunity: whether it affirms or tests the pattern, and the System's words with the offer. */
  stance?: "affirm" | "test";
  notice?: string;
  /** Class offers: for the GM, each offer's role, what it weighs, and the book's rules and advice it crosses; and problems across the three. */
  offers?: { role: string; weighs: string; problems: string[]; warnings: string[]; everyFight?: boolean }[];
  problems?: string[];
  /** Other readings of the same deed, each with what accepting it records: the GM takes one or the draft. */
  alternatives?: { label: string; why: string; accept: Action }[];
}

export interface DraftItem {
  runId: string;
  itemId: string;
  kind: ItemKind;
  lines: string[];
  /** The drafted action; a cue has none. */
  action?: Action;
  /** A cue's prepared item. */
  prepId?: string;
  /** A suggestion's kind and subject; its `action` is what accepting records. */
  suggestion?: Suggested;
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

/** A window of heard lines: its session, the last line drafted (by id), and the earlier lines sent as context. */
export interface HeardWindow {
  sessionId: string;
  through: number;
  earlier: string[];
}

/** A run's talk: typed, or a window of heard lines, whose earlier lines come first. */
export type RunTalk = TypedTalk & { heard?: HeardWindow };

/** Why a window of heard lines did not start drafting. */
export type HeardSkip = "no key" | "busy" | "no session" | "too few lines";

/** Drafting what the listening hears: on, in shadow (kept from review until released), or off. */
export type LiveMode = "on" | "shadow" | "off";

/** Shadow mode's comparison for one session, with each draft as the review shows it. */
export interface ShadowSession {
  /** Drafts still kept from review. */
  hidden: number;
  both: { item: DraftItem; logged: Envelope; sameSide?: boolean }[];
  gmOnly: Envelope[];
  listenerOnly: DraftItem[];
  byType: ShadowReport["byType"];
}

export interface DraftRun {
  id: string;
  feature: string;
  createdAt: string;
  finishedAt?: string;
  status: RunStatus;
  problem?: string;
  message?: string;
  talk: RunTalk;
  /** A window drafted in shadow: hidden (its drafts kept from review) or released. */
  shadow?: "hidden" | "released";
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
      [id, campaignId, `${DRAFT_EVENTS_FEATURE},${DRAFT_ACTIONS_FEATURE},${DRAFT_SUGGESTIONS_FEATURE}`, user!.id, JSON.stringify(talk)],
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

  /**
   * Drafts a window of what the listening heard in the running session: the lines stored since the
   * last window (at least `min` of them), in the order they were said, with the EARLIER_LINES
   * before them as context; the record as it stood when the first was said, and what the table
   * recorded since, each after the line it followed. Returns the run, or why it did not start.
   */
  async startHeard(campaignId: string, min: number, shadow = false): Promise<{ run: DraftRun } | { skip: HeardSkip }> {
    if (!(await this.ai.status(campaignId)).configured) return { skip: "no key" };
    const record = await this.service.record(campaignId);
    const session = runningSession(record.state);
    if (!session) return { skip: "no session" };
    const [busy] = await this.db.query("select id from draft_runs where campaign_id = $1 and status = 'drafting'", [campaignId]);
    if (busy) return { skip: "busy" };
    const [done] = await this.db.query(
      "select coalesce(max((talk->'heard'->>'through')::bigint), 0) as through from draft_runs where campaign_id = $1 and talk->'heard'->>'sessionId' = $2",
      [campaignId, session.id],
    );
    const through = Number(done?.through ?? 0);
    const heard = await this.service.heard(campaignId, session.id);
    const fresh = heard.filter((l) => Number(l.id) > through).slice(0, MAX_TALK_LINES);
    if (fresh.length < Math.max(1, min)) return { skip: "too few lines" };
    const earlier = heard.filter((l) => Number(l.id) <= through).slice(-EARLIER_LINES);

    const members = await this.service.members(campaignId);
    const speakers = members.map((m) => ({ id: m.userId, role: m.role, name: m.displayName }));
    const line = (l: HeardLine) => ({ id: `h${l.id}`, speaker: l.userId, text: l.text });
    const firstAt = Date.parse(fresh[0]!.startedAt);
    // In shadow the listener works blind to what the GM records by hand this session, the kinds the
    // comparison counts, or it would decline to draft what it sees already logged and measure nothing.
    const types = new Set<string>(SHADOW_TYPES);
    const sessionAt = Date.parse(session.startedAt);
    const seen = (e: Envelope) => !(shadow && types.has(e.action.type) && e.source !== "suggestion" && Date.parse(e.at) >= sessionAt);
    const log = record.log.filter(seen);
    const before = log.filter((e: Envelope) => Date.parse(e.at) < firstAt);
    // What the table recorded from the first earlier line on, each after the last line said before it
    // (a Downing in the tracker is said by no one); what came before the window is in its record too.
    const spoken = [...earlier, ...fresh];
    const from = Date.parse(spoken[0]!.startedAt);
    const since = log.filter((e: Envelope) => Date.parse(e.at) >= from);
    const after = (e: Envelope) => line(spoken.filter((l) => Date.parse(l.startedAt) <= Date.parse(e.at)).at(-1) ?? spoken[0]!).id;
    const scene: Scene = {
      record: new CampaignRecord(record.engine, before),
      speakers,
      lines: fresh.map(line),
      earlier: earlier.map(line),
      recorded: since.map((e) => ({ after: after(e), action: e.action, effects: record.state.effects.get(e.id) ?? [] })),
    };
    const talk: RunTalk = {
      speakers,
      lines: [...scene.earlier!, ...scene.lines],
      readings: [],
      heard: { sessionId: session.id, through: Math.max(...fresh.map((l) => Number(l.id))), earlier: scene.earlier!.map((l) => l.id) },
    };
    const id = newId();
    // The window drafts for the GM, who started the listening.
    const gm = members.find((m) => m.role === "gm")!;
    await this.db.query(
      "insert into draft_runs (id, campaign_id, feature, created_by, status, talk, shadow) values ($1, $2, $3, $4, 'drafting', $5::jsonb, $6)",
      [id, campaignId, `${DRAFT_EVENTS_FEATURE},${DRAFT_ACTIONS_FEATURE},${DRAFT_SUGGESTIONS_FEATURE}`, gm.userId, JSON.stringify(talk), shadow],
    );
    const prior = await this.heardMarks(campaignId, session.id, id);
    const work = this.draft(campaignId, id, scene, prior).finally(() => this.running.delete(id));
    this.running.set(id, work);
    return { run: (await this.run(campaignId, id))! };
  }

  async liveMode(campaignId: string): Promise<LiveMode> {
    const [r] = await this.db.query("select live_drafting from campaigns where id = $1", [campaignId]);
    return (r?.live_drafting ?? "on") as LiveMode;
  }

  async setLiveMode(campaignId: string, user: User | null, mode: LiveMode): Promise<void> {
    await this.service.requireGm(campaignId, user);
    await this.db.query("update campaigns set live_drafting = $2 where id = $1", [campaignId, mode]);
  }

  /**
   * Shadow mode's comparison for a session: the drafts of its shadow windows against what the GM
   * recorded by hand while it ran (drafts the GM accepted are no baseline, nor anything undone).
   * A draft is dated by when its first cited line was said.
   */
  async shadow(campaignId: string, user: User | null, sessionId: string): Promise<ShadowSession> {
    await this.service.requireGm(campaignId, user);
    const record = await this.service.record(campaignId);
    const session = record.state.sessions.get(sessionId);
    if (!session) throw new HttpError(404, "no such session");
    const runs = await this.db.query("select * from draft_runs where campaign_id = $1 and shadow and talk->'heard'->>'sessionId' = $2", [campaignId, sessionId]);
    const items = runs.length ? await this.db.query("select * from draft_items where run_id = any($1::text[]) and kind <> 'cue' and action is not null", [runs.map((r) => r.id)]) : [];
    const said = new Map((await this.service.heard(campaignId, sessionId)).map((l) => [`h${l.id}`, Date.parse(l.startedAt)]));
    const byKey = new Map<string, DraftItem>();
    const drafts: ShadowDraft[] = items.map((i) => {
      const run = runs.find((r) => r.id === i.run_id)!;
      byKey.set(`${i.run_id}/${i.item_id}`, this.itemOf(i, record, iso(run.created_at)));
      const times = (i.lines as string[]).map((l) => said.get(l)).filter((t): t is number => t !== undefined);
      return { runId: i.run_id, itemId: i.item_id, action: i.action, saidAt: times.length ? Math.min(...times) : Date.parse(iso(run.created_at)) };
    });
    const state = record.state;
    const from = Date.parse(session.startedAt);
    const to = session.endedAt ? Date.parse(session.endedAt) : Infinity;
    const types = new Set<string>(SHADOW_TYPES);
    const logged = record.log.filter(
      (e) =>
        types.has(e.action.type) &&
        e.source !== "suggestion" &&
        Date.parse(e.at) >= from &&
        Date.parse(e.at) <= to &&
        !state.voided.has(e.id) &&
        !state.rejected.some((x) => x.envelope.id === e.id),
    );
    const report = compareShadow(drafts, logged);
    const item = (d: ShadowDraft) => byKey.get(`${d.runId}/${d.itemId}`)!;
    return {
      hidden: runs.filter((r) => !r.released_at).length,
      both: report.both.map((m) => ({ item: item(m.draft), logged: m.logged, ...(m.sameSide !== undefined ? { sameSide: m.sameSide } : {}) })),
      gmOnly: report.gmOnly,
      listenerOnly: report.listenerOnly.map(item),
      byType: report.byType,
    };
  }

  /** Puts a session's shadow drafts in review. */
  async releaseShadow(campaignId: string, user: User | null, sessionId: string): Promise<void> {
    await this.service.requireGm(campaignId, user);
    await this.db.query("update draft_runs set released_at = now() where campaign_id = $1 and shadow and released_at is null and talk->'heard'->>'sessionId' = $2", [campaignId, sessionId]);
  }

  /** What earlier windows of the session drafted, so a window does not draft the same moment again. */
  private async heardMarks(campaignId: string, sessionId: string, except: string): Promise<DraftMark[]> {
    const rows = await this.db.query(
      `select i.lines, i.action, i.suggestion from draft_items i join draft_runs r on r.id = i.run_id
       where i.campaign_id = $1 and r.talk->'heard'->>'sessionId' = $2 and r.id <> $3 and i.kind <> 'cue'`,
      [campaignId, sessionId, except],
    );
    return rows.map((r) => markOf(r.suggestion ? { lines: r.lines, suggestion: r.suggestion } : { lines: r.lines, action: r.action }));
  }

  /**
   * Drafts a Personal Opportunity for one character at the sweep, in the background, as a run
   * with one suggestion: the offer as the quest the GM issues. The situation is the GM's words.
   */
  async opportunity(campaignId: string, user: User | null, characterId: string, situation: string): Promise<DraftRun> {
    await this.service.requireGm(campaignId, user);
    const status = await this.ai.status(campaignId);
    if (!status.configured) throw new ModelError("key", "no key is set for this campaign");
    const record = await this.service.record(campaignId);
    const c = record.sheets().get(characterId);
    if (!c) throw new HttpError(404, `no character ${characterId}`);
    if (c.dead) throw new HttpError(422, `${c.name} is dead`);
    if (!flavorsFor(record.engine, c).open.length) throw new HttpError(422, `${c.name} has refused every flavor of offer six times; the System offers nothing more`);
    const [busy] = await this.db.query("select id from draft_runs where campaign_id = $1 and status = 'drafting'", [campaignId]);
    if (busy) throw new HttpError(409, "a draft is still running; wait for it to finish");

    const id = newId();
    const talk: TypedTalk = { speakers: [], lines: [], readings: [] };
    await this.db.query("insert into draft_runs (id, campaign_id, feature, created_by, status, talk) values ($1, $2, $3, $4, 'drafting', $5::jsonb)", [
      id,
      campaignId,
      DRAFT_OPPORTUNITY_FEATURE,
      user!.id,
      JSON.stringify(talk),
    ]);
    const work = this.draftOpportunity(campaignId, id, new CampaignRecord(record.engine, record.log), characterId, situation).finally(() => this.running.delete(id));
    this.running.set(id, work);
    return (await this.run(campaignId, id))!;
  }

  private async draftOpportunity(campaignId: string, runId: string, record: CampaignRecord, characterId: string, situation: string): Promise<void> {
    try {
      const out = await draftOpportunity(record.engine, (req) => this.ai.draft(campaignId, DRAFT_OPPORTUNITY_FEATURE, req), record, characterId, { situation });
      await this.db.tx(async (q) => {
        if ("accept" in out) {
          const suggestion: Suggested = { kind: "personal-opportunity", key: out.quest.title, characterId, stance: out.stance, notice: out.notice };
          await q.query(
            "insert into draft_items (run_id, item_id, campaign_id, kind, lines, action, reasons, why, suggestion) values ($1, 'opportunity-1', $2, 'suggestion', '[]'::jsonb, $3::jsonb, '[]'::jsonb, $4, $5::jsonb)",
            [runId, campaignId, JSON.stringify(out.accept), out.why, JSON.stringify(suggestion)],
          );
        }
        await q.query("update draft_runs set status = 'done', finished_at = now(), dropped = $2::jsonb where id = $1", [runId, JSON.stringify("accept" in out ? [] : [{ why: out.refused }])]);
      });
    } catch (err) {
      const p = problemOf(err);
      await this.db.query("update draft_runs set status = 'failed', finished_at = now(), problem = $2, message = $3 where id = $1", [runId, p.problem, p.message]);
    }
  }

  /**
   * Drafts three class offers for a character due them, in the background, as a run with one
   * suggestion: the offers as the `class.offer` the GM records from the Classes writer. What the
   * player keeps doing is the GM's words; the guarded list goes to the model only when asked.
   */
  async classOffers(campaignId: string, user: User | null, characterId: string, keepsDoing: string, guarded: boolean): Promise<DraftRun> {
    await this.service.requireGm(campaignId, user);
    await this.requireKey(campaignId);
    const record = await this.service.record(campaignId);
    const c = record.sheets().get(characterId);
    if (!c) throw new HttpError(404, `no character ${characterId}`);
    if (!dueOffers(record.engine, c)) throw new HttpError(422, `${c.name} is not due class offers`);
    const [busy] = await this.db.query("select id from draft_runs where campaign_id = $1 and status = 'drafting'", [campaignId]);
    if (busy) throw new HttpError(409, "a draft is still running; wait for it to finish");
    const id = newId();
    const talk: TypedTalk = { speakers: [], lines: [], readings: [] };
    await this.db.query("insert into draft_runs (id, campaign_id, feature, created_by, status, talk) values ($1, $2, $3, $4, 'drafting', $5::jsonb)", [
      id,
      campaignId,
      DRAFT_CLASSES_FEATURE,
      user!.id,
      JSON.stringify(talk),
    ]);
    const snapshot = new CampaignRecord(record.engine, record.log);
    const work = (async () => {
      try {
        const out = await draftClasses(record.engine, (req) => this.ai.draft(campaignId, DRAFT_CLASSES_FEATURE, req), snapshot, characterId, { keepsDoing, guarded });
        const suggestion: Suggested = {
          kind: "class-offers",
          key: out.offers.map((o) => o.offer.name).join(", "),
          characterId,
          offers: out.offers.map((o) => ({ role: o.role, weighs: o.weighs, problems: o.problems, warnings: o.warnings, everyFight: o.everyFight })),
          problems: out.problems,
        };
        const action: Action = { type: "class.offer", characterId, offers: out.offers.map((o) => o.offer) };
        await this.db.tx(async (q) => {
          await q.query(
            "insert into draft_items (run_id, item_id, campaign_id, kind, lines, action, reasons, why, suggestion) values ($1, 'classes-1', $2, 'suggestion', '[]'::jsonb, $3::jsonb, '[]'::jsonb, $4, $5::jsonb)",
            [id, campaignId, JSON.stringify(action), keepsDoing.trim() || null, JSON.stringify(suggestion)],
          );
          await q.query("update draft_runs set status = 'done', finished_at = now() where id = $1", [id]);
        });
      } catch (err) {
        const p = problemOf(err);
        await this.db.query("update draft_runs set status = 'failed', finished_at = now(), problem = $2, message = $3 where id = $1", [id, p.problem, p.message]);
      }
    })().finally(() => this.running.delete(id));
    this.running.set(id, work);
    return (await this.run(campaignId, id))!;
  }

  /**
   * A message in the System's voice for the composer, from what the GM wants said. Nothing is
   * stored: the draft fills the composer, where the GM edits and sends it as a typed message.
   */
  async message(campaignId: string, user: User | null, to: string[], gist: string): Promise<MessageDraft> {
    await this.service.requireGm(campaignId, user);
    await this.requireKey(campaignId);
    const record = await this.service.record(campaignId);
    const sheets = record.sheets();
    if (!to.length) throw new HttpError(422, "pick who receives it");
    const unknown = to.find((id) => !sheets.has(id));
    if (unknown) throw new HttpError(404, `no character ${unknown}`);
    if (!gist.trim()) throw new HttpError(422, "say what the System conveys");
    try {
      return await draftMessage(record.engine, (req) => this.ai.draft(campaignId, DRAFT_MESSAGE_FEATURE, req), record, to, gist);
    } catch (err) {
      throw problemOf(err);
    }
  }

  /** The vision answering a meditation, with the Insight it proposes. Nothing is stored: the draft fills the meditation form. */
  async vision(campaignId: string, user: User | null, characterId: string, memoryId: string, family: string, words: string): Promise<VisionDraft> {
    await this.service.requireGm(campaignId, user);
    await this.requireKey(campaignId);
    const record = await this.service.record(campaignId);
    const c = record.sheets().get(characterId);
    if (!c) throw new HttpError(404, `no character ${characterId}`);
    const card = c.principles.memories.find((m) => m.id === memoryId);
    if (!card) throw new HttpError(404, `${c.name} holds no such card`);
    if (card.meditation) throw new HttpError(409, "that card has been meditated on");
    if (!(record.engine.rules.principles.families as { name: string }[]).some((f) => f.name === family)) throw new HttpError(422, `no family ${family}`);
    try {
      return await draftVision(record.engine, (req) => this.ai.draft(campaignId, DRAFT_VISION_FEATURE, req), record, characterId, memoryId, family, words);
    } catch (err) {
      throw problemOf(err);
    }
  }

  /** The session's three-sentence summary, from what the record holds for it. Returned to the GM's form, never stored here. */
  async sessionSummary(campaignId: string, user: User | null, sessionId: string): Promise<{ summary: string }> {
    await this.service.requireGm(campaignId, user);
    await this.requireKey(campaignId);
    const record = await this.service.record(campaignId);
    if (!record.state.sessions.has(sessionId)) throw new HttpError(404, "no such session");
    try {
      return await draftSessionSummary((req) => this.ai.draft(campaignId, DRAFT_SESSION_SUMMARY_FEATURE, req), record, sessionId);
    } catch (err) {
      throw problemOf(err);
    }
  }

  /** A character's System summary for the composer: the record's lines, and a drafted observation. */
  async characterSummary(campaignId: string, user: User | null, characterId: string, integration: boolean): Promise<CharacterSummaryDraft> {
    await this.service.requireGm(campaignId, user);
    await this.requireKey(campaignId);
    const record = await this.service.record(campaignId);
    if (!record.sheets().has(characterId)) throw new HttpError(404, `no character ${characterId}`);
    try {
      return await draftCharacterSummary(record.engine, (req) => this.ai.draft(campaignId, DRAFT_CHARACTER_SUMMARY_FEATURE, req), record, characterId, { integration });
    } catch (err) {
      throw problemOf(err);
    }
  }

  private async requireKey(campaignId: string): Promise<void> {
    if (!(await this.ai.status(campaignId)).configured) throw new ModelError("key", "no key is set for this campaign");
  }

  /** Resolves when a run started in this process has finished drafting. */
  settled(runId: string): Promise<void> {
    return this.running.get(runId) ?? Promise.resolve();
  }

  private async draft(campaignId: string, runId: string, scene: Scene, prior: DraftMark[] = []): Promise<void> {
    const engine = scene.record.engine;
    const drafter =
      (feature: string): Drafter =>
      (req) =>
        this.ai.draft(campaignId, feature, req);
    const [events, actions, suggestions] = await Promise.allSettled([
      draftEvents(engine, drafter(DRAFT_EVENTS_FEATURE), scene),
      draftActions(engine, drafter(DRAFT_ACTIONS_FEATURE), scene),
      draftSuggestions(engine, drafter(DRAFT_SUGGESTIONS_FEATURE), scene),
    ]);
    const all = [
      { what: "the moments", out: events },
      { what: "the bookkeeping", out: actions },
      { what: "the suggestions", out: suggestions },
    ];
    const failures = all.filter((x) => x.out.status === "rejected") as { what: string; out: PromiseRejectedResult }[];
    if (failures.length === all.length) {
      const p = problemOf(failures[0]!.out.reason);
      await this.db.query("update draft_runs set status = 'failed', finished_at = now(), problem = $2, message = $3 where id = $1", [runId, p.problem, p.message]);
      return;
    }
    // One drafter failing leaves the others' drafts, with the failure said on the run.
    const problem = failures.length ? problemOf(failures[0]!.out.reason) : null;
    const rows: unknown[][] = [];
    if (events.status === "fulfilled")
      for (const d of events.value.drafts) rows.push([d.id, "event", d.lines, d.action, d.reasons, null, null]);
    if (actions.status === "fulfilled")
      for (const d of actions.value.drafts) rows.push([d.id, d.suggestion ? "cue" : "action", d.lines, d.action ?? null, [], d.why, d.suggestion ?? null]);
    const seen: { why: string }[] = [];
    if (suggestions.status === "fulfilled") {
      const before = await this.suggestedBefore(campaignId);
      const texts = new Map(scene.lines.map((l) => [l.id, l.text.trim()]));
      const nameOf = new Map([...scene.record.sheets().values()].map((c) => [c.id, c.name]));
      for (const d of suggestions.value.drafts) {
        const again = this.again(d, texts, before, nameOf);
        if (again) seen.push({ why: again });
        else rows.push([d.id, "suggestion", d.lines, d.accept, [], d.why, d.alternatives ? { ...d.suggestion, alternatives: d.alternatives } : d.suggestion]);
      }
    }
    // A window of heard lines drops what an earlier window already drafted.
    const kept = rows.filter((r) => {
      const [, kind, lines, action, , , suggestion] = r as [string, ItemKind, string[], Action | null, unknown, unknown, Suggested | null];
      if (kind === "cue" || !prior.length) return true;
      const again = repeats(prior, markOf(suggestion ? { lines, suggestion: suggestion as never } : { lines, action: action! }));
      if (again) seen.push({ why: "repeats a draft from an earlier window" });
      return !again;
    });
    rows.splice(0, rows.length, ...kept);
    const fulfilled = all.flatMap((x) => (x.out.status === "fulfilled" ? [x.out.value] : []));
    const repaired = fulfilled.flatMap((x) => x.repaired);
    const dropped = [...fulfilled.flatMap((x) => x.dropped), ...seen];
    await this.db.tx(async (q) => {
      for (const [id, kind, lines, action, reasons, why, suggestion] of rows) {
        await q.query(
          "insert into draft_items (run_id, item_id, campaign_id, kind, lines, action, reasons, why, suggestion) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9::jsonb)",
          [runId, id, campaignId, kind, JSON.stringify(lines), action === null ? null : JSON.stringify(action), JSON.stringify(reasons), why, suggestion === null ? null : JSON.stringify(suggestion)],
        );
      }
      await q.query(
        "update draft_runs set status = 'done', finished_at = now(), repaired = $2::jsonb, dropped = $3::jsonb, problem = $4, message = $5 where id = $1",
        [runId, JSON.stringify(repaired), JSON.stringify(dropped.map((d) => ({ why: d.why }))), problem?.problem ?? null, problem ? `drafting ${failures.map((f) => f.what).join(" and ")} failed: ${problem.message}` : null],
      );
    });
  }

  /** Every suggestion drafted for the campaign before, with the text of the lines it cited. */
  private async suggestedBefore(campaignId: string): Promise<{ s: Suggested; texts: Set<string>; status: ItemStatus }[]> {
    const rows = await this.db.query(
      "select i.suggestion, i.lines, i.status, r.talk from draft_items i join draft_runs r on r.id = i.run_id where i.campaign_id = $1 and i.kind = 'suggestion'",
      [campaignId],
    );
    return rows.map((r) => {
      const byId = new Map((r.talk as TypedTalk).lines.map((l) => [l.id, l.text.trim()]));
      return { s: r.suggestion, texts: new Set((r.lines as string[]).map((l) => byId.get(l)).filter((t): t is string => Boolean(t))), status: r.status };
    });
  }

  /**
   * Why a suggestion is not raised again, or null. A suggestion the GM has seen stays as the GM
   * left it (dismissed, accepted, or waiting): the same title for the same character, or the same
   * kind for the same character drawn from a line already cited, as when talk is drafted twice.
   */
  private again(d: SuggestionDraft, texts: Map<string, string>, before: Awaited<ReturnType<Drafts["suggestedBefore"]>>, nameOf: Map<string, string>): string | null {
    const s = d.suggestion;
    const cited = d.lines.map((l) => texts.get(l)).filter(Boolean);
    const earlier = before.find(
      (b) =>
        b.s.kind === s.kind &&
        b.s.characterId === s.characterId &&
        ((s.kind !== "battle-memory" && b.s.key.trim().toLowerCase() === s.key.trim().toLowerCase()) || cited.some((t) => b.texts.has(t!))),
    );
    if (!earlier) return null;
    const how = earlier.status === "dismissed" ? "dismissed" : earlier.status === "accepted" ? "accepted" : "waiting";
    const who = nameOf.get(s.characterId ?? "") ?? s.characterId;
    return `${s.kind === "battle-memory" ? "a Battle Memory Card" : s.key} for ${who} was suggested before (${how})`;
  }

  /** The newest runs with their drafts, and any older run with a draft still open (live windows add runs quickly). */
  async list(campaignId: string, user: User | null): Promise<DraftRun[]> {
    await this.service.requireGm(campaignId, user);
    const runs = await this.db.query(
      `select * from draft_runs r where r.campaign_id = $1 and (
         r.id in (select id from draft_runs where campaign_id = $1 order by created_at desc, id desc limit $2)
         or exists (select 1 from draft_items i where i.run_id = r.id and i.status = 'open'))
       order by r.created_at desc, r.id desc`,
      [campaignId, RUNS_LISTED],
    );
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
    // A shadow window's drafts stay out of review until the GM releases them.
    const hidden = Boolean(r.shadow && !r.released_at);
    if (hidden) items = [];
    const at = new Map((r.talk as TypedTalk).lines.map((l, i) => [l.id, i]));
    const first = (x: DraftItem) => Math.min(...x.lines.map((l) => at.get(l) ?? Infinity));
    const rank = { event: 0, action: 1, cue: 2, suggestion: 3 };
    return {
      id: r.id,
      feature: r.feature,
      createdAt: iso(r.created_at),
      ...(r.finished_at ? { finishedAt: iso(r.finished_at) } : {}),
      status: r.status,
      ...(r.problem ? { problem: r.problem, message: r.message } : {}),
      talk: r.talk,
      ...(r.shadow ? { shadow: hidden ? ("hidden" as const) : ("released" as const) } : {}),
      repaired: r.repaired,
      dropped: r.dropped,
      // In the order the table reached them; on one line, the moment first.
      items: items.map((i) => this.itemOf(i, record, iso(r.created_at))).sort((a, b) => first(a) - first(b) || rank[a.kind] - rank[b.kind]),
    };
  }

  private itemOf(i: Record<string, any>, record: CampaignRecord, since: string): DraftItem {
    const state = record.state;
    const standing = (id: string) => record.log.some((e) => e.id === id) && !state.voided.has(id) && !state.rejected.some((x) => x.envelope.id === id);
    const prepId: string | undefined = i.kind === "cue" ? i.suggestion?.key : undefined;
    const fired =
      i.kind === "cue" && record.log.some((e) => e.cause === `prep:${prepId}` && e.at >= since && standing(e.id));
    return {
      runId: i.run_id,
      itemId: i.item_id,
      kind: i.kind,
      lines: i.lines,
      ...(i.action ? { action: i.action } : {}),
      ...(prepId ? { prepId } : {}),
      ...(i.kind === "suggestion" ? { suggestion: i.suggestion } : {}),
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
      "select i.*, r.created_at as run_created_at, r.shadow as run_shadow, r.released_at as run_released_at from draft_items i join draft_runs r on r.id = i.run_id where i.campaign_id = $1 and i.run_id = $2 and i.item_id = $3",
      [campaignId, runId, itemId],
    );
    if (!i) throw new HttpError(404, "no such draft");
    if (i.run_shadow && !i.run_released_at) throw new HttpError(409, "this draft is in shadow until you release the session's drafts");
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
      const revealed = s.action.type === "quest.reveal" ? (await this.service.record(campaignId)).state.quests.get(s.action.questId) : undefined;
      const forWhom = "characterId" in s.action ? [s.action.characterId] : s.action.type === "quest.issue" ? s.action.to : revealed ? revealed.holders.slice(0, 1) : [];
      if (before.kind === "suggestion" && (forWhom.length !== 1 || forWhom[0] !== before.suggestion?.characterId))
        throw new HttpError(422, "a suggestion is accepted for the character it names");
      if (before.status === "dismissed") throw new HttpError(409, "this draft was dismissed; restore it first");
      if (before.status === "accepted" && !before.undone && before.actionId !== s.id) throw new HttpError(409, "this draft was already accepted");
      const action = await this.resolved(campaignId, runId, s.action);
      const appended = await this.service.submit(campaignId, user, { id: s.id, source: "suggestion", cause: `draft:${runId}/${itemId}`, action });
      await this.db.query(
        "update draft_items set status = 'accepted', action_id = $4, resolved_by = $5, resolved_at = now() where campaign_id = $1 and run_id = $2 and item_id = $3",
        [campaignId, runId, itemId, s.id, user!.id],
      );
      return { appended, item: await this.item(campaignId, runId, itemId) };
    } finally {
      this.accepting.delete(key);
    }
  }

  /**
   * An answer drafted to an invitation drafted in the same run names the invitation's draft id;
   * once the GM has accepted that invitation, the answer names the invitation as recorded.
   */
  private async resolved(campaignId: string, runId: string, action: Action): Promise<Action> {
    if (action.type !== "party.answer") return action;
    const record = await this.service.record(campaignId);
    if (record.state.invites.some((i) => i.id === action.inviteId)) return action;
    const [invite] = await this.db.query("select status, action_id from draft_items where campaign_id = $1 and run_id = $2 and item_id = $3", [
      campaignId,
      runId,
      action.inviteId,
    ]);
    if (!invite) return action;
    if (invite.status !== "accepted" || !invite.action_id) throw new HttpError(409, "accept the invitation it answers first");
    return { ...action, inviteId: invite.action_id };
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
