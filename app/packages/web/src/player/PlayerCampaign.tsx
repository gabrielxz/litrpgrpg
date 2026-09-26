/**
 * The player's System interface: what What Can Be Seen lists under "Your Own Interface", in
 * its order, for each character the player holds, the party frame, and the System's notices
 * beside it. The player spends free points and makes the party's choices here (inviting,
 * answering, leaving); everything else arrives from the GM's record.
 */
import type { Action, FeedItem, InterfaceSheet, PlayerView } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { api, newActionId, submit } from "../api.ts";
import { useAuth } from "../auth.ts";
import { RollForm, RollList } from "../Dice.tsx";
import { useEngine } from "../live.ts";
import { Fight } from "./Fight.tsx";
import { ATTRIBUTES, ATTRIBUTE_NAMES, noticeLine } from "../text.ts";
import { type CharacterSpec, Creator } from "./Creator.tsx";

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="sys-bar">
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

function SpendPoints({ campaignId, c }: { campaignId: string; c: InterfaceSheet }) {
  const [placement, setPlacement] = useState<Record<string, number>>({});
  const [id, setId] = useState(newActionId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = Object.values(placement).reduce((a, b) => a + b, 0);
  const bump = (a: string, d: number) => {
    const next = Math.max(0, (placement[a] ?? 0) + d);
    if (d > 0 && total >= c.freePoints) return;
    setPlacement({ ...placement, [a]: next });
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const spent = Object.fromEntries(Object.entries(placement).filter(([, v]) => v > 0));
      await submit(campaignId, id, { type: "points.free", characterId: c.id, placement: spent });
      setPlacement({});
      setId(newActionId());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sys-section">
      <h3>Unallocated points: {c.freePoints - total}</h3>
      <div className="allocate">
        {ATTRIBUTES.map((a) => (
          <div key={a} className="allocate-row">
            <span>{ATTRIBUTE_NAMES[a]}</span>
            <button onClick={() => bump(a, -1)} disabled={!placement[a]} aria-label={`One less ${a}`}>
              −
            </button>
            <span className="num">{placement[a] ? `+${placement[a]}` : ""}</span>
            <button onClick={() => bump(a, 1)} disabled={total >= c.freePoints} aria-label={`One more ${a}`}>
              +
            </button>
          </div>
        ))}
      </div>
      <button className="sys-confirm" disabled={!total || busy} onClick={confirm}>
        Allocate
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Records one of the player's own actions, with a fresh idempotency key each time. */
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

/** The party frame (What Can Be Seen, "What a Party Shares") and the party's choices. */
function PartySection({
  campaignId,
  c,
  roster,
  readOnly,
}: {
  campaignId: string;
  c: InterfaceSheet;
  roster: PlayerView["roster"];
  readOnly?: boolean;
}) {
  const { run, busy, error } = useAct(campaignId);
  const [target, setTarget] = useState("");
  const [leaving, setLeaving] = useState(false);
  const inParty = new Set(c.party?.members.map((m) => m.id) ?? []);
  // Someone already invited, or waiting on this character's answer, is not offered again.
  const pending = new Set([...c.invited.map((i) => i.toId), ...c.invitations.map((i) => i.fromId)]);
  // The dead neither invite nor are invited.
  const invitable = c.dead ? [] : roster.filter((r) => !inParty.has(r.id) && !pending.has(r.id));
  const picked = invitable.some((r) => r.id === target) ? target : (invitable[0]?.id ?? "");
  const nothing = !c.party && !c.invitations.length && !c.invited.length && (readOnly || !invitable.length);
  if (nothing) return null;

  return (
    <div className="sys-section party">
      <h3>Party</h3>
      {c.party ? (
        <ul className="party-frame">
          {c.party.members.map((m) => (
            <li key={m.id} className={m.downed ? "downed" : ""}>
              <span className="who">{m.name}</span>
              <Bar value={m.hp} max={m.maxHp} />
              <span className="num">
                {m.hp} / {m.maxHp}
              </span>
              <span className="num sys-dim">Aether {m.aether}</span>
              {m.downed && <span className="sys-alert">Downed</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="sys-dim">
          <em>No party.</em>
        </p>
      )}
      {c.invitations.map((i) => (
        <div key={i.id} className="sys-row">
          <em>Party invitation: {i.fromName}.</em>
          {!readOnly && (
            <>
              <button className="sys-confirm" disabled={busy} onClick={() => run({ type: "party.answer", inviteId: i.id, accept: true })}>
                Accept
              </button>
              <button className="sys-quiet" disabled={busy} onClick={() => run({ type: "party.answer", inviteId: i.id, accept: false })}>
                Decline
              </button>
            </>
          )}
        </div>
      ))}
      {c.invited.map((i) => (
        <div key={i.id} className="sys-row sys-dim">
          <em>Invitation pending: {i.toName}.</em>
          {!readOnly && (
            <button className="sys-quiet" disabled={busy} onClick={() => run({ type: "void", targetId: i.id, reason: "undo" })}>
              Withdraw
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="sys-row">
          {invitable.length > 0 && (
            <>
              <select value={picked} onChange={(e) => setTarget(e.target.value)} aria-label="Character to invite">
                {invitable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button className="sys-confirm" disabled={busy || !picked} onClick={() => run({ type: "party.invite", fromId: c.id, toId: picked })}>
                Invite {invitable.find((r) => r.id === picked)?.name}
              </button>
            </>
          )}
          {c.party &&
            (leaving ? (
              <>
                <button
                  className="sys-confirm"
                  disabled={busy}
                  onClick={async () => {
                    if (await run({ type: "party.leave", characterId: c.id })) setLeaving(false);
                  }}
                >
                  Leave the party
                </button>
                <button className="sys-quiet" onClick={() => setLeaving(false)}>
                  Stay
                </button>
              </>
            ) : (
              <button className="sys-quiet" onClick={() => setLeaving(true)}>
                Leave…
              </button>
            ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Interface({
  campaignId,
  c,
  roster,
  readOnly,
}: {
  campaignId: string;
  c: InterfaceSheet;
  roster: PlayerView["roster"];
  readOnly?: boolean;
}) {
  const toNext = c.veToNextLevel;
  return (
    <article className="interface">
      <header>
        <img src="/clave.svg" alt="" className="clave-mark" />
        <div>
          <h2>{c.name}</h2>
          <div className="sys-dim">
            Level {c.level} · {c.grade}-Grade
          </div>
        </div>
      </header>

      <div className="sys-section">
        <table className="sys-stats">
          <thead>
            <tr>
              <th />
              <th>Raw</th>
              <th>Force</th>
            </tr>
          </thead>
          <tbody>
            {ATTRIBUTES.map((a) => (
              <tr key={a}>
                <td>{ATTRIBUTE_NAMES[a]}</td>
                <td className="num">{c.raw[a]}</td>
                <td className="num">{c.force[a]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sys-section vitals">
        {c.dead ? (
          <p className="sys-alert">
            <em>Deceased.</em>
          </p>
        ) : (
          c.vitalCoherence !== null && (
            <p className="sys-alert">
              <em>Vital coherence: {c.vitalCoherence}. Falling.</em>
            </p>
          )
        )}
        <div className="sys-vital">
          <span>Health</span>
          <Bar value={c.hp} max={c.maxHp} />
          <span className="num">
            {c.hp} / {c.maxHp}
          </span>
        </div>
        <div className="sys-vital">
          <span>Aether</span>
          <Bar value={c.aether} max={c.maxAether} />
          <span className="num">
            {c.aether} / {c.maxAether}
          </span>
        </div>
        <div className="sys-vital">
          <span>Volatile Energy</span>
          <Bar value={c.storedVe} max={c.tolerance} />
          <span className="num">
            {c.storedVe} / {c.tolerance}
          </span>
        </div>
      </div>

      <PartySection campaignId={campaignId} c={c} roster={roster} readOnly={readOnly} />

      <div className="sys-section">
        <div className="sys-vital">
          <span>Level {c.level + 1}</span>
          <Bar value={c.refinedVe} max={c.refinedVe + (toNext ?? 0)} />
          <span className="num">{toNext === null ? "Grade limit" : `${c.refinedVe} / ${c.refinedVe + toNext}`}</span>
        </div>
      </div>

      {c.freePoints > 0 &&
        (readOnly ? (
          <div className="sys-section">
            <h3>Unallocated points: {c.freePoints}</h3>
          </div>
        ) : (
          <SpendPoints campaignId={campaignId} c={c} />
        ))}
    </article>
  );
}

function Notices({ feed, names }: { feed: FeedItem[]; names: Map<string, string> | null }) {
  const lines = feed.map((n) => ({ ...n, text: noticeLine(n.effect) })).filter((n) => n.text);
  return (
    <aside className="notices">
      {lines.length === 0 ? (
        <p className="sys-dim">
          <em>No new notices.</em>
        </p>
      ) : (
        <ol>
          {lines.map((n) => (
            <li key={n.key}>
              <img src="/clave.svg" alt="" className="clave-tiny" />
              {names && <span className="sys-dim small">{names.get(n.characterId)} · </span>}
              <em>{n.text}</em>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "character";

/** A player with no character here: build one in place, or bring one they built earlier. */
function Arrival({ view }: { view: PlayerView }) {
  const auth = useAuth();
  const engine = useEngine(view.campaign.rulesVersion);
  const [pool, setPool] = useState<{ id: string; name: string }[]>([]);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ characters: { id: string; name: string }[] }>("GET", "/characters")
      .then((r) => setPool(r.characters))
      .catch(() => {});
  }, []);

  const create = async (spec: CharacterSpec) => {
    const playerId = auth.user!.id;
    const base = slug(spec.kind === "pregen" ? spec.pregen : spec.name);
    const characterId = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    await submit(
      view.campaign.id,
      newActionId(),
      spec.kind === "pregen"
        ? { type: "character.pregen", characterId, pregen: spec.pregen, playerId }
        : { type: "character.create", characterId, name: spec.name, background: spec.background, stats: spec.stats, playerId },
    );
  };
  const bring = async (id: string) => {
    try {
      await api("POST", `/characters/${id}/join`, { campaignId: view.campaign.id });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (building && engine) return <Creator engine={engine} submitLabel="Register" onSubmit={create} onCancel={() => setBuilding(false)} />;
  return (
    <div className="arrival">
      <p className="sys-dim">
        <em>Interface: awaiting registration.</em>
      </p>
      <p className="small">You have no character in this campaign yet. Your GM may make one for you, or you can bring your own.</p>
      <div className="row">
        <button className="sys-confirm" onClick={() => setBuilding(true)} disabled={!engine}>
          Build a character
        </button>
      </div>
      {pool.length > 0 && (
        <div className="sys-section">
          <h3>Or bring one you built</h3>
          <ul className="pool">
            {pool.map((c) => (
              <li key={c.id}>
                {c.name}
                <button className="sys-confirm" onClick={() => bring(c.id)}>
                  Bring {c.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export function PlayerCampaign({
  view,
  readOnly,
}: {
  view: PlayerView;
  /** The GM viewing as this player: nothing can be changed. */
  readOnly?: boolean;
}) {
  // A player with several characters here sees which one each notice is about.
  const names = view.characters.length > 1 ? new Map(view.characters.map((c) => [c.id, c.name])) : null;
  const engine = useEngine(view.combat ? view.campaign.rulesVersion : undefined);
  return (
    <main className="player">
      {view.characters.length === 0 ? (
        readOnly ? (
          <p className="sys-dim">
            <em>Interface: awaiting registration.</em>
          </p>
        ) : (
          <Arrival view={view} />
        )
      ) : (
        <div className="interfaces">
          {view.characters.map((c) => (
            <Interface key={c.id} campaignId={view.campaign.id} c={c} roster={view.roster} readOnly={readOnly} />
          ))}
        </div>
      )}
      <div className="side-column">
        <Notices feed={view.feed} names={names} />
        {view.combat && <Fight view={view} engine={engine} combat={view.combat} readOnly={readOnly} />}
        <section className="table-dice">
          <h3>Dice</h3>
          {!readOnly && view.characters.length > 0 && (
            <RollForm
              campaignId={view.campaign.id}
              characters={view.characters.map((c) => ({ id: c.id, name: c.name, force: c.force, aether: c.aether, surgeCost: c.surgeCost }))}
            />
          )}
          <RollList rolls={view.rolls} />
        </section>
      </div>
    </main>
  );
}
