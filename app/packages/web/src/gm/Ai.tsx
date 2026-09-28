import type { GmView } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { api } from "../api.ts";

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

  if (!ai) return <section className="card">{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</section>;

  return (
    <section className="card ai">
      <h2>AI</h2>
      {!ai.available ? (
        <p className="muted">This server has no AI_KEY_SECRET, so it cannot hold a key. Everything else works without one.</p>
      ) : (
        <>
          <p className="muted small">
            Your own Anthropic API key. It stays on the server, and no player ever receives it; after saving you see only its last four
            characters. The drafting features use it when they arrive.
          </p>
          {ai.configured && (
            <div className="ai-status">
              <div>
                Key <code>••••{ai.keyHint}</code> <span className="muted">saved {when(ai.setAt!)}</span>
              </div>
              {ai.check && (
                <div className={ai.check.ok ? "ok" : "error"}>
                  {ai.check.ok ? "Works" : ai.check.message} <span className="muted">(checked {when(ai.check.at)})</span>
                </div>
              )}
            </div>
          )}
          <div className="row">
            <label>
              Model{" "}
              <select
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
                <button className="link" disabled={busy} onClick={() => void run("POST", "/check")}>
                  Check again
                </button>
                <button className="link" disabled={busy} onClick={() => void run("DELETE", "/key")}>
                  Remove key
                </button>
              </>
            )}
          </div>
          <div className="row">
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={ai.configured ? "A new key replaces the saved one" : "sk-ant-…"}
            />
            <button disabled={busy || !key.trim()} onClick={save}>
              {busy ? "Checking…" : "Check and save"}
            </button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <Usage usage={ai.usage} />
    </section>
  );
}

function Usage({ usage }: { usage: AiView["usage"] }) {
  const all = usage.windows.find((w) => w.name === "all time");
  if (!all?.total.requests) return <p className="muted small">No requests yet.</p>;
  return (
    <>
      <h3>Usage</h3>
      <table className="rows">
        <thead>
          <tr>
            <th />
            <th>Requests</th>
            <th>Failed</th>
            <th>Input tokens</th>
            <th>Output tokens</th>
            <th>From cache</th>
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
      <p className="muted small">Billing is on your Anthropic account; its console shows the cost.</p>
    </>
  );
}

function UsageRow({ label, u, dim }: { label: string; u: FeatureUsage; dim?: boolean }) {
  return (
    <tr className={dim ? "muted" : ""}>
      <td>{label}</td>
      <td className="num">{n(u.requests)}</td>
      <td className="num">{n(u.failed)}</td>
      <td className="num">{n(u.inputTokens)}</td>
      <td className="num">{n(u.outputTokens)}</td>
      <td className="num">{n(u.cacheReadTokens)}</td>
    </tr>
  );
}
