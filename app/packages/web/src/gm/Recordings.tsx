/**
 * Test recordings in the GM's Table section (app/DESIGN.md, M3, "Test recordings"): each one's
 * tracks (one WAV per person who consented) and its timeline of heard lines, in the shape
 * `render-audio` writes, to download into build/listening/audio/<name>/ and run `stt-eval` on.
 * The timeline's lines are the transcriber's: the GM corrects them here, hearing each line, and a
 * second opinion from a more accurate transcriber marks the lines where the two disagree, so
 * only those need a listen. The GM deletes a recording once it is downloaded; the server deletes
 * it after seven days regardless.
 */
import type { GmView } from "@gradebreaker/record";
import { useEffect, useState } from "react";
import { api, currentToken } from "../api.ts";

interface Recording {
  id: string;
  startedAt: string;
  endedAt?: string;
  people: { userId: string; name: string }[];
  /** Each file's route name and the name it is saved under, which the timeline uses. */
  files: { name: string; save: string; bytes: number }[];
  second: "running" | "done" | "none" | { failed: string };
  /** The server holds a key for the second transcriber. */
  secondAvailable: boolean;
}

interface Line {
  id: string;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  checked?: boolean;
}

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
const same = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const SHOWN = 150;

/**
 * The correction: every line with its speaker and time, a button that plays it, the text to fix,
 * and the second opinion where it differs. Saving marks the lines saved as checked, the reference
 * `stt-eval` scores against.
 */
function Corrector({ campaignId, r, onClose }: { campaignId: string; r: Recording; onClose: () => void }) {
  const [data, setData] = useState<{ speakers: { id: string; name: string }[]; lines: Line[]; second: { model: string; lines: Record<string, string> } | null } | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"disagree" | "unchecked" | "all">("disagree");
  const [more, setMore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const load = () =>
    api<{ speakers: { id: string; name: string }[]; lines: Line[]; second: { model: string; lines: Record<string, string> } | null }>("GET", `/campaigns/${campaignId}/recordings/${r.id}/lines`)
      .then((d) => {
        setData(d);
        if (!d.second) setFilter("unchecked");
      })
      .catch((e) => setError(e.message));
  useEffect(() => void load(), [r.id]);
  const play = async (l: Line) => {
    try {
      const token = await currentToken();
      const res = await fetch(`/api/campaigns/${campaignId}/recordings/${r.id}/snippet/${l.speaker}?start=${Math.max(0, l.startMs - 300)}&end=${l.endMs + 300}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`the audio could not be loaded (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!data) return error ? <p className="error small">{error}</p> : <p className="muted small">Loading the lines…</p>;
  const name = (id: string) => data.speakers.find((s) => s.id === id)?.name ?? id;
  const second = (l: Line) => data.second?.lines[l.id];
  const differs = (l: Line) => data.second !== null && !same(l.text, second(l) ?? "");
  const shown = data.lines.filter((l) => (filter === "all" ? true : filter === "unchecked" ? !l.checked : differs(l) && !l.checked));
  const save = async () => {
    setError(null);
    try {
      const lines = Object.entries(edits).map(([id, text]) => ({ id, text }));
      const out = await api<{ corrected: number }>("PUT", `/campaigns/${campaignId}/recordings/${r.id}/lines`, { lines });
      setSaved(`${out.corrected} line${out.corrected === 1 ? "" : "s"} saved.`);
      setEdits({});
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const checkedCount = data.lines.filter((l) => l.checked).length;
  return (
    <div className="form">
      <div className="form-row">
        <strong className="grow">
          Correcting: {checkedCount} of {data.lines.length} lines checked
          {data.second ? `; the second opinion (${data.second.model}) differs on ${data.lines.filter(differs).length}` : ""}
        </strong>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Which lines">
          {data.second && <option value="disagree">Where the two disagree</option>}
          <option value="unchecked">Not yet checked</option>
          <option value="all">Every line</option>
        </select>
        <button onClick={onClose}>Close</button>
      </div>
      <ul className="corrections">
        {shown.slice(0, SHOWN + more).map((l) => {
          const text = edits[l.id] ?? l.text;
          const alt = second(l);
          return (
            <li key={l.id} className={l.checked ? "checked" : ""}>
              <div className="form-row tight">
                <button className="link" onClick={() => play(l)} title="Hear this line">
                  ▶ {clock(l.startMs)}
                </button>
                <span className="muted small">{name(l.speaker)}</span>
                {l.checked && <span className="tag">checked</span>}
              </div>
              <input className="wide" value={text} onChange={(e) => setEdits({ ...edits, [l.id]: e.target.value })} />
              {alt !== undefined && differs(l) && (
                <div className="small muted">
                  Second opinion: {alt || "(nothing heard)"}{" "}
                  <button className="link" onClick={() => setEdits({ ...edits, [l.id]: alt })}>
                    Take it
                  </button>
                </div>
              )}
              {!l.checked && edits[l.id] === undefined && (
                <button className="link small" onClick={() => setEdits({ ...edits, [l.id]: l.text })}>
                  Right as heard
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {shown.length > SHOWN + more && <button onClick={() => setMore(more + SHOWN)}>Show {Math.min(SHOWN, shown.length - SHOWN - more)} more</button>}
      <div className="form-row">
        <button className="primary" disabled={!Object.keys(edits).length} onClick={save}>
          Save {Object.keys(edits).length || ""} line{Object.keys(edits).length === 1 ? "" : "s"}
        </button>
        {saved && <span className="small muted">{saved}</span>}
        {error && <span className="error small">{error}</span>}
      </div>
    </div>
  );
}

const size = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`);
const minutes = (r: Recording) => (r.endedAt ? Math.max(1, Math.round((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 60000)) : null);

export function RecordingsCard({ view }: { view: GmView }) {
  const id = view.campaign.id;
  const [list, setList] = useState<Recording[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const refresh = () =>
    api<{ recordings: Recording[] }>("GET", `/campaigns/${id}/recordings`)
      .then((r) => setList(r.recordings))
      .catch((e) => setError(e.message));
  useEffect(() => void refresh(), [id, view.seq]);

  // The file needs the sign-in header, so it is fetched and handed to the browser to save.
  const download = async (r: Recording, file: string, save: string) => {
    setError(null);
    try {
      const token = await currentToken();
      const res = await fetch(`/api/campaigns/${id}/recordings/${r.id}/${file}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`the download failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = save;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const secondOpinion = async (r: Recording) => {
    setError(null);
    try {
      await api("POST", `/campaigns/${id}/recordings/${r.id}/second-opinion`, {});
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  // While a second opinion runs, the list checks back every 10 seconds.
  useEffect(() => {
    if (!list?.some((r) => r.second === "running")) return;
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [list]);
  const remove = async (r: Recording) => {
    setError(null);
    try {
      await api("DELETE", `/campaigns/${id}/recordings/${r.id}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!list?.length && !error) return null;
  return (
    <section className="card">
      <h2>Test recordings</h2>
      <p className="muted small">
        Each person's voice as the listening took it, with the lines it heard, for measuring the listener. Correct the lines here, hearing
        each one; a second opinion from a more accurate transcriber marks where the two disagree. Then save the files into
        build/listening/audio/ under one folder and run stt-eval on it. Deleted here, or 7 days after the recording ends.
      </p>
      {error && <p className="error small">{error}</p>}
      <ul className="small">
        {(list ?? []).map((r) => (
          <li key={r.id}>
            {new Date(r.startedAt).toLocaleString()}
            {r.endedAt ? `, ${minutes(r)} min` : ", recording"}: {r.people.map((p) => p.name).join(", ") || "nobody"}
            {r.endedAt && (
              <div className="form-row">
                {r.files.map((f) => (
                  <button key={f.name} className="link" onClick={() => download(r, f.name, f.save)}>
                    {f.name === "timeline.json"
                      ? "Timeline"
                      : f.name === "timeline.heard.json"
                        ? "Timeline as heard"
                        : f.name === "second.json"
                          ? "Second opinion"
                          : (r.people.find((p) => `${p.userId}.wav` === f.name)?.name ?? "Track")}{" "}
                    ({size(f.bytes)})
                  </button>
                ))}
                <button className="link" onClick={() => setCorrecting(correcting === r.id ? null : r.id)}>
                  Correct the lines
                </button>
                {r.second === "running" ? (
                  <span className="muted">second opinion running…</span>
                ) : r.second === "done" ? null : r.secondAvailable ? (
                  <button className="link" onClick={() => secondOpinion(r)} title="Transcribes the tracks again with a more accurate transcriber, faster than real time">
                    {typeof r.second === "object" ? `Second opinion failed (${r.second.failed}): try again` : "Get a second opinion"}
                  </button>
                ) : null}
                <button className="link" onClick={() => remove(r)}>
                  Delete
                </button>
              </div>
            )}
            {correcting === r.id && r.endedAt && <Corrector campaignId={id} r={r} onClose={() => setCorrecting(null)} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
