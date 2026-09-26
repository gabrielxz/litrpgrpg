/**
 * Item names from the Items chapter's tables, offered as suggestions wherever the table types
 * an item: a find, a quest reward, a drop. Any other name is accepted; the record keeps names
 * and counts, and the table reads an item's rules from the book.
 */
import type { Engine } from "@gradebreaker/engine";

export function catalogNames(engine: Engine | null): string[] {
  if (!engine) return [];
  const items = engine.rules.items;
  const names = (list: { name: string }[] | undefined) => (list ?? []).map((x) => x.name);
  return [
    ...names(items.healing_pills),
    ...names(items.aether_pills),
    ...names(items.foundation_pills),
    ...names(items.skill_shards?.types),
    ...names(items.field_gear),
    ...names(items.weapons),
    ...names(items.artifacts?.sensory_tools),
  ];
}

export const stackLine = (s: { name: string; count: number }) => (s.count === 1 ? s.name : `${s.name} ×${s.count}`);
