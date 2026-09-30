import type { GmView } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { Icon } from "../ui.tsx";

interface FeatureUsage {
  feature: string;
  requests: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

interface AiView {
  available: boolean;
  configured: boolean;
  models: { id: string; name: string }[];
  model?: string;
  keyHint?: string;
  setAt?: string;
  check?: { at: string; ok: boolean; problem?: string; message?: string };
  usage: { windows: { name: string; since: string | null; features: FeatureUsage[]; total: FeatureUsage }[] };
}

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const n = (x: number) => x.toLocaleString();

/**
 * The campaign's language-model key: the GM's own, held on the server. It goes in here and
 * never comes back; the card shows its last four characters, whether it works, and what the
 * campaign's requests have spent.
 */
export function AiCard({ view }: { view: GmView }) {
  const id = view.campaign.id;
  const [ai, setAi] = useState<AiView | null>(null);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (method: string, path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const next = await api<AiView>(method, `/campaigns/${id}/ai${path}`, body);
      setAi(next);
      setModel(next.model ?? next.models[0]?.id ?? "");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run("GET", "");
  }, [id]);

  const save = async () => {
    if (await run("PUT", "/key", { key, model })) setKey("");
  };

  if (!ai)
    return (
      <section className="panel" aria-labelledby="ai-h">
        <div className="panel__head">
          <h2 id="ai-h">AI</h2>
        </div>
        <div className="panel__body">{error ? <p className="error">{error}</p> : <p className="dim">Loading…</p>}</div>
      </section>
    );

  return (
    <section className="panel" aria-labelledby="ai-h">
      <div className="panel__head">
        <h2 id="ai-h">AI</h2>
      </div>
      <div className="panel__body stack ai-card">
        {!ai.available ? (
          <p className="dim">This server has no AI_KEY_SECRET, so it cannot hold a key. Everything else works without one.</p>
        ) : (
          <>
            <p className="small dim">
              Your own Anthropic API key. It stays on the server, and no player ever receives it; after saving you see only its last four
              characters. Drafting, suggestions, summaries, the campaign memory, and rules questions (players' too) spend it.
            </p>
            {ai.configured && (
              <div className="stack ai-card__status">
                <div className="cluster ai-card__key">
                  <i className="ic ic-lock dim" aria-hidden="true" />
                  <span>Key</span>
                  <code className="num">••••{ai.keyHint}</code>
                  <span className="small dim">saved {when(ai.setAt!)}</span>
                </div>
                {ai.check && (
                  <div className="cluster small ai-card__check">
                    {ai.check.ok ? (
                      <span className="tag tag--ok">
                        <Icon name="confirm" />
                        Works
                      </span>
                    ) : (
                      <span className="tag tag--danger">
                        <Icon name="warning" />
                        {ai.check.message}
                      </span>
                    )}
                    <span className="dim">(checked {when(ai.check.at)})</span>
                  </div>
                )}
              </div>
            )}
            <div className="cluster ai-card__row">
              <label className="field field--row">
                <span>Model</span>
                <select
                  className="select ai-card__model"
                  value={model}
                  disabled={busy}
                  onChange={(e) => {
                    setModel(e.target.value);
                    if (ai.configured) void run("PUT", "/model", { model: e.target.value });
                  }}
                >
                  {ai.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              {ai.configured && (
                <>
                  <span className="grow" />
                  <button className="btn btn--sm" type="button" disabled={busy} onClick={() => void run("POST", "/check")}>
                    Check again
                  </button>
                  <button className="btn btn--sm btn--danger" type="button" disabled={busy} onClick={() => void run("DELETE", "/key")}>
                    Remove key
                  </button>
                </>
              )}
            </div>
            <div className="cluster ai-card__row">
              <input
                className="input ai-card__key-input"
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={ai.configured ? "A new key replaces the saved one" : "sk-ant-…"}
                aria-label={ai.configured ? "A new key replaces the saved one" : "Anthropic API key"}
              />
              <button className="btn" type="button" disabled={busy || !key.trim()} onClick={save}>
                {busy ? "Checking…" : "Check and save"}
              </button>
            </div>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <Usage usage={ai.usage} />
      </div>
    </section>
  );
}

function Usage({ usage }: { usage: AiView["usage"] }) {
  const all = usage.windows.find((w) => w.name === "all time");
  if (!all?.total.requests) return <p className="small dim">No requests yet.</p>;
  return (
    <>
      <h3 className="ai-card__usage-h">Usage</h3>
      <table className="table ai-usage">
        <thead>
          <tr>
            <th>
              <span className="sr-only">Window or feature</span>
            </th>
            <th className="num">Requests</th>
            <th className="num">Failed</th>
            <th className="num">Input tokens</th>
            <th className="num">Output tokens</th>
            <th className="num">From cache</th>
          </tr>
        </thead>
        <tbody>
          {usage.windows.map((w) => (
            <UsageRow key={w.name} label={w.name === "session" ? "This session" : w.name === "30 days" ? "Last 30 days" : "All time"} u={w.total} />
          ))}
          {all.features.map((f) => (
            <UsageRow key={f.feature} label={f.feature} u={f} dim />
          ))}
        </tbody>
      </table>
      <p className="small dim">Billing is on your Anthropic account; its console shows the cost.</p>
    </>
  );
}

function UsageRow({ label, u, dim }: { label: string; u: FeatureUsage; dim?: boolean }) {
  return (
    <tr className={dim ? "dim ai-usage__feature" : undefined}>
      <td className={dim ? "ai-usage__name num" : undefined}>{label}</td>
      <td className="num">{n(u.requests)}</td>
      <td className="num">{n(u.failed)}</td>
      <td className="num">{n(u.inputTokens)}</td>
      <td className="num">{n(u.outputTokens)}</td>
      <td className="num">{n(u.cacheReadTokens)}</td>
    </tr>
  );
}
