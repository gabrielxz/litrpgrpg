/**
 * Renders a scripted session as audio, one track per speaker (app/DESIGN.md, "Testing the listening":
 * synthetic audio per speaker). Each speaker gets a Kokoro voice of their own; lines play in order
 * with a short gap, or after a line's `pause` (seconds of silence after the line before it ends),
 * or at a line's `t` when the script times it, and a speaker's track is silent
 * while others talk, as a microphone with headphones would be. Tracks are 16 kHz mono PCM16 WAV,
 * with a timeline of every line, in build/listening/audio/<script>/.
 *
 *   pnpm --filter @gradebreaker/listening render-audio [--script long-session|silences] [--all]
 *
 * A script is looked for in `audio/` (scenes for transcription only), then `scripts/`. With no
 * script named it renders `audio/terms.yaml`. Rendered lines are cached by voice and text.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KokoroTTS } from "kokoro-js";
import { parse } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const OUT = resolve(PKG, "../../../build/listening/audio");
const CACHE = join(OUT, "cache");
const RATE = 16_000;
/** Silence between one line's end and the next line's start. */
const GAP_MS = 500;
/** Silence before the first line, so each stream opens on quiet as a real one does. */
const LEAD_MS = 1000;

/** The GM, then players in order; distinct voices, alternating so neighbors differ. */
const VOICES = { gm: "am_michael", players: ["af_heart", "am_fenrir", "af_bella", "am_puck", "af_nicole", "am_liam"] };

interface Line {
  id: string;
  speaker: string;
  text: string;
  t?: number;
  pause?: number;
}
interface Speaker {
  id: string;
  role: "gm" | "player";
  name: string;
}
export interface Timeline {
  script: string;
  rate: number;
  durationMs: number;
  speakers: { id: string; name: string; role: string; voice: string; file: string }[];
  lines: { id: string; speaker: string; text: string; startMs: number; endMs: number }[];
}

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};

function sources(): string[] {
  const dirs = ["audio", "scripts"].map((d) => join(PKG, d));
  if (process.argv.includes("--all")) return dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".yaml")).map((f) => join(d, f)));
  const id = arg("--script") ?? "terms";
  const found = dirs.map((d) => join(d, `${id}.yaml`)).find(existsSync);
  if (!found) throw new Error(`no script ${id} in audio/ or scripts/`);
  return [found];
}

/** Linear resampling from Kokoro's 24 kHz to 16 kHz, as PCM16. */
function toPcm16(samples: Float32Array, from: number): Int16Array {
  const n = Math.floor((samples.length * RATE) / from);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const pos = (i * from) / RATE;
    const k = Math.floor(pos);
    const a = samples[k] ?? 0;
    const b = samples[k + 1] ?? a;
    const v = Math.max(-1, Math.min(1, a + (b - a) * (pos - k)));
    out[i] = v < 0 ? v * 32768 : v * 32767;
  }
  return out;
}

function wav(pcm: Int16Array): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

let tts: KokoroTTS | null = null;
async function speak(text: string, voice: string): Promise<Int16Array> {
  const key = createHash("sha256").update(`${voice}\n${text}`).digest("hex").slice(0, 24);
  const file = join(CACHE, `${key}.pcm`);
  if (existsSync(file)) {
    const b = readFileSync(file);
    return new Int16Array(b.buffer, b.byteOffset, b.byteLength / 2);
  }
  tts ??= await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
  const out = await tts.generate(text, { voice: voice as never });
  const pcm = toPcm16(out.audio as Float32Array, out.sampling_rate);
  writeFileSync(file, Buffer.from(pcm.buffer));
  return pcm;
}

async function render(path: string) {
  const s = parse(readFileSync(path, "utf8")) as { id: string; speakers: Speaker[]; lines: Line[] };
  const players = s.speakers.filter((x) => x.role === "player");
  const voiceOf = (id: string) => (s.speakers.find((x) => x.id === id)?.role === "gm" ? VOICES.gm : VOICES.players[players.findIndex((p) => p.id === id) % VOICES.players.length]!);
  const lines: Timeline["lines"] = [];
  const clips: { speaker: string; at: number; pcm: Int16Array }[] = [];
  let cursor = LEAD_MS;
  for (const l of s.lines) {
    const pcm = await speak(l.text, voiceOf(l.speaker));
    const startMs = l.t !== undefined ? Math.max(LEAD_MS, l.t * 1000) : l.pause !== undefined ? cursor - GAP_MS + l.pause * 1000 : cursor;
    const endMs = startMs + Math.round((pcm.length / RATE) * 1000);
    lines.push({ id: l.id, speaker: l.speaker, text: l.text, startMs, endMs });
    clips.push({ speaker: l.speaker, at: startMs, pcm });
    cursor = Math.max(cursor, endMs + GAP_MS);
  }
  const durationMs = cursor + LEAD_MS;
  const dir = join(OUT, s.id);
  mkdirSync(dir, { recursive: true });
  const speakers: Timeline["speakers"] = [];
  for (const sp of s.speakers) {
    const track = new Int16Array(Math.ceil((durationMs / 1000) * RATE));
    for (const c of clips.filter((x) => x.speaker === sp.id)) {
      const at = Math.round((c.at / 1000) * RATE);
      for (let i = 0; i < c.pcm.length && at + i < track.length; i++) track[at + i] = Math.max(-32768, Math.min(32767, track[at + i]! + c.pcm[i]!));
    }
    const file = `${sp.id}.wav`;
    writeFileSync(join(dir, file), wav(track));
    speakers.push({ id: sp.id, name: sp.name, role: sp.role, voice: voiceOf(sp.id), file });
  }
  const timeline: Timeline = { script: s.id, rate: RATE, durationMs, speakers, lines };
  writeFileSync(join(dir, "timeline.json"), JSON.stringify(timeline, null, 1));
  console.log(`${s.id}: ${s.lines.length} lines, ${(durationMs / 60000).toFixed(1)} min, ${speakers.length} tracks → ${dir}`);
}

mkdirSync(CACHE, { recursive: true });
for (const p of sources()) await render(p);
