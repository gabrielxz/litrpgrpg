import { tableWordsIn } from "../text.ts";

/** A warning under text the System will show a player: the table's words it uses, if any. The GM may keep them (a title named Thin Margin). */
export function TableWords({ text }: { text: string }) {
  const words = tableWordsIn(text);
  if (!words.length) return null;
  return <p className="warning small">The table's words: {words.join(", ")}. The System speaks in-world units.</p>;
}
