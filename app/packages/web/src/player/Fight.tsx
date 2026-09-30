/**
 * The fight on a player's screen: the table's shape (turn order, Momentum, who is acting,
 * where everyone stands) and the player's own part in it. A player acts for their own
 * characters: takes their activation, attacks, moves, finishes; defends and Yields when a
 * Clash is aimed at them; takes or gives a pill, stabilizes or executes the Downed, and makes
 * the Will Save again. The GM records anything a player does not.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type InterfaceSheet, type PlayerView, pillLimit, shapes, stabilizeCheck } from "@gradebreaker/record";
import { useState } from "react";
import { Icon } from "../ui.tsx";
import { newActionId, submit } from "../api.ts";
import { permissionClash, reactionsOffered, techniqueOffer } from "../classes.ts";
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

const clasher = (c: InterfaceSheet, engine: Engine | null, combat: Combat): Clasher => ({
  kind: "character",
  name: c.name,
  force: c.force,
  aether: c.aether,
  surgeCost: c.surgeCost,
  shapes: engine ? shapes(engine) : [],
  proficiencies: c.proficiencies,
  ...(c.class ? { technique: techniqueOf(engine, c, combat) } : {}),
  ...permissionClash(c.class),
});

/** The character's class technique as this fight offers it. */
const techniqueOf = (engine: Engine | null, c: InterfaceSheet, combat: Combat) =>
  techniqueOffer(engine, c.class!, { aether: c.aether, usedThisFight: Boolean(combat.combatants.find((x) => x.characterId === c.id)?.techniqueUsed), inFight: true });

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
  const targets = combat.combatants.filter((x) => !x.out && x.sideId !== me.sideId).map((x) => ({ id: x.id, name: x.name, zoneId: x.zoneId }));
  const otherZones = combat.zones.filter((z) => z.id !== me.zoneId);
  const picked = otherZones.some((z) => z.id === zone) ? zone : (otherZones[0]?.id ?? "");
  const beats = me.beats ?? 0;
  const permission = c.class?.permission;
  const hook = permission?.hook;
  // Reach the Fallen: free only into a Zone holding a Downed ally.
  const freeMoveOk =
    hook?.kind === "free-move" &&
    (hook.into !== "downed-ally" || combat.combatants.some((x) => x.sideId === me.sideId && x.id !== me.id && x.downed && !x.out && x.zoneId === picked));
  return (
    <div className="fight-box stack">
      <p className="small">
        {c.name} is acting: {beats} Beat{beats === 1 ? "" : "s"} left.
      </p>
      {attacking ? (
        <AttackForm
          attacker={clasher(c, engine, combat)}
          targets={targets}
          suggestFlanking={(d) => flanks(combat, me.id, d)}
          {...(hook?.kind === "rush" && otherZones.length ? { rush: { name: permission!.name, zones: otherZones } } : {})}
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
              ...(d.rush ? { rush: d.rush } : {}),
            });
            if (ok) setAttacking(false);
          }}
        />
      ) : (
        <div className="form-row tight">
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
              {hook?.kind === "free-move" && (
                <button
                  disabled={busy || !freeMoveOk}
                  title={freeMoveOk ? permission!.effect : "Only into a Zone holding a Downed ally"}
                  onClick={() => run({ type: "combat.move", combatantId: me.id, zoneId: picked, permission: true })}
                >
                  Move by {permission!.name} (no Beat)
                </button>
              )}
            </>
          )}
          {hook?.kind === "free-disengage" && (
            <button disabled={busy} title={permission!.effect} onClick={() => run({ type: "combat.beat", combatantId: me.id, what: "Disengage", permission: true })}>
              Disengage by {permission!.name} (no Beat)
            </button>
          )}
          <button disabled={busy} onClick={() => run({ type: "combat.done", combatantId: me.id })}>
            Done
          </button>
        </div>
      )}
      {!attacking && engine && (
        <CareActions
          me={{ ...mateOf(me), force: c.force, items: c.items, ...(c.class ? { technique: techniqueOf(engine, c, combat) } : {}) }}
          people={combat.combatants.map(mateOf)}
          pills={pillsOf(engine)}
          pillLimit={pillLimit(engine)}
          stabilize={stabilizeCheck(engine)}
          beats={beats}
          busy={busy}
          run={run}
        />
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Defending({ view, engine, combat, c }: { view: PlayerView; engine: Engine | null; combat: Combat; c: InterfaceSheet }) {
  const { run, busy, error } = useAct(view.campaign.id);
  const cl = combat.clash!;
  return (
    <div className="fight-box stack">
      <p className="small">
        <strong>{cl.attackerName}</strong> attacks {c.name}
        {cl.label ? ` (${cl.label})` : ""}.
      </p>
      {cl.stage === "yield" && (
        <div className="clash-totals">
          <span className="num">{cl.attackTotal}</span>
          <span className="small dim">against</span>
          <span className="num">{cl.defenseTotal}</span>
        </div>
      )}
      {cl.stage === "defense" ? (
        <DefenseForm defender={clasher(c, engine, combat)} busy={busy} onDefend={(s) => run({ type: "combat.defend", defense: s })} />
      ) : (
        <>
          <p className="small">
            {cl.attackTotal} against {cl.defenseTotal}: Margin {cl.margin}
            {cl.cut ? `, ${cl.cut} cut by an ally, ${Math.max(0, (cl.margin ?? 0) - cl.cut)} left` : ""}. Yield gives up Beats from {c.name}'s next turn, 20 Margin each.
          </p>
          {cl.coverIds?.length ? <p className="small dim">An ally can still cut the Margin before you Yield.</p> : null}
          <YieldChoice
            margin={Math.max(0, (cl.margin ?? 0) - (cl.cut ?? 0))}
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

/** Off-turn, while no Clash waits: the class's reaction, or a technique used as one. */
function Reactions({ view, engine, combat, c, combatantId }: { view: PlayerView; engine: Engine | null; combat: Combat; c: InterfaceSheet; combatantId: string }) {
  const { run, busy, error } = useAct(view.campaign.id);
  const [using, setUsing] = useState<{ name: string; technique: boolean } | null>(null);
  const me = combat.combatants.find((x) => x.id === combatantId)!;
  const offered = reactionsOffered(engine, c.class, { reactionsUsed: me.reactionsUsed ?? 0, technique: c.class ? techniqueOf(engine, c, combat) : null });
  if (!offered.length) return null;
  const targets = combat.combatants.filter((x) => !x.out && !x.downed && x.sideId !== me.sideId).map((x) => ({ id: x.id, name: x.name, zoneId: x.zoneId }));
  return (
    <div className="fight-box stack">
      {using ? (
        <AttackForm
          attacker={clasher(c, engine, combat)}
          targets={targets}
          suggestFlanking={(d) => flanks(combat, me.id, d)}
          reaction={using}
          busy={busy}
          onCancel={() => setUsing(null)}
          onDeclare={async (d) => {
            const ok = await run({
              type: "combat.attack",
              attackerId: me.id,
              defenderId: d.defenderId,
              attack: d.attack,
              reaction: true,
              ...(d.flanking ? { flanking: true } : {}),
              ...(d.label ? { label: d.label } : {}),
            });
            if (ok) setUsing(null);
          }}
        />
      ) : (
        <div className="form-row tight">
          {offered.map((r) => (
            <button key={r.name} disabled={busy} onClick={() => setUsing(r)} title={r.technique ? c.class!.technique.effect : c.class!.permission.effect}>
              {r.name}: {c.name} strikes now (no Beat)
            </button>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** An ally lost a Clash in this character's Zone: the class's cover, paid from the next turn. */
function Cover({ view, c, combatantId, defenderName }: { view: PlayerView; c: InterfaceSheet; combatantId: string; defenderName: string }) {
  const { run, busy, error } = useAct(view.campaign.id);
  const hook = c.class?.permission.hook;
  if (hook?.kind !== "cover") return null;
  return (
    <div className="fight-box stack">
      <button className="primary" disabled={busy} title={c.class!.permission.effect} onClick={() => run({ type: "combat.cover", combatantId })}>
        {c.class!.permission.name}: {c.name} cuts {defenderName}'s Margin by {hook.cut} (1 Beat from the next turn)
      </button>
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
  const standing = (x: Combat["combatants"][number]) => !readOnly && x.characterId && mine.has(x.characterId) && !x.out && !x.downed;
  const reacting = combat.round > 0 && !cl ? combat.combatants.filter((x) => standing(x) && !x.acting) : [];
  const covering = cl?.stage === "yield" ? combat.combatants.filter((x) => standing(x) && cl.coverIds?.includes(x.id)) : [];
  const last = combat.lastClash;

  return (
    <section className="stack tray-part fight" aria-label="The fight">
      <h3 className="spread">
        {combat.name}
        <span className="num small dim">{combat.round ? `Round ${combat.round}` : "Starting"}</span>
      </h3>
      {combat.pendingShift && combat.pendingShift !== combat.order[0]?.id && (
        <p className="small">Momentum shifts to {combat.order.find((s) => s.id === combat.pendingShift)?.name} next round.</p>
      )}
      {combat.order.map((s, i) => (
        <div key={s.id} className="fight-side">
          <div className="cluster small">
            <b>{s.name}</b>
            {combat.round > 0 && i === 0 && <span className="tag">Momentum</span>}
            {s.id === combat.turnSide && <span className="tag tag--solid">Turn</span>}
          </div>
          <ul className="small">
            {combat.combatants
              .filter((c) => c.sideId === s.id && !c.out)
              .map((c) => {
                const own = c.characterId && mine.has(c.characterId);
                const onTurn = s.id === combat.turnSide || (combat.round === 0 && c.surprise);
                const canAct = own && !readOnly && onTurn && !c.acted && !c.downed && !someoneActing && !cl;
                return (
                  <li key={c.id} className={`spread fight-row${c.acting ? " fight-row--acting" : c.acted ? " fight-row--done" : ""}`}>
                    <span>
                      {c.acting ? "▸ " : ""}
                      {c.name}
                      {c.exposed && (
                        <span className="tag tag--danger">
                          <Icon name="exposed" />
                          Exposed
                        </span>
                      )}
                      {c.downed && (
                        <span className="tag tag--danger">
                          <Icon name="downed" />
                          {c.stabilized ? "Downed, stable" : "Downed"}
                        </span>
                      )}
                      {c.suppressed && (
                        <span className="tag tag--danger">
                          <Icon name="suppressed" />
                          Suppressed
                        </span>
                      )}
                      {c.readAsDead && <span className="tag">Reads as dead</span>}
                      {c.surprise && !c.acted && <span className="tag">Surprise</span>}
                      <span className="dim">
                        {c.hp !== undefined && ` · ${c.hp}/${c.maxHp} Health`}
                        {c.zoneId && combat.zones.length > 1 && ` · ${zoneName(c.zoneId)}`}
                      </span>
                    </span>
                    <span className="cluster">
                      {c.beats !== undefined && (
                        <span className="pips" aria-label={`${c.beats} of ${Math.max(c.beatsPerTurn ?? 0, c.beats)} Beats`}>
                          {Array.from({ length: Math.max(c.beatsPerTurn ?? 0, c.beats) }, (_, j) => (
                            <i key={j} className={j < c.beats! ? "on" : ""} />
                          ))}
                        </span>
                      )}
                      {canAct && (
                        <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => run({ type: "combat.act", combatantId: c.id })}>
                          Act
                        </button>
                      )}
                    </span>
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
      {covering.map((x) => (
        <Cover key={x.id} view={view} c={mine.get(x.characterId!)!} combatantId={x.id} defenderName={cl!.defenderName} />
      ))}
      {defending && <Defending view={view} engine={engine} combat={combat} c={mine.get(defending.characterId!)!} />}
      {actingMine && !cl && <MyTurn view={view} engine={engine} combat={combat} c={mine.get(actingMine.characterId!)!} combatantId={actingMine.id} />}
      {reacting.map((x) => (
        <Reactions key={x.id} view={view} engine={engine} combat={combat} c={mine.get(x.characterId!)!} combatantId={x.id} />
      ))}
      {last && !cl && (
        <p className="small dim">
          {last.attackerWins
            ? `${last.attackerName} hit ${last.defenderName}: ${last.damage} damage${last.yielded ? ` after ${last.yielded} Beat${last.yielded === 1 ? "" : "s"} Yielded` : ""}${last.drivenBack ? ", Driven Back" : ""}.`
            : `${last.defenderName} turned ${last.attackerName}'s attack${last.turnedAside ? " aside" : ""}.`}
        </p>
      )}
    </section>
  );
}
