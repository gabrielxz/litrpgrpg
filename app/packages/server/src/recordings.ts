/**
 * Test recordings (app/DESIGN.md, M3, "Test recordings"): material for measuring the listener with
 * real voices. While the GM records a listening session for testing, each person who has
 * consented to test recordings (their own consent, apart from listening's) gets a track of what
 * their microphone sent, padded with silence so every track keeps the recording's clock. At the
 * end the heard lines become a timeline in the shape `render-audio` writes, so `stt-eval` runs on
 * a recording as on a rendered scene; its lines are the transcriber's, a first draft of the
 * reference for the GM to correct.
 *
 * The GM corrects the timeline in the app, line by line with each line's audio to hand: the
 * corrected text replaces the transcriber's in `timeline.json` (the heard text is kept in
 * `timeline.heard.json`), so `stt-eval` scores against what was said. A second opinion from a more
 * accurate transcriber, run on the tracks after the session, is aligned to the lines by time and
 * kept in `second.json`, so the GM can check only the lines where the two disagree.
 *
 * The audio stays on the server's own disk, never in the database: the GM downloads it and
 * deletes it, it is deleted RECORDING_KEEP_DAYS after the recording ends, and a new machine starts without
 * it. Withdrawing consent deletes that person's tracks.
 */
import { closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync, writeFileSync, type WriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { HeardLine } from "@gradebreaker/record";
import { words } from "@gradebreaker/listening/stt";
import { newId } from "./tokens.ts";

const RATE = 16_000;

/** Each person's track as it is saved and as the timeline names it: their name, made safe, and unique. */
export function trackNames(people: RecordedPerson[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const p of people) {
    const base = p.name.replace(/[^\w -]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "speaker";
    let name = `${base}.wav`;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}.wav`;
    used.add(name);
    out.set(p.userId, name);
  }
  return out;
}
/** How long a recording is kept after it ends; the consent text states it. */
export const RECORDING_KEEP_DAYS = 7;
/** A gap longer than this between one person's frames is filled with silence, so the tracks keep one clock. */
const GAP_MS = 200;

export interface RecordedPerson {
  userId: string;
  name: string;
  role: "gm" | "player";
}

/** A timeline line as the recording keeps it; `checked` once the GM has corrected or confirmed it. */
export interface TimelineLine {
  id: string;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  checked?: boolean;
}

/** The longest snippet of a track served at once. */
const SNIPPET_MAX_MS = 60_000;
/** How far from a line a second opinion's word may fall and still belong to it. */
const ALIGN_SLACK_MS = 1500;

/**
 * A second transcript's words, one speaker's, laid on that speaker's lines: each word goes to the
 * line it overlaps most, or the nearest within ALIGN_SLACK_MS; a word near no line is left out.
 */
export function alignWords(lines: readonly TimelineLine[], speaker: string, heard: readonly { text: string; startMs: number; endMs: number }[]): Map<string, string> {
  const mine = lines.filter((l) => l.speaker === speaker);
  const out = new Map<string, string[]>();
  for (const w of heard) {
    let best: TimelineLine | undefined;
    let score = -Infinity;
    for (const l of mine) {
      const overlap = Math.min(l.endMs, w.endMs) - Math.max(l.startMs, w.startMs);
      if (overlap > score) {
        score = overlap;
        best = l;
      }
    }
    if (best && score > -ALIGN_SLACK_MS) out.set(best.id, [...(out.get(best.id) ?? []), w.text]);
  }
  return new Map([...out].map(([id, ws]) => [id, ws.join(" ")]));
}

/** Whether two readings of a line differ in their words (case and punctuation aside). */
export const disagree = (a: string, b: string) => words(a).join(" ") !== words(b).join(" ");

export interface RecordingMeta {
  id: string;
  campaignId: string;
  sessionId: string | null;
  startedAt: string;
  endedAt?: string;
  people: RecordedPerson[];
}

interface Open {
  meta: RecordingMeta;
  started: number;
  tracks: Map<string, { out: WriteStream; samples: number }>;
}

export class Recordings {
  private readonly dir: string;
  private readonly now: () => number;
  private readonly open = new Map<string, Open>();

  constructor(opts: { dir?: string; now?: () => number } = {}) {
    this.dir = opts.dir ?? join(tmpdir(), "gradebreaker-recordings");
    this.now = opts.now ?? Date.now;
    mkdirSync(this.dir, { recursive: true });
  }

  private path(id: string, file = "") {
    if (!/^[\w-]+$/.test(id)) throw new Error("bad recording id");
    return join(this.dir, id, file);
  }

  start(campaignId: string, sessionId: string | null, people: RecordedPerson[]): RecordingMeta {
    const id = newId();
    const meta: RecordingMeta = { id, campaignId, sessionId, startedAt: new Date(this.now()).toISOString(), people };
    mkdirSync(this.path(id), { recursive: true });
    writeFileSync(this.path(id, "meta.json"), JSON.stringify(meta));
    this.open.set(id, { meta, started: this.now(), tracks: new Map() });
    return meta;
  }

  /** One frame of a recorded person's audio, which ends now. */
  write(id: string, userId: string, pcm: Buffer): void {
    const r = this.open.get(id);
    if (!r || !r.meta.people.some((p) => p.userId === userId)) return;
    let t = r.tracks.get(userId);
    if (!t) r.tracks.set(userId, (t = { out: createWriteStream(this.path(id, `${userId}.pcm`)), samples: 0 }));
    const frameSamples = pcm.length / 2;
    const due = Math.floor(((this.now() - r.started) * RATE) / 1000) - frameSamples;
    if (due - t.samples > (GAP_MS * RATE) / 1000) {
      t.out.write(Buffer.alloc((due - t.samples) * 2));
      t.samples = due;
    }
    t.out.write(pcm);
    t.samples += frameSamples;
  }

  /** Ends a recording: its tracks close and the heard lines of its span become its timeline. */
  async stop(id: string, heard: HeardLine[]): Promise<void> {
    const r = this.open.get(id);
    if (!r) return;
    this.open.delete(id);
    await Promise.all([...r.tracks.values()].map((t) => new Promise((done) => t.out.end(done))));
    const ended = this.now();
    r.meta.endedAt = new Date(ended).toISOString();
    writeFileSync(this.path(id, "meta.json"), JSON.stringify(r.meta));
    const who = new Set(r.meta.people.map((p) => p.userId));
    const saved = trackNames(r.meta.people);
    const lines = heard
      .filter((l) => who.has(l.userId) && Date.parse(l.startedAt) >= r.started && Date.parse(l.startedAt) <= ended)
      .map((l, i) => ({ id: `l${i + 1}`, speaker: l.userId, text: l.text, startMs: Date.parse(l.startedAt) - r.started, endMs: Date.parse(l.endedAt) - r.started }));
    const timeline = {
      script: `recording-${r.meta.startedAt.slice(0, 16).replace(/[:T]/g, "-")}`,
      rate: RATE,
      durationMs: ended - r.started,
      speakers: r.meta.people.map((p) => ({ id: p.userId, name: p.name, role: p.role, file: saved.get(p.userId)! })),
      lines,
    };
    writeFileSync(this.path(id, "timeline.json"), JSON.stringify(timeline, null, 1));
  }

  isOpen(id: string): boolean {
    return this.open.has(id);
  }

  /** A campaign's recordings, newest first, with each file and its size. */
  list(campaignId: string): (RecordingMeta & { files: { name: string; save: string; bytes: number }[] })[] {
    return readdirSync(this.dir)
      .filter((id) => existsSync(this.path(id, "meta.json")))
      .map((id) => JSON.parse(readFileSync(this.path(id, "meta.json"), "utf8")) as RecordingMeta)
      .filter((m) => m.campaignId === campaignId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((m) => {
        const saved = trackNames(m.people);
        return {
          ...m,
          files: [
            ...m.people
              .filter((p) => existsSync(this.path(m.id, `${p.userId}.pcm`)))
              .map((p) => ({ name: `${p.userId}.wav`, save: saved.get(p.userId)!, bytes: 44 + statSync(this.path(m.id, `${p.userId}.pcm`)).size })),
            ...["timeline.json", "timeline.heard.json", "second.json"]
              .filter((f) => existsSync(this.path(m.id, f)))
              .map((f) => ({ name: f, save: f, bytes: statSync(this.path(m.id, f)).size })),
          ],
        };
      });
  }

  /** A finished recording's file as a stream, with its type and length; a track streams as WAV. */
  file(campaignId: string, id: string, name: string): { type: string; bytes: number; body: ReadableStream } | null {
    const meta = this.list(campaignId).find((m) => m.id === id);
    if (!meta?.endedAt || !meta.files.some((f) => f.name === name)) return null;
    if (name.endsWith(".json")) {
      const p = this.path(id, name);
      return { type: "application/json", bytes: statSync(p).size, body: Readable.toWeb(createReadStream(p)) as ReadableStream };
    }
    const pcm = this.path(id, name.replace(/\.wav$/, ".pcm"));
    const size = statSync(pcm).size;
    const header = wavHeader(size);
    const body = Readable.toWeb(
      Readable.from(
        (async function* () {
          yield header;
          for await (const chunk of createReadStream(pcm)) yield chunk as Buffer;
        })(),
      ),
    ) as ReadableStream;
    return { type: "audio/wav", bytes: 44 + size, body };
  }

  /** A finished recording's timeline, or null. */
  timeline(campaignId: string, id: string): { speakers: { id: string; name: string; file: string }[]; lines: TimelineLine[] } | null {
    const meta = this.list(campaignId).find((m) => m.id === id);
    if (!meta?.endedAt || !existsSync(this.path(id, "timeline.json"))) return null;
    return JSON.parse(readFileSync(this.path(id, "timeline.json"), "utf8"));
  }

  /** The second opinion's text by line, once it has run. */
  second(campaignId: string, id: string): { model: string; lines: Record<string, string> } | null {
    if (!this.timeline(campaignId, id) || !existsSync(this.path(id, "second.json"))) return null;
    return JSON.parse(readFileSync(this.path(id, "second.json"), "utf8"));
  }

  /**
   * The GM's corrections: each named line takes the text given and is marked checked. The
   * transcriber's text is kept in `timeline.heard.json` the first time.
   */
  correct(campaignId: string, id: string, lines: { id: string; text: string }[]): number {
    const t = this.timeline(campaignId, id);
    if (!t) throw new Error("no such recording, or it is still recording");
    if (!existsSync(this.path(id, "timeline.heard.json"))) writeFileSync(this.path(id, "timeline.heard.json"), readFileSync(this.path(id, "timeline.json")));
    const byId = new Map(lines.map((l) => [l.id, l.text.trim()]));
    let n = 0;
    for (const l of t.lines) {
      const text = byId.get(l.id);
      if (text === undefined) continue;
      l.text = text;
      l.checked = true;
      n++;
    }
    writeFileSync(this.path(id, "timeline.json"), JSON.stringify(t, null, 1));
    return n;
  }

  /** A stretch of one person's track as a WAV of its own, to hear a line against its text. */
  snippet(campaignId: string, id: string, userId: string, startMs: number, endMs: number): Buffer | null {
    const t = this.timeline(campaignId, id);
    const pcm = this.path(id, `${userId}.pcm`);
    if (!t || !/^[\w-]+$/.test(userId) || !existsSync(pcm)) return null;
    const from = Math.max(0, Math.floor((startMs * RATE) / 1000)) * 2;
    const to = Math.min(statSync(pcm).size, Math.floor((Math.min(endMs, startMs + SNIPPET_MAX_MS) * RATE) / 1000) * 2);
    if (to <= from) return null;
    const out = Buffer.alloc(to - from);
    const fd = openSync(pcm, "r");
    try {
      readSync(fd, out, 0, out.length, from);
    } finally {
      closeSync(fd);
    }
    return Buffer.concat([wavHeader(out.length), out]);
  }

  private seconds = new Map<string, { state: "running" } | { state: "failed"; error: string }>();

  /** Where a second opinion stands: running, failed with why, done, or never asked for. */
  secondState(id: string): "running" | "done" | "none" | { failed: string } {
    const s = this.seconds.get(id);
    if (s?.state === "running") return "running";
    if (existsSync(this.path(id, "second.json"))) return "done";
    return s?.state === "failed" ? { failed: s.error } : "none";
  }

  /**
   * Runs the second opinion in the background: each track transcribed by `transcribe`, its words
   * laid on the speaker's lines, and the result written to `second.json`.
   */
  startSecond(campaignId: string, id: string, model: string, transcribe: (wav: { header: Buffer; pcmPath: string }) => Promise<{ text: string; startMs: number; endMs: number }[]>): void {
    const t = this.timeline(campaignId, id);
    if (!t) throw new Error("no such recording, or it is still recording");
    if (this.seconds.get(id)?.state === "running") return;
    this.seconds.set(id, { state: "running" });
    void (async () => {
      try {
        const lines: Record<string, string> = {};
        await Promise.all(
          t.speakers.map(async (sp) => {
            const pcmPath = this.path(id, `${sp.id}.pcm`);
            if (!existsSync(pcmPath)) return;
            const heard = await transcribe({ header: wavHeader(statSync(pcmPath).size), pcmPath });
            for (const [line, text] of alignWords(t.lines, sp.id, heard)) lines[line] = text;
          }),
        );
        writeFileSync(this.path(id, "second.json"), JSON.stringify({ model, lines }, null, 1));
        this.seconds.delete(id);
      } catch (e) {
        this.seconds.set(id, { state: "failed", error: (e as Error).message });
      }
    })();
  }

  delete(campaignId: string, id: string): boolean {
    const meta = this.list(campaignId).find((m) => m.id === id);
    if (!meta || this.open.has(id)) return false;
    rmSync(this.path(id), { recursive: true, force: true });
    return true;
  }

  /** Withdrawn consent: the person's tracks go from every recording of the campaign, and they are recorded no further. */
  forget(campaignId: string, userId: string): void {
    for (const r of this.open.values()) {
      if (r.meta.campaignId !== campaignId) continue;
      r.tracks.get(userId)?.out.destroy();
      r.tracks.delete(userId);
      r.meta.people = r.meta.people.filter((p) => p.userId !== userId);
    }
    for (const m of this.list(campaignId)) {
      rmSync(this.path(m.id, `${userId}.pcm`), { force: true });
      // What they said goes from the timeline with their voice.
      const theirs = new Set<string>();
      for (const f of ["timeline.json", "timeline.heard.json"]) {
        const tl = this.path(m.id, f);
        if (!existsSync(tl)) continue;
        const t = JSON.parse(readFileSync(tl, "utf8")) as { speakers: { id: string }[]; lines: { id: string; speaker: string }[] };
        for (const l of t.lines) if (l.speaker === userId) theirs.add(l.id);
        writeFileSync(tl, JSON.stringify({ ...t, speakers: t.speakers.filter((x) => x.id !== userId), lines: t.lines.filter((l) => l.speaker !== userId) }, null, 1));
      }
      const second = this.path(m.id, "second.json");
      if (existsSync(second)) {
        const s = JSON.parse(readFileSync(second, "utf8")) as { model: string; lines: Record<string, string> };
        writeFileSync(second, JSON.stringify({ ...s, lines: Object.fromEntries(Object.entries(s.lines).filter(([id]) => !theirs.has(id))) }, null, 1));
      }
      if (!this.open.has(m.id)) writeFileSync(this.path(m.id, "meta.json"), JSON.stringify({ ...m, files: undefined, people: m.people.filter((p) => p.userId !== userId) }));
    }
  }

  /** Deletes recordings that ended more than RECORDING_KEEP_DAYS ago; returns how many. */
  purge(): number {
    let n = 0;
    const cutoff = this.now() - RECORDING_KEEP_DAYS * 86_400_000;
    for (const id of readdirSync(this.dir)) {
      const p = this.path(id, "meta.json");
      if (!existsSync(p)) continue;
      const m = JSON.parse(readFileSync(p, "utf8")) as RecordingMeta;
      if (m.endedAt && Date.parse(m.endedAt) < cutoff) {
        rmSync(this.path(id), { recursive: true, force: true });
        n++;
      }
    }
    return n;
  }
}

function wavHeader(dataBytes: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
}
