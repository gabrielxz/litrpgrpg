/**
 * Inspection on the player's interface (What Can Be Seen, "What You See of Others"): a glance at
 * another being within sight, costing nothing. The server has already filtered each read by the
 * Grade gap; a being a Grade or more above does not resolve.
 */
import type { InspectRead, InterfaceSheet } from "@gradebreaker/record";
import { useState } from "react";

export function Inspect({ c }: { c: InterfaceSheet }) {
  const [id, setId] = useState("");
  if (!c.inspection.length || c.dead) return null;
  const r: InspectRead | undefined = c.inspection.find((x) => x.id === id);
  return (
    <section className="sys-section">
      <h2 className="sys-label">Inspect</h2>
      <div className="cluster">
        <select className="select inspect-pick" value={id} onChange={(e) => setId(e.target.value)} aria-label="Inspect whom">
          <option value="">Look at…</option>
          {c.inspection.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </div>
      {r &&
        (r.nothing ? (
          <p className="voice dim">{r.name}: no life reads.</p>
        ) : !r.resolves ? (
          <p className="voice dim">{r.name}: does not resolve.</p>
        ) : r.titles.length === 0 ? (
          <p className="voice dim">{r.name}: no titles read.</p>
        ) : (
          <ul>
            {r.titles.map((t) => (
              <li key={t.name} className="sys-row">
                <span className="sys-row__main">{t.name}</span>
                <span className="sys-row__side" style={t.negative ? { color: "var(--danger)" } : undefined}>
                  {t.negative ? "negative" : t.category}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
