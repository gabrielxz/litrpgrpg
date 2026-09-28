/**
 * Drafting events and HVE entries from typed table talk (app/DESIGN.md, M2; "Testing the
 * listening", layer 2). The model reads a scene's lines, with what the table recorded in the app
 * between them and the record as it stood before the first line, and drafts the moments the GM
 * reviews: each an `event.log` action citing its lines, with one HVE entry per character whose
 * own decision it was. Drafts reach the GM only; the GM accepts, edits, or dismisses each, and
 * logging an event by hand makes the same record.
 *
 * The instructions are built from `rules/hve.yaml` and never change between requests, so the
 * provider caches them; the scene goes in the request. The drafter sees no HVE reading of any
 * character: an entry comes from what the character did in these lines, never from who they
 * have been (The Hidden Vector Engine, "Do not steer").
 *
 * The model is reached through a `Drafter`, a function the server binds to a campaign's key and
 * feature (`CampaignAi.draft`), so every request is recorded against the campaign.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, CampaignRecord, type Effect, type LogEvent } from "@gradebreaker/record";
import { z } from "zod";
import type { Script } from "./script.ts";
import { replay } from "./script.ts";

export const DRAFT_EVENTS_FEATURE = "draft-events";

/** What a drafting feature asks of the model: the same shape as the server's `DraftRequest`. */
export interface DraftRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: Effort;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type Drafter = <T>(req: DraftRequest<T>) => Promise<T>;

/** A scene to draft from: the record before its first line, the lines, and what the app recorded among them. */
export interface Scene {
  record: CampaignRecord;
  speakers: { id: string; role: "gm" | "player"; name: string }[];
  lines: { id: string; speaker: string; text: string; as?: string }[];
  /** Actions recorded in the app during the scene, each after the line it follows, with what they did. */
  recorded: { after: string; action: Action; effects: Effect[] }[];
}

/** A drafted event, with the model's reason for each entry for the GM to read. */
export interface EventDraft {
  id: string;
  lines: string[];
  action: LogEvent;
  reasons: { characterId: string; why: string }[];
}

export interface EventDrafts {
  drafts: EventDraft[];
  /** Drafts the record would refuse or that cite nothing in the scene, with the reason. */
  dropped: { draft: unknown; why: string }[];
  /** Repairs made to drafts that were kept: an unknown line dropped, a participant added. */
  repaired: string[];
}

// ------------------------------------------------------------- rules ---

interface Pole {
  name: string;
  family: string;
  description: string;
}

const polesOf = (engine: Engine): string[] => (engine.rules.hve.axes as { poles: Pole[] }[]).flatMap((a) => a.poles.map((p) => p.name));

const intensitiesOf = (engine: Engine): number[] => Object.values(engine.rules.hve.structured_logging.intensities as Record<string, number>).sort((a, b) => a - b);

// ------------------------------------------------------------ schema ---

/** The model's output. Nullable rather than optional fields, so every field is asked for. */
export function draftEventsSchema(engine: Engine) {
  const poles = polesOf(engine) as [string, ...string[]];
  const entry = z.object({
    characterId: z.string().describe("The character's id from the roster."),
    why: z.string().describe("One sentence for the GM: the decision, what it cost, and why this side and weight."),
    pole: z.enum(poles),
    intensity: z.literal(intensitiesOf(engine)),
    intent: z.string().nullable().describe("What the character was trying to do, in a few words."),
    outcome: z.string().nullable().describe("What came of it, when the lines show it."),
    secondary: z.enum(poles).nullable().describe("A second axis the moment clearly reads on; only at intensity 2 or 3."),
    coercion: z.boolean().describe("Coercion aimed at another player character."),
  });
  return z.object({
    events: z.array(
      z.object({
        lines: z.array(z.string()).describe("The ids of every line that evidences the moment: the decision and the reactions to it."),
        summary: z.string().describe("One sentence: who decided what, in the fiction."),
        context: z.string().nullable().describe("What made it a choice, when the summary does not carry it."),
        participants: z.array(z.string()).describe("The ids of the characters in the moment."),
        entries: z.array(entry),
      }),
    ),
  });
}

export type DraftEventsOutput = z.infer<ReturnType<typeof draftEventsSchema>>;

// ------------------------------------------------------ instructions ---

/** The standing instructions, built from the rules alone: the same text for every request. */
export function draftEventsSystem(engine: Engine): string {
  const hve = engine.rules.hve;
  const axes = (hve.axes as { name: string; question: string; poles: Pole[] }[])
    .map((a) => [`${a.name}: ${a.question}`, ...a.poles.map((p) => `- ${p.name} (${p.family}): ${p.description}`)].join("\n"))
    .join("\n\n");
  const i = hve.structured_logging.intensities as Record<string, number>;
  const weights = (hve.sweep.weights as { tallies: number; name: string; qualifies: string; example: string }[])
    .filter((w) => w.tallies > 0)
    .map((w) => `- ${w.tallies}, ${w.name}: ${w.qualifies}. For example: ${w.example}`)
    .join("\n");
  const none = (hve.sweep.weights as { tallies: number; qualifies: string; example: string }[]).find((w) => w.tallies === 0)!;
  const calibration = (hve.sweep.calibration as string[]).map((c) => `- ${c[0]!.toUpperCase()}${c.slice(1)}.`).join("\n");
  const [low, high] = hve.sweep.expected_tallies_per_session_party as [number, number];
  const pvp = hve.sweep.pvp_coercion_min_will_tallies as number;

  return `You read the transcript of a scene from a tabletop game of Gradebreaker, a LitRPG roleplaying game, and draft the moments the Game Master (GM) reviews for the Hidden Vector Engine. Your drafts go to the GM alone. The GM accepts, edits, or dismisses each one, and can log a moment you missed by hand, so a wrong draft costs more than a missed one: draft a moment only when the lines show it.

# The Hidden Vector Engine

The engine tracks how each character behaves under pressure, and answers one question: how does this person act when it costs them something? It records conduct without judging it. Four axes, each a tension between two sides:

${axes}

# What a moment is

A moment is a decision a character made in the fiction, at some cost, that the table would still remember at the end of the session. You draft each as an event: one thing that happened, with the lines that show it, the characters in it, and one entry for each character whose own decision it was. A character who only watched, agreed, or was affected gets no entry; list them as a participant when they are part of the moment.

Weigh each entry by the table's sweep:

${weights}
- ${i.below_threshold}, a reminder: a real choice in the fiction that falls short of ${i.remembered}, because it cost little or passed quickly. The GM sees it at the end of the session and may raise it to ${i.remembered}.

No tally at all: ${none.qualifies}. For example: ${none.example}

Calibration:
${calibration}
- Coercion aimed at another player character is at least ${pvp} of Will; mark it as coercion.
- A secondary side goes on another axis and only on an entry of ${i.surprised_the_table} or more.
- A session produces ${low} to ${high} tallies across the whole party. A scene is part of a session, and most scenes carry fewer.

# Evidence

Tally what the character did in these lines. The roster gives each character's name and state; it says nothing about who they are, and a character acting against what you would expect of them is still acting.

The transcript marks who speaks and when a player speaks as their character or the GM speaks as someone in the world. A player also narrates what their character does in the third person ("Andre picks up the shard"); that is the character acting.

Lines that produce nothing:
- Players talking about the game as themselves: rules questions, jokes, hypotheticals ("what if he just ran with it?"), plans for later, notes to look something up.
- Life around the table: food, sports, work, a phone call, a player stepping away and coming back, side conversations.
- References only the table shares: a name or joke you have no context for.
- A choice taken back before it stood ("no, wait, scratch that"): only the choice that stood counts.
- The GM describing the world, speaking as someone in it, or reading out a state (a character's Health, what they see).
- What the app already recorded. Lines marked "app" are actions the table recorded in the app (rolls, attacks, defenses, forced movement, Marks), with their results. The GM or a player reading them out is not a new event. The decision behind a recorded action can still be a moment, when choosing it cost something: the dice and damage are in the record; the choice is yours to weigh.
- Mechanical optimization, and choices with no cost.

# Output

Use the character ids from the roster and the line ids from the transcript. Cite every line that shows the moment: the decision, and the reactions to it. Write the summary in one sentence: who decided what, in the fiction. Every event carries at least one entry. When nothing in the scene is a moment, return no events.`;
}

// ------------------------------------------------------------- scene ---

const json = (x: unknown) => JSON.stringify(x);

/** The request's material: the roster and record before the scene, then the transcript. */
export function draftEventsPrompt(scene: Scene): string {
  const { record } = scene;
  const state = record.state;
  const speakers = new Map(scene.speakers.map((s) => [s.id, s]));
  const sheets = [...record.sheets().values()];
  const nameOf = new Map(sheets.map((s) => [s.id, s.name]));

  const roster = sheets.map((s) => {
    const player = s.playerId ? (speakers.get(s.playerId)?.name ?? s.playerId) : "the GM";
    const status = s.dead ? ", dead" : s.downed ? ", Downed" : "";
    return `- ${s.id}: ${s.name}, played by ${player}. ${s.grade}-Grade, Level ${s.level}. Health ${s.hp} of ${s.maxHp}${status}. Background: ${s.background.replace(/\.$/, "")}.`;
  });

  const parties = [...state.parties.values()].map((p) => `- ${p.members.map((m) => nameOf.get(m) ?? m).join(", ")}`);
  const items = [...state.inventory]
    .filter(([, stacks]) => stacks.length)
    .map(([holder, stacks]) => `- ${holder === "spoils" ? "unclaimed (spoils)" : holder}: ${stacks.map((x) => `${x.name} ×${x.count}`).join(", ")}`);
  const quests = [...state.quests.values()]
    .filter((q) => q.status === "active" || q.status === "offered")
    .map((q) => `- ${q.title} (${q.code}), ${q.status}, held by ${q.holders.join(", ")}: ${q.objective}${q.count ? ` ${q.count.done} of ${q.count.of}.` : ""}`);
  const events = [...state.events.values()].map((e) => `- ${e.summary} (${e.participants.join(", ")})`);

  const who = (l: Scene["lines"][number]) => {
    const s = speakers.get(l.speaker);
    const name = s ? `${s.name}${s.role === "gm" ? " (GM)" : ""}` : l.speaker;
    if (!l.as) return name;
    return `${name} as ${nameOf.get(l.as) ?? l.as}`;
  };
  const transcript: string[] = [];
  for (const l of scene.lines) {
    transcript.push(`[${l.id}] ${who(l)}: ${l.text}`);
    for (const r of scene.recorded.filter((r) => r.after === l.id)) {
      const effects = r.effects.length ? ` -> ${json(r.effects)}` : "";
      transcript.push(`    app: ${json(r.action)}${effects}`);
    }
  }

  const section = (title: string, rows: string[]) => `# ${title}\n\n${rows.length ? rows.join("\n") : "(none)"}`;
  return [
    section("Roster", roster),
    section("Parties", parties),
    section("Items held", items),
    section("Quests", quests),
    section("Events already in the record", events),
    `# Transcript\n\n${transcript.join("\n")}`,
  ].join("\n\n");
}

/** A script's scene: the setup replayed, its lines, and its recorded actions with the effects the replay gave them. */
export function sceneOfScript(engine: Engine, script: Script): Scene {
  const record = new CampaignRecord(engine);
  const gm = script.speakers.find((s) => s.role === "gm")!;
  for (const s of script.setup) record.append({ id: s.id, at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: gm.id }, source: "manual", action: s.action as Action });
  const full = replay(engine, script);
  return {
    record,
    speakers: script.speakers.map(({ id, role, name }) => ({ id, role, name })),
    lines: script.lines.map(({ id, speaker, text, as }) => (as ? { id, speaker, text, as } : { id, speaker, text })),
    recorded: script.recorded.map((r) => ({ after: r.after, action: r.action as Action, effects: full.state.effects.get(r.id) ?? [] })),
  };
}

// ------------------------------------------------------------ drafts ---

/**
 * The model's events as record actions. Repairs what a GM would not want to fix by hand (a line
 * id the scene lacks, an entry's character missing from the participants, a secondary on a
 * single tally) and drops what the record refuses.
 */
export function eventDraftsOf(engine: Engine, scene: Scene, out: DraftEventsOutput): EventDrafts {
  const lineIds = new Set(scene.lines.map((l) => l.id));
  const result: EventDrafts = { drafts: [], dropped: [], repaired: [] };
  const check = new CampaignRecord(engine, scene.record.log);
  const minSecondary = intensitiesOf(engine).find((x) => x > engine.rules.hve.structured_logging.intensities.remembered)!;

  out.events.forEach((e, n) => {
    const id = `draft-${n + 1}`;
    const lines = e.lines.filter((l) => lineIds.has(l));
    if (lines.length < e.lines.length) result.repaired.push(`${id}: dropped line ids the scene lacks (${e.lines.filter((l) => !lineIds.has(l)).join(", ")})`);
    if (!lines.length) return void result.dropped.push({ draft: e, why: "cites no line in the scene" });
    if (!e.entries.length) return void result.dropped.push({ draft: e, why: "carries no entry" });

    const seen = new Set<string>();
    const entries: LogEvent["entries"] = [];
    const reasons: EventDraft["reasons"] = [];
    for (const x of e.entries) {
      if (seen.has(x.characterId)) {
        result.repaired.push(`${id}: dropped a second entry for ${x.characterId}`);
        continue;
      }
      seen.add(x.characterId);
      const entry: NonNullable<LogEvent["entries"]>[number] = { characterId: x.characterId, pole: x.pole, intensity: x.intensity };
      if (x.intent?.trim()) entry.intent = x.intent.trim();
      if (x.outcome?.trim()) entry.outcome = x.outcome.trim();
      if (x.secondary) {
        if (x.intensity >= minSecondary) entry.secondary = x.secondary;
        else result.repaired.push(`${id}: dropped ${x.characterId}'s secondary ${x.secondary} on a single tally`);
      }
      if (x.coercion) entry.coercion = true;
      entries.push(entry);
      reasons.push({ characterId: x.characterId, why: x.why });
    }
    const participants = [...new Set([...e.participants, ...entries.map((x) => x.characterId)])];
    if (participants.length > new Set(e.participants).size) result.repaired.push(`${id}: added entry characters to the participants`);

    const action: LogEvent = { type: "event.log", summary: e.summary, participants, entries };
    if (e.context?.trim()) action.context = e.context.trim();
    const preview = check.preview({ id, at: "2026-01-01T00:00:00Z", actor: { role: "gm", userId: "drafter" }, source: "voice", cause: lines.join(","), action });
    if (!preview.accepted) return void result.dropped.push({ draft: e, why: `the record refuses it: ${preview.reason}` });
    result.drafts.push({ id, lines, action, reasons });
  });
  return result;
}

/** Drafts a scene's events through the model. */
export async function draftEvents(engine: Engine, drafter: Drafter, scene: Scene, opts: { effort?: Effort } = {}): Promise<EventDrafts> {
  const out = await drafter({
    system: draftEventsSystem(engine),
    prompt: draftEventsPrompt(scene),
    schema: draftEventsSchema(engine),
    effort: opts.effort ?? "medium",
  });
  return eventDraftsOf(engine, scene, out);
}
