/**
 * The user guide's screenshots (app/DESIGN.md, M4, "User guide"): seeds a campaign from the
 * rehearsal pack through the development API, then drives headless Chrome over its debugging
 * protocol to capture each screen into `public/guide-shots/`, in the light theme and the dark
 * (`<name>-dark.webp`). Needs the development servers
 * running (app-api on 8787 with DEV_SIGNIN, app-web on 5173) and Google Chrome.
 *
 *   node scripts/guide-shots.ts            every shot
 *   node scripts/guide-shots.ts gm-party   only the shots named
 *   node scripts/guide-shots.ts --seed-only   seed, and print the tokens and campaign ids
 *
 * Each run seeds fresh campaigns under fresh test people, so the shots never depend on what a
 * development database already holds.
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Engine } from "@gradebreaker/engine";
import { loadRules } from "@gradebreaker/engine/node";
import { type Action, type PackData, bookClasses, packItems, packSetup } from "@gradebreaker/record";
import { parse } from "yaml";

const API = process.env.GUIDE_API ?? "http://localhost:8787/api";
const WEB = process.env.GUIDE_WEB ?? "http://localhost:5173";
const CHROME = process.env.CHROME ?? "google-chrome";
const OUT = join(import.meta.dirname, "..", "public", "guide-shots");
const PACK = join(import.meta.dirname, "..", "..", "..", "packs", "rehearsal.yaml");
const WIDTH = 1440;
const args = process.argv.slice(2);
const seedOnly = args.includes("--seed-only");
const only = new Set(args.filter((a) => !a.startsWith("--")));
const run = Date.now().toString(36).slice(-4);

// ------------------------------------------------------------- seed ---

async function call<T>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

/** A test person; the suffix keeps each run's people and campaigns apart. */
const person = async (name: string) => (await call<{ token: string }>(null, "POST", "/dev/sign-in", { name: `${name} ${run}` })).token;

const record = (token: string, campaignId: string, action: Action, id: string = crypto.randomUUID()) =>
  call<{ envelope: unknown }>(token, "POST", `/campaigns/${campaignId}/actions`, { id, action });

interface Seeded {
  gm: string;
  players: Record<"kara" | "joe" | "andre", string>;
  newcomer: string;
  main: string;
  empty: string;
  invite: string;
}

async function seed(): Promise<Seeded> {
  const gm = await person("Dana");
  const players = { kara: await person("Priya"), joe: await person("Marcus"), andre: await person("Leo") };
  const newcomer = await person("Sam");
  const main = (await call<{ campaign: { id: string } }>(gm, "POST", "/campaigns", { name: "Past the depot fence" })).campaign.id;
  const empty = (await call<{ campaign: { id: string } }>(gm, "POST", "/campaigns", { name: "The long road" })).campaign.id;
  const invite = (await call<{ code: string }>(gm, "POST", `/campaigns/${main}/invites`, {})).code;
  for (const t of Object.values(players)) await call(t, "POST", `/invites/${invite}/accept`);

  const pack = parse(readFileSync(PACK, "utf8")) as PackData;
  await record(gm, main, { type: "prep.save", items: packItems(pack), pack: pack.pack });
  for (const s of packSetup(pack)) await record(gm, main, s.action, s.id);

  // Kara, Joe, and Andre go to their players; Nia stays with the GM.
  const view = await call<{ members: { userId: string; displayName: string }[] }>(gm, "GET", `/campaigns/${main}`);
  const idOf = (name: string) => view.members.find((m) => m.displayName === `${name} ${run}`)!.userId;
  const holders = { kara: "Priya", joe: "Marcus", andre: "Leo" } as const;
  for (const [c, name] of Object.entries(holders)) await record(gm, main, { type: "character.assign", characterId: c, playerId: idOf(name) });
  await record(gm, main, { type: "session.start", present: ["kara", "joe", "andre", "nia"], label: "The depot gate" });
  // The shots show the people without the run's suffix.
  for (const [t, name] of [[gm, "Dana"], [players.kara, "Priya"], [players.joe, "Marcus"], [players.andre, "Leo"], [newcomer, "Sam"]] as const)
    await call(t, "PATCH", "/me", { displayName: name });
  return { gm, players, newcomer, main, empty, invite };
}

// ----------------------------------------------------------- chrome ---

type Json = Record<string, unknown>;

class Page {
  private next = 0;
  private pending = new Map<number, { ok: (v: Json) => void; fail: (e: Error) => void }>();
  private ws: WebSocket;
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data)) as { id?: number; result?: Json; error?: { message: string } };
      const p = msg.id !== undefined ? this.pending.get(msg.id) : undefined;
      if (!p) return;
      this.pending.delete(msg.id!);
      if (msg.error) p.fail(new Error(msg.error.message));
      else p.ok(msg.result ?? {});
    };
  }
  static async open(debugUrl: string): Promise<Page> {
    const target = (await (await fetch(`${debugUrl}/json/new?about:blank`, { method: "PUT" })).json()) as { webSocketDebuggerUrl: string };
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, fail) => {
      ws.onopen = ok;
      ws.onerror = fail;
    });
    const page = new Page(ws);
    await page.send("Page.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: 1000, deviceScaleFactor: 1, mobile: false });
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });
    return page;
  }
  send(method: string, params: Json = {}): Promise<Json> {
    const id = ++this.next;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        fail(new Error(`${method} did not answer`));
      }, 30000);
      this.pending.set(id, { ok: (v) => (clearTimeout(timer), ok(v)), fail: (e) => (clearTimeout(timer), fail(e)) });
    });
  }
  async eval<T = unknown>(expression: string): Promise<T> {
    const r = (await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })) as { result: { value: T }; exceptionDetails?: { text: string } };
    if (r.exceptionDetails) throw new Error(`${expression.slice(0, 80)}: ${r.exceptionDetails.text}`);
    return r.result.value;
  }
  async waitFor(expression: string, what: string, ms = 15000) {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      if (await this.eval<boolean>(`Boolean(${expression})`).catch(() => false)) return;
      await sleep(150);
    }
    const shown = await this.eval<string>(`(document.querySelector("main") ?? document.body).innerText.slice(0, 600)`).catch(() => "");
    throw new Error(`timed out waiting for ${what}; the page shows:\n${shown}`);
  }
  /** Signs this tab in as a test person: the development token lives in the tab's sessionStorage. */
  async signIn(token: string | null) {
    await this.goto(`${WEB}/guide`);
    await this.eval(token ? `sessionStorage.setItem("gradebreaker.devToken", ${JSON.stringify(token)})` : `sessionStorage.clear()`);
  }
  /** A full load every time: a hash-only change within the app can leave Page.navigate unanswered. */
  async goto(url: string) {
    await this.send("Page.navigate", { url: "about:blank" });
    await this.send("Page.navigate", { url });
    await this.waitFor(`document.readyState === "complete" && document.querySelector("#root > *")`, url);
  }
  /** Presses the first button or link whose text is `label`, inside `within` when given. */
  async press(label: string, within = "body") {
    const ok = await this.eval<boolean>(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(within)} + " :is(button, a, [role=tab])")].find((b) => b.textContent.trim() === ${JSON.stringify(label)} && !b.disabled);
      if (el) el.click();
      return Boolean(el);
    })()`);
    if (!ok) throw new Error(`no "${label}" to press in ${within}`);
    await sleep(400);
  }
  /** Presses the first button whose text matches `pattern` (a fight's "Kara acts" is whoever has the Momentum). */
  async pressMatch(pattern: RegExp) {
    const ok = await this.eval<boolean>(`(() => {
      const el = [...document.querySelectorAll("button")].find((b) => ${pattern.toString()}.test(b.textContent.trim()) && !b.disabled);
      if (el) el.click();
      return Boolean(el);
    })()`);
    if (!ok) throw new Error(`no button matching ${pattern}`);
    await sleep(600);
  }
  /** Presses `label` on the card that shows `title` (a Prep item among many with the same buttons). */
  async pressOn(title: string, label: string) {
    const ok = await this.eval<boolean>(`(() => {
      const t = [...document.querySelectorAll("main *")].find((e) => e.children.length === 0 && e.textContent.trim() === ${JSON.stringify(title)});
      let card = t;
      while (card && ![...card.querySelectorAll("button")].some((b) => b.textContent.trim() === ${JSON.stringify(label)})) card = card.parentElement;
      const b = card && [...card.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(label)});
      if (b) b.click();
      return Boolean(b);
    })()`);
    if (!ok) throw new Error(`no "${label}" on ${title}`);
    await sleep(600);
  }
  /** Chooses a value in the select labeled `label`, the way React hears it. */
  async choose(label: string, value: string) {
    await this.eval(`(() => {
      const s = document.querySelector('select[aria-label=${JSON.stringify(label)}]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, ${JSON.stringify(value)});
      s.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
  }
  async theme(scheme: "light" | "dark") {
    await this.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }] });
    await sleep(400);
  }
  async settle() {
    // The development sign-in's tag is not part of any screen a table sees.
    await this.eval(`document.querySelectorAll(".topbar .tag").forEach((t) => (t.style.display = "none"))`);
    // A tab behind another never paints a frame, and its capture never answers.
    await this.send("Page.bringToFront");
    await this.eval(`document.fonts.ready.then(() => true)`);
    await sleep(700);
  }
  /** A shot of the page from the top (to `maxHeight`), or of one element with a margin around it. */
  async shot(name: string, opts: { selector?: string; heading?: string; maxHeight?: number; pad?: number } = {}) {
    await this.settle();
    let clip: { x: number; y: number; width: number; height: number };
    if (opts.selector || opts.heading) {
      const pad = opts.pad ?? 12;
      // By a selector, or the panel whose heading reads `heading`.
      const find = opts.selector
        ? `document.querySelector(${JSON.stringify(opts.selector)})`
        : `[...document.querySelectorAll("h2")].find((h) => h.textContent.trim() === ${JSON.stringify(opts.heading)})?.closest(".panel, section")`;
      const r = await this.eval<{ x: number; y: number; width: number; height: number } | null>(`(() => {
        const el = ${find};
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: b.left + scrollX, y: b.top + scrollY, width: b.width, height: b.height };
      })()`);
      if (!r) throw new Error(`${name}: nothing matches ${opts.selector ?? opts.heading}`);
      clip = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(WIDTH, r.width + 2 * pad), height: r.height + 2 * pad };
    } else {
      const h = await this.eval<number>(`document.documentElement.scrollHeight`);
      clip = { x: 0, y: 0, width: WIDTH, height: Math.min(h, opts.maxHeight ?? 1500) };
    }
    // Each shot in both themes: the console follows the reader's light or dark setting, and the
    // guide shows the one that matches (a player's screen is dark in both).
    for (const theme of ["light", "dark"] as const) {
      await this.theme(theme);
      const { data } = (await this.send("Page.captureScreenshot", { format: "webp", quality: 88, captureBeyondViewport: true, clip: { ...clip, scale: 1 } })) as { data: string };
      writeFileSync(join(OUT, `${name}${theme === "dark" ? "-dark" : ""}.webp`), Buffer.from(data, "base64"));
    }
    await this.theme("light");
    console.log(`  ${name}.webp, ${name}-dark.webp  ${Math.round(clip.width)}×${Math.round(clip.height)}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function launchChrome(): Promise<{ url: string; stop: () => void }> {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = mkdtempSync(join(tmpdir(), "guide-shots-"));
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${url}/json/version`).then((r) => r.ok, () => false)) return { url, stop: () => proc.kill() };
    await sleep(100);
  }
  proc.kill();
  throw new Error("Chrome did not start");
}

// ------------------------------------------------------------ shots ---

interface Ctx {
  s: Seeded;
  gm: Page;
  player: Page;
  other: Page;
}

const gmAt = async (c: Ctx, campaign: string, section: string) => {
  await c.gm.goto(`${WEB}/c/${campaign}#${section}`);
  await c.gm.waitFor(`document.querySelector(".nav__item[aria-current=page]")`, `the ${section} section`);
};

/**
 * Initial Momentum with set dice, so the party acts first and the shots never catch a character
 * dying (which holds the fight open). Each side's roller is whoever the record accepts.
 */
async function partyTakesMomentum(c: Ctx) {
  type View = { encounter: { sides: { id: string }[]; combatants: { id: string; sideId: string }[] } | null };
  const view = await call<View>(c.s.gm, "GET", `/campaigns/${c.s.main}`);
  const e = view.encounter!;
  const [party, hostiles] = e.sides.map((side) => e.combatants.filter((x) => x.sideId === side.id));
  for (const p of party!)
    for (const h of hostiles!) {
      const action: Action = {
        type: "combat.momentum",
        attempts: [[{ sideId: p.sideId, combatantId: p.id, natural: [80] }, { sideId: h.sideId, combatantId: h.id, natural: [5] }]],
      };
      const preview = await call<{ accepted: boolean }>(c.s.gm, "POST", `/campaigns/${c.s.main}/preview`, { id: crypto.randomUUID(), action });
      if (!preview.accepted) continue;
      await record(c.s.gm, c.s.main, action);
      await c.gm.waitFor(`document.body.innerText.includes("Round 1")`, "the first round");
      return;
    }
  throw new Error("no Momentum roll the record accepts");
}

/** Each shot, in the order they run; a later one may rely on an earlier one's state (the fight). */
const SHOTS: [string, (c: Ctx) => Promise<void>][] = [
  [
    "start-home",
    async (c) => {
      await c.gm.goto(`${WEB}/`);
      await c.gm.waitFor(`document.body.innerText.includes("Campaigns you run")`, "Home");
      await c.gm.shot("start-home", { maxHeight: 1000 });
    },
  ],
  [
    "start-join",
    async (c) => {
      await c.other.goto(`${WEB}/join/${c.s.invite}`);
      await c.other.waitFor(`document.querySelector(".arrive__go")`, "the join page");
      await c.other.shot("start-join", { maxHeight: 900 });
    },
  ],
  [
    "player-creator",
    async (c) => {
      await c.other.goto(`${WEB}/`);
      await c.other.waitFor(`document.body.innerText.includes("Build a character")`, "Home");
      await c.other.press("Build a character");
      await c.other.shot("player-creator", { maxHeight: 1500 });
    },
  ],
  [
    "gm-setup-checklist",
    async (c) => {
      await gmAt(c, c.s.empty, "party");
      await c.gm.waitFor(`document.querySelector(".table-setup")`, "the checklist");
      await c.gm.shot("gm-setup-checklist", { maxHeight: 900 });
    },
  ],
  [
    "gm-tablebar",
    async (c) => {
      await gmAt(c, c.s.main, "party");
      await c.gm.shot("gm-tablebar", { selector: ".tablebar", pad: 0 });
    },
  ],
  [
    "gm-party",
    async (c) => {
      await gmAt(c, c.s.main, "party");
      await c.gm.waitFor(`document.querySelector(".sheet")`, "the sheets");
      await c.gm.shot("gm-party", { maxHeight: 1400 });
    },
  ],
  [
    "gm-record",
    async (c) => {
      await gmAt(c, c.s.main, "party");
      await c.gm.shot("gm-record", { selector: ".party-screen__side" });
    },
  ],
  ...(["suggestions", "events", "quests", "principles", "classes", "hve", "log", "prep", "bestiary", "table", "rules"] as const).map(
    (s): [string, (c: Ctx) => Promise<void>] => [
      `gm-${s}`,
      async (c) => {
        await gmAt(c, c.s.main, s);
        await c.gm.shot(`gm-${s}`, { maxHeight: 1500 });
      },
    ],
  ),
  [
    "gm-heard",
    async (c) => {
      await gmAt(c, c.s.main, "events");
      await c.gm.shot("gm-heard", { heading: "Heard this session" });
    },
  ],
  [
    "gm-ai",
    async (c) => {
      await gmAt(c, c.s.main, "table");
      await c.gm.shot("gm-ai", { selector: `.panel:has(#ai-h)` });
    },
  ],
  [
    "gm-player-view",
    async (c) => {
      await gmAt(c, c.s.main, "player");
      await c.gm.waitFor(`document.querySelector(".view-as__screen .interface, .view-as__screen")`, "the player's screen");
      await c.gm.shot("gm-player-view", { maxHeight: 1500 });
    },
  ],
  [
    "player-screen",
    async (c) => {
      await c.player.goto(`${WEB}/c/${c.s.main}`);
      await c.player.waitFor(`document.querySelector(".tray")`, "the player's screen");
      await c.player.shot("player-screen", { maxHeight: 1500 });
    },
  ],
  [
    "player-tray",
    async (c) => {
      await c.player.goto(`${WEB}/c/${c.s.main}`);
      await c.player.waitFor(`document.querySelector(".tray")`, "the tray");
      await c.player.shot("player-tray", { selector: ".tray" });
    },
  ],
  [
    "player-listening",
    async (c) => {
      await c.player.goto(`${WEB}/c/${c.s.main}`);
      await c.player.waitFor(`document.querySelector(".listen-strip")`, "the capture strip");
      await c.player.shot("player-listening", { selector: ".listen-strip", pad: 0 });
    },
  ],
  // The fight, in order: the setup from Prep, a Clash waiting on the defense, the player's side, the aftermath.
  [
    "gm-combat-setup",
    async (c) => {
      await gmAt(c, c.s.main, "prep");
      await c.gm.waitFor(`document.body.innerText.includes("The fence line: three Snarljaws")`, "the prepared fight");
      await c.gm.pressOn("The fence line: three Snarljaws", "Set up the fight");
      await c.gm.waitFor(`document.body.innerText.includes("A new fight")`, "the fight's setup");
      for (const n of ["Kara", "Joe", "Andre", "Nia"]) await c.gm.choose(`Side for ${n}`, "party");
      await c.gm.shot("gm-combat-setup", { maxHeight: 1600 });
    },
  ],
  [
    "gm-combat",
    async (c) => {
      await c.gm.press("Start the fight");
      await partyTakesMomentum(c);
      await c.gm.pressMatch(/ acts$/);
      await c.gm.press("Attack…");
      await c.gm.pressMatch(/attacks \(1 Beat\)$/);
      await c.gm.waitFor(`document.querySelector(".panel.clash")`, "the Clash");
      await c.gm.shot("gm-combat", { maxHeight: 1500 });
    },
  ],
  [
    "player-fight",
    async (c) => {
      await c.player.goto(`${WEB}/c/${c.s.main}`);
      await c.player.waitFor(`document.querySelector(".tray")`, "the player's screen");
      await c.player.shot("player-fight", { selector: ".tray" });
    },
  ],
  [
    "gm-aftermath",
    async (c) => {
      await gmAt(c, c.s.main, "combat");
      await c.gm.waitFor(`document.querySelector(".panel.clash")`, "the waiting Clash");
      await c.gm.press("Roll the Clash");
      // A hit the defender may Yield waits on the choice; take the damage.
      await c.gm.pressMatch(/^Take \d+/).catch(() => undefined);
      await c.gm.press("End the fight…");
      await c.gm.pressMatch(/^End The fence line/);
      await c.gm.waitFor(`document.body.innerText.includes("The fight is over") || document.body.innerText.includes("THE FIGHT IS OVER")`, "the aftermath");
      await c.gm.shot("gm-aftermath", { maxHeight: 1600 });
    },
  ],
  // Last, since it moves everyone to Level 10: the rehearsal's VE plan (the fence, both quests, one rest), then three of the book's classes for Kara.
  [
    "player-class-offers",
    async (c) => {
      const gm = (action: Action) => record(c.s.gm, c.s.main, action);
      const all = ["kara", "joe", "andre", "nia"];
      const everyone = (ve: number) => gm({ type: "ve.award", basis: { kind: "other", note: "the rehearsal's plan" }, awards: all.map((id) => ({ characterId: id, ve })) });
      const rest = (hours: number) => gm({ type: "consolidation.rest", highDensity: false, rests: all.map((id) => ({ characterId: id, hours })) });
      await everyone(50);
      await rest(6);
      const engine = new Engine(loadRules());
      const book = bookClasses(engine);
      await gm({ type: "class.offer", characterId: "kara", offers: ["Breaching Vanguard", "Standing Surety", "Counterpuncher"].map((n) => book.find((b) => b.name === n)!) });
      await c.player.goto(`${WEB}/c/${c.s.main}`);
      await c.player.waitFor(`document.body.innerText.includes("Standing Surety")`, "the class offers");
      await c.player.shot("player-class-offers", { maxHeight: 1600 });
    },
  ],
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log("seeding…");
  const s = await seed();
  if (seedOnly) {
    // For looking around by hand: sessionStorage "gradebreaker.devToken" takes these tokens.
    console.log(JSON.stringify(s, null, 2));
    return;
  }
  const chrome = await launchChrome();
  try {
    const [gm, player, other] = await Promise.all([Page.open(chrome.url), Page.open(chrome.url), Page.open(chrome.url)]);
    await gm.signIn(s.gm);
    await player.signIn(s.players.kara);
    await other.signIn(s.newcomer);
    const c: Ctx = { s, gm, player, other };
    for (const [name, take] of SHOTS) {
      if (only.size && !only.has(name)) continue;
      process.stdout.write(`${name}…\n`);
      await take(c);
    }
  } finally {
    chrome.stop();
  }
}

await main();
