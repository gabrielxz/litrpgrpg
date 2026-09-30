/**
 * Campaign memory in a request (app/DESIGN.md, "AI context"): a request carries the campaign
 * paragraph, the last session's summary, and the chronicles of the characters it concerns,
 * instead of the whole history, so its size stays about constant however long the campaign runs.
 * The events already in the record come the same way: all of them while the campaign is young,
 * then the running session's and the few earlier ones the talk calls back to.
 */
import { type CampaignEvent, type CampaignRecord, memoryOf, runningSession } from "@gradebreaker/record";
import { section } from "./draft-events.ts";

/** Below this many events a request carries them all. */
export const ALL_EVENTS_UNDER = 30;
/** Past it, the earlier events a request carries: the ones that match the talk best. */
export const MATCHED_EVENTS = 8;

/** The campaign paragraph, the last session's summary, and the chronicles of `characters` (everyone with one, if absent). */
export function campaignContext(record: CampaignRecord, characters?: readonly string[]): string[] {
  const m = memoryOf(record.state);
  const sheets = record.sheets();
  const last = [...record.state.sessions.values()].filter((s) => s.summary && s.endedAt).at(-1);
  const who = characters ?? [...m.chronicles.keys()];
  const chronicles = who.flatMap((id) => {
    const c = m.chronicles.get(id);
    return c ? [`- ${sheets.get(id)?.name ?? id}: ${c.text}`] : [];
  });
  return [
    ...(m.campaign ? [section("The campaign", [m.campaign.text])] : []),
    ...(last ? [section("Last session", [last.summary!])] : []),
    ...(chronicles.length ? [section("Chronicles", chronicles)] : []),
  ];
}

const WORD = /[A-Za-z][A-Za-z'-]{3,}/g;
const COMMON = new Set(["that", "this", "with", "from", "they", "their", "them", "there", "then", "than", "what", "when", "were", "have", "your", "into", "just", "like", "over", "back", "down", "only", "said", "says", "does", "doesn't", "don't", "it's", "i'm", "okay", "yeah"]);
const words = (text: string) => new Set((text.match(WORD) ?? []).map((w) => w.toLowerCase()).filter((w) => !COMMON.has(w)));

/**
 * The events a request carries: every one while there are fewer than ALL_EVENTS_UNDER; after that,
 * the running session's, and the MATCHED_EVENTS earlier ones sharing the most words with `talk`
 * (a name, a place, a thing), in the record's order.
 */
export function eventsFor(record: CampaignRecord, talk: string): CampaignEvent[] {
  const all = [...record.state.events.values()];
  if (all.length < ALL_EVENTS_UNDER) return all;
  const running = runningSession(record.state)?.id;
  const heard = words(talk);
  const earlier = all
    .filter((e) => !running || e.sessionId !== running)
    .map((e, i) => ({ e, i, score: [...words(`${e.summary} ${e.context ?? ""}`)].filter((w) => heard.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.i - a.i)
    .slice(0, MATCHED_EVENTS);
  const keep = new Set([...earlier.map((x) => x.e.id), ...all.filter((e) => running && e.sessionId === running).map((e) => e.id)]);
  return all.filter((e) => keep.has(e.id));
}
