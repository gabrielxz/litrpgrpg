import { useEffect, useState } from "react";
import { type CampaignSummary, type User, api } from "../api.ts";
import { authConfig, setUser, signOut, useAuth } from "../auth.ts";
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

  return (
    <>
      <TopBar />
      <main className="page narrow">
        <h1>Campaigns</h1>
        {campaigns === null ? (
          <p className="muted">Loading…</p>
        ) : campaigns.length === 0 ? (
          <p className="muted">None yet. Start one below, or open an invite link from your GM.</p>
        ) : (
          <ul className="campaign-list">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link to={`/c/${c.id}`}>{c.name}</Link>
                <span className="muted">
                  {c.role === "gm" ? "GM" : "Player"} · rules {c.rulesVersion}
                </span>
              </li>
            ))}
          </ul>
        )}

        <section className="card">
          <h2>New campaign</h2>
          <p className="muted">You run it as the GM, on rules {authConfig()?.rulesVersion}.</p>
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" />
            <button className="primary" disabled={!name.trim()} onClick={create}>
              Create
            </button>
          </div>
        </section>

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
