/** The design system's small repeated pieces (gb.css): meters, a vital row, icons, the clave. */
import type { CSSProperties, ReactNode } from "react";

export type MeterKind = "health" | "aether" | "ve" | "level" | "danger";

const pct = (value: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);

/** A meter is the glance; the number beside it is the value. */
export function Meter({ kind, value, max, thin }: { kind: MeterKind; value: number; max: number; thin?: boolean }) {
  return (
    <div className={`meter meter--${kind}${thin ? " meter--thin" : ""}`} style={{ "--v": `${pct(value, max)}%` } as CSSProperties}>
      <i />
    </div>
  );
}

/** A label, its meter, and the value: `31 / 44`, or the text given in its place. */
export function Vital({ label, kind, value, max, text, danger }: { label: ReactNode; kind: MeterKind; value: number; max: number; text?: string; danger?: boolean }) {
  return (
    <div className="vital">
      <span>{label}</span>
      <Meter kind={danger ? "danger" : kind} value={value} max={max} />
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
