import type { GmView } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { type Invite, api } from "../api.ts";

/** The table: who is in the campaign, and invite links for players. */
export function Table({ view }: { view: GmView }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [maxUses, setMaxUses] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = view.campaign.id;

  const load = () =>
    api<{ invites: Invite[] }>("GET", `/campaigns/${id}/invites`)
      .then((r) => setInvites(r.invites))
      .catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, [id]);

  const create = async () => {
    const n = Number(maxUses);
    await api("POST", `/campaigns/${id}/invites`, maxUses.trim() && n > 0 ? { maxUses: Math.trunc(n) } : {}).catch((e) =>
      setError(e.message),
    );
    setMaxUses("");
    await load();
  };
  const revoke = async (code: string) => {
    await api("DELETE", `/campaigns/${id}/invites/${code}`).catch((e) => setError(e.message));
    await load();
  };
  const link = (code: string) => `${window.location.origin}/join/${code}`;
  const copy = async (code: string) => {
    await navigator.clipboard.writeText(link(code));
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };
  const playing = (userId: string) =>
    view.characters
      .filter((c) => c.playerId === userId)
      .map((c) => c.name)
      .join(", ");
  const active = invites.filter((i) => !i.revokedAt);

  return (
    <section className="card">
      <h2>Table</h2>
      <ul className="members">
        {view.members.map((m) => (
          <li key={m.userId}>
            {m.displayName} <span className="muted">{m.role === "gm" ? "GM" : playing(m.userId) || "no character yet"}</span>
          </li>
        ))}
      </ul>
      <h3>Invite links</h3>
      {active.length === 0 && <p className="muted">No open links. Each link lets whoever holds it join as a player.</p>}
      <ul className="invites">
        {active.map((i) => (
          <li key={i.code}>
            <code>{link(i.code)}</code>
            <span className="muted">
              {i.uses} joined{i.maxUses ? ` of ${i.maxUses}` : ""}
            </span>
            <button className="link" onClick={() => copy(i.code)}>
              {copied === i.code ? "Copied" : "Copy"}
            </button>
            <button className="link" onClick={() => revoke(i.code)}>
              Revoke
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <input
          type="number"
          min={1}
          className="narrow-input"
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          placeholder="Any"
          title="How many people the link admits"
        />
        <button onClick={create}>New invite link</button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
