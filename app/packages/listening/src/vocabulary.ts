/**
 * The words a table says that a speech-to-text model has not heard: the campaign's names first,
 * then the game's terms, then the names in the rules data (creatures, classes, titles, items).
 * The order is the priority a vendor's term limit cuts at. The same list scores a transcript's
 * term accuracy (transcript-score.ts).
 */
import type { Engine } from "@gradebreaker/engine";

/** The mechanics' own words, which the data holds as keys and prose rather than as names. */
const CORE = [
  "Aether",
  "Volatile Energy",
  "VE",
  "Consolidation",
  "Breakthrough",
  "Distillation",
  "Insight",
  "Principle",
  "Battle Memory",
  "Clash",
  "Surge",
  "Yield",
  "Downed",
  "Exposed",
  "Momentum",
  "Beat",
  "Grade",
  "Tolerance",
  "Saturation",
  "Resonance",
  "Hidden Achievement",
  "Personal Opportunity",
  "System",
];

type Named = { name?: string; title?: string };

function names(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((x: Named) => x?.name ?? x?.title).filter((x): x is string => typeof x === "string");
}

/** Every term, deduplicated case-insensitively, the campaign's names first. */
export function vocabulary(engine: Engine, campaignNames: string[] = []): string[] {
  const r = engine.rules as Record<string, any>;
  const catalog = Object.values(r.titles?.achievement_catalog ?? {}).flatMap((group) => names(group));
  const all = [
    ...campaignNames,
    ...CORE,
    ...names(r.character?.attributes),
    ...names(r.principles?.families),
    ...names(r.bestiary?.creatures),
    ...names(r.classes?.classes),
    ...names(r.titles?.tutorial_titles),
    ...catalog,
    ...names(r.items?.healing_pills),
    ...names(r.items?.aether_pills),
    ...names(r.items?.field_gear),
  ];
  const seen = new Set<string>();
  return all.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
