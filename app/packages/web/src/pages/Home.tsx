import { useEffect, useState } from "react";
import { type CampaignSummary, type User, api } from "../api.ts";
import { authConfig, setUser, signOut, useAuth } from "../auth.ts";
import { useEngine } from "../live.ts";
import { type CharacterSpec, Creator } from "../player/Creator.tsx";
import { Link, navigate } from "../router.tsx";

export function TopBar({ children }: { children?: React.ReactNode }) {
  const auth = useAuth();
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <img src="/clave-ink.svg" alt="" /> Gradebreaker
      </Link>
      <div className="topbar-middle">{children}</div>
      <div className="topbar-user">
        {auth.user?.displayName}
        {auth.via === "dev" && <span className="tag">dev</span>}
        <button className="link" onClick={() => void signOut().then(() => navigate("/"))}>
          Sign out
        </button>
      </div>
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
    await api("DELETE", `/characters/${id}`).catch((e) => setError(e.message));
    await load();
  };

  return (
    <section className="card">
      <h2>Your characters</h2>
      <p className="muted">
        Characters you have built that are not in a campaign yet. Bringing one into a campaign moves it there for good.
      </p>
      {characters && characters.length > 0 && (
        <ul className="pool">
          {characters.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong>
              <span className="muted small">
                {c.spec.kind === "pregen" ? "ready-made" : Object.entries(c.spec.stats).map(([k, v]) => `${k} ${v}`).join(" ")}
              </span>
              {campaigns.length > 0 && (
                <span className="row">
                  <select value={target[c.id] ?? campaigns[0]!.id} onChange={(e) => setTarget({ ...target, [c.id]: e.target.value })}>
                    {campaigns.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => join(c.id)}>Bring into campaign</button>
                </span>
              )}
              <button className="link" onClick={() => remove(c.id)}>
                Delete
              </button>
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
        <button onClick={() => setBuilding(true)}>Build a character</button>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function CampaignList({ campaigns, empty }: { campaigns: CampaignSummary[]; empty: string }) {
  if (!campaigns.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="campaign-list">
      {campaigns.map((c) => (
        <li key={c.id}>
          <Link to={`/c/${c.id}`}>{c.name}</Link>
          <span className="muted">rules {c.rulesVersion}</span>
        </li>
      ))}
    </ul>
  );
}

export function Home() {
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
      <main className="page narrow">
        {campaigns === null ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <section>
              <h2>Campaigns you play in</h2>
              <CampaignList campaigns={playing} empty="None yet. Open an invite link from your GM to join one." />
            </section>
            <Pool campaigns={campaigns} />
            <section>
              <h2>Campaigns you run</h2>
              <CampaignList campaigns={running} empty="None yet." />
              <div className="row">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New campaign name" />
                <button className="primary" disabled={!name.trim()} onClick={create}>
                  Start a campaign
                </button>
              </div>
              <p className="muted small">You run it as the GM, on rules {authConfig()?.rulesVersion}.</p>
            </section>
          </>
        )}

        <section className="card">
          <h2>Your name at the table</h2>
          <div className="row">
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <button disabled={!displayName.trim() || displayName === auth.user?.displayName} onClick={rename}>
              Save
            </button>
          </div>
        </section>
        {error && <p className="error">{error}</p>}
      </main>
    </>
  );
}
