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
import { HEARD_KEEP_DAYS, type ListeningStatus, RECORDING_KEEP_DAYS, SpeechGate, type StreamStatus } from "@gradebreaker/record";
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
  "not-transcribed": "not transcribed",
};

export function ListeningBar({ campaignId, role, status, send }: Props) {
  const [muted, setMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [needsClick, setNeedsClick] = useState(false);
  const [retry, setRetry] = useState(0);
  const [level, setLevel] = useState(0);
  const [takenElsewhere, setTakenElsewhere] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askingRecording, setAskingRecording] = useState(false);
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
  const consent = async (give: boolean, what: "consent" | "recording-consent" = "consent") => {
    setError(null);
    try {
      await api("POST", `/campaigns/${campaignId}/listening/${what}`, { give });
      setAsking(false);
      setAskingRecording(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const record = async (on: boolean) => {
    setError(null);
    try {
      await api("POST", `/campaigns/${campaignId}/listening/record`, { on });
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

  const own = (
    <>
      {status.recorded && <span className="tag tag--danger">Recording for testing</span>}
      {micOn && !micError && <LevelMeter level={level} />}
      {micOn && micError && (
        <button className="btn btn--sm" onClick={() => setRetry((n) => n + 1)}>
          {needsClick ? "Turn my microphone on" : "Try again"}
        </button>
      )}
      {takenElsewhere && (
        <button className="btn btn--sm" onClick={() => setTakenElsewhere(false)}>
          Use this tab
        </button>
      )}
      {wantCapture && (
        <button className="btn btn--sm" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
          <i className={`ic ic-${muted ? "listen" : "mute"}`} aria-hidden="true" />
          {muted ? "Unmute" : "Mute"}
        </button>
      )}
    </>
  );
  const consents = (
    <span className="cluster listening-consent">
      {status.consented ? (
        <button className="btn-link small dim" onClick={() => consent(false)}>
          Withdraw consent
        </button>
      ) : (
        !asking && (
          <button className="btn btn--sm" onClick={() => setAsking(true)}>
            Consent to listening…
          </button>
        )
      )}
      {status.recordingConsented ? (
        <button className="btn-link small dim" onClick={() => consent(false, "recording-consent")}>
          Withdraw test-recording consent
        </button>
      ) : (
        !askingRecording && (
          <button className="btn-link small dim" onClick={() => setAskingRecording(true)}>
            Test recordings…
          </button>
        )
      )}
    </span>
  );
  const asks = (
    <>
      {asking && !status.consented && (
        <div className="listening-ask stack">
          <p>
            While the GM has listening on during a session, this tab sends your microphone to the Gradebreaker server, which passes it to
            Soniox to turn into text. Neither keeps the audio. The text appears on the GM's screen, where the app uses it to draft what
            happened, and is deleted {HEARD_KEEP_DAYS} days after it was said. You can mute this tab at any time. The table listens only while everyone
            at it has consented, and withdrawing your consent stops it for everyone.
          </p>
          <div className="cluster">
            <button className="btn btn--primary btn--sm" onClick={() => consent(true)}>
              I consent
            </button>
            <button className="btn btn--sm" onClick={() => setAsking(false)}>
              Not now
            </button>
          </div>
        </div>
      )}
      {askingRecording && !status.recordingConsented && (
        <div className="listening-ask stack">
          <p>
            A test recording keeps your voice so the listener can be measured against real speech. While the GM records a listening session
            for testing, the Gradebreaker server saves what your microphone sends, with the text the listening made of it, for the GM to
            download. It is deleted from the server when the GM deletes it, or {RECORDING_KEEP_DAYS} days after the recording ends. This
            tab says when your voice is being kept. Withdrawing this consent deletes your part of every test recording still on the server.
            It is separate from consenting to listening, which keeps no audio.
          </p>
          <div className="cluster">
            <button className="btn btn--primary btn--sm" onClick={() => consent(true, "recording-consent")}>
              I consent to test recordings
            </button>
            <button className="btn btn--sm" onClick={() => setAskingRecording(false)}>
              Not now
            </button>
          </div>
        </div>
      )}
      {error && <p className="error small">{error}</p>}
    </>
  );

  // The GM's: a part of the table bar, beside the session and the clock (P1); what needs a line of
  // its own (consent, streams that are not live) opens under the bar.
  if (role === "gm") {
    const details = <GmStreamDetails status={status} />;
    const open = (asking && !status.consented) || (askingRecording && !status.recordingConsented) || Boolean(error);
    return (
      <>
        <div className="tablebar__part listening" role="region" aria-label="Listening">
          <i className={`listen-dot listen-dot--${status.mode}`} aria-hidden="true" />
          <b>{MODE_LABEL[status.mode]}</b>
          <GmStreamSummary status={status} />
          {mine && status.mode !== "off" && <span className="dim">{mine}</span>}
          {own}
          {status.mode === "off" && (status.streams ?? []).length > 0 && !(status.missing ?? []).length && (
            <button className="btn btn--sm" onClick={() => setMode("listening")}>
              <i className="ic ic-play" aria-hidden="true" />
              Start listening
            </button>
          )}
          {status.mode === "listening" && (
            <button className="btn btn--sm" onClick={() => setMode("paused")}>
              <i className="ic ic-pause" aria-hidden="true" />
              Pause for everyone
            </button>
          )}
          {status.mode === "paused" && (
            <button className="btn btn--sm" onClick={() => setMode("listening")}>
              <i className="ic ic-play" aria-hidden="true" />
              Resume
            </button>
          )}
          {status.mode !== "off" && (
            <button className="btn btn--sm" onClick={() => setMode("off")}>
              <i className="ic ic-stop" aria-hidden="true" />
              Stop listening
            </button>
          )}
          {status.mode !== "off" &&
            (status.recording?.on ? (
              <button className="btn btn--sm" onClick={() => record(false)}>
                Stop the test recording
              </button>
            ) : (
              <button className="btn btn--sm" onClick={() => record(true)}>
                Record for testing
              </button>
            ))}
          {consents}
        </div>
        {details}
        {open && <div className="tablebar__drawer">{asks}</div>}
      </>
    );
  }

  // A player's: a thin strip above their screen.
  return (
    <div className={`listen-strip listen-strip--${status.mode}`} role="region" aria-label="Listening">
      <div className="listen-strip__line">
        <i className={`listen-dot listen-dot--${status.mode}`} aria-hidden="true" />
        <b>{MODE_LABEL[status.mode]}</b>
        {mine && <span className="dim">{mine}</span>}
        {own}
        <span className="grow" />
        {consents}
      </div>
      {asks}
    </div>
  );
}

/** How many of the table's streams are live, in the bar. */
function GmStreamSummary({ status }: { status: ListeningStatus }) {
  const streams = status.streams ?? [];
  if (status.mode === "off") return streams.length === 0 && !status.stopped ? <span className="dim">Start a session to listen.</span> : null;
  const live = streams.filter((s) => s.state === "live").length;
  return (
    <span className="dim">
      {live} of {streams.length} live
    </span>
  );
}

/** What needs the GM's eye, under the bar: a stop, consent missing, a stream that is not live. */
function GmStreamDetails({ status }: { status: ListeningStatus }) {
  const streams = status.streams ?? [];
  const missing = status.missing ?? [];
  const unrecorded = status.recording?.on ? status.recording.unconsented : [];
  const trouble = status.mode === "listening" && streams.some((s) => s.state !== "live");
  if (!(status.mode === "off" && status.stopped) && !missing.length && !unrecorded.length && !trouble) return null;
  return (
    <div className="tablebar__drawer listening-streams small">
      {status.mode === "off" && status.stopped && <span>Stopped: {status.stopped}.</span>}
      {missing.length > 0 && <span className="warning">Waiting on consent from {names(missing)}.</span>}
      {unrecorded.length > 0 && <span className="dim">Not recorded (no test-recording consent): {names(unrecorded)}.</span>}
      {trouble &&
        streams.map((s) => (
          <span key={s.userId} className={`stream stream--${s.state}`}>
            {s.displayName}: {STREAM_LABEL[s.state]}
            {s.failure && ` (${s.failure})`}
            {s.state === "live" && <LevelMeter level={s.level} />}
            {s.recorded && <span className="tag">recorded</span>}
          </span>
        ))}
    </div>
  );
}

const names = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

/** The level as a few bars of a meter; its shape is fixed and its height follows the level. */
const BARS = [0.55, 1, 0.7, 0.85, 0.45];
function LevelMeter({ level }: { level: number }) {
  const l = Math.min(1, level);
  return (
    <span className="level-meter" role="img" aria-label={`Level ${Math.round(l * 100)}`}>
      {BARS.map((k, i) => (
        <i key={i} style={{ height: `${Math.max(12, Math.round(l * k * 100))}%` }} />
      ))}
    </span>
  );
}
