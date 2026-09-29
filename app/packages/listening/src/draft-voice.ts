/**
 * Drafting in the System's voice (app/DESIGN.md, M2, "System voice drafting"): a message for the
 * composer from what the GM wants said, and the vision that answers a Battle Memory meditation
 * (Principles, "Battle Memories"; The System AI, "Battle Memory Visions"). Both are held to the
 * voice in `rules/system-ai.yaml` and checked by `voiceFlags`. The GM edits the draft in the same
 * field it would have typed into, so writing by hand makes the same record.
 *
 * Neither request carries the Hidden Vector Engine's sheet: the System never discloses its reading
 * of a person, and a draft cannot leak what it was never given.
 */
import type { Engine } from "@gradebreaker/engine";
import type { CampaignRecord, Sheet } from "@gradebreaker/record";
import { z } from "zod";
import { type Drafter, type Effort, section } from "./draft-events.ts";
import { tableWords } from "./offers.ts";

export const DRAFT_MESSAGE_FEATURE = "draft-message";
export const DRAFT_VISION_FEATURE = "draft-vision";

/** The longest message the composer drafts, in lines; the book's samples run one or two. */
export const MESSAGE_LINES = 4;
/** The longest vision, in sentences: three images, one of them allowed a second sentence. */
export const VISION_SENTENCES = 4;

interface Voice {
  register: string;
  rules: string[];
  units: string;
  humor: string;
  attention: string;
  names: Record<string, string>;
  registers: Record<string, string>;
}

const voiceOf = (engine: Engine) => engine.rules["system-ai"].voice as Voice;

/** The voice every draft is written in, from `rules/system-ai.yaml`, the same for every request so it caches. */
export function voiceInstructions(engine: Engine): string {
  const v = voiceOf(engine);
  const names = Object.entries(v.names)
    .map(([who, name]) => `${who === "humans" ? "humans" : `the ${who}`} call it ${name}`)
    .join("; ");
  const samples = Object.entries(v.registers)
    .map(([k, t]) => `- ${k.replace(/_/g, " ")}: ${t}`)
    .join("\n");
  return `# The System's voice

The System is the intelligence that took Earth into its jurisdiction at Integration: it measures, classifies, issues quests, and confers titles. It is clinical, confident, and allowed to be wrong, and it never performs humor.

- One register: ${v.register}.
${v.rules.map((r) => `- ${r[0]!.toUpperCase()}${r.slice(1)}.`).join("\n")}
- Units: ${v.units}. When the table's words appear in a request, carry the quantity in the world's units or leave it out.
- Humor: ${v.humor}.
- Attention: ${v.attention}.
- It is exact about what it measured and approximate about what it inferred, and states both with the same confidence. When the GM wants the System mistaken, state the mistake as a measurement.
- It has no name for itself (${names}).
- Plain text. The app sets it in italics: no quotation marks around it, no brackets, no bold, no exclamation marks.

One sample per register:
${samples}`;
}

// ------------------------------------------------------------ flags ---

const SELF = /\b(I|I'm|I've|I'll|I'd)\b|\b(me|my|mine|myself|we|we're|we've|us|our|ours|ourselves)\b/g;
const MANNERISMS = /\b(congratulations|well done|great job|good job|nice work|sorry|apologi[sz]e|unfortunately|please|thank you|thanks|good luck|don't worry|keep going|keep it up|you've got this|impressive|amazing|hope)\b/gi;
const SHEET_WORDS = /\b(HVE|Hidden Vector|axis|axes|tall(?:y|ies))\b/g;

/**
 * What in a draft breaks the voice rules a reader can check by eye: the table's words, the System
 * speaking of itself, a chatbot's mannerisms, exclamation, brackets or bold, the sheet's words, and
 * `names` the text must not say in any case (a vision's Principle and family), and `poles`, the
 * behavioral sides, which it must not say capitalized as the sheet writes them: lowercase they are
 * ordinary words ("acquisition method", "hemorrhage control").
 */
export function voiceFlags(engine: Engine, text: string, opts: { names?: string[]; poles?: string[]; maxLines?: number; maxSentences?: number } = {}): string[] {
  const out: string[] = [];
  const all = (re: RegExp) => [...new Set([...text.matchAll(re)].map((m) => m[0]))];
  for (const w of tableWords(engine).filter((w) => new RegExp(`\\b${w}\\b`, "i").test(text))) out.push(`table word: ${w}`);
  for (const w of all(SELF)) out.push(`speaks of itself: ${w}`);
  for (const w of all(MANNERISMS)) out.push(`mannerism: ${w.toLowerCase()}`);
  for (const w of all(SHEET_WORDS)) out.push(`says ${w}`);
  if (text.includes("!")) out.push("exclaims");
  if (/[[\]]|\*\*/.test(text)) out.push("brackets or bold");
  if (/^\s*["“]/.test(text)) out.push("in quotation marks");
  for (const n of opts.names ?? []) if (new RegExp(`\\b${n}\\b`, "i").test(text)) out.push(`names ${n}`);
  for (const n of opts.poles ?? []) if (new RegExp(`\\b${n}\\b`).test(text)) out.push(`names ${n}`);
  const lines = text.split("\n").filter((l) => l.trim()).length;
  if (opts.maxLines && lines > opts.maxLines) out.push(`runs ${lines} lines`);
  const sentences = text.split(/(?<=[.?!])\s+/).filter((s) => s.trim()).length;
  if (opts.maxSentences && sentences > opts.maxSentences) out.push(`runs ${sentences} sentences`);
  return out;
}

/** The behavioral sides, capitalized as the sheet writes them: a message that names one discloses the Engine's reading. */
const polesOf = (engine: Engine) => (engine.rules.hve.axes as { poles: { name: string }[] }[]).flatMap((a) => a.poles.map((p) => p.name));

// ------------------------------------------------------------ whom ---

/** What the System knows of a character and may say to them: no Hidden Vector Engine. */
function known(c: Sheet): string {
  const titles = c.titles.filter((t) => t.status === "active").map((t) => t.name);
  return [
    `- ${c.name}: ${c.grade}-Grade, Level ${c.level}${c.class ? `, class ${c.class.name}` : ""}.`,
    `  Health ${c.hp} of ${c.maxHp}, Aether ${c.aether} of ${c.maxAether}, Volatile Energy stored ${c.storedVe}.`,
    `  Titles: ${titles.length ? titles.join(", ") : "none"}.`,
  ].join("\n");
}

// --------------------------------------------------------- messages ---

export interface MessageDraft {
  text: string;
  register: string;
  /** Numbers, measurements, and facts the draft says that the GM's request did not give. */
  added: string[];
  flags: string[];
}

export function draftMessageSchema(engine: Engine) {
  const registers = Object.keys(voiceOf(engine).registers) as [string, ...string[]];
  return z.object({
    text: z.string().describe(`The System's words: one to ${MESSAGE_LINES} short lines, each on its own line.`),
    register: z.enum(registers).describe("The register the message is in."),
    added: z.array(z.string()).describe("Every number, measurement, or fact in the text that the GM's request did not give, for the GM to check. Empty when it adds nothing."),
  });
}

export function draftMessageSystem(engine: Engine): string {
  return `You write the System's messages for the Game Master (GM) of Gradebreaker, a LitRPG tabletop roleplaying game. The GM says what the System conveys and to whom: in notes, a paraphrase, or a draft of their own to put in the voice. The GM reads your draft, edits it, and sends it; the characters named receive it in their interface.

${voiceInstructions(engine)}

# Writing the message

- Convey what the GM asks, all of it, and nothing the GM did not ask. Keep every number and fact the GM gives, exactly.
- The System may state a measurement the message needs to be precise (a distance, a duration, a temperature). List each in "added" so the GM can check it. Never add a reward, a cost, a deadline, or anything else the characters would act on that the GM did not give.
- The System never discloses what it keeps on a person's behavior: it states the acts it measured (counts, times, distances), never what they say about the person, and never names a trait.
- Each recipient receives the same text. Address a character by name only when the GM asks for it.
- One to ${MESSAGE_LINES} lines, most often one or two.`;
}

export function draftMessagePrompt(record: CampaignRecord, to: string[], gist: string): string {
  const sheets = record.sheets();
  return [section("Recipients", to.map((id) => sheets.get(id)).filter((c): c is Sheet => Boolean(c)).map(known)), `# What the GM wants the System to say\n\n${gist.trim()}`].join("\n\n");
}

export async function draftMessage(engine: Engine, drafter: Drafter, record: CampaignRecord, to: string[], gist: string, opts: { effort?: Effort } = {}): Promise<MessageDraft> {
  const out = await drafter({
    system: draftMessageSystem(engine),
    prompt: draftMessagePrompt(record, to, gist),
    schema: draftMessageSchema(engine),
    effort: opts.effort ?? "medium",
  });
  const text = out.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  return { text, register: out.register, added: out.added, flags: voiceFlags(engine, text, { poles: polesOf(engine), maxLines: MESSAGE_LINES }) };
}

// ---------------------------------------------------------- visions ---

export interface VisionDraft {
  vision: string;
  ip: number;
  /** For the GM: the images chosen and the Insight by the memory's intensity. */
  why: string;
  flags: string[];
}

interface Family {
  name: string;
  affinities: string[];
}

const familiesOf = (engine: Engine) => engine.rules.principles.families as Family[];
const meditationRow = (engine: Engine) => (engine.rules.principles.ip_sources as { source: string; ip_min: number; ip_max: number; note?: string }[]).find((s) => s.source === "Battle Memory meditation")!;

export function draftVisionSchema(engine: Engine) {
  const row = meditationRow(engine);
  return z.object({
    vision: z.string().describe(`The vision: three images in the System's voice, at most ${VISION_SENTENCES} short sentences, as one paragraph.`),
    ip: z.number().int().min(row.ip_min).max(row.ip_max).describe(`Insight, ${row.ip_min} to ${row.ip_max}, ${row.note ?? ""}.`),
    why: z.string().describe("One or two sentences for the GM: which image carries the moment, which the Principle, which misleads, and why this Insight."),
  });
}

export function draftVisionSystem(engine: Engine): string {
  const fn = (engine.rules["system-ai"].functions as { name: string; unplugged?: string; example?: { memory: string; principle: string; vision: string } }[]).find((f) => f.name === "Battle Memory Visions")!;
  const row = meditationRow(engine);
  const ex = fn.example!;
  return `You write the vision the System gives a character who meditates on a Battle Memory, for the Game Master (GM) of Gradebreaker, a LitRPG tabletop roleplaying game. The GM reads your draft, edits it, and records it; the player reads it in their character's interface.

${voiceInstructions(engine)}

# The vision

A Battle Memory Card records a moment of extreme stress. At a Consolidation the player says how the character meditates on it (what they felt, noticed, or think they glimpsed), and the System answers with a cryptic vision. The vision points toward the Principle the memory expresses and never states it: the player names the pattern later, from their own reading of play.

Compose it from ${fn.unplugged}. Draw on what the player said where it gives you something. The vision is images only: no notice, no Insight count, no address to the character, no explanation.

Never name the Principle, its family, or the family's listed affinities. Before a Principle crystallizes, the vision points into the family's territory through the moment itself.

Example: for ${ex.memory}, toward ${ex.principle}:
${ex.vision}

Propose the Insight the meditation earns, ${row.ip_min} to ${row.ip_max}, ${row.note ?? "by the memory's intensity"}; the GM decides.`;
}

export function draftVisionPrompt(engine: Engine, record: CampaignRecord, characterId: string, memoryId: string, family: string, words: string): string {
  const c = record.sheets().get(characterId)!;
  const m = c.principles.memories.find((x) => x.id === memoryId)!;
  const f = familiesOf(engine).find((x) => x.name === family);
  const principle = c.principles.principles.find((p) => p.family === family);
  const how = { cascade: "a cascade: the character's own act ran far past anything measured for it", downed: "the character survived being brought to the edge of death", gm: "the GM granted it for the moment" }[m.source];
  const earlier = c.principles.memories.filter((x) => x.meditation?.vision).map((x) => `- ${x.meditation!.vision}`);
  return [
    section("Character", [`- ${c.name}, ${c.grade}-Grade, Level ${c.level}. Background: ${c.background.replace(/\.$/, "")}.`]),
    section("The Battle Memory", [`- ${m.text}`, `- How it came: ${how}.`]),
    section(
      "Where the vision points",
      principle
        ? [`- The Principle ${principle.name} (${family}), crystallized, at ${principle.tier}.`]
        : [`- The family ${family}, not yet crystallized${f ? `; its affinities include ${f.affinities.join(", ")}` : ""}.`],
    ),
    section("What the player said", [words.trim() ? words.trim() : "Nothing: the character sits with it."]),
    section("Visions this character has already had (do not repeat their images)", earlier),
  ].join("\n\n");
}

export async function draftVision(
  engine: Engine,
  drafter: Drafter,
  record: CampaignRecord,
  characterId: string,
  memoryId: string,
  family: string,
  words: string,
  opts: { effort?: Effort } = {},
): Promise<VisionDraft> {
  const c = record.sheets().get(characterId);
  if (!c) throw new Error(`no character ${characterId}`);
  if (!c.principles.memories.some((m) => m.id === memoryId)) throw new Error(`${c.name} holds no card ${memoryId}`);
  const out = await drafter({
    system: draftVisionSystem(engine),
    prompt: draftVisionPrompt(engine, record, characterId, memoryId, family, words),
    schema: draftVisionSchema(engine),
    effort: opts.effort ?? "medium",
  });
  const vision = out.vision.replace(/\s*\n+\s*/g, " ").trim();
  const principle = c.principles.principles.find((p) => p.family === family)?.name;
  const affinities = familiesOf(engine).find((f) => f.name === family)?.affinities ?? [];
  // A listed affinity may be an ordinary word in an image (Iron, Wind); only the Principle and the family are its name.
  const names = [family, ...(principle ? [principle] : [])];
  const flags = voiceFlags(engine, vision, { names, maxSentences: VISION_SENTENCES });
  for (const a of affinities.filter((a) => !names.includes(a) && new RegExp(`\\b${a}\\b`).test(vision))) flags.push(`says the affinity ${a}`);
  return { vision, ip: out.ip, why: out.why.trim(), flags };
}
