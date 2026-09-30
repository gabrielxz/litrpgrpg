/**
 * Test recordings in the GM's Table section (app/DESIGN.md, M3, "Test recordings"): each one's
 * tracks (one WAV per person who consented) and its timeline of heard lines, in the shape
 * `render-audio` writes, to download into build/listening/audio/<name>/ and run `stt-eval` on.
 * The timeline's lines are the transcriber's: correct them before scoring against them. The GM
 * deletes a recording once it is downloaded; the server deletes it after seven days regardless.
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
}

const size = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`);
const minutes = (r: Recording) => (r.endedAt ? Math.max(1, Math.round((Date.parse(r.endedAt) - Date.parse(r.startedAt)) / 60000)) : null);

export function RecordingsCard({ view }: { view: GmView }) {
  const id = view.campaign.id;
  const [list, setList] = useState<Recording[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        Each person's voice as the listening took it, with the lines it heard, for measuring the listener. Save the files into
        build/listening/audio/ under one folder, correct the timeline's lines, and run stt-eval on it. Deleted here, or 7 days after the
        recording ends.
      </p>
      {error && <p className="error small">{error}</p>}
      <ul className="small">
        {(list ?? []).map((r) => (
          <li key={r.id}>
            {new Date(r.startedAt).toLocaleString()}
            {r.endedAt ? `, ${minutes(r)} min` : ", recording"}: {r.people.map((p) => p.name).join(", ") || "nobody"}
            {r.endedAt && (
              <div className="row">
                {r.files.map((f) => (
                  <button key={f.name} className="link" onClick={() => download(r, f.name, f.save)}>
                    {f.name === "timeline.json" ? "Timeline" : (r.people.find((p) => `${p.userId}.wav` === f.name)?.name ?? "Track")} ({size(f.bytes)})
                  </button>
                ))}
                <button className="link" onClick={() => remove(r)}>
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
