/**
 * The capture path end to end in a real browser: headless Chrome gives a player's tab a WAV file
 * as its microphone, and the GM's live socket must see that person's stream arrive, go muted, and
 * stop at a pause. Runs against the development servers (`.claude/launch.json`: app-api on 8787,
 * app-web on 5173), in a campaign of its own.
 *
 *   node scripts/capture-check.ts [--chrome /usr/bin/google-chrome] [--headed]
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
const gm = (await call<{ token: string }>("POST", "/dev/sign-in", undefined, { name: `Capture GM ${stamp}` })).token;
const player = (await call<{ token: string }>("POST", "/dev/sign-in", undefined, { name: `Capture Player ${stamp}` })).token;
const campaignId = (await call("POST", "/campaigns", gm, { name: `Capture check ${stamp}` })).campaign.id as string;
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
const ws = new WebSocket(`ws://localhost:8787/api/campaigns/${campaignId}/live`);
await new Promise((r) => ws.on("open", r));
ws.on("message", (d) => {
  const m = JSON.parse(String(d));
  if (m.type === "state" && !statuses.length) ws.send(JSON.stringify({ type: "listen" }));
  if (m.type === "listening") statuses.push(m.status);
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
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${toneWav()}`, "--autoplay-policy=no-user-gesture-required"],
});
try {
  const page = await (await browser.newContext()).newPage();
  page.on("console", (m) => m.type() === "error" && console.log(`    page: ${m.text()}`));
  await page.addInitScript((token) => sessionStorage.setItem("gradebreaker.devToken", token), player);
  await page.goto(`${WEB}/c/${campaignId}`);
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
