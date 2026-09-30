/** The server's HTTP API, with the signed-in person's token on every call. */
import type { TypedTalk } from "@gradebreaker/listening/typed";
import type { Action, Effect, Envelope, Preview } from "@gradebreaker/record";

export interface Config {
  supabaseUrl: string | null;
  supabasePublishableKey: string | null;
  devSignIn: boolean;
  rulesVersion: string;
}

export interface User {
  id: string;
  displayName: string;
}

export interface CampaignSummary {
  id: string;
  name: string;
  rulesVersion: string;
  role: "gm" | "player";
}

export interface Invite {
  code: string;
  createdAt: string;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  revokedAt: string | null;
}

export interface Appended {
  envelope: Envelope;
  effects: Effect[];
  duplicate: boolean;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let tokenSource: () => Promise<string | null> = async () => null;

/** Set by auth.ts: where the current access token comes from. */
export function setTokenSource(source: () => Promise<string | null>) {
  tokenSource = source;
}

export async function currentToken(): Promise<string | null> {
  return tokenSource();
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = await tokenSource();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? res.statusText);
  return data as T;
}

/** A fresh idempotency key: one per action the person means to record. */
export const newActionId = () => crypto.randomUUID();

export const submit = (campaignId: string, id: string, action: Action, cause?: string) =>
  api<Appended>("POST", `/campaigns/${campaignId}/actions`, { id, action, ...(cause ? { cause } : {}) });

export const preview = (campaignId: string, id: string, action: Action) =>
  api<Preview>("POST", `/campaigns/${campaignId}/preview`, { id, action });

// ------------------------------------------------ drafts from table talk ---

/** One draft the model made, waiting for the GM (server/src/drafts.ts). */
export interface DraftItem {
  runId: string;
  itemId: string;
  /** An event (the moment), an action (an item, quest, or count), a Prep cue, or a suggestion (a title, a Battle Memory Card, a Hidden Achievement). */
  kind: "event" | "action" | "cue" | "suggestion";
  lines: string[];
  /** What accepting records; a suggestion's is the grant it proposes. */
  action?: Action;
  prepId?: string;
  suggestion?: {
    kind: "title" | "battle-memory" | "hidden-achievement" | "personal-opportunity" | "quest" | "class-offers";
    key: string;
    characterId: string;
    /** A Personal Opportunity: whether it affirms or tests the pattern, and the System's words with the offer. */
    stance?: "affirm" | "test";
    notice?: string;
    /** Class offers: for the GM, each offer's role, what it weighs, and the book's rules and advice it crosses; and problems across the three. */
    offers?: { role: string; weighs: string; problems: string[]; warnings: string[]; everyFight?: boolean }[];
    problems?: string[];
    /** Other readings of the same deed, each with what accepting it records. */
    alternatives?: { label: string; why: string; accept: Action }[];
  };
  /** An event's reason per character. */
  reasons: { characterId: string; why: string }[];
  /** An action's or a cue's reason. */
  why?: string;
  status: "open" | "accepted" | "dismissed";
  actionId?: string;
  undone?: boolean;
  /** A cue whose prepared item has been fired since the run. */
  fired?: boolean;
  resolvedAt?: string;
}

export interface DraftRun {
  id: string;
  /** What drafted it: "draft-events,draft-actions,draft-suggestions" from talk, or "draft-opportunity" at the sweep. */
  feature: string;
  createdAt: string;
  finishedAt?: string;
  status: "drafting" | "done" | "failed";
  problem?: string;
  message?: string;
  /** The talk drafted from: typed, or a window of heard lines whose earlier lines (sent as context) come first. */
  talk: TypedTalk & { heard?: { sessionId: string; through: number; earlier: string[] } };
  /** A window drafted in shadow: hidden (its drafts kept from review) or released. */
  shadow?: "hidden" | "released";
  repaired: string[];
  dropped: { why: string }[];
  items: DraftItem[];
}

/** Drafting what the listening hears: on, in shadow (kept from review until released), or off. */
export type LiveMode = "on" | "shadow" | "off";
export const draftRuns = (campaignId: string) => api<{ runs: DraftRun[]; live?: { mode: LiveMode } }>("GET", `/campaigns/${campaignId}/drafts`);
/** Drafts what the listening heard since the last draft, now. */
export const draftHeardNow = (campaignId: string) => api<{ run: DraftRun }>("POST", `/campaigns/${campaignId}/drafts/heard`, {});
/** Drafts what the listening hears as the table talks, in shadow, or not at all. */
export const setLiveDrafting = (campaignId: string, mode: LiveMode) => api<{ live: { mode: LiveMode } }>("POST", `/campaigns/${campaignId}/drafts/heard/mode`, { mode });

/** Shadow mode's comparison for a session: the hidden drafts against what the GM recorded by hand. */
export interface ShadowSession {
  hidden: number;
  both: { item: DraftItem; logged: Envelope; sameSide?: boolean }[];
  gmOnly: Envelope[];
  listenerOnly: DraftItem[];
  byType: Record<string, { both: number; gmOnly: number; listenerOnly: number }>;
}
export const shadowSession = (campaignId: string, sessionId: string) => api<ShadowSession>("GET", `/campaigns/${campaignId}/sessions/${sessionId}/shadow`);
export const releaseShadow = (campaignId: string, sessionId: string) => api<{ ok: true }>("POST", `/campaigns/${campaignId}/sessions/${sessionId}/shadow/release`, {});

export const startOpportunity = (campaignId: string, characterId: string, situation: string) =>
  api<{ run: DraftRun }>("POST", `/campaigns/${campaignId}/opportunities`, { characterId, situation });

/** A message drafted in the System's voice: the register it took, what it adds that the GM did not give, and what breaks the voice. */
export interface MessageDraft {
  text: string;
  register: string;
  added: string[];
  flags: string[];
}

/** A drafted vision, with the Insight it proposes and the reason, for the GM. */
export interface VisionDraft {
  vision: string;
  ip: number;
  why: string;
  flags: string[];
}

export const draftMessage = (campaignId: string, to: string[], gist: string) => api<{ draft: MessageDraft }>("POST", `/campaigns/${campaignId}/voice/message`, { to, gist });

export interface DistillationReading {
  articulation: string;
  phrasing: string;
  test: { operational: string; bounded: string; testable: string };
  name: string;
  effect: string;
  flags: string[];
}
export const draftDistillation = (campaignId: string, b: { characterId: string; family: string; words?: string; refine?: boolean }) =>
  api<{ draft: { family: string; tier: string; readings: DistillationReading[]; attunements?: string } }>("POST", `/campaigns/${campaignId}/distillation-draft`, b);
export const draftMemory = (campaignId: string, sessionId: string) =>
  api<{ draft: { campaign: string; chronicles: { characterId: string; text: string }[] } }>("POST", `/campaigns/${campaignId}/sessions/${sessionId}/memory-draft`, {});
export const draftSessionSummary = (campaignId: string, sessionId: string) =>
  api<{ draft: { summary: string } }>("POST", `/campaigns/${campaignId}/sessions/${sessionId}/summary-draft`, {});

/** A character's System summary: the whole message, and the flags on its drafted observation. */
export const draftCharacterSummary = (campaignId: string, characterId: string, integration: boolean) =>
  api<{ draft: { text: string; observation: string; flags: string[] } }>("POST", `/campaigns/${campaignId}/voice/summary`, { characterId, integration });

export const draftVision = (campaignId: string, body: { characterId: string; memoryId: string; family: string; words: string }) =>
  api<{ draft: VisionDraft }>("POST", `/campaigns/${campaignId}/voice/vision`, body);

export const startClassOffers = (campaignId: string, characterId: string, keepsDoing: string, guarded: boolean) =>
  api<{ run: DraftRun }>("POST", `/campaigns/${campaignId}/class-offers`, { characterId, keepsDoing, guarded });

export const startDraft = (campaignId: string, text: string) => api<{ run: DraftRun }>("POST", `/campaigns/${campaignId}/drafts`, { text });

export const acceptDraft = (campaignId: string, item: DraftItem, id: string, action: Action) =>
  api<{ appended: Appended; item: DraftItem }>("POST", `/campaigns/${campaignId}/drafts/${item.runId}/${item.itemId}/accept`, { id, action });

export const markDraft = (campaignId: string, item: DraftItem, to: "dismiss" | "restore") =>
  api<{ item: DraftItem }>("POST", `/campaigns/${campaignId}/drafts/${item.runId}/${item.itemId}/${to}`);
