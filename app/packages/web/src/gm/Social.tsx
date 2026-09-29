/**
 * The GM's party and System message forms. Players make their own party choices on their
 * screens; the GM records them here for a player who is not at a screen, and disbands. The
 * composer sends the System's words to one character, several, or a party, now or held.
 */
import type { Action, GmView } from "@gradebreaker/record";
import { useState } from "react";
import { type MessageDraft, draftCharacterSummary, draftMessage } from "../api.ts";
import { type Names, tableWordsIn } from "../text.ts";
import { Commit } from "./Commit.tsx";
import type { FormProps } from "./Record.tsx";
import { useAiConfigured } from "./useAi.ts";

// ---------------------------------------------------------------- party ---

type PartyMode = "invite" | "answer" | "leave" | "disband";

function partyNames(view: GmView, names: Names) {
  return (partyId: string) => view.parties.find((p) => p.id === partyId)?.members.map(names).join(", ") ?? "";
}

export function PartyForm({ view, names, onRecorded }: FormProps) {
  const [mode, setMode] = useState<PartyMode>(view.invites.length ? "answer" : "invite");
  const chars = view.characters;
  const [fromId, setFromId] = useState(chars[0]?.id ?? "");
  const [toId, setToId] = useState(chars[1]?.id ?? "");
  const [inviteId, setInviteId] = useState(view.invites[0]?.id ?? "");
  const [accept, setAccept] = useState(true);
  const members = view.parties.flatMap((p) => p.members);
  const [leaverId, setLeaverId] = useState(members[0] ?? "");
  const [partyId, setPartyId] = useState(view.parties[0]?.id ?? "");
  const partyOf = partyNames(view, names);

  if (chars.length < 2) return <p className="muted">A party needs two characters.</p>;

  let action: Action | null = null;
  let problem: string | null = null;
  let label = "";
  switch (mode) {
    case "invite":
      if (fromId === toId) problem = "Pick two different characters.";
      action = { type: "party.invite", fromId, toId };
      label = `Record ${names(fromId)} inviting ${names(toId)}`;
      break;
    case "answer": {
      const inv = view.invites.find((i) => i.id === inviteId) ?? view.invites[0];
      if (!inv) problem = "No invitation is waiting on an answer.";
      else {
        action = { type: "party.answer", inviteId: inv.id, accept };
        label = `Record ${names(inv.toId)} ${accept ? "accepting" : "declining"}`;
      }
      break;
    }
    case "leave": {
      const who = members.includes(leaverId) ? leaverId : members[0];
      if (!who) problem = "Nobody is in a party.";
      else {
        action = { type: "party.leave", characterId: who };
        label = `Record ${names(who)} leaving the party`;
      }
      break;
    }
    case "disband": {
      const p = view.parties.find((x) => x.id === partyId) ?? view.parties[0];
      if (!p) problem = "There is no party to disband.";
      else {
        action = { type: "party.disband", partyId: p.id };
        label = `Disband ${partyOf(p.id)}`;
      }
      break;
    }
  }

  const MODES: [PartyMode, string][] = [
    ["invite", "Invite"],
    ["answer", `Answer${view.invites.length ? ` (${view.invites.length})` : ""}`],
    ["leave", "Leave"],
    ["disband", "Disband"],
  ];
  const pick = (value: string, set: (v: string) => void, options: [string, string][]) => (
    <select value={value} onChange={(e) => set(e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  const everyone = chars.map((c): [string, string] => [c.id, c.name]);

  return (
    <div className="form">
      <div className="row">
        {MODES.map(([m, l]) => (
          <label key={m}>
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} /> {l}
          </label>
        ))}
      </div>
      {mode === "invite" && (
        <div className="row">
          <label>From {pick(fromId, setFromId, everyone)}</label>
          <label>To {pick(toId, setToId, everyone)}</label>
        </div>
      )}
      {mode === "answer" && view.invites.length > 0 && (
        <div className="row">
          <label>
            Invitation
            {pick(
              inviteId,
              setInviteId,
              view.invites.map((i) => [i.id, `${names(i.fromId)} invites ${names(i.toId)}`]),
            )}
          </label>
          <label>
            <input type="radio" checked={accept} onChange={() => setAccept(true)} /> Accept
          </label>
          <label>
            <input type="radio" checked={!accept} onChange={() => setAccept(false)} /> Decline
          </label>
        </div>
      )}
      {mode === "leave" && members.length > 0 && (
        <div className="row">
          <label>Member {pick(leaverId, setLeaverId, members.map((m) => [m, names(m)]))}</label>
        </div>
      )}
      {mode === "disband" && view.parties.length > 0 && (
        <div className="row">
          <label>Party {pick(partyId, setPartyId, view.parties.map((p) => [p.id, partyOf(p.id)]))}</label>
        </div>
      )}
      <p className="muted">
        Players invite, answer, and leave on their own screens. Record it here for a player away from theirs. Who invites,
        who accepts at once, and who stays solo are moments for the sweep.
      </p>
      <Commit campaignId={view.campaign.id} action={action} problem={problem} names={names} label={label} onRecorded={onRecorded} />
    </div>
  );
}

// ------------------------------------------------------------- composer ---

export function MessageForm({ view, names, onRecorded }: FormProps) {
  const [to, setTo] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [hold, setHold] = useState(false);
  const [heldPick, setHeldPick] = useState<{ id: string; send: boolean } | null>(null);
  const ai = useAiConfigured(view.campaign.id);
  const [gist, setGist] = useState("");
  const [drafted, setDrafted] = useState<MessageDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [integration, setIntegration] = useState(false);
  const player = (playerId?: string) =>
    playerId ? (view.members.find((m) => m.userId === playerId)?.displayName ?? "a former player") : "GM";
  const toggle = (id: string) => setTo(to.includes(id) ? to.filter((x) => x !== id) : [...to, id]);
  const words = tableWordsIn(text);

  // Recipients in the campaign's character order, so the log line reads the same way each time.
  const recipients = view.characters.map((c) => c.id).filter((id) => to.includes(id));
  let problem: string | null = null;
  if (!recipients.length) problem = "Pick who receives it.";
  else if (!text.trim()) problem = "Write the message.";
  const action: Action = { type: "message.send", to: recipients, text: text.trim(), ...(hold ? { hold: true } : {}) };
  const whom = recipients.map(names).join(", ");
  // With nothing in the box, the draft puts the GM's own message in the voice.
  const asked = gist.trim() || text.trim();
  const draft = async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const { draft: d } = await draftMessage(view.campaign.id, recipients, asked);
      setText(d.text);
      setDrafted(d);
    } catch (e) {
      setDraftError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  };
  // One character: the System's summary of them, on the tutorial's template.
  const summarize = async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const { draft: d } = await draftCharacterSummary(view.campaign.id, recipients[0]!, integration);
      setText(d.text);
      setDrafted({ text: d.text, register: "explanation", added: [], flags: d.flags });
    } catch (e) {
      setDraftError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  };
  // What the drafter flagged holds for its text; once the GM edits, the table-words warning below still reads the edit.
  const note = drafted && drafted.text === text.trim() ? drafted : null;
  const voiceFlags = note?.flags.filter((f) => !f.startsWith("table word")) ?? [];

  const held = view.held.find((m) => m.id === heldPick?.id);
  const heldAction: Action | null = held
    ? heldPick!.send
      ? { type: "message.release", messageId: held.id }
      : { type: "void", targetId: held.id, reason: "undo" }
    : null;

  return (
    <div className="form">
      <div className="recipients">
        {view.parties.map((p) => (
          <button key={p.id} className="chip" onClick={() => setTo([...new Set([...to, ...p.members])])}>
            + The party: {p.members.map(names).join(", ")}
          </button>
        ))}
        {view.characters.length > 1 && (
          <button className="chip" onClick={() => setTo(view.characters.map((c) => c.id))}>
            + Everyone
          </button>
        )}
        {to.length > 0 && (
          <button className="chip" onClick={() => setTo([])}>
            Clear
          </button>
        )}
      </div>
      <div className="checks">
        {view.characters.map((c) => (
          <label key={c.id} className="check">
            <input type="checkbox" checked={to.includes(c.id)} onChange={() => toggle(c.id)} /> {c.name}{" "}
            <span className="muted small">({player(c.playerId)})</span>
          </label>
        ))}
      </div>
      {ai && (
        <details className="voice-draft">
          <summary>Draft it in the System's voice</summary>
          <label>
            What the System conveys
            <textarea rows={2} value={gist} maxLength={2000} onChange={(e) => setGist(e.target.value)} placeholder="In your words, or leave it empty to put the message below in the voice" />
          </label>
          <div className="row">
            <button disabled={!recipients.length || !asked || drafting} onClick={draft}>
              {drafting ? "Drafting…" : "Draft"}
            </button>
            <span className="muted small">The draft replaces the message below, for you to edit before sending.</span>
          </div>
          {recipients.length === 1 && (
            <div className="row">
              <button disabled={drafting} onClick={summarize}>
                Draft a summary of {names(recipients[0]!)}
              </button>
              <label className="check small">
                <input type="checkbox" checked={integration} onChange={(e) => setIntegration(e.target.checked)} /> As the Integration Complete summary
              </label>
            </div>
          )}
          {draftError && <p className="error">{draftError}</p>}
        </details>
      )}
      <label>
        The System says
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Anomaly logged." />
      </label>
      {words.length > 0 && (
        <p className="warning">
          The System speaks in-world units only and never says {words.map((w) => `“${w}”`).join(", ")} in its table sense
          (The System AI, “The Voice of the System”). Keep the word if it means something else here.
        </p>
      )}
      {note && note.added.length > 0 && (
        <p className="warning small">The draft adds what you did not give: {note.added.join("; ")}. Check each against what you hold.</p>
      )}
      {voiceFlags.length > 0 && <p className="warning small">The draft may break the voice: {voiceFlags.join(", ")}.</p>}
      {text.trim() && (
        <div className="system-sample">
          <img src="/clave.svg" alt="" className="clave-tiny" />
          <em>{text.trim()}</em>
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} /> Hold it and send it later
      </label>
      <Commit
        campaignId={view.campaign.id}
        action={action}
        problem={problem}
        names={names}
        label={recipients.length ? `${hold ? "Hold for" : "Send to"} ${whom}` : "Send"}
        onRecorded={(env) => {
          setText("");
          setGist("");
          setDrafted(null);
          onRecorded(env);
        }}
      />

      {view.held.length > 0 && (
        <div className="held">
          <h3>Held</h3>
          <ul>
            {view.held.map((m) => (
              <li key={m.id} className={heldPick?.id === m.id ? "picked" : ""}>
                <div>
                  <em>{m.text}</em>
                </div>
                <div className="muted small">For {m.to.map(names).join(", ")}</div>
                <div className="row">
                  <button onClick={() => setHeldPick({ id: m.id, send: true })}>Send now…</button>
                  <button onClick={() => setHeldPick({ id: m.id, send: false })}>Discard…</button>
                </div>
              </li>
            ))}
          </ul>
          {held && heldAction && (
            <Commit
              key={`${held.id}-${heldPick!.send}`}
              campaignId={view.campaign.id}
              action={heldAction}
              names={names}
              label={heldPick!.send ? `Send to ${held.to.map(names).join(", ")}` : "Discard the held message"}
              onRecorded={(env) => {
                setHeldPick(null);
                onRecorded(env);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
