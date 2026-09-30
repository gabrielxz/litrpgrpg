/** The design system's small repeated pieces (gb.css): meters, a vital row, icons, the clave. */
import { type CSSProperties, type ReactNode, createContext, useContext } from "react";

export type MeterKind = "health" | "aether" | "ve" | "level" | "danger";

const pct = (value: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);

/** A meter is the glance; the number beside it is the value. */
export function Meter({ kind, value, max, thin, className, vars }: { kind: MeterKind; value: number; max: number; thin?: boolean; className?: string; vars?: Record<string, string> }) {
  return (
    <div className={`meter meter--${kind}${thin ? " meter--thin" : ""}${className ? ` ${className}` : ""}`} style={{ "--v": `${pct(value, max)}%`, "--v-new": `${pct(value, max)}%`, ...vars } as CSSProperties}>
      <i />
    </div>
  );
}

/** A label, its meter, and the value: `31 / 44`, or the text given in its place. */
export function Vital({
  label,
  kind,
  value,
  max,
  text,
  danger,
  meterClass,
  vars,
}: {
  label: ReactNode;
  kind: MeterKind;
  value: number;
  max: number;
  text?: string;
  danger?: boolean;
  /** A moment's classes on the meter (moments.ts). */
  meterClass?: string;
  vars?: Record<string, string>;
}) {
  return (
    <div className="vital">
      <span>{label}</span>
      <Meter kind={danger ? "danger" : kind} value={value} max={max} className={meterClass} vars={vars} />
      <span className="vital__value" style={danger ? { color: "var(--danger)" } : undefined}>
        {text ?? (
          <>
            <b style={danger ? { color: "inherit" } : undefined}>{value}</b> / {max}
          </>
        )}
      </span>
    </div>
  );
}

/** A functional icon from gb.css (`ic-health`, `ic-downed`, ...): meanings are fixed. */
export function Icon({ name }: { name: string }) {
  return <i className={`ic ic-${name}`} aria-hidden="true" />;
}

export function Clave({ style }: { style?: CSSProperties }) {
  return <i className="clave" aria-hidden="true" style={style} />;
}

/**
 * Each character's mark by id (marksOf in the record): the GM's screen gives every sheet's, a
 * player's view the ones it names. A mark is one of four colors, solid for the first four
 * characters and hollow for the next four (gb.css, "character marks").
 */
export const Marks = createContext<Record<string, number>>({});

const markStyle = (n: number) => ({ "--id": `var(--id-${(n % 4) + 1})` }) as CSSProperties;
const hollow = (n: number) => n % 8 >= 4;

/** The mark beside a character's name; nothing for a creature, an NPC, or anyone unmarked. */
export function Mark({ id, large }: { id: string | undefined; large?: boolean }) {
  const n = useContext(Marks)[id ?? ""];
  if (n === undefined) return null;
  return <i className={`idm${hollow(n) ? " idm--hollow" : ""}${large ? " idm--lg" : ""}`} style={markStyle(n)} aria-hidden="true" />;
}

/** A tracker row's classes and color for its character: the stripe takes the mark's color. */
export function useMarkRow(id: string | undefined): { className: string; style?: CSSProperties } {
  const n = useContext(Marks)[id ?? ""];
  if (n === undefined) return { className: "" };
  return { className: ` track--pc${hollow(n) ? " track--pc-hollow" : ""}`, style: markStyle(n) };
}
