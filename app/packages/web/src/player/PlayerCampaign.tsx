/**
 * The player's System interface: what What Can Be Seen lists under "Your Own Interface", in
 * its order, for each character the player holds, the party frame, and the System's notices
 * beside it. The player spends free points and makes the party's choices here (inviting,
 * answering, leaving); everything else arrives from the GM's record.
 */
import { type Action, type FeedItem, type InterfaceSheet, type PlayerQuest, type PlayerView, shapes } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { api, newActionId, submit } from "../api.ts";
import { useAuth } from "../auth.ts";
import { RollForm, RollList } from "../Dice.tsx";
import { useEngine } from "../live.ts";
import { Fight } from "./Fight.tsx";
import { stackLine } from "../items.ts";
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

/**
 * What the character carries, on their own interface after Proficiencies (Gabriel, 2026-09-26:
 * the System shows the owner their items; nobody else sees them; book edit 14). Hand an item to
 * someone in the campaign or the spoils, or mark one used.
 */
function Carried({ campaignId, c, roster, readOnly }: { campaignId: string; c: InterfaceSheet; roster: PlayerView["roster"]; readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState<Record<string, string>>({});
  if (!c.items.length) return null;
  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      await submit(campaignId, newActionId(), action);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sys-section">
      <h3>Carried</h3>
      <ul className="items">
        {c.items.map((s) => (
          <li key={s.name}>
            {stackLine(s)}
            {!readOnly && !c.dead && (
              <span className="item-actions">
                <select value={to[s.name] ?? "spoils"} onChange={(e) => setTo({ ...to, [s.name]: e.target.value })} aria-label={`Where ${s.name} goes`}>
                  <option value="spoils">To the spoils</option>
                  {roster.map((r) => (
                    <option key={r.id} value={r.id}>
                      To {r.name}
                    </option>
                  ))}
                </select>
                <button className="sys-confirm inline" disabled={busy} onClick={() => run({ type: "item.move", from: c.id, to: to[s.name] ?? "spoils", name: s.name, count: 1 })}>
                  Hand over one
                </button>
                <button className="sys-confirm inline" disabled={busy} onClick={() => run({ type: "item.remove", from: c.id, name: s.name, count: 1, note: "used" })}>
                  Used one
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/**
 * Every title the character holds, hidden ones included (What Can Be Seen): the holder wears or
 * hides a Bestowed title, reveals a Hidden Achievement for good, and places a player's-choice point.
 */
function Titles({ campaignId, c, readOnly }: { campaignId: string; c: InterfaceSheet; readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [stat, setStat] = useState<Record<string, string>>({});
  if (!c.titles.length) return null;
  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      await submit(campaignId, newActionId(), action);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const bonus = (b: Record<string, number>) =>
    Object.entries(b)
      .filter(([, v]) => v)
      .map(([k, v]) => `${v > 0 ? "+" : "−"}${Math.abs(v)} ${ATTRIBUTE_NAMES[k]}`)
      .join(", ");
  const can = !readOnly && !c.dead;
  return (
    <div className="sys-section titles">
      <h3>Titles</h3>
      <ul className="items">
        {c.titles.map((t) => (
          <li key={t.id} className={t.status !== "active" ? "sys-dim" : ""}>
            <span className="grow">
              <strong>{t.name}</strong> <span className="sys-dim small">{t.category}
                {t.category === "Hidden Achievement" ? (t.revealed ? ", revealed" : ", hidden from observers") : ""}
                {t.status === "echoed" ? ", Echoed" : t.status === "released" ? ", released" : ""}
              </span>
              {bonus(t.bonus) && <span className="small"> · {bonus(t.bonus)}</span>}
              {t.effect && <div className="small">{t.effect}</div>}
              {t.negative && t.status === "active" && <div className="small sys-alert">Visible to every observer of your Grade or higher.{t.release ? ` Released by: ${t.release}` : ""}</div>}
            </span>
            {can && t.choice !== undefined && (
              <span className="item-actions">
                <select value={stat[t.id] ?? "STR"} onChange={(e) => setStat({ ...stat, [t.id]: e.target.value })} aria-label="Stat">
                  {ATTRIBUTES.map((a) => (
                    <option key={a} value={a}>
                      {ATTRIBUTE_NAMES[a]}
                    </option>
                  ))}
                </select>
                <button className="sys-confirm inline" disabled={busy} onClick={() => run({ type: "title.choose", characterId: c.id, titleId: t.id, attribute: stat[t.id] ?? "STR" })}>
                  Place +{t.choice}
                </button>
              </span>
            )}
            {can && t.category === "Bestowed" && !t.negative && t.status !== "released" && (
              <button className="sys-confirm inline" disabled={busy} onClick={() => run({ type: "title.wear", characterId: c.id, titleId: t.id, worn: !t.worn })}>
                {t.worn ? "Worn: hide it" : "Hidden: wear it"}
              </button>
            )}
            {can && t.category === "Hidden Achievement" && !t.revealed && (
              revealing === t.id ? (
                <span className="item-actions">
                  <span className="small">Revealing is permanent.</span>
                  <button className="sys-confirm inline" disabled={busy} onClick={() => run({ type: "title.reveal", characterId: c.id, titleId: t.id })}>
                    Reveal {t.name}
                  </button>
                  <button className="sys-confirm inline" onClick={() => setRevealing(null)}>
                    Keep it hidden
                  </button>
                </span>
              ) : (
                <button className="sys-confirm inline" onClick={() => setRevealing(t.id)}>
                  Reveal…
                </button>
              )
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** The quest log (System Quests, "The Quest UI"): each entry in the book's shape, and the player's answers. */
function QuestLog({ campaignId, c, readOnly }: { campaignId: string; c: InterfaceSheet; readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<string | null>(null);
  if (!c.quests.length) return null;
  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      await submit(campaignId, newActionId(), action);
      setRefusing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const can = !readOnly && !c.dead;
  const entry = (q: PlayerQuest) => {
    const reward = [q.scaled ? "Proportional" : q.ve === null ? "" : `${q.ve} VE`, ...(q.items ?? []).map((i) => (i.count === 1 ? i.name : `${i.count} ${i.name}`)), q.rewardText ?? ""]
      .filter(Boolean)
      .join(", ");
    const lines = [`[${q.id}] ${q.title}`];
    if (!q.hidden || q.status === "completed") {
      lines.push(`Issuer:     ${q.issuer}`, `Grade:      ${q.grade} · Difficulty: ${q.difficulty}`);
      if (q.objective) lines.push(`Objective:  ${q.objective}${q.count ? ` (${q.count.done}/${q.count.of})` : ""}`);
      if (reward) lines.push(`Reward:     ${reward}`);
      if (q.time) lines.push(`Time:       ${q.time}`);
    } else if (q.objective) lines.push(q.objective);
    lines.push(`Status:     ${q.status === "offered" ? "Offered" : q.status[0]!.toUpperCase() + q.status.slice(1)}${q.shared ? " · Shared" : ""}`);
    return lines.join("\n");
  };
  const open = c.quests.filter((q) => q.status === "offered" || q.status === "active");
  const closed = c.quests.filter((q) => q.status !== "offered" && q.status !== "active");
  return (
    <div className="sys-section quest-log">
      <h3>Quest log</h3>
      {open.map((q) => (
        <div key={q.id} className="quest">
          <pre className="quest-entry">{entry(q)}</pre>
          {can && (
            <div className="row tight">
              {q.status === "offered" && (
                <>
                  <button className="sys-confirm inline" disabled={busy} onClick={() => run({ type: "quest.answer", questId: q.id, characterId: c.id, accept: true })}>
                    Accept
                  </button>
                  <button className="sys-confirm inline" disabled={busy} onClick={() => run({ type: "quest.answer", questId: q.id, characterId: c.id, accept: false })}>
                    Refuse
                  </button>
                </>
              )}
              {q.sharable && (
                <button className="sys-confirm inline" disabled={busy} onClick={() => run({ type: "quest.share", questId: q.id, characterId: c.id })}>
                  Share with the party
                </button>
              )}
              {q.category === "Mandate" && q.status === "active" &&
                (refusing === q.id ? (
                  <>
                    <span className="small">Refusing a Mandate has consequences.</span>
                    <button className="sys-confirm inline" disabled={busy} onClick={() => run({ type: "quest.answer", questId: q.id, characterId: c.id, accept: false })}>
                      Refuse [{q.id}]
                    </button>
                    <button className="sys-confirm inline" onClick={() => setRefusing(null)}>
                      Keep it
                    </button>
                  </>
                ) : (
                  <button className="sys-confirm inline" onClick={() => setRefusing(q.id)}>
                    Refuse…
                  </button>
                ))}
            </div>
          )}
        </div>
      ))}
      {closed.length > 0 && (
        <details>
          <summary className="small">Completed, failed, and refused ({closed.length})</summary>
          {closed.map((q) => (
            <pre key={q.id} className="quest-entry sys-dim">
              {entry(q)}
            </pre>
          ))}
        </details>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** What the party has not divided: any player can claim an item for their own character. */
function Spoils({ view, readOnly }: { view: PlayerView; readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const living = view.characters.filter((c) => !c.dead);
  const [who, setWho] = useState(living[0]?.id ?? "");
  if (!view.spoils.length) return null;
  const claimer = living.some((c) => c.id === who) ? who : (living[0]?.id ?? "");
  const take = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      await submit(view.campaign.id, newActionId(), { type: "item.move", from: "spoils", to: claimer, name, count: 1 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="table-dice">
      <h3>Spoils</h3>
      <p className="small sys-dim">What the party has not divided yet.</p>
      {!readOnly && living.length > 1 && (
        <select value={claimer} onChange={(e) => setWho(e.target.value)} aria-label="Claim for">
          {living.map((c) => (
            <option key={c.id} value={c.id}>
              For {c.name}
            </option>
          ))}
        </select>
      )}
      <ul className="items">
        {view.spoils.map((s) => (
          <li key={s.name}>
            {stackLine(s)}
            {!readOnly && claimer && (
              <button className="sys-confirm inline" disabled={busy} onClick={() => take(s.name)}>
                Take one
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
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

      {c.proficiencies.length > 0 && (
        <div className="sys-section">
          <h3>Proficiencies</h3>
          <ul className="items">
            {c.proficiencies.map((p) => (
              <li key={p.shape}>
                <span className="grow">{p.shape}</span>
                <span className="sys-dim">
                  {p.tier} +{p.bonus} · {p.marks} Mark{p.marks === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Carried campaignId={campaignId} c={c} roster={roster} readOnly={readOnly} />

      <Titles campaignId={campaignId} c={c} readOnly={readOnly} />

      <QuestLog campaignId={campaignId} c={c} readOnly={readOnly} />

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
  const engine = useEngine(view.campaign.rulesVersion);
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
        <Spoils view={view} readOnly={readOnly} />
        <section className="table-dice">
          <h3>Dice</h3>
          {!readOnly && view.characters.length > 0 && (
            <RollForm
              campaignId={view.campaign.id}
              characters={view.characters.map((c) => ({ id: c.id, name: c.name, force: c.force, aether: c.aether, surgeCost: c.surgeCost, proficiencies: c.proficiencies }))}
              shapes={engine ? shapes(engine) : []}
            />
          )}
          <RollList rolls={view.rolls} />
        </section>
      </div>
    </main>
  );
}
