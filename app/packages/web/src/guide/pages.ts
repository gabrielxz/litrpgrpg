/**
 * The user guide's pages (app/DESIGN.md, M4, "User guide"): Markdown under `pages/`, in the
 * order and groups the guide's contents show. Screenshots live in `public/guide-shots/`, taken by
 * `app/scripts/guide-shots.mjs` from a campaign seeded with the rehearsal pack.
 */
import { type Block, parse } from "./markdown.tsx";

const sources = import.meta.glob("./pages/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const SHOT_BASE = "/guide-shots/";

export const GROUPS: { label: string; ids: string[] }[] = [
  { label: "Getting started", ids: ["start"] },
  { label: "Running a campaign", ids: ["gm-setup", "gm-session", "gm-listening"] },
  { label: "Play", ids: ["gm-party", "gm-record", "gm-combat", "gm-suggestions", "gm-events"] },
  { label: "Record", ids: ["gm-quests", "gm-principles", "gm-classes", "gm-hve", "gm-log"] },
  { label: "Prepare", ids: ["gm-prep", "gm-bestiary"] },
  { label: "Table", ids: ["gm-table", "gm-rules", "gm-player-view"] },
  { label: "The player's screen", ids: ["player-screen", "player-character", "player-fight", "player-moments", "player-listening", "player-rules"] },
];

export interface GuidePage {
  id: string;
  title: string;
  blocks: Block[];
}

export const PAGES: Map<string, GuidePage> = new Map(
  GROUPS.flatMap((g) => g.ids).flatMap((id) => {
    const md = sources[`./pages/${id}.md`];
    if (md === undefined) return [];
    const blocks = parse(md);
    const h1 = blocks[0]?.kind === "h1" ? blocks[0].text : id;
    return [[id, { id, title: h1, blocks: blocks[0]?.kind === "h1" ? blocks.slice(1) : blocks }]];
  }),
);

/** Every page's Markdown by id, including any not in the contents (for the guide's test). */
export const SOURCES: Map<string, string> = new Map(Object.entries(sources).map(([k, v]) => [k.slice(8, -3), v]));

/** The guide page for where the reader is: a GM's section, a player's screen, or the start. */
export function guideFor(where: { role?: "gm" | "player" | undefined; section?: string | undefined }): string {
  if (where.role === "player") return "player-screen";
  if (where.role === "gm") {
    const id = where.section === "player" ? "gm-player-view" : `gm-${where.section ?? "party"}`;
    return PAGES.has(id) ? id : "gm-party";
  }
  return "start";
}
