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
    <div className="sys-section">
      <h3>Inspect</h3>
      <select value={id} onChange={(e) => setId(e.target.value)} aria-label="Inspect whom">
        <option value="">Look at…</option>
        {c.inspection.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      {r &&
        (!r.resolves ? (
          <p className="sys-dim">
            <em>{r.name}: does not resolve.</em>
          </p>
        ) : r.titles.length === 0 ? (
          <p className="sys-dim">
            <em>{r.name}: no titles read.</em>
          </p>
        ) : (
          <ul className="items">
            {r.titles.map((t) => (
              <li key={t.name}>
                <span className="grow">{t.name}</span>
                <span className={t.negative ? "sys-alert small" : "sys-dim small"}>{t.negative ? "negative" : t.category}</span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
