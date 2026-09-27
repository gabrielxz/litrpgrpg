/**
 * The encounter builder's reading (Bestiary, "GM Reference: Encounter Building"): where a fight's
 * creatures sit in the sizing table for the party at hand, and what the table leaves to the GM.
 */
import type { Engine } from "@gradebreaker/engine";
import { type CombatantSpec, type Sheet, type SizedCreature, partyLevelOf, sizeEncounter } from "@gradebreaker/record";
import { useState } from "react";

const LABEL: Record<string, string> = {
  below: "Easier than the easy column",
  easy: "An easy fight",
  standard: "A standard fight",
  hard: "A hard fight",
  above: "Past the hard column",
};

interface BestiaryEntry {
  name: string;
  tier: string;
  grade: string;
  beats: number;
  offense: { force: number }[];
  defense: { force: number }[];
}

/** A combatant spec as the sizing table reads it: a Bestiary entry's block, or what the GM typed. */
export function sizedOf(engine: Engine, spec: CombatantSpec): SizedCreature {
  const entry = (engine.rules.bestiary.creatures as BestiaryEntry[]).find((b) => b.name === spec.creature);
  if (entry)
    return {
      name: spec.name ?? entry.name,
      tier: entry.tier,
      grade: entry.grade,
      beats: entry.beats,
      offense: entry.offense.map((o) => o.force),
      defense: entry.defense.map((d) => d.force),
    };
  return {
    name: spec.name ?? "someone",
    grade: spec.grade ?? "F",
    ...(spec.beats === undefined ? {} : { beats: spec.beats }),
    offense: (spec.offense ?? []).map((o) => o.force),
    defense: (spec.defense ?? []).map((d) => d.force),
  };
}

export function SizingPanel({ engine, party, creatures }: { engine: Engine; party: Sheet[]; creatures: SizedCreature[] }) {
  const computed = partyLevelOf(party.map((c) => c.level));
  const [override, setOverride] = useState<string>("");
  const level = Math.max(1, Math.min(25, Math.trunc(Number(override)) || computed));
  if (!party.length || !creatures.length) return null;
  const grade = party[0]!.grade;
  const s = sizeEncounter(engine, level, party.length, grade, creatures);
  return (
    <div className="sizing">
      <div className="row">
        <strong>{s.column ? LABEL[s.column] : "Not sized by the table"}</strong>
        <span className="muted small">
          for {party.length} at Level {level} ({s.row} row)
          {s.force !== undefined && `; the fight counts as Force ${s.force}`}
          {s.columns && `; this party's columns: easy ${s.columns.easy}, standard ${s.columns.standard}, hard ${s.columns.hard}`}
        </span>
        <label className="inline-label">
          Party level
          <input type="number" className="narrow-input" min={1} max={25} value={override} placeholder={String(computed)} onChange={(e) => setOverride(e.target.value)} />
        </label>
      </div>
      {s.notes.map((n) => (
        <p key={n} className="muted small">
          {n}
        </p>
      ))}
      <p className="muted small">
        A standard fight Downs a character in about one fight in five; a hard one doubles that. The Hard column assumes the top of the band; terrain with nowhere to be driven is deadlier.
      </p>
    </div>
  );
}
