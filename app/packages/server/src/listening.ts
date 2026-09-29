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
import { type ListeningMode, type ListeningStatus, type StreamState, type StreamStatus, runningSession } from "@gradebreaker/record";
import type { Service } from "./service.ts";
import type { Member, Role } from "./views.ts";

export type { ListeningMode, ListeningStatus, StreamState, StreamStatus };

export const SAMPLE_RATE = 16_000;
/** The largest frame taken: one second of audio. Tabs send 100 ms. */
export const MAX_FRAME_BYTES = SAMPLE_RATE * 2;
/** A stream with no frame for this long reads as silent: the tab is open and nothing arrives. */
const SILENT_AFTER_MS = 2000;

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
  onError(error: Error): void;
}

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
}

interface Stream {
  tab: Tab;
  muted: boolean;
  /** The tab could not open a microphone (permission refused, no device). */
  noMicrophone: boolean;
  lastFrameAt: number;
  level: number;
  sink?: TranscriberStream;
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
}

export class Listening {
  private readonly service: Service;
  private readonly transcriber: Transcriber;
  private readonly tables = new Map<string, Table>();
  /** Tabs that asked for listening status, by campaign. */
  private readonly tabs = new Map<string, Set<Tab>>();
  private readonly now: () => number;

  constructor(service: Service, opts: { transcriber?: Transcriber; now?: () => number } = {}) {
    this.service = service;
    this.transcriber = opts.transcriber ?? meterOnly;
    this.now = opts.now ?? Date.now;
    service.on((e) => void this.recheck(e.campaignId).catch(() => {}));
  }

  private table(campaignId: string): Table {
    let t = this.tables.get(campaignId);
    if (!t) this.tables.set(campaignId, (t = { mode: "off", streams: new Map(), running: false, present: new Set(), consented: new Set(), members: [] }));
    return t;
  }

  /** Rereads who is present and who has consented. */
  private async refresh(campaignId: string): Promise<Table> {
    const t = this.table(campaignId);
    const [rec, members, consented] = await Promise.all([
      this.service.record(campaignId),
      this.service.members(campaignId),
      this.service.listeningConsents(campaignId),
    ]);
    const session = runningSession(rec.state);
    t.running = Boolean(session);
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
      if (mode === "paused") for (const id of [...t.streams.keys()]) this.closeSink(t, id);
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
    await this.refresh(tab.campaignId);
    this.broadcast(tab.campaignId);
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
      t.streams.set(tab.userId, { tab, muted: msg.muted, noMicrophone: msg.noMicrophone, lastFrameAt: 0, level: 0 });
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
    s.lastFrameAt = this.now();
    s.level = Math.max(level(pcm), s.level * 0.5);
    s.sink ??= this.transcriber.open({
      campaignId: tab.campaignId,
      userId: tab.userId,
      terms: [],
      onSegment: () => {},
      onError: () => {},
    });
    s.sink.write(pcm);
    return true;
  }

  private closeSink(t: Table, userId: string) {
    const s = t.streams.get(userId);
    void s?.sink?.close();
    if (s) {
      delete s.sink;
      s.level = 0;
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
              : t.mode === "listening" && this.now() - s.lastFrameAt > SILENT_AFTER_MS
                ? "silent"
                : "live";
        return { userId: m.userId, displayName: m.displayName, role: m.role, consented: t.consented.has(m.userId), state, level: s && state === "live" ? round(s.level) : 0 };
      });
    return { t, streams, missing: this.missing(t) };
  }

  private statusFor(tab: Tab, s: ReturnType<Listening["status"]>): ListeningStatus {
    const out: ListeningStatus = {
      mode: s.t.mode,
      consented: s.t.consented.has(tab.userId),
      capturing: s.t.streams.get(tab.userId)?.tab === tab,
      present: s.t.present.has(tab.userId),
    };
    if (tab.role === "gm") {
      // Why it stopped can name who withdrew; a player's tab only learns that it stopped.
      if (s.t.stopped && s.t.mode === "off") out.stopped = s.t.stopped;
      out.streams = s.streams;
      out.missing = s.missing;
    }
    return out;
  }
}

export class ListeningRefused extends Error {}

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
