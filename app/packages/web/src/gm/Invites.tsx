import "../css/table-rules.css";
import type { GmView } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { type Invite, api } from "../api.ts";
import { Icon } from "../ui.tsx";

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
  const open = (i: Invite) =>
    !i.revokedAt && !(i.expiresAt && new Date(i.expiresAt) <= new Date()) && !(i.maxUses !== null && i.uses >= i.maxUses);
  const active = invites.filter(open);

  return (
    <section className="panel" aria-labelledby="table-h">
      <div className="panel__head">
        <h2 id="table-h">Table</h2>
      </div>
      <div className="panel__body stack table-card">
        <ul className="rows">
          {view.members.map((m) => (
            <li key={m.userId}>
              <span className="row__main">{m.displayName}</span>
              <span className="small dim">{m.role === "gm" ? "GM" : playing(m.userId) || "no character yet"}</span>
            </li>
          ))}
        </ul>
        <h3 className="cluster table-card__h">
          <i className="ic ic-link dim" aria-hidden="true" />
          Invite links
        </h3>
        {active.length === 0 && <p className="small dim">No open links. Each link lets whoever holds it join as a player.</p>}
        {active.length > 0 && (
          <ul className="rows">
            {active.map((i) => (
              <li key={i.code}>
                <code className="num small row__main invite-link">{link(i.code)}</code>
                <span className="small dim invite-uses">
                  {i.uses} joined{i.maxUses ? ` of ${i.maxUses}` : ""}
                </span>
                <div className="row__actions">
                  <button className="btn btn--sm" type="button" onClick={() => copy(i.code)}>
                    {copied === i.code ? "Copied" : "Copy"}
                  </button>
                  <button className="btn btn--sm btn--danger" type="button" onClick={() => revoke(i.code)}>
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="cluster invite-new">
          <label className="field invite-new__uses">
            <span>How many people the link admits</span>
            <input type="number" min={1} className="input num" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Any" />
          </label>
          <button className="btn" type="button" onClick={create}>
            <Icon name="add" />
            New invite link
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}
