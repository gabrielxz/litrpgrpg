/**
 * Drafting while the table talks (app/DESIGN.md, M3, "Event and HVE drafting"). Each line the
 * listening hears counts toward a window; a window closes once WINDOW_LINES new lines have arrived
 * and nobody has spoken for WINDOW_QUIET_MS, or at WINDOW_MAX_LINES regardless, and whatever is
 * left closes when the GM pauses or stops the listening. A closed window drafts through
 * `Drafts.startHeard` into the same drafts typed talk makes, which wait for the GM. The GM can
 * turn it off (it spends the campaign's key), put it in shadow (drafted and kept from review, to
 * measure against the GM's own logging), and draft the lines so far at any time.
 *
 * The mode is the campaign's, stored; the counts live in memory, like the listening, and after a
 * restart the lines not yet drafted are found from the runs, so none is skipped.
 */
import { WINDOW_LINES, WINDOW_MAX_LINES, WINDOW_QUIET_MS } from "@gradebreaker/listening";
import type { DraftRun, Drafts, HeardSkip, LiveMode } from "./drafts.ts";
import type { Service, User } from "./service.ts";

interface Table {
  /** Read from the campaign on first use. */
  mode?: LiveMode;
  /** Lines heard since the last window started. */
  pending: number;
  timer?: ReturnType<typeof setTimeout>;
  /** A window is starting or drafting. */
  busy: boolean;
}

export class LiveDrafting {
  private readonly tables = new Map<string, Table>();
  private readonly service: Service;
  private readonly drafts: Drafts;
  /** Tells the campaign's GM tabs their drafts changed. */
  private readonly changed: (campaignId: string) => void;
  private readonly quietMs: number;
  private readonly log: (msg: string) => void;

  constructor(service: Service, drafts: Drafts, changed: (campaignId: string) => void, opts: { quietMs?: number; log?: (msg: string) => void } = {}) {
    this.service = service;
    this.drafts = drafts;
    this.changed = changed;
    this.quietMs = opts.quietMs ?? WINDOW_QUIET_MS;
    this.log = opts.log ?? (() => {});
  }

  private table(campaignId: string): Table {
    let t = this.tables.get(campaignId);
    if (!t) this.tables.set(campaignId, (t = { pending: 0, busy: false }));
    return t;
  }

  /** A line was heard: a window closes at the next pause once enough have arrived, or now at the most. */
  heard(campaignId: string): void {
    const t = this.table(campaignId);
    t.pending++;
    void this.mode(campaignId)
      .then(() => this.schedule(campaignId))
      .catch((e) => this.log(`live drafting: ${e}`));
  }

  /** The listening paused or stopped: the lines so far are drafted. */
  quiet(campaignId: string): void {
    const t = this.table(campaignId);
    if (t.mode !== "off" && t.pending) void this.close(campaignId, 1);
  }

  async mode(campaignId: string): Promise<LiveMode> {
    const t = this.table(campaignId);
    t.mode ??= await this.drafts.liveMode(campaignId);
    return t.mode;
  }

  /** The GM drafts the lines not yet drafted, now (in shadow when the campaign drafts in shadow). */
  async now(campaignId: string, user: User | null): Promise<{ run?: DraftRun; skip?: HeardSkip }> {
    await this.service.requireGm(campaignId, user);
    await this.mode(campaignId);
    return this.start(campaignId, 1);
  }

  async setMode(campaignId: string, user: User | null, mode: LiveMode): Promise<void> {
    await this.drafts.setLiveMode(campaignId, user, mode);
    const t = this.table(campaignId);
    t.mode = mode;
    clearTimeout(t.timer);
    this.schedule(campaignId);
  }

  /** Closes a window now at the most lines, or at the next pause once there are enough. */
  private schedule(campaignId: string) {
    const t = this.table(campaignId);
    if (!t.mode || t.mode === "off" || t.busy) return;
    clearTimeout(t.timer);
    if (t.pending >= WINDOW_MAX_LINES) void this.close(campaignId, 1);
    else if (t.pending >= WINDOW_LINES) t.timer = setTimeout(() => void this.close(campaignId, WINDOW_LINES), this.quietMs);
  }

  private async close(campaignId: string, min: number): Promise<void> {
    const out = await this.start(campaignId, min).catch((e): { skip?: HeardSkip } => {
      this.log(`live drafting: ${e}`);
      return {};
    });
    // Another run was drafting (typed talk, an offer): try again at the next pause's length.
    if (out.skip === "busy") {
      const t = this.table(campaignId);
      clearTimeout(t.timer);
      t.timer = setTimeout(() => void this.close(campaignId, min), this.quietMs);
    }
  }

  /** Starts a window of at least `min` lines unless one is starting or drafting; the drafting goes on in the background. */
  private async start(campaignId: string, min: number): Promise<{ run?: DraftRun; skip?: HeardSkip }> {
    const t = this.table(campaignId);
    if (t.busy) return { skip: "busy" };
    t.busy = true;
    clearTimeout(t.timer);
    const counted = t.pending;
    let out: Awaited<ReturnType<Drafts["startHeard"]>>;
    try {
      out = await this.drafts.startHeard(campaignId, min, t.mode === "shadow");
    } catch (e) {
      t.busy = false;
      throw e;
    }
    if (!("run" in out)) {
      t.busy = false;
      return out;
    }
    t.pending = Math.max(0, t.pending - counted);
    this.changed(campaignId);
    const run = out.run;
    void this.drafts
      .settled(run.id)
      .finally(() => {
        t.busy = false;
        this.changed(campaignId);
        // Lines that arrived while the window drafted close the next one on the same terms.
        this.schedule(campaignId);
      })
      .catch((e) => this.log(`live drafting: ${e}`));
    return { run };
  }
}
