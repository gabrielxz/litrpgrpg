import { tableWordsIn } from "../text.ts";
import { Icon } from "../ui.tsx";

/** A warning under text the System will show a player: the table's words it uses, if any. The GM may keep them (a title named Thin Margin). */
export function TableWords({ text }: { text: string }) {
  const words = tableWordsIn(text);
  if (!words.length) return null;
  return (
    <p className="warning small">
      <Icon name="warning" />
      The table's words: {words.join(", ")}. The System speaks in-world units.
    </p>
  );
}
