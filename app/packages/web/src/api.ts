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
    kind: "title" | "battle-memory" | "hidden-achievement" | "personal-opportunity";
    key: string;
    characterId: string;
    /** A Personal Opportunity: whether it affirms or tests the pattern, and the System's words with the offer. */
    stance?: "affirm" | "test";
    notice?: string;
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
  talk: TypedTalk;
  repaired: string[];
  dropped: { why: string }[];
  items: DraftItem[];
}

export const draftRuns = (campaignId: string) => api<{ runs: DraftRun[] }>("GET", `/campaigns/${campaignId}/drafts`);

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

export const draftVision = (campaignId: string, body: { characterId: string; memoryId: string; family: string; words: string }) =>
  api<{ draft: VisionDraft }>("POST", `/campaigns/${campaignId}/voice/vision`, body);

export const startDraft = (campaignId: string, text: string) => api<{ run: DraftRun }>("POST", `/campaigns/${campaignId}/drafts`, { text });

export const acceptDraft = (campaignId: string, item: DraftItem, id: string, action: Action) =>
  api<{ appended: Appended; item: DraftItem }>("POST", `/campaigns/${campaignId}/drafts/${item.runId}/${item.itemId}/accept`, { id, action });

export const markDraft = (campaignId: string, item: DraftItem, to: "dismiss" | "restore") =>
  api<{ item: DraftItem }>("POST", `/campaigns/${campaignId}/drafts/${item.runId}/${item.itemId}/${to}`);
