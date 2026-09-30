/**
 * The player's System interface: what What Can Be Seen lists under "Your Own Interface" for each
 * character the player holds, the party frame, and the System's notices beside it. The player
 * spends free points and makes the party's choices here (inviting, answering, leaving); everything
 * else arrives from the GM's record.
 *
 * Two registers (Decisions, "the makeover"): the interface is the System's, in world words only;
 * the table's tools (the fight, the spoils, the dice, rules questions) sit in the "At the table"
 * tray beside the notices, in the table's words.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type FeedItem, type InterfaceSheet, type PlayerQuest, type PlayerView, shapes } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { api, newActionId, submit } from "../api.ts";
import { useAuth } from "../auth.ts";
import { RollForm, RollList } from "../Dice.tsx";
import { useEngine } from "../live.ts";
import { Fight } from "./Fight.tsx";
import { pillsOf } from "../Care.tsx";
import { stackLine } from "../items.ts";
import { type Playing, momentOf, useMoments } from "../moments.ts";
import { ATTRIBUTES, ATTRIBUTE_NAMES, noticeLine } from "../text.ts";
import { Clave, Icon, Meter, Vital } from "../ui.tsx";
import { type CharacterSpec, Creator } from "./Creator.tsx";
import { PrincipleSection } from "./Principle.tsx";
import { ClassHeld, ClassOffers } from "./Class.tsx";
import { Inspect } from "./Inspect.tsx";
import { AskRules } from "../AskRules.tsx";

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

/** Attributes in both readings, raw over Force; while points wait, a stepper under each. */
function Attributes({ campaignId, c, readOnly, leveled }: { campaignId: string; c: InterfaceSheet; readOnly?: boolean; leveled?: boolean }) {
  const [placement, setPlacement] = useState<Record<string, number>>({});
  const [id, setId] = useState(newActionId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const spending = c.freePoints > 0 && !readOnly;
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
    <section className="sys-section">
      <h2 className="sys-label">
        Attributes <span className="tail">Raw · Force</span>
      </h2>
      {c.freePoints > 0 && (
        <div className={`spread points-waiting${leveled ? " mo-wash" : ""}`}>
          <span className="voice">
            Unallocated points: <span className="num">{c.freePoints - total}</span>
          </span>
          {/* Fragments resolving into alignment while points wait; they resolve in motion when a level lands. */}
          <span className="cluster glyphs" aria-hidden="true">
            <i className="gl gl-tri mo-frag" style={{ "--dx": "-46px", "--dy": "-22px", "--rot": "-40deg", "--delay": "950ms" } as React.CSSProperties} />
            <i className="gl gl-step mo-frag" style={{ "--dx": "26px", "--dy": "24px", "--rot": "30deg", "--delay": "1020ms" } as React.CSSProperties} />
            <i className="gl gl-nest mo-frag" style={{ "--dx": "52px", "--dy": "-14px", "--rot": "45deg", "--delay": "1090ms" } as React.CSSProperties} />
          </span>
        </div>
      )}
      <div className="stats">
        {ATTRIBUTES.map((a) => (
          <div key={a} className={`stat${placement[a] ? " stat--pending" : ""}`}>
            <span className="stat__name">{ATTRIBUTE_NAMES[a]}</span>
            <span className="stat__raw">{c.raw[a]}</span>
            <span className="stat__force">
              Force <b>{c.force[a]}</b>
            </span>
            {spending && (
              <div className="stepper">
                <button className="btn btn--sm btn--icon" onClick={() => bump(a, -1)} disabled={!placement[a]} aria-label={`One less ${ATTRIBUTE_NAMES[a]}`}>
                  <Icon name="remove" />
                </button>
                <span className="stepper__add">{placement[a] ? `+${placement[a]}` : ""}</span>
                <button className="btn btn--sm btn--icon" onClick={() => bump(a, 1)} disabled={total >= c.freePoints} aria-label={`One more ${ATTRIBUTE_NAMES[a]}`}>
                  <Icon name="add" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {spending && (
        <div className="cluster">
          <button className="btn btn--primary" disabled={!total || busy} onClick={confirm}>
            Allocate
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
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
    <section className="sys-section">
      <h2 className="sys-label">Party</h2>
      {c.party ? (
        <ul className="party-frame">
          {c.party.members.map((m) => (
            <li key={m.id}>
              <span className="cluster">
                {m.name}
                {m.downed && (
                  <span className="tag tag--danger">
                    <Icon name="downed" />
                    Downed
                  </span>
                )}
              </span>
              <Meter kind={m.downed ? "danger" : "health"} value={m.hp} max={m.maxHp} thin />
              <span className="num small" style={m.downed ? { color: "var(--danger)" } : undefined}>
                {m.hp} / {m.maxHp}
              </span>
              <span className="num small dim">Aether {m.aether}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="voice dim">No party.</p>
      )}
      {c.invitations.map((i) => (
        <div key={i.id} className="sys-row">
          <span className="sys-row__main voice">Party invitation: {i.fromName}.</span>
          {!readOnly && (
            <span className="cluster">
              <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => run({ type: "party.answer", inviteId: i.id, accept: true })}>
                Accept
              </button>
              <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "party.answer", inviteId: i.id, accept: false })}>
                Decline
              </button>
            </span>
          )}
        </div>
      ))}
      {c.invited.map((i) => (
        <div key={i.id} className="sys-row">
          <span className="sys-row__main voice dim">Invitation pending: {i.toName}.</span>
          {!readOnly && (
            <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "void", targetId: i.id, reason: "undo" })}>
              Withdraw
            </button>
          )}
        </div>
      ))}
      {!readOnly && (invitable.length > 0 || c.party) && (
        <div className="cluster">
          {invitable.length > 0 && (
            <>
              <select className="select select--sm" value={picked} onChange={(e) => setTarget(e.target.value)} aria-label="Character to invite">
                {invitable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button className="btn btn--sm" disabled={busy || !picked} onClick={() => run({ type: "party.invite", fromId: c.id, toId: picked })}>
                Invite {invitable.find((r) => r.id === picked)?.name}
              </button>
            </>
          )}
          {c.party &&
            (leaving ? (
              <span className="confirm confirm--armed">
                <button
                  className="btn btn--sm btn--danger"
                  disabled={busy}
                  onClick={async () => {
                    if (await run({ type: "party.leave", characterId: c.id })) setLeaving(false);
                  }}
                >
                  Leave the party
                </button>
                <button className="btn btn--sm" onClick={() => setLeaving(false)}>
                  Stay
                </button>
              </span>
            ) : (
              <button className="btn btn--sm" onClick={() => setLeaving(true)}>
                Leave…
              </button>
            ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/**
 * What the character carries, on their own interface after Proficiencies (Gabriel, 2026-09-26:
 * the System shows the owner their items; nobody else sees them). Hand an item to
 * someone in the campaign or the spoils, or mark one used.
 */
function Carried({ campaignId, c, roster, readOnly, pills }: { campaignId: string; c: InterfaceSheet; roster: PlayerView["roster"]; readOnly?: boolean; pills: string[] }) {
  const { run, busy, error } = useAct(campaignId);
  const [to, setTo] = useState<Record<string, string>>({});
  if (!c.items.length && !c.pillsTaken.healing && !c.pillsTaken.aether) return null;
  return (
    <section className="sys-section">
      <h2 className="sys-label">Carried</h2>
      {(c.pillsTaken.healing > 0 || c.pillsTaken.aether > 0) && (
        <p className="small dim">
          Pills since Consolidation: healing <span className="num">{c.pillsTaken.healing}</span>, Aether <span className="num">{c.pillsTaken.aether}</span>
        </p>
      )}
      <ul>
        {c.items.map((s) => (
          <li key={s.name} className="sys-row sys-row--center">
            <span className="sys-row__main">{stackLine(s)}</span>
            {!readOnly && !c.dead && (
              <>
                <select className="select select--sm" value={to[s.name] ?? "spoils"} onChange={(e) => setTo({ ...to, [s.name]: e.target.value })} aria-label={`Where ${s.name} goes`}>
                  <option value="spoils">To the spoils</option>
                  {roster.map((r) => (
                    <option key={r.id} value={r.id}>
                      To {r.name}
                    </option>
                  ))}
                </select>
                <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "item.move", from: c.id, to: to[s.name] ?? "spoils", name: s.name, count: 1 })}>
                  Hand over one
                </button>
                {pills.includes(s.name.toLowerCase()) ? (
                  <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "pill.take", characterId: c.id, targetId: c.id, pill: s.name })}>
                    Take one
                  </button>
                ) : (
                  <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "item.remove", from: c.id, name: s.name, count: 1, note: "used" })}>
                    Used one
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/**
 * Every title the character holds, hidden ones included (What Can Be Seen): the holder wears or
 * hides a Bestowed title, reveals a Hidden Achievement for good, and places a player's-choice point.
 */
function Titles({ campaignId, c, readOnly, fresh }: { campaignId: string; c: InterfaceSheet; readOnly?: boolean; fresh?: string }) {
  const { run, busy, error } = useAct(campaignId);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [stat, setStat] = useState<Record<string, string>>({});
  if (!c.titles.length) return null;
  const bonus = (b: Record<string, number>) =>
    Object.entries(b)
      .filter(([, v]) => v)
      .map(([k, v]) => `${v > 0 ? "+" : "−"}${Math.abs(v)} ${ATTRIBUTE_NAMES[k]}`)
      .join(", ");
  const can = !readOnly && !c.dead;
  return (
    <section className="sys-section">
      <h2 className="sys-label">Titles</h2>
      <ul>
        {c.titles.map((t) => (
          <li key={t.id} className={`sys-row${t.status !== "active" ? " dim" : ""}${t.id === fresh ? " mo-insert" : ""}`}>
            <span className="sys-row__main">
              <b className={`title-name${t.id === fresh ? " mo-brackets" : ""}`}>{t.name}</b>{" "}
              <span className="small dim">
                {t.category}
                {t.category === "Hidden Achievement" ? (t.revealed ? ", revealed" : ", hidden from observers") : ""}
                {t.status === "echoed" ? ", Echoed" : t.status === "released" ? ", released" : ""}
              </span>
              {t.effect && <span className="sys-row__more small">{t.effect}</span>}
              {t.negative && t.status === "active" && (
                <span className="sys-row__more small" style={{ color: "var(--danger)" }}>
                  Visible to every observer of your Grade or higher.{t.release ? ` Released by: ${t.release}` : ""}
                </span>
              )}
              {can && t.choice !== undefined && (
                <span className="cluster sys-row__more">
                  <select className="select select--sm" value={stat[t.id] ?? "STR"} onChange={(e) => setStat({ ...stat, [t.id]: e.target.value })} aria-label="Stat">
                    {ATTRIBUTES.map((a) => (
                      <option key={a} value={a}>
                        {ATTRIBUTE_NAMES[a]}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => run({ type: "title.choose", characterId: c.id, titleId: t.id, attribute: stat[t.id] ?? "STR" })}>
                    Place +{t.choice}
                  </button>
                </span>
              )}
              {can && t.category === "Bestowed" && !t.negative && t.status !== "released" && (
                <span className="cluster sys-row__more">
                  <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "title.wear", characterId: c.id, titleId: t.id, worn: !t.worn })}>
                    {t.worn ? "Worn: hide it" : "Hidden: wear it"}
                  </button>
                </span>
              )}
              {can && t.category === "Hidden Achievement" && !t.revealed && (
                <span className="cluster sys-row__more">
                  {revealing === t.id ? (
                    <span className="confirm confirm--armed">
                      <span className="confirm__what">Revealing is permanent.</span>
                      <button className="btn btn--sm btn--primary" disabled={busy} onClick={() => run({ type: "title.reveal", characterId: c.id, titleId: t.id })}>
                        Reveal {t.name}
                      </button>
                      <button className="btn btn--sm" onClick={() => setRevealing(null)}>
                        Keep it hidden
                      </button>
                    </span>
                  ) : (
                    <button className="btn btn--sm" onClick={() => setRevealing(t.id)}>
                      Reveal…
                    </button>
                  )}
                </span>
              )}
            </span>
            {bonus(t.bonus) && (
              <span className={`sys-row__side${t.id === fresh ? " mo-fade" : ""}`} style={t.id === fresh ? ({ "--delay": "700ms" } as React.CSSProperties) : undefined}>
                {bonus(t.bonus)}
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

const STATUS = (q: PlayerQuest) => (q.status === "offered" ? "Offered" : q.status[0]!.toUpperCase() + q.status.slice(1));

/** One entry in the book's quest shape (System Quests, "The Quest UI"): key and value in columns. */
function QuestEntry({ q, children, closed, fresh }: { q: PlayerQuest; children?: React.ReactNode; closed?: boolean; fresh?: boolean }) {
  const reward = [q.scaled ? "Proportional" : q.ve === null ? "" : `${q.ve} VE`, ...(q.items ?? []).map((i) => (i.count === 1 ? i.name : `${i.count} ${i.name}`)), q.rewardText ?? ""]
    .filter(Boolean)
    .join(", ");
  const full = !q.hidden || q.status === "completed";
  return (
    <dl className={`quest${q.status === "offered" ? " quest--offered" : ""}${closed ? " dim" : ""}${fresh ? " mo-unfold" : ""}`}>
      <div className="quest__id">
        <span className="num">[{q.code}]</span>
        <b>{q.title}</b>
        <span className="grow" />
        {q.status === "offered" && <span className="tag tag--system">Offered</span>}
      </div>
      {full ? (
        <>
          <dt>Issuer</dt>
          <dd className={q.issuer === "System" ? undefined : "world"}>{q.issuer}</dd>
          <dt>Grade</dt>
          <dd>
            {q.grade} · Difficulty: {q.difficulty}
          </dd>
          {q.objective && (
            <>
              <dt>Objective</dt>
              <dd>
                {q.objective}
                {q.count && <span className="num dim"> ({q.count.done}/{q.count.of})</span>}
              </dd>
            </>
          )}
          {reward && (
            <>
              <dt>Reward</dt>
              <dd>{reward}</dd>
            </>
          )}
          {q.time && (
            <>
              <dt>Time</dt>
              <dd>{q.time}</dd>
            </>
          )}
          {q.hoursLeft !== undefined && (
            <>
              <dt>Remaining</dt>
              <dd className="num">{q.hoursLeft === 1 ? "1 hour" : `${q.hoursLeft} hours`}</dd>
            </>
          )}
        </>
      ) : (
        q.objective && <dd className="quest__whole">{q.objective}</dd>
      )}
      <dt>Status</dt>
      <dd>
        {STATUS(q)}
        {q.shared ? " · Shared" : ""}
      </dd>
      {children && <div className="quest__actions">{children}</div>}
    </dl>
  );
}

/** The quest log: each entry in the book's shape, and the player's answers. */
function QuestLog({ campaignId, c, readOnly, fresh }: { campaignId: string; c: InterfaceSheet; readOnly?: boolean; fresh?: string }) {
  const { run: act, busy, error } = useAct(campaignId);
  const [refusing, setRefusing] = useState<string | null>(null);
  if (!c.quests.length) return null;
  const run = async (action: Action) => {
    if (await act(action)) setRefusing(null);
  };
  const can = !readOnly && !c.dead;
  const open = c.quests.filter((q) => q.status === "offered" || q.status === "active");
  const closed = c.quests.filter((q) => q.status !== "offered" && q.status !== "active");
  return (
    <section className="sys-section">
      <h2 className="sys-label">Quest log</h2>
      {open.map((q) => (
        <QuestEntry key={q.id} q={q} fresh={q.id === fresh}>
          {can && (
            <>
              {q.status === "offered" && (
                <>
                  <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => run({ type: "quest.answer", questId: q.id, characterId: c.id, accept: true })}>
                    Accept
                  </button>
                  <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "quest.answer", questId: q.id, characterId: c.id, accept: false })}>
                    Refuse
                  </button>
                </>
              )}
              {q.sharable && (
                <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "quest.share", questId: q.id, characterId: c.id })}>
                  Share with the party
                </button>
              )}
              {q.category === "Mandate" && q.status === "active" &&
                (refusing === q.id ? (
                  <span className="confirm confirm--armed">
                    <span className="confirm__what">Refusing a Mandate has consequences.</span>
                    <button className="btn btn--sm btn--danger" disabled={busy} onClick={() => run({ type: "quest.answer", questId: q.id, characterId: c.id, accept: false })}>
                      Refuse [{q.code}]
                    </button>
                    <button className="btn btn--sm" onClick={() => setRefusing(null)}>
                      Keep it
                    </button>
                  </span>
                ) : (
                  <button className="btn btn--sm" onClick={() => setRefusing(q.id)}>
                    Refuse…
                  </button>
                ))}
            </>
          )}
        </QuestEntry>
      ))}
      {closed.length > 0 && (
        <details className="small">
          <summary className="dim">Completed, failed, and refused ({closed.length})</summary>
          <div className="stack quest-closed">
            {closed.map((q) => (
              <QuestEntry key={q.id} q={q} closed />
            ))}
          </div>
        </details>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

/** What the party has not divided: any player can claim an item for their own character. */
function Spoils({ view, readOnly }: { view: PlayerView; readOnly?: boolean }) {
  const { run, busy, error } = useAct(view.campaign.id);
  const living = view.characters.filter((c) => !c.dead);
  const [who, setWho] = useState(living[0]?.id ?? "");
  if (!view.spoils.length) return null;
  const claimer = living.some((c) => c.id === who) ? who : (living[0]?.id ?? "");
  return (
    <section className="stack tray-part">
      <h3 className="spread">
        Spoils
        {!readOnly && living.length > 1 ? (
          <select className="select select--sm" value={claimer} onChange={(e) => setWho(e.target.value)} aria-label="Claim for">
            {living.map((c) => (
              <option key={c.id} value={c.id}>
                For {c.name}
              </option>
            ))}
          </select>
        ) : (
          living[0] && <span className="small dim">For {living[0].name}</span>
        )}
      </h3>
      <p className="small dim">What the party has not divided yet.</p>
      <ul className="rows small">
        {view.spoils.map((s) => (
          <li key={s.name}>
            <span className="row__main">{stackLine(s)}</span>
            {!readOnly && claimer && (
              <button className="btn btn--sm" disabled={busy} onClick={() => run({ type: "item.move", from: "spoils", to: claimer, name: s.name, count: 1 })}>
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
  pills,
  engine,
  inFight,
  playing,
}: {
  campaignId: string;
  c: InterfaceSheet;
  roster: PlayerView["roster"];
  readOnly?: boolean;
  engine: Engine | null;
  /** A moment landing on this character (moments.ts): the interface plays it. */
  playing?: Playing;
  /** In the running fight: the technique is used from the fight's panel. */
  inFight: boolean;
  /** Pill names from the Items tables, lower-cased: these are taken, not just used. */
  pills: string[];
}) {
  const toNext = c.veToNextLevel;
  const falling = !c.dead && c.vitalCoherence !== null;
  const m = playing?.moment;
  const e = playing?.effect;
  const leveled = m === "level";
  const downed = m === "downed";
  return (
    <article
      className={`interface iframe${falling ? " iframe--unstable" : ""}${playing ? " is-playing" : ""}${downed ? " mo-displace" : ""}`}
      aria-label={`${c.name}'s interface`}
    >
      {/* The head and the vitals stay in view while the rest scrolls (Decisions, "the makeover", P9). */}
      <div className="interface__pinned">
        <header className="sys-head">
          <Clave />
          <div>
            <h1 className="sys-name">{c.name}</h1>
            <div className="sys-sub">
              <span>
                Level{" "}
                <b className="num">
                  {leveled && c.level > 1 ? (
                    <span className="mo-roll">
                      <span>{c.level - 1}</span>
                      <span>{c.level}</span>
                    </span>
                  ) : (
                    c.level
                  )}
                </b>
              </span>
              <span aria-hidden="true">·</span>
              <span>{c.grade}-Grade</span>
              {c.class && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{c.class.name}</span>
                </>
              )}
            </div>
          </div>
          <div className="sys-grade" aria-label={`${c.grade}-Grade`}>
            {c.grade}
            <small>Grade</small>
          </div>
        </header>

        {c.dead ? (
          <section className="coherence" aria-label="Vital coherence">
            <p className="coherence__text">Deceased.</p>
          </section>
        ) : (
          falling && (
            <section className={`coherence${downed ? " mo-rise" : ""}`} style={downed ? ({ "--delay": "450ms" } as React.CSSProperties) : undefined} aria-live="polite" aria-label="Vital coherence">
              <p className="coherence__text">Vital coherence: {c.vitalCoherence}. Falling.</p>
              <div className="coherence__segments" role="img" aria-label={`Vital coherence ${c.vitalCoherence} of 3`}>
                {[1, 2, 3].map((n) => (
                  <i key={n} className={n <= (c.vitalCoherence ?? 0) ? "on" : ""} />
                ))}
              </div>
            </section>
          )
        )}

        <section className="sys-section" aria-label="Progress and vitals">
          <Vital
            label={<span className="label" style={{ color: "var(--system)" }}>Level {c.level + 1}</span>}
            kind="level"
            value={c.refinedVe}
            max={c.refinedVe + (toNext ?? 0)}
            text={toNext === null ? "Grade limit" : undefined}
            {...(leveled ? { meterClass: "mo-levelfill mo-flash", vars: { "--v-old": "90%" } } : {})}
          />
          <Vital label="Health" kind="health" value={c.hp} max={c.maxHp} danger={c.hp === 0} {...(downed ? { meterClass: "mo-drain" } : {})} />
          <Vital label="Aether" kind="aether" value={c.aether} max={c.maxAether} />
          <Vital label="Volatile Energy" kind="ve" value={c.storedVe} max={c.tolerance} />
        </section>
      </div>

      {c.background && <p className="prose dim background">{c.background}</p>}

      <Attributes campaignId={campaignId} c={c} readOnly={readOnly} leveled={leveled} />

      {c.proficiencies.length > 0 && (
        <section className="sys-section">
          <h2 className="sys-label">Proficiencies</h2>
          <ul>
            {c.proficiencies.map((p) => (
              <li key={p.shape} className={`sys-row sys-row--center${m === "technique" && e?.kind === "mark" && e.marks === 1 && e.shape.toLowerCase() === p.shape.toLowerCase() ? " mo-insert" : ""}`}>
                <span className="sys-row__main">{p.shape}</span>
                <span className="marks">
                  <span className="mo-marks" role="img" aria-label={`${p.marks} Mark${p.marks === 1 ? "" : "s"}`}>
                    {Array.from({ length: p.marks }, (_, i) => (
                      <i key={i} className={`on${m === "technique" && e?.kind === "mark" && i === p.marks - 1 && e.shape.toLowerCase() === p.shape.toLowerCase() ? " new" : ""}`} />
                    ))}
                  </span>
                  {m === "technique" && e?.kind === "mark" && e.shape.toLowerCase() === p.shape.toLowerCase() && <span className="mo-ticks" />}
                </span>
                <span className="sys-row__side">
                  {p.tier} +{p.bonus} · {p.marks} Mark{p.marks === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ClassOffers campaignId={campaignId} engine={engine} c={c} readOnly={readOnly} dealt={m === "class" && e?.kind === "classification"} />

      <ClassHeld campaignId={campaignId} engine={engine} c={c} readOnly={readOnly} inFight={inFight} taken={m === "class" && e?.kind === "class-accepted"} />

      <PrincipleSection campaignId={campaignId} c={c} readOnly={readOnly} distilled={m === "distillation" && e?.kind === "distilled" ? e.name : undefined} />

      <Titles campaignId={campaignId} c={c} readOnly={readOnly} fresh={m === "title" && e?.kind === "title-conferred" ? e.titleId : undefined} />

      <QuestLog campaignId={campaignId} c={c} readOnly={readOnly} fresh={m === "quest" && e?.kind === "quest-offered" ? e.questId : undefined} />

      <Carried campaignId={campaignId} c={c} roster={roster} readOnly={readOnly} pills={pills} />

      <PartySection campaignId={campaignId} c={c} roster={roster} readOnly={readOnly} />

      <Inspect c={c} />
    </article>
  );
}

/** How many notices read as current; older ones dim. */
const RECENT = 5;
/** How many show before the rest fold under "Earlier notices", so the tray stays in reach. */
const SHOWN = 8;

/** A notice of several paragraphs shows its first, with the rest a press away (P10). */
function NoticeText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const cut = text.indexOf("\n\n");
  if (cut < 0) return <span className="notice__text">{text}</span>;
  return (
    <span className="notice__text">
      {open ? text : text.slice(0, cut)}
      <button className="btn-link notice__more" onClick={() => setOpen(!open)}>
        {open ? "Less" : "Read the rest"}
      </button>
    </span>
  );
}

type Line = FeedItem & { text: string | null; moment: ReturnType<typeof momentOf> };

function NoticeItem({ n, old, names, rising }: { n: Line; old: boolean; names: Map<string, string> | null; rising?: boolean }) {
  const moment = !old && n.moment;
  return (
    <li className={`notice${moment ? " notice--moment" : ""}${moment === "downed" ? " notice--downed" : ""}${old ? " notice--old" : ""}${rising ? " mo-rise" : ""}`}>
      <Clave />
      <span>
        {names && <span className="notice__who">{names.get(n.characterId)}</span>}
        <NoticeText text={n.text!} />
      </span>
    </li>
  );
}

function Notices({ feed, names, rising }: { feed: FeedItem[]; names: Map<string, string> | null; rising: Set<string> }) {
  const lines: Line[] = feed.map((n) => ({ ...n, text: noticeLine(n.effect), moment: momentOf(n.effect) })).filter((n) => n.text);
  const earlier = lines.slice(SHOWN);
  return (
    <section aria-label="The System's notices">
      <h2 className="sys-label notices__label">Notices</h2>
      {lines.length === 0 ? (
        <p className="voice dim">No new notices.</p>
      ) : (
        <ol className={`notices${rising.size ? " is-playing" : ""}`}>
          {lines.slice(0, SHOWN).map((n, i) => (
            <NoticeItem key={n.key} n={n} old={i >= RECENT} names={names} rising={rising.has(n.key)} />
          ))}
        </ol>
      )}
      {earlier.length > 0 && (
        <details className="notices__earlier">
          <summary className="small dim">Earlier notices ({earlier.length})</summary>
          <ol className="notices">
            {earlier.map((n) => (
              <NoticeItem key={n.key} n={n} old names={names} />
            ))}
          </ol>
        </details>
      )}
    </section>
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
    <article className="interface iframe arrival">
      <header className="sys-head">
        <Clave />
        <p className="voice">Interface: awaiting registration.</p>
      </header>
      <p className="small dim">You have no character in this campaign yet. Your GM may make one for you, or you can bring your own.</p>
      <div className="cluster">
        <button className="btn btn--primary" onClick={() => setBuilding(true)} disabled={!engine}>
          Build a character
        </button>
      </div>
      {pool.length > 0 && (
        <section className="sys-section">
          <h2 className="sys-label">Or bring one you built</h2>
          <ul>
            {pool.map((c) => (
              <li key={c.id} className="sys-row sys-row--center">
                <span className="sys-row__main">{c.name}</span>
                <button className="btn btn--sm" onClick={() => bring(c.id)}>
                  Bring {c.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p className="error">{error}</p>}
    </article>
  );
}

/** A tool in the tray: open by default, folded closed while a fight runs (P5). */
function TrayPart({ title, folded, children }: { title: string; folded: boolean; children: React.ReactNode }) {
  return (
    <details className="tray-part" open={!folded} key={folded ? "folded" : "open"}>
      <summary>
        <h3>{title}</h3>
      </summary>
      <div className="stack">{children}</div>
    </details>
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
  const fighting = Boolean(view.combat);
  const playing = useMoments(view.feed);
  const rising = new Set([...playing.values()].map((p) => p.key));
  return (
    <main className="player-screen">
      <div className="interfaces">
        {view.characters.length === 0 ? (
          readOnly ? (
            <article className="interface iframe">
              <p className="voice dim">Interface: awaiting registration.</p>
            </article>
          ) : (
            <Arrival view={view} />
          )
        ) : (
          view.characters.map((c) => (
            <Interface
              key={c.id}
              campaignId={view.campaign.id}
              c={c}
              roster={view.roster}
              readOnly={readOnly}
              pills={pillsOf(engine).map((p) => p.name.toLowerCase())}
              engine={engine}
              inFight={Boolean(view.combat?.combatants.some((x) => x.characterId === c.id && !x.out))}
              playing={playing.get(c.id)}
            />
          ))
        )}
      </div>
      <aside className="player-side">
        <Notices feed={view.feed} names={names} rising={rising} />
        <div className="tray table-tray">
          <div className="tray-head">At the table</div>
          {view.combat && <Fight view={view} engine={engine} combat={view.combat} readOnly={readOnly} />}
          <Spoils view={view} readOnly={readOnly} />
          <TrayPart title="Dice" folded={fighting}>
            {!readOnly && view.characters.length > 0 && (
              <RollForm
                campaignId={view.campaign.id}
                characters={view.characters.map((c) => ({ id: c.id, name: c.name, force: c.force, aether: c.aether, surgeCost: c.surgeCost, proficiencies: c.proficiencies }))}
                shapes={engine ? shapes(engine) : []}
              />
            )}
            <RollList rolls={view.rolls} />
          </TrayPart>
          {!readOnly && (
            <TrayPart title="Ask the rules" folded={fighting}>
              <AskRules campaignId={view.campaign.id} className="stack ask-rules" heading={false} />
            </TrayPart>
          )}
        </div>
      </aside>
    </main>
  );
}
