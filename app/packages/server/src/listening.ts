/**
 * Listening: consent, the table's listening state, and each person's microphone stream (app/DESIGN.md,
 * "Voice capture" and "Listening consent").
 *
 * Consent belongs to a person in a campaign, given or withdrawn only by that person, and is stored
 * on the membership. The table listens only while every person present has consented: the GM and
 * the players of the characters at the running session. The GM starts listening, pauses it for
 * everyone, and stops it; ending the session, a withdrawal, or an arrival without consent stops it.
 * Nothing here starts on its own.
 *
 * A tab streams 16 kHz mono PCM16 as binary frames on the live socket. A frame is taken only while
 * the table listens, from a person present who has consented, through the one socket that person
 * captures with (the newest tab to ask). Frames go to the transcriber and are not kept here.
 */
import { vocabulary } from "@gradebreaker/listening/stt";
import { HEARD_KEEP_DAYS, type HeardLine, type ListeningMode, type ListeningStatus, type StreamState, type StreamStatus, runningSession } from "@gradebreaker/record";
import type { Recordings } from "./recordings.ts";
import type { Service } from "./service.ts";
import type { Member, Role } from "./views.ts";

export type { ListeningMode, ListeningStatus, StreamState, StreamStatus };

export const SAMPLE_RATE = 16_000;
/** The largest frame taken: one second of audio. Tabs send 100 ms. */
export const MAX_FRAME_BYTES = SAMPLE_RATE * 2;
/** A stream with no frame or level report for this long reads as silent: the tab is open and nothing arrives. */
const SILENT_AFTER_MS = 2000;
/**
 * The vendor stream closes after this long without a frame, and the next frame opens a new one.
 * Tabs send audio only while their person speaks, and vendors bill for the time a stream is open.
 */
export const IDLE_CLOSE_MS = 4000;
/**
 * After a vendor refuses or drops a person's stream, how long before a frame opens another. A
 * table of five retrying at this pace makes ten attempts a minute, well inside a vendor's limit
 * on new streams, which every table on the key shares.
 */
export const RETRY_AFTER_MS = 30_000;

/** A final stretch of one person's speech; times are milliseconds from the stream's first audio. */
export interface Segment {
  text: string;
  startMs: number;
  endMs: number;
  words?: { text: string; startMs: number; endMs: number }[];
}

export interface TranscriberOptions {
  campaignId: string;
  userId: string;
  /** The words a table says that a model has not heard, most important first (listening's `vocabulary`). */
  terms: string[];
  /** A sentence or two on what is being said, for a model that takes one. */
  context?: string;
  onSegment(segment: Segment): void;
  /** The vendor refused or dropped the stream; the server closes it and retries after RETRY_AFTER_MS. */
  onError(error: Error): void;
  /** The vendor accepted the stream (its first reply that is not an error), which clears a failure. */
  onOpen?(): void;
}

/** A vendor refused a stream because the key's limit on streams is full. */
export class StreamLimit extends Error {}

/** Where a person's audio goes: a speech-to-text adapter (stt/), or a meter until one is chosen. */
export interface Transcriber {
  readonly name: string;
  open(opts: TranscriberOptions): TranscriberStream;
}
export interface TranscriberStream {
  write(pcm: Buffer): void;
  /** Ends the stream; resolves once the vendor has sent its last segment. */
  close(): Promise<void>;
}

/** The transcriber before a vendor is chosen: audio is measured for the GM's panel and dropped. */
export const meterOnly: Transcriber = { name: "meter", open: () => ({ write: () => {}, close: async () => {} }) };

/** A socket that may capture: the live hub's subscriber, seen from here. */
export interface Tab {
  campaignId: string;
  userId: string;
  role: Role;
  /** Sends this tab its listening status. */
  sendListening(status: ListeningStatus): void;
  /** Sends the GM's tab what was heard. */
  sendHeard(lines: HeardLine[]): void;
  /** Tells the GM's tab its drafts changed. */
  sendDrafts(): void;
}

interface Stream {
  tab: Tab;
  muted: boolean;
  /** The tab could not open a microphone (permission refused, no device). */
  noMicrophone: boolean;
  lastFrameAt: number;
  /** The tab reports its microphone's level while it is open, speaking or not. */
  lastLevelAt: number;
  level: number;
  sink?: TranscriberStream;
  /** The open vendor stream's clock, which its segments are dated by, even when they arrive after it closes. */
  clock?: StreamClock;
  /** The vendor refused or dropped the last stream; no new one opens before `until`. */
  failure?: { limit: boolean; until: number };
}

/** Wall time of a vendor stream's first audio, and how much audio it has been sent. */
interface StreamClock {
  origin: number;
  writtenMs: number;
}

interface Table {
  mode: ListeningMode;
  stopped?: string;
  /** The capturing stream per person. */
  streams: Map<string, Stream>;
  /** Read from the record and the memberships at every change, so a frame costs no query. */
  running: boolean;
  present: Set<string>;
  consented: Set<string>;
  members: Member[];
  sessionId: string | null;
  /** The vocabulary a vendor stream opens with: the characters' names, then the game's words. */
  terms: string[];
  recordingConsented: Set<string>;
  /** A test recording running (recordings.ts), and the people it keeps. */
  recording?: { id: string; people: Set<string> };
}

export class Listening {
  private readonly service: Service;
  private readonly transcriber: Transcriber;
  private readonly tables = new Map<string, Table>();
  /** Tabs that asked for listening status, by campaign. */
  private readonly tabs = new Map<string, Set<Tab>>();
  private readonly now: () => number;
  private readonly log: (msg: string) => void;
  /** Drafting while the table talks (live-drafting.ts): each line heard, and the table falling quiet at a pause or a stop. */
  private readonly onHeard: (campaignId: string) => void;
  private readonly onQuiet: (campaignId: string) => void;
  private readonly recordings: Recordings | null;

  constructor(
    service: Service,
    opts: {
      transcriber?: Transcriber;
      now?: () => number;
      log?: (msg: string) => void;
      onHeard?: (campaignId: string) => void;
      onQuiet?: (campaignId: string) => void;
      recordings?: Recordings;
    } = {},
  ) {
    this.recordings = opts.recordings ?? null;
    this.service = service;
    this.transcriber = opts.transcriber ?? meterOnly;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? (() => {});
    this.onHeard = opts.onHeard ?? (() => {});
    this.onQuiet = opts.onQuiet ?? (() => {});
    service.on((e) => void this.recheck(e.campaignId).catch(() => {}));
  }

  private table(campaignId: string): Table {
    let t = this.tables.get(campaignId);
    if (!t) this.tables.set(campaignId, (t = { mode: "off", streams: new Map(), running: false, present: new Set(), consented: new Set(), members: [], sessionId: null, terms: [], recordingConsented: new Set() }));
    return t;
  }

  /** Rereads who is present and who has consented. */
  private async refresh(campaignId: string): Promise<Table> {
    const t = this.table(campaignId);
    const [rec, members, consented, recordingConsented] = await Promise.all([
      this.service.record(campaignId),
      this.service.members(campaignId),
      this.service.listeningConsents(campaignId),
      this.service.recordingConsents(campaignId),
    ]);
    t.recordingConsented = recordingConsented;
    const session = runningSession(rec.state);
    t.running = Boolean(session);
    t.sessionId = session?.id ?? null;
    t.terms = vocabulary(rec.engine, [...rec.state.characters.values()].map((c) => c.name));
    t.members = members;
    t.consented = consented;
    t.present = new Set();
    if (session) {
      for (const m of members) if (m.role === "gm") t.present.add(m.userId);
      for (const id of session.present.filter((c) => !session.left.includes(c))) {
        const playerId = rec.state.characters.get(id)?.playerId;
        if (playerId && members.some((m) => m.userId === playerId)) t.present.add(playerId);
      }
    }
    return t;
  }

  /** Present people who have not consented, by name. */
  private missing(t: Table): string[] {
    return [...t.present].filter((u) => !t.consented.has(u)).map((u) => t.members.find((m) => m.userId === u)?.displayName ?? u);
  }

  // ---------------------------------------------------------- consent ---

  async consent(campaignId: string, userId: string, give: boolean): Promise<void> {
    await this.service.setListeningConsent(campaignId, userId, give);
    const t = await this.refresh(campaignId);
    if (!give) {
      const name = t.members.find((m) => m.userId === userId)?.displayName ?? "Someone";
      if (t.streams.has(userId)) this.closeStream(t, userId);
      if (t.present.has(userId)) this.stop(t, `${name} withdrew consent`);
    }
    this.broadcast(campaignId);
  }

  /** Gives or withdraws one's own consent to test recordings; withdrawing deletes one's tracks. */
  async recordingConsent(campaignId: string, userId: string, give: boolean): Promise<void> {
    await this.service.setRecordingConsent(campaignId, userId, give);
    const t = await this.refresh(campaignId);
    if (!give) {
      t.recording?.people.delete(userId);
      this.recordings?.forget(campaignId, userId);
    }
    this.broadcast(campaignId);
  }

  /** The GM starts or stops a test recording, which keeps the audio of those present who consented to it. */
  async record(campaignId: string, on: boolean): Promise<void> {
    if (!this.recordings) throw new ListeningRefused("This server keeps no test recordings.");
    const t = await this.refresh(campaignId);
    if (on) {
      if (t.recording) return;
      if (t.mode === "off") throw new ListeningRefused("Start listening first: a test recording keeps what the listening takes.");
      const people = t.members.filter((m) => t.present.has(m.userId) && t.consented.has(m.userId) && t.recordingConsented.has(m.userId));
      if (!people.length) throw new ListeningRefused("Nobody at the table has consented to test recordings.");
      const meta = this.recordings.start(
        campaignId,
        t.sessionId,
        people.map((m) => ({ userId: m.userId, name: m.displayName, role: m.role })),
      );
      t.recording = { id: meta.id, people: new Set(people.map((m) => m.userId)) };
    } else await this.endRecording(campaignId, t);
    this.broadcast(campaignId);
  }

  private async endRecording(campaignId: string, t: Table): Promise<void> {
    const r = t.recording;
    if (!r || !this.recordings) return;
    delete t.recording;
    await this.recordings.stop(r.id, t.sessionId ? await this.service.heard(campaignId, t.sessionId) : []);
  }

  // ------------------------------------------------------ the GM's hand ---

  /** Starts, pauses, resumes, or stops listening. Starting needs a running session and everyone present consenting. */
  async set(campaignId: string, mode: ListeningMode): Promise<void> {
    const t = await this.refresh(campaignId);
    if (mode !== "off") {
      const missing = this.missing(t);
      if (!t.running) throw new ListeningRefused("Start a session first: the table listens only during one.");
      if (missing.length) throw new ListeningRefused(`Waiting on consent from ${list(missing)}.`);
      t.mode = mode;
      delete t.stopped;
      if (mode === "paused") {
        for (const id of [...t.streams.keys()]) this.closeSink(t, id);
        this.onQuiet(campaignId);
      }
    } else {
      this.stop(t, "the GM stopped listening");
    }
    this.broadcast(campaignId);
  }

  private stop(t: Table, why: string) {
    if (t.mode === "off") return;
    t.mode = "off";
    t.stopped = why;
    for (const id of [...t.streams.keys()]) this.closeSink(t, id);
    const campaignId = [...this.tables].find(([, x]) => x === t)?.[0];
    if (campaignId) {
      this.onQuiet(campaignId);
      void this.endRecording(campaignId, t).catch((e) => this.log(`recording: ${e}`));
    }
  }

  /** After anything recorded or any membership change: a session ended, someone arrived without consent. */
  private async recheck(campaignId: string) {
    if (!this.tables.has(campaignId)) return;
    const t = await this.refresh(campaignId);
    const missing = this.missing(t);
    if (!t.running) this.stop(t, "the session ended");
    else if (missing.length) this.stop(t, `${list(missing)} ${missing.length === 1 ? "is" : "are"} at the table without consent`);
    this.broadcast(campaignId);
  }

  // ------------------------------------------------------------- tabs ---

  /** A tab asks for listening status and may be asked to capture. */
  async join(tab: Tab): Promise<void> {
    let set = this.tabs.get(tab.campaignId);
    if (!set) this.tabs.set(tab.campaignId, (set = new Set()));
    set.add(tab);
    const t = await this.refresh(tab.campaignId);
    this.broadcast(tab.campaignId);
    if (tab.role === "gm" && t.sessionId) tab.sendHeard(await this.service.heard(tab.campaignId, t.sessionId));
  }

  async leave(tab: Tab): Promise<void> {
    this.tabs.get(tab.campaignId)?.delete(tab);
    const t = this.tables.get(tab.campaignId);
    if (t?.streams.get(tab.userId)?.tab === tab) this.closeStream(t, tab.userId);
    this.broadcast(tab.campaignId);
  }

  /**
   * The tab's capture state: capturing (the newest tab to say so takes the person's stream),
   * muted, or unable to open a microphone.
   */
  control(tab: Tab, msg: { capture: boolean; muted: boolean; noMicrophone: boolean }): void {
    const t = this.table(tab.campaignId);
    const current = t.streams.get(tab.userId);
    if (!msg.capture) {
      if (current?.tab === tab) this.closeStream(t, tab.userId);
    } else if (current?.tab === tab) {
      current.muted = msg.muted;
      current.noMicrophone = msg.noMicrophone;
      if (msg.muted) this.closeSink(t, tab.userId);
    } else {
      if (current) this.closeStream(t, tab.userId);
      t.streams.set(tab.userId, { tab, muted: msg.muted, noMicrophone: msg.noMicrophone, lastFrameAt: 0, lastLevelAt: 0, level: 0 });
    }
    this.broadcast(tab.campaignId);
  }

  /** One frame of audio from a tab. Returns whether it was taken. */
  frame(tab: Tab, pcm: Buffer): boolean {
    const t = this.tables.get(tab.campaignId);
    if (!t || t.mode !== "listening") return false;
    const s = t.streams.get(tab.userId);
    if (!s || s.tab !== tab || s.muted) return false;
    if (pcm.length === 0 || pcm.length > MAX_FRAME_BYTES || pcm.length % 2) return false;
    if (!t.present.has(tab.userId) || !t.consented.has(tab.userId)) return false;
    const now = this.now();
    s.lastFrameAt = now;
    s.level = Math.max(level(pcm), s.level * 0.5);
    if (!s.sink && s.failure && now < s.failure.until) return true;
    if (!s.sink || !s.clock) {
      const clock: StreamClock = { origin: now, writtenMs: 0 };
      const sessionId = t.sessionId;
      s.clock = clock;
      const sink: TranscriberStream = this.transcriber.open({
        campaignId: tab.campaignId,
        userId: tab.userId,
        terms: t.terms,
        context: CONTEXT,
        onOpen: () => {
          if (s.sink === sink) delete s.failure;
        },
        onSegment: (seg) => {
          if (s.sink === sink) delete s.failure;
          void this.heard(tab.campaignId, tab.userId, sessionId, clock.origin, seg).catch((e) => this.log(`listening: ${e}`));
        },
        onError: (e) => this.failed(t, tab.userId, s, sink, e),
      });
      s.sink = sink;
    }
    // A tab's held-back first frames arrive in a burst: the earliest arrival less the audio sent before it dates the stream.
    s.clock.origin = Math.min(s.clock.origin, now - s.clock.writtenMs);
    s.clock.writtenMs += (pcm.length / 2 / SAMPLE_RATE) * 1000;
    s.sink.write(pcm);
    if (t.recording?.people.has(tab.userId)) this.recordings?.write(t.recording.id, tab.userId, pcm);
    return true;
  }

  /** The tab's microphone level while it is open, so the GM sees a quiet microphone as live. */
  reportLevel(tab: Tab, value: number): void {
    const s = this.tables.get(tab.campaignId)?.streams.get(tab.userId);
    if (!s || s.tab !== tab || !Number.isFinite(value)) return;
    s.lastLevelAt = this.now();
    s.level = Math.max(0, Math.min(1, value));
  }

  /** Stores a segment as a heard line and sends it to the GM's tabs. */
  private async heard(campaignId: string, userId: string, sessionId: string | null, origin: number, seg: Segment) {
    const line = await this.service.addHeard(campaignId, {
      userId,
      sessionId,
      startedAt: new Date(origin + seg.startMs).toISOString(),
      endedAt: new Date(origin + seg.endMs).toISOString(),
      text: seg.text,
      ...(seg.words ? { words: seg.words.map((w) => ({ text: w.text, startMs: w.startMs - seg.startMs, endMs: w.endMs - seg.startMs })) } : {}),
    });
    for (const tab of this.tabs.get(campaignId) ?? []) if (tab.role === "gm") tab.sendHeard([line]);
    this.onHeard(campaignId);
  }

  /** Tells the campaign's GM tabs their drafts changed. */
  draftsChanged(campaignId: string): void {
    for (const tab of this.tabs.get(campaignId) ?? []) if (tab.role === "gm") tab.sendDrafts();
  }

  /** Deletes heard lines past their keeping; main runs it at start and daily. */
  purge(): Promise<number> {
    return this.service.purgeHeard(HEARD_KEEP_DAYS);
  }

  /** The vendor refused or dropped a stream: close it, and open no other until RETRY_AFTER_MS. */
  private failed(t: Table, userId: string, s: Stream, sink: TranscriberStream, e: Error) {
    this.log(`listening: ${e.message}`);
    if (s.sink !== sink || t.streams.get(userId) !== s) return;
    s.failure = { limit: e instanceof StreamLimit, until: this.now() + RETRY_AFTER_MS };
    this.closeSink(t, userId, true);
    this.broadcast(s.tab.campaignId);
  }

  /**
   * Closes the vendor stream. An idle close keeps the level the tab still reports and any failure;
   * a mute, a pause, or a stop clears both.
   */
  private closeSink(t: Table, userId: string, idle = false) {
    const s = t.streams.get(userId);
    void s?.sink?.close().catch((e) => this.log(`listening: ${e}`));
    if (s) {
      delete s.sink;
      delete s.clock;
      if (!idle) {
        s.level = 0;
        delete s.failure;
      }
    }
  }

  private closeStream(t: Table, userId: string) {
    this.closeSink(t, userId);
    t.streams.delete(userId);
  }

  // ----------------------------------------------------------- status ---

  /** Sends every tab in the campaign its status; the GM's carries each stream. */
  broadcast(campaignId: string): void {
    const tabs = this.tabs.get(campaignId);
    if (!tabs?.size) return;
    const status = this.status(campaignId);
    for (const tab of tabs) tab.sendListening(this.statusFor(tab, status));
  }

  /** Refreshes the GM's stream levels; the hub calls it on a short timer while any table listens. */
  tick(): void {
    for (const [campaignId, t] of this.tables) {
      if (t.mode === "off" && !t.streams.size) continue;
      for (const [userId, s] of t.streams) if (s.sink && this.now() - s.lastFrameAt > IDLE_CLOSE_MS) this.closeSink(t, userId, true);
      for (const s of t.streams.values()) if (this.now() - s.lastFrameAt > SILENT_AFTER_MS / 4) s.level *= 0.5;
      const tabs = [...(this.tabs.get(campaignId) ?? [])].filter((x) => x.role === "gm");
      if (!tabs.length) continue;
      const status = this.status(campaignId);
      for (const tab of tabs) tab.sendListening(this.statusFor(tab, status));
    }
  }

  get anyListening(): boolean {
    return [...this.tables.values()].some((t) => t.mode !== "off");
  }

  private status(campaignId: string) {
    const t = this.table(campaignId);
    const streams: StreamStatus[] = t.members
      .filter((m) => t.present.has(m.userId))
      .map((m) => {
        const s = t.streams.get(m.userId);
        const state: StreamState = !s
          ? "not-connected"
          : s.noMicrophone
            ? "no-microphone"
            : s.muted
              ? "muted"
              : t.mode === "listening" && this.now() - Math.max(s.lastFrameAt, s.lastLevelAt) > SILENT_AFTER_MS
                ? "silent"
                : s.failure
                  ? "not-transcribed"
                  : "live";
        const out: StreamStatus = { userId: m.userId, displayName: m.displayName, role: m.role, consented: t.consented.has(m.userId), state, level: s && state === "live" ? round(s.level) : 0 };
        if (t.recording?.people.has(m.userId)) out.recorded = true;
        if (state === "not-transcribed")
          out.failure = `${s!.failure!.limit ? "the speech service is at its limit on streams" : "the speech service refused or dropped the stream"}; trying again every ${RETRY_AFTER_MS / 1000} s`;
        return out;
      });
    return { t, streams, missing: this.missing(t) };
  }

  private statusFor(tab: Tab, s: ReturnType<Listening["status"]>): ListeningStatus {
    const out: ListeningStatus = {
      mode: s.t.mode,
      consented: s.t.consented.has(tab.userId),
      capturing: s.t.streams.get(tab.userId)?.tab === tab,
      present: s.t.present.has(tab.userId),
      recordingConsented: s.t.recordingConsented.has(tab.userId),
    };
    if (s.t.recording?.people.has(tab.userId)) out.recorded = true;
    if (tab.role === "gm") {
      // Why it stopped can name who withdrew; a player's tab only learns that it stopped.
      if (s.t.stopped && s.t.mode === "off") out.stopped = s.t.stopped;
      out.streams = s.streams;
      out.missing = s.missing;
      out.recording = {
        on: Boolean(s.t.recording),
        unconsented: [...s.t.present].filter((u) => !s.t.recordingConsented.has(u)).map((u) => s.t.members.find((m) => m.userId === u)?.displayName ?? u),
      };
    }
    return out;
  }
}

export class ListeningRefused extends Error {}

const CONTEXT = "A tabletop roleplaying game played online: a game master and players talking at the table, in and out of character, about a LitRPG world with a System, levels, Grades, and invented creatures and items.";

/** Root-mean-square loudness of PCM16, scaled so ordinary speech reads around 0.3 to 0.8. */
export function level(pcm: Buffer): number {
  let sum = 0;
  const n = pcm.length / 2;
  for (let i = 0; i < n; i++) {
    const v = pcm.readInt16LE(i * 2) / 32768;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / n) * 4);
}

const round = (x: number) => Math.round(x * 100) / 100;
const list = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
