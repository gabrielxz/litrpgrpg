/**
 * The capture bar under the top bar in every tab: whether the table is listening, this tab's
 * microphone and its mute, and consent. The GM's also starts, pauses, and stops listening and
 * shows each person's stream (app/DESIGN.md, "Voice capture" and "Listening consent").
 *
 * The tab captures while the table listens, its person has consented and is at the table, it is
 * not muted, and no newer tab of theirs has taken over. It tells the server what it is doing, so
 * the GM sees a muted microphone as muted and a refused one as refused.
 *
 * Every frame is sent while the microphone is open. With SEND_ONLY_SPEECH the speech gate
 * (@gradebreaker/record) sends only speech and the half second before it, and the server closes
 * the idle vendor stream (listening.ts), so the bill follows speaking time; it stays off until a
 * measurement shows it loses no short line after a long silence. The level goes to the server
 * four times a second regardless, for the GM's panel.
 */
import { type ListeningStatus, SpeechGate, type StreamStatus } from "@gradebreaker/record";
import { useEffect, useRef, useState } from "react";
import { api } from "./api.ts";
import { type Microphone, MicrophoneError, NeedsClick, openMicrophone } from "./capture.ts";

interface Props {
  campaignId: string;
  role: "gm" | "player";
  status: ListeningStatus | null;
  send: (data: string | ArrayBuffer) => void;
}

/** Off: a short reply after a silence must not lose its first words (Gabriel, 2026-09-29). */
const SEND_ONLY_SPEECH = false;
const LEVEL_EVERY_MS = 250;

const MODE_LABEL = { off: "Not listening", listening: "Listening", paused: "Paused" } as const;

const STREAM_LABEL: Record<StreamStatus["state"], string> = {
  live: "live",
  muted: "muted",
  silent: "nothing arriving",
  "no-microphone": "no microphone",
  "not-connected": "no tab open",
};

export function ListeningBar({ campaignId, role, status, send }: Props) {
  const [muted, setMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [needsClick, setNeedsClick] = useState(false);
  const [retry, setRetry] = useState(0);
  const [level, setLevel] = useState(0);
  const [takenElsewhere, setTakenElsewhere] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sawCapturing = useRef(false);

  const wantCapture = Boolean(status && status.mode !== "off" && status.consented && status.present && !takenElsewhere);
  const micOn = wantCapture && status?.mode === "listening" && !muted;

  // A newer tab of this person's took the stream: this one stops until asked to capture here.
  useEffect(() => {
    if (!wantCapture) {
      sawCapturing.current = false;
      return;
    }
    if (status?.capturing) sawCapturing.current = true;
    else if (sawCapturing.current) {
      sawCapturing.current = false;
      setTakenElsewhere(true);
    }
  }, [wantCapture, status?.capturing]);

  // Tell the server what this tab is doing.
  const noMicrophone = Boolean(micError && !needsClick);
  useEffect(() => {
    if (!status) return;
    send(JSON.stringify({ type: "capture", capture: wantCapture, muted, noMicrophone }));
  }, [send, Boolean(status), wantCapture, muted, noMicrophone]);

  // The microphone is open only while it is in use.
  useEffect(() => {
    if (!micOn) {
      setLevel(0);
      return;
    }
    let mic: Microphone | null = null;
    let live = true;
    setMicError(null);
    setNeedsClick(false);
    const gate = new SpeechGate<ArrayBuffer>();
    let levelAt = 0;
    openMicrophone((pcm, l) => {
      const now = performance.now();
      if (!SEND_ONLY_SPEECH) send(pcm);
      else for (const f of gate.push(pcm, l, now)) send(f);
      if (now - levelAt >= LEVEL_EVERY_MS) {
        levelAt = now;
        send(JSON.stringify({ type: "level", level: Math.round(l * 100) / 100 }));
      }
      setLevel(l);
    })
      .then((m) => {
        if (live) mic = m;
        else m.stop();
      })
      .catch((e) => {
        if (!live) return;
        setMicError(e instanceof MicrophoneError ? e.message : String(e));
        setNeedsClick(e instanceof NeedsClick);
      });
    return () => {
      live = false;
      mic?.stop();
      setLevel(0);
    };
  }, [micOn, send, retry]);

  // An error from the last request is stale once the table's state moves.
  useEffect(() => setError(null), [status?.mode, status?.consented]);

  if (!status) return null;

  const setMode = async (mode: "off" | "listening" | "paused") => {
    setError(null);
    try {
      await api("POST", `/campaigns/${campaignId}/listening`, { mode });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const consent = async (give: boolean) => {
    setError(null);
    try {
      await api("POST", `/campaigns/${campaignId}/listening/consent`, { give });
      setAsking(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const mine = !status.consented
    ? null
    : !status.present
      ? "You are not at the table this session."
      : takenElsewhere
        ? "Another of your tabs has the microphone."
        : status.mode === "off"
          ? null
          : muted
            ? "Your microphone is muted."
            : status.mode === "paused"
              ? "Your microphone is off until the GM resumes."
              : micError
                ? micError
                : "Your microphone is live.";

  return (
    <div className={`listening-bar ${status.mode}`} role="region" aria-label="Listening">
      <div className="listening-line">
        <strong className="listening-mode">
          <span className="dot" />
          {MODE_LABEL[status.mode]}
        </strong>
        {mine && <span className="small">{mine}</span>}
        {micOn && !micError && <LevelMeter level={level} />}
        {micOn && micError && (
          <button onClick={() => setRetry((n) => n + 1)}>{needsClick ? "Turn my microphone on" : "Try again"}</button>
        )}
        {takenElsewhere && <button onClick={() => setTakenElsewhere(false)}>Use this tab</button>}
        {wantCapture && (
          <button className={muted ? "primary" : ""} onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
            {muted ? "Unmute" : "Mute"}
          </button>
        )}
        {role === "gm" && (
          <span className="listening-controls">
            {status.mode === "off" && (status.streams ?? []).length > 0 && !(status.missing ?? []).length && (
              <button onClick={() => setMode("listening")}>Start listening</button>
            )}
            {status.mode === "listening" && <button onClick={() => setMode("paused")}>Pause for everyone</button>}
            {status.mode === "paused" && <button onClick={() => setMode("listening")}>Resume</button>}
            {status.mode !== "off" && <button onClick={() => setMode("off")}>Stop listening</button>}
          </span>
        )}
        <span className="listening-consent">
          {status.consented ? (
            <button className="link small" onClick={() => consent(false)}>
              Withdraw consent
            </button>
          ) : (
            !asking && <button onClick={() => setAsking(true)}>Consent to listening…</button>
          )}
        </span>
      </div>
      {asking && !status.consented && (
        <div className="listening-ask">
          <p>
            While the GM has listening on during a session, this tab sends your microphone to the Gradebreaker server, which passes it to
            Soniox to turn into text. Neither keeps the audio. The text appears on the GM's screen, where the app uses it to draft what
            happened, and is deleted 30 days after it was said. You can mute this tab at any time. The table listens only while everyone
            at it has consented, and withdrawing your consent stops it for everyone.
          </p>
          <div className="row">
            <button className="primary" onClick={() => consent(true)}>
              I consent
            </button>
            <button onClick={() => setAsking(false)}>Not now</button>
          </div>
        </div>
      )}
      {role === "gm" && <GmStreams status={status} />}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

function GmStreams({ status }: { status: ListeningStatus }) {
  const streams = status.streams ?? [];
  const missing = status.missing ?? [];
  return (
    <div className="listening-streams small">
      {status.mode === "off" && status.stopped && <span>Stopped: {status.stopped}.</span>}
      {missing.length > 0 && <span className="warn-text">Waiting on consent from {names(missing)}.</span>}
      {streams.length === 0 && status.mode === "off" && !status.stopped && <span className="muted">Start a session to listen.</span>}
      {status.mode === "listening" &&
        streams.map((s) => (
          <span key={s.userId} className={`stream ${s.state}`}>
            {s.displayName}: {STREAM_LABEL[s.state]}
            {s.state === "live" && <LevelMeter level={s.level} />}
          </span>
        ))}
    </div>
  );
}

const names = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

function LevelMeter({ level }: { level: number }) {
  return (
    <span className="level" aria-label={`Level ${Math.round(level * 100)}`}>
      <span style={{ width: `${Math.round(Math.min(1, level) * 100)}%` }} />
    </span>
  );
}
