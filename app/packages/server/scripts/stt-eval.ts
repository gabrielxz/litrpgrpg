/**
 * Speech-to-text vendors against the rendered scripts (app/DESIGN.md, "Testing the listening").
 * Each speaker's track streams to each vendor through its adapter, in 100 ms frames at real-time
 * pace, all speakers at once as at a table. Each speaker's final text is scored against what they
 * said: word error rate, and how many of the game's terms came through intact. Latency is the time
 * from a segment's last word ending in the audio to the segment arriving.
 *
 * Each line is scored too: whole (every word came through) and its first word, with the silence
 * its speaker kept before it. `--gate on` sends a track as a tab with the speech gate would
 * (@gradebreaker/record's SpeechGate, on each frame's level) into the server's stream handling: a
 * stream opens on a frame and closes after IDLE_CLOSE_MS without one. `--gate both` runs the track
 * gated and continuous side by side and lists every line the gate lost. `--gain` scales the tracks
 * (0.5 is 6 dB down), for a quiet microphone.
 *
 *   pnpm --filter @gradebreaker/server stt-eval [--vendor soniox,assemblyai] [--script terms|--all] [--speed 1] [--serial]
 *     [--gate off|on|both] [--gain 1,0.5] [--speaker gm,nora]
 *
 * Tracks come from `pnpm --filter @gradebreaker/listening render-audio`. Keys come from app/.env;
 * a vendor without a key is skipped. The full runs go to build/listening/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { matchedWords, scoreTranscript, vocabulary, words } from "@gradebreaker/listening/stt";
import { SpeechGate } from "@gradebreaker/record";
import { parse } from "yaml";
import { IDLE_CLOSE_MS, level, type Segment } from "../src/listening.ts";
import { transcribers } from "../src/stt/index.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const AUDIO = join(ROOT, "build/listening/audio");
const FRAME_MS = 100;

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};

interface Timeline {
  script: string;
  rate: number;
  durationMs: number;
  speakers: { id: string; name: string; role: string; file: string }[];
  lines: { id: string; speaker: string; text: string; startMs: number; endMs: number }[];
}

/** The names a campaign would supply: the script's characters, and the tutorial's people the scripts mention. */
function campaignNames(scriptId: string): string[] {
  const path = [join(ROOT, "app/packages/listening/scripts", `${scriptId}.yaml`), join(ROOT, "app/packages/listening/audio", `${scriptId}.yaml`)].find(existsSync);
  const s = path ? (parse(readFileSync(path, "utf8")) as { speakers?: { characters?: string[] }[] }) : {};
  const chars = (s.speakers ?? []).flatMap((x) => x.characters ?? []).map((c) => c[0]!.toUpperCase() + c.slice(1));
  return [...new Set([...chars, "Kara", "Joe", "Andre", "Nemi", "Tovan", "Kith", "Ray"])];
}

const CONTEXT = "A tabletop roleplaying game played online: a game master and players talking at the table, in and out of character, about a LitRPG world with a System, levels, Grades, and invented creatures and items.";

function readWav(path: string): Buffer {
  const b = readFileSync(path);
  return b.subarray(44);
}

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/** A reply this short after this much of its speaker's silence is what the gate puts at risk. */
const SHORT_WORDS = 4;
const LONG_SILENCE_MS = 10_000;
/** A heard word belongs to the line it falls in, with this much slack either side. */
const LINE_SLACK_MS = 500;

interface Heard {
  text: string;
  /** Track time, whatever stream carried it. */
  startMs: number;
}

interface LineScore {
  id: string;
  text: string;
  silenceMs: number;
  short: boolean;
  heard: string;
  matched: boolean[];
}

/** Each speaker line's words, heard or lost, from the words placed on the track's clock. */
function scoreLines(t: Timeline, speaker: string, heard: Heard[]): LineScore[] {
  const mine = t.lines.filter((l) => l.speaker === speaker);
  const placed = new Map<string, Heard[]>(mine.map((l) => [l.id, []]));
  for (const w of heard) {
    const inside = mine.find((l) => w.startMs >= l.startMs - LINE_SLACK_MS && w.startMs <= l.endMs + LINE_SLACK_MS);
    const near = inside ?? mine.reduce((a, l) => (Math.abs(w.startMs - l.startMs) < Math.abs(w.startMs - a.startMs) ? l : a), mine[0]!);
    placed.get(near.id)!.push(w);
  }
  let lastEnd = 0;
  return mine.map((l) => {
    const silenceMs = l.startMs - lastEnd;
    lastEnd = l.endMs;
    const ref = words(l.text);
    const text = placed.get(l.id)!.sort((a, b) => a.startMs - b.startMs).map((w) => w.text).join(" ");
    return { id: l.id, text: l.text, silenceMs, short: ref.length <= SHORT_WORDS && silenceMs >= LONG_SILENCE_MS, heard: text, matched: matchedWords(ref, words(text)) };
  });
}

async function streamTrack(vendor: string, t: Timeline, speaker: Timeline["speakers"][number], terms: string[], speed: number, gated: boolean, gain: number) {
  const pcm = Buffer.from(readWav(join(AUDIO, t.script, speaker.file)));
  if (gain !== 1) for (let i = 0; i + 1 < pcm.length; i += 2) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm.readInt16LE(i) * gain))), i);
  const frameBytes = (t.rate * 2 * FRAME_MS) / 1000;
  const segments: (Segment & { arrivedMs: number; stream: number })[] = [];
  const errors: string[] = [];
  const started = Date.now();
  // The server's side: a vendor stream per run of frames, each written frame's track time kept to date its words.
  type Stream = { sink: ReturnType<(typeof transcribers)[string]["open"]>; trackMs: number[]; lastFrameMs: number; openedMs: number; closedMs?: number; closeTookMs?: number };
  const streams: Stream[] = [];
  const closing: Promise<void>[] = [];
  // Written from inside `write`, which the compiler's narrowing does not follow.
  let open = null as Stream | null;
  const write = (frame: Buffer, trackMs: number) => {
    if (!open) {
      const n = streams.length;
      open = {
        sink: transcribers[vendor]!.open({
          campaignId: "stt-eval",
          userId: speaker.id,
          terms,
          context: `${CONTEXT} This speaker is the ${speaker.role === "gm" ? "game master" : "player"} ${speaker.name}.`,
          onSegment: (s) => segments.push({ ...s, arrivedMs: Date.now() - started, stream: n }),
          onError: (e) => errors.push(e.message),
        }),
        trackMs: [],
        lastFrameMs: trackMs,
        openedMs: trackMs,
      };
      streams.push(open);
    }
    open.sink.write(frame);
    open.trackMs.push(trackMs);
    open.lastFrameMs = trackMs;
  };
  const closeTimed = async (x: Stream) => {
    const at = Date.now();
    await x.sink.close();
    x.closeTookMs = Date.now() - at;
  };
  const gate = new SpeechGate<{ frame: Buffer; trackMs: number }>();
  for (let i = 0, n = 0; i < pcm.length; i += frameBytes, n++) {
    const frame = pcm.subarray(i, i + frameBytes);
    const trackMs = n * FRAME_MS;
    if (!gated) write(frame, trackMs);
    else for (const f of gate.push({ frame, trackMs }, level(frame), trackMs)) write(f.frame, f.trackMs);
    if (open && trackMs - open.lastFrameMs > IDLE_CLOSE_MS) {
      open.closedMs = trackMs;
      closing.push(closeTimed(open));
      open = null;
    }
    const due = started + ((n + 1) * FRAME_MS) / speed;
    const wait = due - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  if (open) {
    open.closedMs = t.durationMs;
    closing.push(closeTimed(open));
  }
  await Promise.all(closing);
  // A stream's clock counts only the audio written to it; map it back to the track.
  const toTrack = (stream: number, ms: number) => {
    const at = streams[stream]!.trackMs;
    const k = Math.min(at.length - 1, Math.max(0, Math.floor(ms / FRAME_MS)));
    return at[k]! + (ms - k * FRAME_MS);
  };
  const heard: Heard[] = segments.flatMap((s) => {
    if (s.words?.length) return s.words.map((w) => ({ text: w.text, startMs: toTrack(s.stream, w.startMs) }));
    const list = s.text.split(/\s+/).filter(Boolean);
    return list.map((text, k) => ({ text, startMs: toTrack(s.stream, s.startMs + ((s.endMs - s.startMs) * k) / list.length) }));
  });
  const reference = t.lines.filter((l) => l.speaker === speaker.id).map((l) => l.text).join(" ");
  const hypothesis = segments.map((s) => s.text).join(" ");
  const score = scoreTranscript(reference, hypothesis, terms);
  const latencies = segments.map((s) => s.arrivedMs * speed - toTrack(s.stream, s.endMs)).filter((x) => x > -1000);
  const sentMs = streams.reduce((a, x) => a + x.trackMs.length * FRAME_MS, 0);
  const openMs = streams.reduce((a, x) => a + (x.closedMs ?? t.durationMs) - x.openedMs, 0);
  const log = streams.map((x, n) => ({
    openedMs: x.openedMs,
    firstFrameMs: x.trackMs[0],
    lastFrameMs: x.lastFrameMs,
    closedMs: x.closedMs,
    closeTookMs: x.closeTookMs,
    segments: segments.filter((g) => g.stream === n).map((g) => g.text),
  }));
  return { speaker: speaker.id, reference, hypothesis, segments, errors, score, latencyMs: median(latencies), lines: scoreLines(t, speaker.id, heard), sentMs, openMs, streams: streams.length, log };
}

const engine = new Engine(loadRules());
const speed = Number(arg("--speed") ?? 1);
/** One speaker at a time, for a plan that allows fewer concurrent streams than the table has speakers. */
const serial = process.argv.includes("--serial");
const gateArg = arg("--gate") ?? "off";
const gates = gateArg === "both" ? [false, true] : [gateArg === "on"];
const gains = (arg("--gain") ?? "1").split(",").map(Number);
/** Only these speakers' tracks. */
const only = arg("--speaker")?.split(",");
const wanted = (arg("--vendor") ?? Object.keys(transcribers).join(",")).split(",");
const vendors = wanted.filter((v) => {
  if (!transcribers[v]) throw new Error(`no adapter ${v}; there are ${Object.keys(transcribers).join(", ")}`);
  return true;
});
const scripts = process.argv.includes("--all")
  ? readdirSync(AUDIO).filter((d) => existsSync(join(AUDIO, d, "timeline.json")))
  : [arg("--script") ?? "terms"];

const pct = (a: number, b: number) => `${a}/${b} (${b ? ((a / b) * 100).toFixed(0) : "-"}%)`;
const lineKey = (s: string, l: LineScore) => `${s} ${l.id}`;

const results: any[] = [];
for (const id of scripts) {
  const t = JSON.parse(readFileSync(join(AUDIO, id, "timeline.json"), "utf8")) as Timeline;
  const terms = vocabulary(engine, campaignNames(id));
  const combos = vendors.flatMap((vendor) => gains.flatMap((gain) => gates.map((gated) => ({ vendor, gain, gated }))));
  const runs = await Promise.all(
    combos.map(async (c) => {
      const run = (sp: Timeline["speakers"][number]) => streamTrack(c.vendor, t, sp, terms, speed, c.gated, c.gain);
      const who = t.speakers.filter((sp) => !only || only.includes(sp.id));
      if (!serial) return { ...c, speakers: await Promise.all(who.map(run)) };
      const speakers = [];
      for (const sp of who) speakers.push(await run(sp));
      return { ...c, speakers };
    }),
  );
  for (const r of runs) {
    const words = r.speakers.reduce((a, s) => a + s.score.words, 0);
    const edits = r.speakers.reduce((a, s) => a + s.score.wer * s.score.words, 0);
    const said = r.speakers.reduce((a, s) => a + s.score.termsSaid, 0);
    const heard = r.speakers.reduce((a, s) => a + s.score.termsHeard, 0);
    const missed = r.speakers.flatMap((s) => s.score.terms.filter((x) => x.heard < x.said).map((x) => `${x.term}${x.said > 1 ? ` ${x.heard}/${x.said}` : ""}`));
    const errors = r.speakers.flatMap((s) => s.errors);
    const latency = median(r.speakers.map((s) => s.latencyMs).filter(Number.isFinite));
    const label = `${r.vendor}${r.gated ? " gated" : ""}${r.gain !== 1 ? ` x${r.gain}` : ""}`;
    console.log(
      `${id.padEnd(24)} ${label.padEnd(22)} WER ${((edits / words) * 100).toFixed(1).padStart(5)}%  terms ${heard}/${said} (${((heard / said) * 100).toFixed(0)}%)  latency ${Number.isFinite(latency) ? `${latency} ms` : "n/a"}${errors.length ? `  errors: ${errors.slice(0, 2).join("; ")}` : ""}`,
    );
    if (missed.length) console.log(`${"".padEnd(24)} missed: ${missed.join(", ")}`);
    const lines = r.speakers.flatMap((s) => s.lines);
    const short = lines.filter((l) => l.short);
    const whole = (ls: LineScore[]) => ls.filter((l) => l.matched.every(Boolean)).length;
    const first = (ls: LineScore[]) => ls.filter((l) => l.matched[0]).length;
    const trackMs = t.durationMs * r.speakers.length;
    console.log(
      `${"".padEnd(24)} lines whole ${pct(whole(lines), lines.length)}, first words ${pct(first(lines), lines.length)}; short after silence whole ${pct(whole(short), short.length)}, first words ${pct(first(short), short.length)}`,
    );
    console.log(
      `${"".padEnd(24)} audio sent ${((r.speakers.reduce((a, s) => a + s.sentMs, 0) / trackMs) * 100).toFixed(0)}% of the tracks, streams open ${((r.speakers.reduce((a, s) => a + s.openMs, 0) / trackMs) * 100).toFixed(0)}%, ${r.speakers.reduce((a, s) => a + s.streams, 0)} streams`,
    );
    results.push({ script: id, ...r });
  }
  // What the gate lost: lines whole without it and not with it, at the same volume.
  if (gates.length === 2)
    for (const vendor of vendors)
      for (const gain of gains) {
        const of = (gated: boolean) => runs.find((r) => r.vendor === vendor && r.gain === gain && r.gated === gated)!.speakers.flatMap((s) => s.lines.map((l) => [lineKey(s.speaker, l), l] as const));
        const plain = new Map(of(false));
        const lost = of(true).filter(([k, l]) => {
          const p = plain.get(k)!;
          return p.matched.filter(Boolean).length > l.matched.filter(Boolean).length;
        });
        const gained = of(true).filter(([k, l]) => plain.get(k)!.matched.filter(Boolean).length < l.matched.filter(Boolean).length);
        console.log(`${id} ${vendor}${gain !== 1 ? ` x${gain}` : ""}: the gate lost words on ${lost.length} lines, kept more on ${gained.length}`);
        for (const [k, l] of lost)
          console.log(`  ${k} (${(l.silenceMs / 1000).toFixed(0)} s silent) "${l.text}": gated "${l.heard}", continuous "${plain.get(k)!.heard}"`);
      }
}
mkdirSync(join(ROOT, "build/listening"), { recursive: true });
const out = join(ROOT, `build/listening/stt-eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify({ vendors, scripts, speed, gates, gains, results }, null, 1));
console.log(`the runs: ${out}`);
