/**
 * After the fight (Cultivation, "Combat Kills"; The System AI, "Loot"): the GM reads each
 * kill's tier, marks a boss, confirms the finishing blow, ticks who took part, rolls the loot,
 * enters what dropped, and settles it all as one action. The VE each participant collects is
 * computed at their own tier and can be overridden before it is recorded.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type Envelope, type GmView, type KillEntry, encounterAwards, lootRow } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import { catalogNames } from "../items.ts";
import type { Names } from "../text.ts";
import { Commit } from "./Commit.tsx";

type Aftermath = NonNullable<GmView["aftermath"]>;

const int = (s: string) => (s.trim() === "" ? Number.NaN : Math.trunc(Number(s)));

export function AftermathPanel({ view, engine, names, onRecorded }: { view: GmView; engine: Engine; names: Names; onRecorded: (env: Envelope) => void }) {
  const e: Aftermath = view.aftermath!;
  const tierNames: string[] = engine.rules.cultivation.awards.kill_tiers.map((t: { difficulty: string }) => t.difficulty);
  const bestiary: { name: string; tier: string }[] = engine.rules.bestiary.creatures;
  const dead = e.combatants.filter((c) => c.dead && !c.characterId);
  const fighters = e.combatants.filter((c) => c.characterId);
  const sheet = (id: string) => view.characters.find((s) => s.id === id);

  const [kills, setKills] = useState<KillEntry[]>(() =>
    dead.map((c) => ({
      combatantId: c.id,
      tier: bestiary.find((b) => b.name === c.creature)?.tier ?? "Moderate",
      ...(c.killedBy ? { byId: c.killedBy } : {}),
    })),
  );
  const [took, setTook] = useState<Set<string>>(() => new Set(fighters.filter((c) => !sheet(c.characterId!)?.dead).map((c) => c.characterId!)));
  const [override, setOverride] = useState<Record<string, string>>({});
  const [spoils, setSpoils] = useState<{ name: string; count: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participants = fighters.filter((c) => took.has(c.characterId!)).map((c) => ({ characterId: c.characterId!, grade: c.grade }));
  const computed = encounterAwards(engine, e, participants, kills);
  const awards = computed.map((w) => {
    const o = int(override[w.characterId] ?? "");
    return { characterId: w.characterId, ve: Number.isNaN(o) ? w.ve : o };
  });
  const items = spoils.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), count: int(s.count) }));
  const problem =
    awards.some((w) => w.ve < 0) || items.some((s) => !(s.count >= 1))
      ? "VE and item counts are whole numbers; an item counts from 1."
      : null;
  const took_ = new Set(participants.map((p) => p.characterId));
  // A tier set for someone since unticked does not travel with the kill.
  const settledKills = kills.map((k) => {
    if (!k.tiers) return k;
    const tiers = Object.fromEntries(Object.entries(k.tiers).filter(([c]) => took_.has(c)));
    const { tiers: _, ...rest } = k;
    return Object.keys(tiers).length ? { ...rest, tiers } : rest;
  });
  const settle: Action = { type: "encounter.settle", encounterId: e.id, participants: [...took_], kills: settledKills, awards, spoils: items };
  const setKill = (i: number, k: Partial<KillEntry>) => setKills(kills.map((x, j) => (j === i ? { ...x, ...k } : x)));
  const survivors = fighters.filter((c) => c.wasDowned && !c.dead);

  const rollLoot = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await submit(view.campaign.id, newActionId(), {
        type: "encounter.loot",
        encounterId: e.id,
        kills: kills.map((k) => ({ combatantId: k.combatantId, tier: k.tier, ...(k.boss ? { boss: true } : {}) })),
      });
      onRecorded(r.envelope);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card aftermath">
      <h2>After {e.name}</h2>
      <h3>Kills</h3>
      {kills.length === 0 ? (
        <p className="muted small">Nobody died, so there is no kill to award or loot to roll.</p>
      ) : (
        <table className="rows">
          <thead>
            <tr>
              <th>Killed</th>
              <th>Tier for the party</th>
              <th>Boss</th>
              <th>Finishing blow</th>
              <th>Tier differs for</th>
            </tr>
          </thead>
          <tbody>
            {kills.map((k, i) => {
              const c = e.combatants.find((x) => x.id === k.combatantId)!;
              return (
                <tr key={k.combatantId}>
                  <td>
                    {c.name} <span className="muted small">{c.grade}-Grade</span>
                  </td>
                  <td>
                    <select value={k.tier} onChange={(ev) => setKill(i, { tier: ev.target.value })} aria-label={`${c.name}'s tier`}>
                      {tierNames.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className="check" title="A boss (rare, named, or designed for the moment) pays 1.5× and drops one row higher">
                      <input type="checkbox" checked={Boolean(k.boss)} onChange={(ev) => setKill(i, { boss: ev.target.checked })} /> ×1.5
                    </label>
                  </td>
                  <td>
                    <select
                      value={k.byId ?? ""}
                      onChange={(ev) => {
                        const { byId: _, ...rest } = k;
                        setKills(kills.map((x, j) => (j === i ? (ev.target.value ? { ...rest, byId: ev.target.value } : rest) : x)));
                      }}
                      aria-label={`Who killed ${c.name}`}
                    >
                      <option value="">Nobody in particular</option>
                      {e.combatants
                        .filter((x) => x.id !== c.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td>
                    {participants.map((p) => (
                      <label key={p.characterId} className="small">
                        {names(p.characterId)}{" "}
                        <select
                          value={k.tiers?.[p.characterId] ?? ""}
                          onChange={(ev) => {
                            const tiers = { ...(k.tiers ?? {}) };
                            if (ev.target.value) tiers[p.characterId] = ev.target.value;
                            else delete tiers[p.characterId];
                            const { tiers: _, ...rest } = k;
                            setKills(kills.map((x, j) => (j === i ? (Object.keys(tiers).length ? { ...rest, tiers } : rest) : x)));
                          }}
                        >
                          <option value="">same</option>
                          {tierNames.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3>Took part</h3>
      <div className="row tight">
        {fighters.map((c) => {
          const gone = sheet(c.characterId!)?.dead;
          return (
            <label key={c.id} className="check">
              <input
                type="checkbox"
                disabled={gone}
                checked={took.has(c.characterId!)}
                onChange={(ev) => {
                  const next = new Set(took);
                  if (ev.target.checked) next.add(c.characterId!);
                  else next.delete(c.characterId!);
                  setTook(next);
                }}
              />{" "}
              {c.name}
              {gone ? " (died)" : ""}
            </label>
          );
        })}
      </div>
      <p className="muted small">Fighting, guarding, scouting the escape route, and controlling the field all count; being elsewhere does not.</p>

      {participants.length > 0 && (
        <>
          <h3>VE</h3>
          <table className="rows">
            <tbody>
              {computed.map((w) => (
                <tr key={w.characterId}>
                  <td>{names(w.characterId)}</td>
                  <td className="num">{w.ve} VE at their tier</td>
                  <td>
                    <input
                      type="number"
                      className="narrow-input"
                      min={0}
                      value={override[w.characterId] ?? ""}
                      placeholder={String(w.ve)}
                      onChange={(ev) => setOverride({ ...override, [w.characterId]: ev.target.value })}
                      aria-label={`${names(w.characterId)}'s VE`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>Loot</h3>
      {kills.length > 0 &&
        (e.loot ? (
          <ul className="small">
            {e.loot.map((r) => (
              <li key={r.combatantId}>
                <strong>{names(r.combatantId)}</strong> ({r.row}
                {r.die === null ? "" : `, rolled ${r.die}`}): {r.drop}
              </li>
            ))}
          </ul>
        ) : (
          <div className="row tight">
            <button className="primary" disabled={busy} onClick={rollLoot}>
              Roll loot
            </button>
            <span className="muted small">
              One roll per kill;{" "}
              {kills
                .map((k) => {
                  const r = lootRow(engine, k.tier, Boolean(k.boss));
                  return r.chance === undefined ? null : `${names(k.combatantId)} has a ${r.chance}% chance`;
                })
                .filter(Boolean)
                .join(", ") || "no kill here has a chance to roll"}
              .
            </span>
          </div>
        ))}
      {error && <p className="error">{error}</p>}
      <p className="muted small">Enter what dropped. It goes into the spoils, and the players divide it on their screens.</p>
      <datalist id="item-catalog">
        {catalogNames(engine).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {spoils.map((s, i) => (
        <div key={i} className="row tight">
          <input list="item-catalog" value={s.name} onChange={(ev) => setSpoils(spoils.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} placeholder="Lesser Healing Pill" aria-label="Item" />
          <input type="number" className="narrow-input" min={1} value={s.count} onChange={(ev) => setSpoils(spoils.map((x, j) => (j === i ? { ...x, count: ev.target.value } : x)))} aria-label="How many" />
          <button onClick={() => setSpoils(spoils.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <button onClick={() => setSpoils([...spoils, { name: "", count: "1" }])}>Add an item</button>

      {survivors.length > 0 && (
        <p className="small">
          {survivors.map((c) => c.name).join(" and ")} survived Downed: a Battle Memory Card is due, unless the Downing taught nothing.
        </p>
      )}
      <Commit campaignId={view.campaign.id} action={settle} problem={problem} names={names} label={`Settle ${e.name}`} onRecorded={onRecorded} />
    </section>
  );
}
