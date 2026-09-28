/**
 * Table talk typed or pasted by the GM, read into a scene's speakers and lines (app/DESIGN.md,
 * M2: drafting from typed input). One utterance per line, `Name: what they said`, the form a
 * pasted transcript takes; a leading timestamp (`[00:12:03]`, `00:12:03`, `12:03 -`) is dropped.
 *
 * A name is read in this order: a character's name (or its first word) is that character's
 * player speaking as the character, or the GM when nobody holds it; a member's display name (or
 * its first word) is that person; GM, DM, or Game Master is the GM; any other name is someone
 * the GM voices. A line with no name continues the previous speaker, and before any speaker it
 * is the GM's.
 *
 * Pure, with no Node imports, so the web client shows the same reading as the GM types.
 */

export interface TalkRoster {
  members: { userId: string; name: string; role: "gm" | "player" }[];
  characters: { id: string; name: string; playerId?: string | undefined }[];
}

export interface TypedLine {
  id: string;
  speaker: string;
  text: string;
  as?: string;
}

/** How one typed name was read, for the GM to check. */
export interface NameReading {
  name: string;
  /** Who is speaking: a member's user id. */
  speaker: string;
  /** Spoken as: a character id, or the name of someone the GM voices. */
  as?: string;
  kind: "character" | "member" | "gm" | "voiced";
  lines: number;
}

export interface TypedTalk {
  speakers: { id: string; role: "gm" | "player"; name: string }[];
  lines: TypedLine[];
  readings: NameReading[];
}

const STAMP = /^\s*(?:\[\s*\d{1,2}(?::\d{2}){1,2}(?:\.\d+)?\s*\]|\(\s*\d{1,2}(?::\d{2}){1,2}\s*\)|\d{1,2}(?::\d{2}){1,2}(?:\.\d+)?)\s*[-–]?\s*/;
const NAMED = /^([^:]{1,40}?)\s*:\s*(.*)$/;
const GM_NAMES = new Set(["gm", "dm", "game master", "the gm"]);

const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function readTypedTalk(text: string, roster: TalkRoster): TypedTalk {
  const gm = roster.members.find((m) => m.role === "gm");
  const gmId = gm?.userId ?? "gm";
  const speakers = roster.members.map((m) => ({ id: m.userId, role: m.role, name: m.name }));
  if (!gm) speakers.push({ id: gmId, role: "gm", name: "GM" });

  const byCharacter = new Map<string, TalkRoster["characters"][number]>();
  for (const c of roster.characters) byCharacter.set(fold(c.name), c);
  for (const c of roster.characters) {
    const first = fold(c.name).split(" ")[0]!;
    if (!byCharacter.has(first)) byCharacter.set(first, c);
  }
  const byMember = new Map(roster.members.map((m) => [fold(m.name), m]));
  for (const m of roster.members) {
    const first = fold(m.name).split(" ")[0]!;
    if (!byMember.has(first) && !byCharacter.has(first)) byMember.set(first, m);
  }

  const readings = new Map<string, NameReading>();
  const read = (name: string): NameReading => {
    const key = fold(name);
    const known = readings.get(key);
    if (known) return known;
    let r: NameReading;
    const c = byCharacter.get(key);
    const m = byMember.get(key);
    if (c) r = { name, speaker: c.playerId ?? gmId, as: c.id, kind: "character", lines: 0 };
    else if (m) r = { name, speaker: m.userId, kind: m.role === "gm" ? "gm" : "member", lines: 0 };
    else if (GM_NAMES.has(key)) r = { name, speaker: gmId, kind: "gm", lines: 0 };
    else r = { name: name.trim(), speaker: gmId, as: name.trim(), kind: "voiced", lines: 0 };
    readings.set(key, r);
    return r;
  };

  const lines: TypedLine[] = [];
  let current: NameReading | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const bare = raw.replace(STAMP, "").trim();
    if (!bare) continue;
    const m = NAMED.exec(bare);
    let said = bare;
    // A name is a few words at most; a colon later in a sentence is not a speaker.
    if (m && m[2]!.trim() && m[1]!.trim().split(/\s+/).length <= 4) {
      current = read(m[1]!);
      said = m[2]!.trim();
    }
    const who = current ?? read("GM");
    who.lines++;
    lines.push({ id: `L${lines.length + 1}`, speaker: who.speaker, text: said, ...(who.as ? { as: who.as } : {}) });
  }
  return { speakers, lines, readings: [...readings.values()].filter((r) => r.lines > 0) };
}
