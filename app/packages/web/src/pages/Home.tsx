import { useRegister } from "../frame.ts";
import { useEffect, useState } from "react";
import { type CampaignSummary, type User, api } from "../api.ts";
import { authConfig, setUser, signOut, useAuth } from "../auth.ts";
import { useEngine } from "../live.ts";
import { type CharacterSpec, Creator } from "../player/Creator.tsx";
import { Link, navigate } from "../router.tsx";
import { Icon } from "../ui.tsx";

/** The bar over every signed-in screen; its Guide link opens the guide's page for that screen in a tab of its own. */
export function TopBar({ children, guide = "start" }: { children?: React.ReactNode; guide?: string }) {
  const auth = useAuth();
  return (
    <header className="topbar">
      <Link to="/" className="topbar__mark">
        <i className="clave" aria-hidden="true" />
        <span className="wordmark">Gradebreaker</span>
      </Link>
      {children}
      <span className="grow" />
      <a className="small topbar__guide" href={`/guide/${guide}`} target="_blank" rel="noreferrer">
        Guide
      </a>
      <span className="small dim">
        {auth.user?.displayName}
        {auth.via === "dev" && <span className="tag">dev</span>}
      </span>
      <button className="btn-link small" onClick={() => void signOut().then(() => navigate("/"))}>
        Sign out
      </button>
    </header>
  );
}

interface Unassigned {
  id: string;
  name: string;
  spec: CharacterSpec;
}

function Pool({ campaigns }: { campaigns: CampaignSummary[] }) {
  const engine = useEngine(authConfig()?.rulesVersion);
  const [characters, setCharacters] = useState<Unassigned[] | null>(null);
  const [building, setBuilding] = useState(false);
  const [target, setTarget] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const load = () =>
    api<{ characters: Unassigned[] }>("GET", "/characters")
      .then((r) => setCharacters(r.characters))
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);

  const join = async (id: string) => {
    const campaignId = target[id] ?? campaigns[0]?.id;
    if (!campaignId) return;
    try {
      await api("POST", `/characters/${id}/join`, { campaignId });
      navigate(`/c/${campaignId}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async (id: string) => {
    setDeleting(null);
    await api("DELETE", `/characters/${id}`).catch((e) => setError(e.message));
    await load();
  };

  return (
    <section className="panel" aria-labelledby="chars-h">
      <div className="panel__head">
        <h2 id="chars-h">Your characters</h2>
      </div>
      <div className="panel__body stack home__chars">
        <p className="small dim">Characters you have built that are not in a campaign yet. Bringing one into a campaign moves it there for good.</p>
        {characters && characters.length > 0 && (
          <ul>
            {characters.map((c) => (
              <li key={c.id} className="stack home__char">
                <div className="spread">
                  <b className="home__char-name">{c.name}</b>
                  <span className="num dim home__char-stats">
                    {c.spec.kind === "pregen" ? "ready-made" : Object.entries(c.spec.stats).map(([k, v]) => `${k} ${v}`).join(" ")}
                  </span>
                </div>
                {campaigns.length > 0 && (
                  <div className="cluster">
                    <select className="select select--sm" value={target[c.id] ?? campaigns[0]!.id} onChange={(e) => setTarget({ ...target, [c.id]: e.target.value })} aria-label={`Campaign for ${c.name}`}>
                      {campaigns.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn--sm" onClick={() => join(c.id)}>
                      Bring into campaign
                    </button>
                  </div>
                )}
                {/* Deleting is for good, so it takes the confirm tap (Decisions, "the makeover", P12). */}
                <div>
                  {deleting === c.id ? (
                    <span className="confirm confirm--armed">
                      <span className="confirm__what">Deleting is permanent.</span>
                      <button className="btn btn--sm btn--danger" onClick={() => remove(c.id)}>
                        Delete {c.name}
                      </button>
                      <button className="btn btn--sm" onClick={() => setDeleting(null)}>
                        Keep {c.name}
                      </button>
                    </span>
                  ) : (
                    <button className="btn btn--sm btn--danger" onClick={() => setDeleting(c.id)}>
                      Delete…
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {building && engine ? (
          <Creator
            engine={engine}
            submitLabel="Register"
            onCancel={() => setBuilding(false)}
            onSubmit={async (spec) => {
              await api("POST", "/characters", spec);
              setBuilding(false);
              await load();
            }}
          />
        ) : (
          <div>
            <button className="btn" onClick={() => setBuilding(true)}>
              <Icon name="add" />
              Build a character
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}

function CampaignList({ campaigns, empty }: { campaigns: CampaignSummary[]; empty: string }) {
  if (!campaigns.length) return <p className="dim panel__body">{empty}</p>;
  return (
    <ul className="rows panel__rows">
      {campaigns.map((c) => (
        <li key={c.id}>
          <Link to={`/c/${c.id}`} className="row__main home__campaign">
            {c.name}
          </Link>
          <span className="num small dim">rules {c.rulesVersion}</span>
        </li>
      ))}
    </ul>
  );
}

export function Home() {
  useRegister("gm");
  const auth = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState(auth.user?.displayName ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ campaigns: CampaignSummary[] }>("GET", "/me")
      .then((r) => setCampaigns(r.campaigns))
      .catch((e) => setError(e.message));
  }, []);

  const create = async () => {
    try {
      const r = await api<{ campaign: CampaignSummary }>("POST", "/campaigns", { name });
      navigate(`/c/${r.campaign.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const rename = async () => {
    try {
      const r = await api<{ user: User }>("PATCH", "/me", { displayName });
      setUser(r.user);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const running = campaigns?.filter((c) => c.role === "gm") ?? [];
  const playing = campaigns?.filter((c) => c.role === "player") ?? [];

  return (
    <>
      <TopBar />
      <img className="home__band" src="/art/office-bone-band.webp" alt="" />
      <main className="screen screen--side home">
        {campaigns === null ? (
          <p className="dim">Loading…</p>
        ) : (
          <div className="stack home__main">
            <section className="panel" aria-labelledby="run-h">
              <div className="panel__head">
                <h2 id="run-h">Campaigns you run</h2>
              </div>
              <CampaignList campaigns={running} empty="None yet." />
              <div className="stack home__new">
                <div className="cluster home__new-row">
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New campaign name" aria-label="New campaign name" />
                  <button className="btn btn--primary" disabled={!name.trim()} onClick={create}>
                    Start a campaign
                  </button>
                </div>
                <p className="small dim">
                  You run it as the GM, on rules <span className="num">{authConfig()?.rulesVersion}</span>.
                </p>
              </div>
            </section>
            <section className="panel" aria-labelledby="play-h">
              <div className="panel__head">
                <h2 id="play-h">Campaigns you play in</h2>
              </div>
              <CampaignList campaigns={playing} empty="None yet. Open an invite link from your GM to join one." />
            </section>
          </div>
        )}
        <aside className="stack home__side">
          {campaigns !== null && <Pool campaigns={campaigns} />}
          <section className="panel" aria-labelledby="name-h">
            <div className="panel__head">
              <h2 id="name-h">Your name at the table</h2>
            </div>
            <div className="panel__body">
              <div className="cluster home__new-row">
                <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} aria-label="Your name at the table" />
                <button className="btn" disabled={!displayName.trim() || displayName === auth.user?.displayName} onClick={rename}>
                  Save
                </button>
              </div>
            </div>
          </section>
          {error && <p className="error">{error}</p>}
        </aside>
      </main>
    </>
  );
}
