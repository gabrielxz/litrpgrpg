/**
 * The capture path end to end in a real browser: headless Chrome gives a player's tab a WAV file
 * as its microphone, and the GM's live socket must see that person's stream arrive, go muted, and
 * stop at a pause. Runs against the development servers (`.claude/launch.json`: app-api on 8787,
 * app-web on 5173), in a campaign of its own.
 *
 * With `--speech <wav>` the microphone plays that file instead (a rendered script's track), and the
 * check waits for the server's transcriber to send the GM what it heard; the dev server needs its
 * vendor key for that. With `--record` as well, the player consents to test recordings and the GM
 * records the session, and the check reads the recording back: the player's track, and the heard
 * lines in its timeline. `--gm-token` makes an existing development sign-in the GM, so a GM tab in
 * the browser pane can watch the check's campaign (its id is printed).
 *
 *   node scripts/capture-check.ts [--chrome /usr/bin/google-chrome] [--headed] [--speech <wav> --seconds 60 [--record]] [--gm-token <token>]
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { WebSocket } from "ws";

const API = "http://localhost:8787/api";
const WEB = "http://localhost:5173";
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};

async function call<T = any>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data?.error ?? ""}`);
  return data as T;
}

/** Five seconds of a 440 Hz tone at half scale, 48 kHz mono PCM16; Chrome loops it. */
function toneWav(): string {
  const rate = 48_000;
  const n = rate * 5;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 0.5 * 32767), 44 + i * 2);
  const path = join(tmpdir(), "gradebreaker-tone.wav");
  writeFileSync(path, buf);
  return path;
}

const stamp = Date.now().toString(36);
const gm = arg("--gm-token") ?? (await call<{ token: string }>("POST", "/dev/sign-in", undefined, { name: `Capture GM ${stamp}` })).token;
const player = (await call<{ token: string }>("POST", "/dev/sign-in", undefined, { name: `Capture Player ${stamp}` })).token;
const campaignId = (await call("POST", "/campaigns", gm, { name: `Capture check ${stamp}` })).campaign.id as string;
console.log(`    campaign ${campaignId}`);
const code = (await call("POST", `/campaigns/${campaignId}/invites`, gm, {})).code as string;
await call("POST", `/invites/${code}/accept`, player);
const playerId = (await call("GET", "/me", player)).user.id as string;
let n = 0;
const act = (action: unknown) => call("POST", `/campaigns/${campaignId}/actions`, gm, { id: `capture-${stamp}-${++n}`, action });
await act({ type: "character.pregen", characterId: "kara", pregen: "Kara", playerId });
await act({ type: "session.start", present: ["kara"] });
await call("POST", `/campaigns/${campaignId}/listening/consent`, gm, { give: true });
await call("POST", `/campaigns/${campaignId}/listening/consent`, player, { give: true });
await call("POST", `/campaigns/${campaignId}/listening`, gm, { mode: "listening" });

// The GM's socket, watching the player's stream.
const statuses: any[] = [];
const heard: { text: string; startedAt: string }[] = [];
const ws = new WebSocket(`ws://localhost:8787/api/campaigns/${campaignId}/live`);
await new Promise((r) => ws.on("open", r));
ws.on("message", (d) => {
  const m = JSON.parse(String(d));
  if (m.type === "state" && !statuses.length) ws.send(JSON.stringify({ type: "listen" }));
  if (m.type === "listening") statuses.push(m.status);
  if (m.type === "heard") heard.push(...m.lines);
});
ws.send(JSON.stringify({ type: "auth", token: gm }));
const stream = () => statuses.at(-1)?.streams?.find((s: { userId: string }) => s.userId === playerId);
async function until(what: string, ok: () => boolean, ms = 8000) {
  for (let t = 0; t < ms && !ok(); t += 100) await new Promise((r) => setTimeout(r, 100));
  if (!ok()) throw new Error(`${what}: last seen ${JSON.stringify(stream())}`);
  console.log(`ok  ${what}: ${JSON.stringify(stream())}`);
}

const browser = await chromium.launch({
  executablePath: arg("--chrome") ?? "/usr/bin/google-chrome",
  headless: !process.argv.includes("--headed"),
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${arg("--speech") ?? toneWav()}`, "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await (await browser.newContext()).newPage();
  page.on("console", (m) => m.type() === "error" && console.log(`    page: ${m.text()}`));
  await page.addInitScript((token) => sessionStorage.setItem("gradebreaker.devToken", token), player);
  await page.goto(`${WEB}/c/${campaignId}`);
  if (arg("--speech")) {
    const seconds = Number(arg("--seconds") ?? 60);
    // A stream the vendor refuses reads as not transcribed, and the check waits out its retries.
    await until("the player's microphone is live", () => stream()?.state === "live" || stream()?.state === "not-transcribed");
    const recording = process.argv.includes("--record");
    if (recording) {
      await call("POST", `/campaigns/${campaignId}/listening/recording-consent`, player, { give: true });
      await call("POST", `/campaigns/${campaignId}/listening/record`, gm, { on: true });
      await page.getByText("Recording for testing").waitFor({ timeout: 5000 });
      console.log("ok  the player's tab says it is recorded");
    }
    await new Promise((r) => setTimeout(r, seconds * 1000));
    if (!heard.length) throw new Error(`nothing heard in ${seconds} s`);
    for (const l of heard) console.log(`    heard ${l.startedAt.slice(11, 19)}: ${l.text}`);
    console.log(`speech check passed: ${heard.length} line(s)`);
    if (recording) {
      await call("POST", `/campaigns/${campaignId}/listening/record`, gm, { on: false });
      const [r] = (await call<{ recordings: { id: string; files: { name: string; bytes: number }[] }[] }>("GET", `/campaigns/${campaignId}/recordings`, gm)).recordings;
      const track = r?.files.find((f) => f.name.endsWith(".wav"));
      if (!r || !track) throw new Error("the recording kept no track");
      const res = await fetch(`${API}/campaigns/${campaignId}/recordings/${r.id}/timeline.json`, { headers: { authorization: `Bearer ${gm}` } });
      const timeline = (await res.json()) as { durationMs: number; lines: { text: string; startMs: number }[] };
      console.log(`    track ${track.bytes} bytes (${(((track.bytes - 44) / 32000) | 0)} s of ${(timeline.durationMs / 1000) | 0} s); timeline ${timeline.lines.length} line(s), first at ${(timeline.lines[0]?.startMs ?? 0) / 1000} s: ${timeline.lines[0]?.text ?? ""}`);
      if (!timeline.lines.length) throw new Error("the timeline has no lines");
      console.log("recording check passed");
    }
    process.exit(0);
  }
  await until("the player's stream arrives with sound", () => stream()?.state === "live" && stream()?.level > 0.3);
  console.log(`    player's bar: ${(await page.locator(".listening-bar").innerText()).replace(/\n/g, " | ")}`);

  await page.getByRole("button", { name: "Mute" }).click();
  await until("muting shows as muted", () => stream()?.state === "muted");
  await page.getByRole("button", { name: "Unmute" }).click();
  await until("unmuting brings it back", () => stream()?.state === "live" && stream()?.level > 0.3);

  await call("POST", `/campaigns/${campaignId}/listening`, gm, { mode: "paused" });
  await page.getByText("Your microphone is off until the GM resumes.").waitFor({ timeout: 5000 });
  await until("a pause stops the sound", () => statuses.at(-1)?.mode === "paused" && stream()?.level === 0);

  await call("POST", `/campaigns/${campaignId}/listening/consent`, player, { give: false });
  await until("a withdrawal stops listening", () => statuses.at(-1)?.mode === "off" && /withdrew consent/.test(statuses.at(-1)?.stopped ?? ""));
  console.log(`    player's bar: ${(await page.locator(".listening-bar").innerText()).replace(/\n/g, " | ")}`);
  console.log("capture check passed");
} finally {
  await browser.close();
  ws.close();
}
