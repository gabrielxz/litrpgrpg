/**
 * AssemblyAI's pre-recorded transcription (docs read 2026-09-30), for a test recording's second
 * opinion: the WAV uploaded to `/v2/upload`, a transcript requested from `/v2/transcript` with
 * `speech_models` and the game's `keyterms_prompt` (up to 1000), then polled until it is
 * `completed` or `error`. Words carry milliseconds from the audio's start. Unlike streaming, it runs
 * faster than real time.
 */
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

const API = "https://api.assemblyai.com/v2";
export const SECOND_OPINION_MODEL = "universal-3-5-pro";
const POLL_MS = 3000;

export interface FileWord {
  text: string;
  startMs: number;
  endMs: number;
}

export async function transcribeWav(key: string, wav: { header: Buffer; pcmPath: string }, terms: string[], opts: { fetch?: typeof fetch; pollMs?: number } = {}): Promise<FileWord[]> {
  const f = opts.fetch ?? fetch;
  const body = Readable.toWeb(
    Readable.from(
      (async function* () {
        yield wav.header;
        for await (const chunk of createReadStream(wav.pcmPath)) yield chunk as Buffer;
      })(),
    ),
  ) as ReadableStream;
  const up = await f(`${API}/upload`, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/octet-stream", "content-length": String(wav.header.length + statSync(wav.pcmPath).size) },
    body,
    duplex: "half",
  } as RequestInit);
  if (!up.ok) throw new Error(`the upload was refused (${up.status})`);
  const { upload_url } = (await up.json()) as { upload_url: string };
  const req = await f(`${API}/transcript`, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: upload_url, speech_models: [SECOND_OPINION_MODEL], keyterms_prompt: terms.slice(0, 1000) }),
  });
  if (!req.ok) throw new Error(`the transcript was refused (${req.status}): ${(await req.text()).slice(0, 200)}`);
  const { id } = (await req.json()) as { id: string };
  for (;;) {
    await new Promise((r) => setTimeout(r, opts.pollMs ?? POLL_MS));
    const res = await f(`${API}/transcript/${id}`, { headers: { authorization: key } });
    if (!res.ok) throw new Error(`the transcript could not be read (${res.status})`);
    const t = (await res.json()) as { status: string; error?: string; words?: { text: string; start: number; end: number }[] };
    if (t.status === "error") throw new Error(t.error ?? "the transcript failed");
    if (t.status === "completed") return (t.words ?? []).map((w) => ({ text: w.text, startMs: w.start, endMs: w.end }));
  }
}
