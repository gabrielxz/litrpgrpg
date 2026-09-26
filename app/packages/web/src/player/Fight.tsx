/**
 * The fight on a player's screen: the table's shape (turn order, Momentum, who is acting,
 * where everyone stands) and the player's own part in it. A player acts for their own
 * characters: takes their activation, attacks, moves, finishes; defends and Yields when a
 * Clash is aimed at them; takes or gives a pill, stabilizes or executes the Downed, and makes
 * the Will Save again. The GM records anything a player does not.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type InterfaceSheet, type PlayerView, stabilizeAttribute } from "@gradebreaker/record";
import { useState } from "react";
import { newActionId, submit } from "../api.ts";
import { CareActions, type Mate, pillsOf } from "../Care.tsx";
import { AttackForm, type Clasher, DefenseForm, YieldChoice } from "../Clash.tsx";

type Combat = NonNullable<PlayerView["combat"]>;

function useAct(campaignId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      await submit(campaignId, newActionId(), action);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error };
}

const clasher = (c: InterfaceSheet): Clasher => ({ kind: "character", name: c.name, force: c.force, aether: c.aether, surgeCost: c.surgeCost });

/** Flanking from the Zones: another hostile of the target shares its Zone. */
function flanks(combat: Combat, attackerId: string, defenderId: string): boolean {
  const d = combat.combatants.find((c) => c.id === defenderId);
  if (!d?.zoneId) return false;
  return combat.combatants.some((c) => !c.out && c.id !== attackerId && c.sideId !== d.sideId && c.zoneId === d.zoneId);
}

const mateOf = (x: Combat["combatants"][number]): Mate => ({
  id: x.id,
  name: x.name,
  sideId: x.sideId,
  zoneId: x.zoneId,
  out: x.out,
  downed: x.downed,
  stabilized: x.stabilized,
  suppressed: x.suppressed,
  ...(x.characterId ? { characterId: x.characterId } : {}),
  ...(x.pills ? { pills: x.pills } : {}),
});

function MyTurn({
  view,
  engine,
  combat,
  c,
  combatantId,
}: {
  view: PlayerView;
  engine: Engine | null;
  combat: Combat;
  c: InterfaceSheet;
  combatantId: string;
}) {
  const { run, busy, error } = useAct(view.campaign.id);
  const [attacking, setAttacking] = useState(false);
  const me = combat.combatants.find((x) => x.id === combatantId)!;
  const [zone, setZone] = useState("");
  const targets = combat.combatants.filter((x) => !x.out && x.sideId !== me.sideId).map((x) => ({ id: x.id, name: x.name }));
  const otherZones = combat.zones.filter((z) => z.id !== me.zoneId);
  const picked = otherZones.some((z) => z.id === zone) ? zone : (otherZones[0]?.id ?? "");
  const beats = me.beats ?? 0;
  return (
    <div className="my-turn">
      <p className="small">
        {c.name} is acting: {beats} Beat{beats === 1 ? "" : "s"} left.
      </p>
      {attacking ? (
        <AttackForm
          attacker={clasher(c)}
          targets={targets}
          suggestFlanking={(d) => flanks(combat, me.id, d)}
          busy={busy}
          onCancel={() => setAttacking(false)}
          onDeclare={async (d) => {
            const ok = await run({
              type: "combat.attack",
              attackerId: me.id,
              defenderId: d.defenderId,
              attack: d.attack,
              ...(d.flanking ? { flanking: true } : {}),
              ...(d.label ? { label: d.label } : {}),
            });
            if (ok) setAttacking(false);
          }}
        />
      ) : (
        <div className="row tight">
          <button className="primary" disabled={busy || beats < 1} onClick={() => setAttacking(true)}>
            Attack…
          </button>
          {otherZones.length > 0 && (
            <>
              <select value={picked} onChange={(e) => setZone(e.target.value)} aria-label="Zone to move to">
                {otherZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
              <button disabled={busy || beats < 1} onClick={() => run({ type: "combat.move", combatantId: me.id, zoneId: picked })}>
                Move (1 Beat)
              </button>
            </>
          )}
          <button disabled={busy} onClick={() => run({ type: "combat.done", combatantId: me.id })}>
            Done
          </button>
        </div>
      )}
      {!attacking && (
        <CareActions
          me={{ ...mateOf(me), force: c.force }}
          people={combat.combatants.map(mateOf)}
          pills={pillsOf(engine)}
          pillLimit={engine?.rules.items.pill_use.per_fight_limit_per_kind ?? 2}
          stabilizeWith={engine ? stabilizeAttribute(engine) : "DEX"}
          beats={beats}
          busy={busy}
          run={run}
        />
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Defending({ view, combat, c }: { view: PlayerView; combat: Combat; c: InterfaceSheet }) {
  const { run, busy, error } = useAct(view.campaign.id);
  const cl = combat.clash!;
  return (
    <div className="my-turn">
      <p className="small">
        <strong>{cl.attackerName}</strong> attacks {c.name}
        {cl.label ? ` (${cl.label})` : ""}.
      </p>
      {cl.stage === "defense" ? (
        <DefenseForm defender={clasher(c)} busy={busy} onDefend={(s) => run({ type: "combat.defend", defense: s })} />
      ) : (
        <>
          <p className="small">
            {cl.attackTotal} against {cl.defenseTotal}: Margin {cl.margin}. Yield gives up Beats from {c.name}'s next turn, 20 Margin each.
          </p>
          <YieldChoice
            margin={cl.margin ?? 0}
            cap={cl.yieldCap ?? 0}
            multiplier={cl.damageMultiplier ?? 1}
            busy={busy}
            onYield={(y) => run({ type: "combat.resolve", yield: y })}
          />
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function Fight({ view, engine, combat, readOnly }: { view: PlayerView; engine: Engine | null; combat: Combat; readOnly?: boolean }) {
  const { run, busy } = useAct(view.campaign.id);
  const mine = new Map(view.characters.map((c) => [c.id, c]));
  const zoneName = (id: string | null) => combat.zones.find((z) => z.id === id)?.name;
  const someoneActing = combat.combatants.some((c) => c.acting);
  const cl = combat.clash;
  const defending = cl && !readOnly ? combat.combatants.find((c) => c.id === cl.defenderId && c.characterId && mine.has(c.characterId)) : undefined;
  const actingMine = !readOnly ? combat.combatants.find((c) => c.acting && c.characterId && mine.has(c.characterId)) : undefined;
  const last = combat.lastClash;

  return (
    <section className="table-dice fight">
      <h3>
        {combat.name} · {combat.round ? `Round ${combat.round}` : "Starting"}
      </h3>
      {combat.pendingShift && combat.pendingShift !== combat.order[0]?.id && (
        <p className="small">Momentum shifts to {combat.order.find((s) => s.id === combat.pendingShift)?.name} next round.</p>
      )}
      {combat.order.map((s, i) => (
        <div key={s.id} className={`fight-side ${s.id === combat.turnSide ? "taking" : ""}`}>
          <div className="fight-side-name">
            {s.name}
            {combat.round > 0 && i === 0 && <span className="fight-badge">Momentum</span>}
            {s.id === combat.turnSide && <span className="fight-badge">Turn</span>}
          </div>
          <ul>
            {combat.combatants
              .filter((c) => c.sideId === s.id && !c.out)
              .map((c) => {
                const own = c.characterId && mine.has(c.characterId);
                const onTurn = s.id === combat.turnSide || (combat.round === 0 && c.surprise);
                const canAct = own && !readOnly && onTurn && !c.acted && !c.downed && !someoneActing && !cl;
                return (
                  <li key={c.id} className={c.acting ? "acting" : c.acted ? "acted" : ""}>
                    {c.acting ? "▸ " : ""}
                    {c.name}
                    {c.exposed && <span className="fight-badge warn">Exposed</span>}
                    {c.downed && <span className="fight-badge warn">{c.stabilized ? "Downed, stable" : "Downed"}</span>}
                    {c.suppressed && <span className="fight-badge warn">Suppressed</span>}
                    {c.surprise && !c.acted && <span className="fight-badge">Surprise</span>}
                    {c.zoneId && combat.zones.length > 1 && <span className="sys-dim small"> · {zoneName(c.zoneId)}</span>}
                    {c.beats !== undefined && (
                      <span className="pips">
                        {Array.from({ length: Math.max(c.beatsPerTurn ?? 0, c.beats) }, (_, j) => (
                          <span key={j} className={j < c.beats! ? "pip on" : "pip"} />
                        ))}
                      </span>
                    )}
                    {canAct && (
                      <button className="sys-confirm inline" disabled={busy} onClick={() => run({ type: "combat.act", combatantId: c.id })}>
                        Act
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      {cl && !defending && (
        <p className="small">
          {cl.attackerName} attacks {cl.defenderName}
          {cl.stage === "yield" ? `: ${cl.attackTotal} against ${cl.defenseTotal}` : ""}.
        </p>
      )}
      {defending && <Defending view={view} combat={combat} c={mine.get(defending.characterId!)!} />}
      {actingMine && !cl && <MyTurn view={view} engine={engine} combat={combat} c={mine.get(actingMine.characterId!)!} combatantId={actingMine.id} />}
      {last && !cl && (
        <p className="small sys-dim">
          {last.attackerWins
            ? `${last.attackerName} hit ${last.defenderName}: ${last.damage} damage${last.yielded ? ` after ${last.yielded} Beat${last.yielded === 1 ? "" : "s"} Yielded` : ""}${last.drivenBack ? ", Driven Back" : ""}.`
            : `${last.defenderName} turned ${last.attackerName}'s attack${last.turnedAside ? " aside" : ""}.`}
        </p>
      )}
    </section>
  );
}
