/**
 * The GM's screen, in sections: the party (every sheet and the forms that change them), the
 * campaign log, the table (members, invite links, who plays whom), and any player's screen as
 * that player sees it.
 */
import type { Envelope, GmView, PlayerView, Sheet, Stack } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { useCampaign } from "../live.ts";
import { useEngine } from "../live.ts";
import { PlayerCampaign } from "../player/PlayerCampaign.tsx";
import { AiCard } from "./Ai.tsx";
import { RecordingsCard } from "./Recordings.tsx";
import { CombatSection } from "./Combat.tsx";
import { Commit, LogSeq } from "./Commit.tsx";
import { SpoilsCard } from "./Items.tsx";
import { QuestsSection } from "./Quests.tsx";
import { HveSection } from "./Hve.tsx";
import { EventsSection } from "./Events.tsx";
import { useDraftRuns } from "./Drafts.tsx";
import { SuggestionsSection, suggestionsWaiting } from "./Suggestions.tsx";
import { SessionBar, SessionsCard } from "./Sessions.tsx";
import { ClockControls } from "./Clock.tsx";
import { PrinciplesSection, principlesWaiting } from "./Principles.tsx";
import { ClassesSection, classesWaiting } from "./Classes.tsx";
import { BestiarySection } from "./Bestiary.tsx";
import { type Firing, PrepSection } from "./Prep.tsx";
import { TitlesDueCard } from "./Titles.tsx";
import { stackLine } from "../items.ts";
import { ATTRIBUTES } from "../text.ts";
import { Table } from "./Invites.tsx";
import { Log } from "./Log.tsx";
import { RecordPanel } from "./Record.tsx";
import { AskRules } from "../AskRules.tsx";
import { ListeningBar } from "../Listening.tsx";
import { Icon, Vital } from "../ui.tsx";
import { useEcho } from "../moments.ts";

function CharacterCard({ c, player, party, items }: { c: Sheet; player: string; party: string | null; items: Stack[] }) {
  const band = c.saturation.band;
  return (
    <article className={`panel sheet${c.downed || c.dead ? " sheet--down" : ""}`}>
      <div className="panel__head">
        <h2 className="sheet__name">{c.name}</h2>
        <span className="small dim">{player}</span>
        <span className="grow" />
        <span className="num small">
          Level {c.level} · {c.grade}
        </span>
      </div>
      <div className="panel__body stack sheet__body">
        <div className="cluster sheet__tags">
          {c.dead ? (
            <span className="tag tag--danger">
              <Icon name="danger" />
              Dead
            </span>
          ) : (
            c.downed && (
              <span className="tag tag--danger">
                <Icon name="downed" />
                Downed
              </span>
            )
          )}
          {c.pendingSystemLevels.length > 0 && <span className="tag tag--solid">Assigned points due: Level {c.pendingSystemLevels.join(", ")}</span>}
          {c.freePoints > 0 && <span className="tag">{c.freePoints} free held</span>}
          {c.class && <span className="tag">{c.class.name}</span>}
          {c.classOffers.length > 0 && <span className="tag tag--solid">Class offers standing</span>}
          {party && <span className="tag">Party: {party}</span>}
          {band !== "None" && (
            <span className={`tag ${band === "Mild" ? "tag--warn" : "tag--danger"}`}>
              <Icon name="warning" />
              {band} Saturation {c.saturation.penalty}
              {c.saturation.collapseClock ? " · collapse clock running" : ""}
            </span>
          )}
        </div>
        <Vital label="HP" kind={c.downed || c.dead ? "danger" : "health"} value={c.hp} max={c.maxHp} />
        <Vital label="Aether" kind="aether" value={c.aether} max={c.maxAether} />
        <Vital label="Stored" kind={band === "None" ? "ve" : "danger"} value={c.storedVe} max={c.tolerance} />
        <Vital label="Refined" kind="level" value={c.refinedVe} max={c.refinedVe + (c.veToNextLevel ?? 0)} text={c.atCap ? "cap" : `${c.veToNextLevel} to go`} />
        <dl className="statline">
          {ATTRIBUTES.map((a) => (
            <div key={a}>
              <dt>{a}</dt>
              <dd>{c.raw[a]}</dd>
            </div>
          ))}
        </dl>
        {c.temporary.length > 0 && <p className="small dim">Temporarily down 1 {c.temporary.join(", 1 ")} until a clean Consolidation.</p>}
        {c.proficiencies.length > 0 && (
          <p className="small">
            <span className="dim">Proficiencies</span> {c.proficiencies.map((p) => `${p.shape} ${p.tier} (${p.marks})`).join(", ")}
          </p>
        )}
        {c.titles.length > 0 && (
          <p className="small">
            <span className="dim">Titles</span>{" "}
            {c.titles
              .map((t) => `${t.name}${t.status !== "active" ? ` (${t.status})` : t.negative ? " (negative)" : t.choice ? " (stat to choose)" : ""}`)
              .join(", ")}
          </p>
        )}
        {items.length > 0 && (
          <p className="small">
            <span className="dim">Carries</span> {items.map(stackLine).join(", ")}
          </p>
        )}
        {c.background && <p className="prose dim sheet__background">{c.background}</p>}
      </div>
    </article>
  );
}

/** Hand a character to another player, or take it over as the GM. */
function Holders({ view, names, onRecorded }: { view: GmView; names: (id: string) => string; onRecorded: (env: Envelope) => void }) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const players = view.members.filter((m) => m.role === "player");
  const who = (id: string | undefined) => (id ? (players.find((m) => m.userId === id)?.displayName ?? "a former player") : "the GM");
  if (!view.characters.length) return null;
  return (
    <section className="card">
      <h2>Who plays whom</h2>
      <table className="rows">
        <tbody>
          {view.characters.map((c) => {
            const current = c.playerId ?? "";
            const picked = choice[c.id] ?? current;
            return (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>
                  <select value={picked} onChange={(e) => setChoice({ ...choice, [c.id]: e.target.value })}>
                    <option value="">The GM</option>
                    {players.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                  {picked !== current && (
                    <Commit
                      campaignId={view.campaign.id}
                      action={{ type: "character.assign", characterId: c.id, ...(picked ? { playerId: picked } : {}) }}
                      names={names}
                      label={`Hand ${c.name} to ${who(picked || undefined)}`}
                      onRecorded={(env) => {
                        setChoice({ ...choice, [c.id]: picked });
                        onRecorded(env);
                      }}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** A player's screen exactly as they see it, refreshed whenever the record changes. */
function ViewAs({ view }: { view: GmView }) {
  const players = view.members.filter((m) => m.role === "player");
  const [userId, setUserId] = useState(players[0]?.userId ?? "");
  const [shown, setShown] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picked = players.some((m) => m.userId === userId) ? userId : (players[0]?.userId ?? "");
  useEffect(() => {
    if (!picked) return;
    api<PlayerView>("GET", `/campaigns/${view.campaign.id}/players/${picked}/view`)
      .then((v) => {
        setShown(v);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [picked, view]);
  if (!players.length) return <p className="muted pad">No players yet. Invite them from the Table.</p>;
  return (
    <div className="view-as">
      <div className="view-as-bar cluster">
        <i className="ic ic-eye" aria-hidden="true" />
        Viewing as
        <select className="select select--sm" value={picked} onChange={(e) => setUserId(e.target.value)}>
          {players.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </select>
        <span className="muted small">exactly what their screen shows; nothing here can be changed</span>
      </div>
      {error && <p className="error">{error}</p>}
      {/* The player's register, exactly as their screen shows it. */}
      {shown && (
        <div className="sys view-as__screen">
          <PlayerCampaign view={shown} readOnly />
        </div>
      )}
    </div>
  );
}

type Section = "party" | "suggestions" | "prep" | "combat" | "bestiary" | "quests" | "principles" | "classes" | "events" | "hve" | "log" | "rules" | "table" | "player";
/** The sections in four groups, by the GM's job (Decisions, "the makeover", P7). */
const GROUPS: { label: string; sections: [Section, string][] }[] = [
  {
    label: "Play",
    sections: [
      ["party", "Party"],
      ["combat", "Combat"],
      ["suggestions", "Suggestions"],
      ["events", "Events"],
    ],
  },
  {
    label: "Record",
    sections: [
      ["quests", "Quests"],
      ["principles", "Principles"],
      ["classes", "Classes"],
      ["hve", "HVE"],
      ["log", "Campaign log"],
    ],
  },
  {
    label: "Prepare",
    sections: [
      ["prep", "Prep"],
      ["bestiary", "Bestiary"],
    ],
  },
  {
    label: "Table",
    sections: [
      ["table", "Table"],
      ["rules", "Rules"],
      ["player", "Player view"],
    ],
  },
];
const SECTIONS = GROUPS.flatMap((g) => g.sections);

function useSection(): [Section, (s: Section) => void] {
  const read = () => {
    const h = window.location.hash.slice(1);
    return (SECTIONS.some(([s]) => s === h) ? h : "party") as Section;
  };
  const [section, set] = useState<Section>(read);
  useEffect(() => {
    const on = () => set(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [section, (s) => (window.location.hash = s)];
}

/** The rules the campaign runs on: always the current ones until the first printed edition (app/DESIGN.md, "Rules editions"). */
function RulesCard({ view }: { view: GmView }) {
  return (
    <section className="card">
      <h2>Rules</h2>
      <p>
        This campaign runs on rules {view.campaign.rulesVersion}. It follows each new version as it lands; an action a new version no longer
        applies shows in the campaign log's rejected list.
      </p>
    </section>
  );
}

export function GmCampaign({ view, live }: { view: GmView; live: ReturnType<typeof useCampaign> }) {
  const engine = useEngine(view.campaign.rulesVersion);
  const [section, setSection] = useSection();
  // A prepared fight or quest handed to Combat or Quests to fire there.
  const [firing, setFiring] = useState<Firing | null>(null);
  const drafts = useDraftRuns(view, live.draftsChanged);
  const echo = useEcho(view);
  // Characters by id, and every creature or NPC a fight has named, for the log's lines.
  const byId = new Map(view.characters.map((c) => [c.id, c.name]));
  for (const env of live.log) {
    const a = env.action;
    const specs = a.type === "combat.start" ? a.combatants : a.type === "combat.add" ? [a.combatant] : [];
    for (const s of specs) if (s.name && !byId.has(s.combatantId)) byId.set(s.combatantId, s.name);
  }
  // Quests by their key, for the log's lines.
  for (const q of view.quests) byId.set(q.id, `[${q.code}] ${q.title}`);
  const names = (id: string) => byId.get(id) ?? id;
  /** The other members of a character's party, by name. */
  const partyWith = (id: string) => {
    const p = view.parties.find((x) => x.members.includes(id));
    return p ? p.members.filter((m) => m !== id).map(names).join(", ") : null;
  };
  const playerName = (c: Sheet) =>
    c.playerId ? (view.members.find((m) => m.userId === c.playerId)?.displayName ?? "a former player") : "GM";

  return (
    <LogSeq.Provider value={view.seq}>
      <nav className="nav" aria-label="Sections">
        {GROUPS.map((g) => (
          <span key={g.label} className="nav__group" role="group" aria-label={g.label}>
            {g.sections.map(([s, label]) => {
              const count =
                s === "suggestions"
                  ? suggestionsWaiting(view, engine, names, drafts.runs)
                  : s === "principles"
                    ? principlesWaiting(view)
                    : s === "classes"
                      ? classesWaiting(view, engine)
                      : s === "log"
                        ? view.rejected.length
                        : 0;
              const state = s !== "combat" ? null : view.encounter ? (view.encounter.round ? `Round ${view.encounter.round}` : "Set") : view.aftermath ? "To settle" : null;
              return (
                <button key={s} className="nav__item" aria-current={s === section ? "page" : undefined} onClick={() => setSection(s)}>
                  {label}
                  {count > 0 && (
                    <span className="count" aria-label={`${count} waiting`}>
                      {count}
                    </span>
                  )}
                  {state && <span className="nav__state">{state}</span>}
                </button>
              );
            })}
          </span>
        ))}
      </nav>
      <div className="tablebar" role="region" aria-label="The table">
        <SessionBar view={view} names={names} onRecorded={live.addToLog} onSweep={() => setSection("hve")} />
        <ListeningBar campaignId={view.campaign.id} role="gm" status={live.listening} send={live.send} />
        <ClockControls view={view} engine={engine} names={names} onRecorded={live.addToLog} />
        <span className="grow" />
        {echo && (
          // The quiet echo of a player's moment: one line, then it goes (moments.ts).
          <span key={echo.at} className="is-playing tablebar__echo">
            <span className={`echo mo-echo${echo.danger ? " echo--danger" : ""}`} role="status">
              {echo.danger ? <Icon name="downed" /> : <i className="clave" aria-hidden="true" />}
              {echo.text}
            </span>
          </span>
        )}
      </div>
      {section === "party" && (
        <main className="screen screen--side party-screen">
          <div className="stack party-screen__main">
            {engine && <TitlesDueCard view={view} engine={engine} onRecorded={live.addToLog} />}
            {view.characters.length === 0 ? (
              <p className="dim">No characters yet. Players can build their own once they join, or you can create one under New character.</p>
            ) : (
              <div className="sheets">
                {view.characters.map((c) => (
                  <CharacterCard key={c.id} c={c} player={playerName(c)} party={partyWith(c.id)} items={view.inventory[c.id] ?? []} />
                ))}
              </div>
            )}
            <SpoilsCard view={view} onRecorded={live.addToLog} />
          </div>
          <aside className="party-screen__side">
            {engine ? <RecordPanel view={view} engine={engine} names={names} onRecorded={live.addToLog} /> : <p className="dim">Loading rules…</p>}
          </aside>
        </main>
      )}
      {section === "prep" && (
        <PrepSection
          view={view}
          engine={engine}
          names={names}
          log={live.log}
          onRecorded={live.addToLog}
          onFire={(f) => {
            setFiring(f);
            setSection(f.kind === "encounter" ? "combat" : "quests");
          }}
        />
      )}
      {section === "combat" && (
        <CombatSection
          view={view}
          engine={engine}
          names={names}
          log={live.log}
          onRecorded={live.addToLog}
          {...(firing?.kind === "encounter" ? { firing } : {})}
          onFired={() => setFiring(null)}
        />
      )}
      {section === "bestiary" && <BestiarySection view={view} engine={engine} />}
      {section === "quests" && (
        <QuestsSection view={view} engine={engine} names={names} onRecorded={live.addToLog} {...(firing?.kind === "quest" ? { firing } : {})} onFired={() => setFiring(null)} />
      )}
      {section === "principles" && <PrinciplesSection view={view} engine={engine} names={names} onRecorded={live.addToLog} />}
      {section === "classes" && <ClassesSection view={view} engine={engine} names={names} onRecorded={live.addToLog} drafts={drafts} />}
      {section === "events" && <EventsSection view={view} engine={engine} names={names} onRecorded={live.addToLog} drafts={drafts} heard={live.heard} />}
      {section === "suggestions" && (
        <SuggestionsSection
          view={view}
          engine={engine}
          names={names}
          onRecorded={live.addToLog}
          drafts={drafts}
          onFire={(f) => {
            setFiring(f);
            setSection("quests");
          }}
        />
      )}
      {section === "hve" && <HveSection view={view} engine={engine} names={names} onRecorded={live.addToLog} drafts={drafts} />}
      {section === "log" && (
        <main className="page">
          <SessionsCard view={view} names={names} onRecorded={live.addToLog} />
          <Log view={view} log={live.log} names={names} onRecorded={live.addToLog} />
        </main>
      )}
      {section === "table" && (
        <main className="page narrow">
          <Table view={view} />
          <RulesCard view={view} />
          <AiCard view={view} />
          <RecordingsCard view={view} />
          <Holders view={view} names={names} onRecorded={live.addToLog} />
        </main>
      )}
      {section === "rules" && (
        <main className="page narrow">
          <AskRules campaignId={view.campaign.id} gm className="card" />
        </main>
      )}
      {section === "player" && <ViewAs view={view} />}
    </LogSeq.Provider>
  );
}
