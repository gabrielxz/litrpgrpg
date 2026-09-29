/**
 * Speech-to-text vendors against the rendered scripts (app/DESIGN.md, "Testing the listening").
 * Each speaker's track streams to each vendor through its adapter, in 100 ms frames at real-time
 * pace, all speakers at once as at a table. Each speaker's final text is scored against what they
 * said: word error rate, and how many of the game's terms came through intact. Latency is the time
 * from a segment's last word ending in the audio to the segment arriving.
 *
 *   pnpm --filter @gradebreaker/server stt-eval [--vendor soniox,assemblyai] [--script terms|--all] [--speed 1] [--serial]
 *
 * Tracks come from `pnpm --filter @gradebreaker/listening render-audio`. Keys come from app/.env;
 * a vendor without a key is skipped. The full runs go to build/listening/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { scoreTranscript, vocabulary } from "@gradebreaker/listening/stt";
import { parse } from "yaml";
import type { Segment } from "../src/listening.ts";
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

async function streamTrack(vendor: string, t: Timeline, speaker: Timeline["speakers"][number], terms: string[], speed: number) {
  const pcm = readWav(join(AUDIO, t.script, speaker.file));
  const frameBytes = (t.rate * 2 * FRAME_MS) / 1000;
  const segments: (Segment & { arrivedMs: number })[] = [];
  const errors: string[] = [];
  const started = Date.now();
  const stream = transcribers[vendor]!.open({
    campaignId: "stt-eval",
    userId: speaker.id,
    terms,
    context: `${CONTEXT} This speaker is the ${speaker.role === "gm" ? "game master" : "player"} ${speaker.name}.`,
    onSegment: (s) => segments.push({ ...s, arrivedMs: Date.now() - started }),
    onError: (e) => errors.push(e.message),
  });
  for (let i = 0, n = 0; i < pcm.length; i += frameBytes, n++) {
    stream.write(pcm.subarray(i, i + frameBytes));
    const due = started + ((n + 1) * FRAME_MS) / speed;
    const wait = due - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  await stream.close();
  const reference = t.lines.filter((l) => l.speaker === speaker.id).map((l) => l.text).join(" ");
  const hypothesis = segments.map((s) => s.text).join(" ");
  const score = scoreTranscript(reference, hypothesis, terms);
  const latencies = segments.map((s) => s.arrivedMs * speed - s.endMs).filter((x) => x > -1000);
  return { speaker: speaker.id, reference, hypothesis, segments, errors, score, latencyMs: median(latencies) };
}

const engine = new Engine(loadRules());
const speed = Number(arg("--speed") ?? 1);
/** One speaker at a time, for a plan that allows fewer concurrent streams than the table has speakers. */
const serial = process.argv.includes("--serial");
const wanted = (arg("--vendor") ?? Object.keys(transcribers).join(",")).split(",");
const vendors = wanted.filter((v) => {
  if (!transcribers[v]) throw new Error(`no adapter ${v}; there are ${Object.keys(transcribers).join(", ")}`);
  return true;
});
const scripts = process.argv.includes("--all")
  ? readdirSync(AUDIO).filter((d) => existsSync(join(AUDIO, d, "timeline.json")))
  : [arg("--script") ?? "terms"];

const results: any[] = [];
for (const id of scripts) {
  const t = JSON.parse(readFileSync(join(AUDIO, id, "timeline.json"), "utf8")) as Timeline;
  const terms = vocabulary(engine, campaignNames(id));
  const runs = await Promise.all(
    vendors.map(async (vendor) => {
      if (!serial) return { vendor, speakers: await Promise.all(t.speakers.map((sp) => streamTrack(vendor, t, sp, terms, speed))) };
      const speakers = [];
      for (const sp of t.speakers) speakers.push(await streamTrack(vendor, t, sp, terms, speed));
      return { vendor, speakers };
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
    console.log(
      `${id.padEnd(24)} ${r.vendor.padEnd(22)} WER ${((edits / words) * 100).toFixed(1).padStart(5)}%  terms ${heard}/${said} (${((heard / said) * 100).toFixed(0)}%)  latency ${Number.isFinite(latency) ? `${latency} ms` : "n/a"}${errors.length ? `  errors: ${errors.slice(0, 2).join("; ")}` : ""}`,
    );
    if (missed.length) console.log(`${"".padEnd(24)} missed: ${missed.join(", ")}`);
    results.push({ script: id, ...r });
  }
}
mkdirSync(join(ROOT, "build/listening"), { recursive: true });
const out = join(ROOT, `build/listening/stt-eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify({ vendors, scripts, speed, results }, null, 1));
console.log(`the runs: ${out}`);
