/**
 * Inspection for the GM (What Can Be Seen, "What You See of Others"): what one being reads of a
 * character's titles, by the Grade gap. The observer is a character, or an NPC or creature of a
 * given Grade, since a title changes an NPC's reaction only if that NPC can see it. Nothing is recorded.
 */
import type { Engine } from "@gradebreaker/engine";
import { type GmView, titlesRead } from "@gradebreaker/record";
import { useState } from "react";

export function InspectionForm({ view, engine }: { view: GmView; engine: Engine }) {
  const grades = (engine.rules.grades.grades as { code: string }[]).map((g) => g.code);
  const [observer, setObserver] = useState(view.characters[0]?.id ?? "grade");
  const [grade, setGrade] = useState(grades[0]!);
  const [targetId, setTargetId] = useState(view.characters[1]?.id ?? view.characters[0]?.id ?? "");
  const target = view.characters.find((c) => c.id === targetId);
  if (!target) return <p className="muted">No characters yet.</p>;
  const from = view.characters.find((c) => c.id === observer);
  const inspectorGrade = from ? from.grade : grade;
  const read = titlesRead(engine, inspectorGrade, target.grade, target.titles);
  const active = target.titles.filter((t) => t.status === "active");
  const unread = read ? active.filter((t) => !read.some((r) => r.name === t.name)) : active;
  return (
    <div className="form">
      <div className="form-row">
        <label>
          Who looks
          <select value={observer} onChange={(e) => setObserver(e.target.value)}>
            {view.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.grade})
              </option>
            ))}
            <option value="grade">An NPC or creature</option>
          </select>
        </label>
        {!from && (
          <label>
            Its Grade
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              {grades.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          At whom
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            {view.characters
              .filter((c) => c.id !== observer)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.grade})
                </option>
              ))}
          </select>
        </label>
      </div>
      {read === null ? (
        <p>
          <em>It does not resolve.</em> {target.name} is a Grade or more above; the look reads nothing, which tells the observer that much.
        </p>
      ) : read.length === 0 ? (
        <p>No titles read.</p>
      ) : (
        <ul>
          {read.map((t) => (
            <li key={t.name}>
              {t.name} <span className="muted small">{t.negative ? "negative" : t.category}</span>
            </li>
          ))}
        </ul>
      )}
      {unread.length > 0 && <p className="muted small">Not read at this gap: {unread.map((t) => t.name).join(", ")}.</p>}
      <p className="muted small">Inspection shows titles only: never Attributes, Health, Aether, Insight, class, or the quest log. It costs no Beat.</p>
    </div>
  );
}
