/**
 * Reviewing the drafted bookkeeping: an item given, moved, or used up, a quest advanced,
 * completed, or failed, VE granted aloud, a party invitation or its answer, or a count ticked,
 * each in a small form the GM can edit before accepting; and a Prep cue, which points at a
 * prepared item the GM fires from Prep.
 */
import type { Engine } from "@gradebreaker/engine";
import { type Action, type GmView, tickedCounters } from "@gradebreaker/record";
import { useState } from "react";
import { type DraftItem, type DraftRun, acceptDraft } from "../api.ts";
import { type Names, counterLabel, describe } from "../text.ts";
import { Commit } from "./Commit.tsx";

const SPOILS = "spoils";

function Holder({ view, value, onChange, label }: { view: GmView; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {view.characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value={SPOILS}>The spoils</option>
      </select>
    </label>
  );
}

const whole = (v: string) => Math.max(0, Math.trunc(Number(v)) || 0);

/** The fields of one drafted action. Each edit hands back the whole action. */
function ActionFields({ view, engine, names, action, onChange }: { view: GmView; engine: Engine; names: Names; action: Action; onChange: (a: Action) => void }) {
  const count = (n: number, set: (n: number) => void) => (
    <label>
      How many
      <input type="number" className="narrow-input" min={1} value={n} onChange={(e) => set(whole(e.target.value))} />
    </label>
  );
  switch (action.type) {
    case "item.give":
      return (
        <div className="form-row">
          <Holder view={view} label="To" value={action.to} onChange={(to) => onChange({ ...action, to })} />
          {action.items.map((s, i) => (
            <span key={i} className="form-row tight">
              <label>
                Item
                <input value={s.name} onChange={(e) => onChange({ ...action, items: action.items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              </label>
              {count(s.count, (n) => onChange({ ...action, items: action.items.map((x, j) => (j === i ? { ...x, count: n } : x)) }))}
            </span>
          ))}
        </div>
      );
    case "item.move":
      return (
        <div className="form-row">
          <Holder view={view} label="From" value={action.from} onChange={(from) => onChange({ ...action, from })} />
          <Holder view={view} label="To" value={action.to} onChange={(to) => onChange({ ...action, to })} />
          <label>
            Item
            <input value={action.name} onChange={(e) => onChange({ ...action, name: e.target.value })} />
          </label>
          {count(action.count, (n) => onChange({ ...action, count: n }))}
        </div>
      );
    case "item.remove":
      return (
        <div className="form-row">
          <Holder view={view} label="From" value={action.from} onChange={(from) => onChange({ ...action, from })} />
          <label>
            Item
            <input value={action.name} onChange={(e) => onChange({ ...action, name: e.target.value })} />
          </label>
          {count(action.count, (n) => onChange({ ...action, count: n }))}
          <label className="grow">
            Note
            <input value={action.note ?? ""} maxLength={200} onChange={(e) => onChange({ ...action, ...(e.target.value ? { note: e.target.value } : { note: undefined }) })} />
          </label>
        </div>
      );
    case "quest.progress":
      return <div className="form-row">{count(action.by, (by) => onChange({ ...action, by }))}</div>;
    case "quest.complete":
      return (
        <div className="form-row">
          {action.awards.map((w, i) => (
            <label key={w.characterId}>
              VE to {names(w.characterId)}
              <input
                type="number"
                className="narrow-input"
                min={0}
                value={w.ve}
                onChange={(e) => onChange({ ...action, awards: action.awards.map((x, j) => (j === i ? { ...x, ve: whole(e.target.value) } : x)) })}
              />
            </label>
          ))}
        </div>
      );
    case "ve.award": {
      const b = action.basis;
      return (
        <div className="form-row">
          {b.kind === "core" ? (
            <label>
              Core
              <input value={b.core} onChange={(e) => onChange({ ...action, basis: { kind: "core", core: e.target.value } })} />
            </label>
          ) : b.kind === "other" ? (
            <label className="grow">
              For
              <input value={b.note} onChange={(e) => onChange({ ...action, basis: { kind: "other", note: e.target.value } })} />
            </label>
          ) : null}
          {action.awards.map((w, i) => (
            <label key={w.characterId}>
              VE to {names(w.characterId)}
              <input
                type="number"
                className="narrow-input"
                min={0}
                value={w.ve}
                onChange={(e) => onChange({ ...action, awards: action.awards.map((x, j) => (j === i ? { ...x, ve: whole(e.target.value) } : x)) })}
              />
            </label>
          ))}
        </div>
      );
    }
    case "party.invite":
      return (
        <div className="form-row">
          {(["fromId", "toId"] as const).map((k) => (
            <label key={k}>
              {k === "fromId" ? "Who invites" : "Who is invited"}
              <select value={action[k]} onChange={(e) => onChange({ ...action, [k]: e.target.value })}>
                {view.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      );
    case "party.answer":
      return (
        <div className="form-row">
          <label className="check">
            <input type="radio" checked={action.accept} onChange={() => onChange({ ...action, accept: true })} /> Joins
          </label>
          <label className="check">
            <input type="radio" checked={!action.accept} onChange={() => onChange({ ...action, accept: false })} /> Declines
          </label>
        </div>
      );
    case "counter.tick":
      return (
        <div className="form-row">
          <label>
            Who
            <select value={action.characterId} onChange={(e) => onChange({ ...action, characterId: e.target.value })}>
              {view.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Count
            <select value={action.counter} onChange={(e) => onChange({ ...action, counter: e.target.value })}>
              {tickedCounters(engine).map((c) => (
                <option key={c} value={c}>
                  {counterLabel(c)}
                </option>
              ))}
            </select>
          </label>
          {count(action.count, (n) => onChange({ ...action, count: n }))}
        </div>
      );
    default:
      return null;
  }
}

const KIND_LABEL: Partial<Record<Action["type"], string>> = {
  "item.give": "Items found",
  "item.move": "Items change hands",
  "item.remove": "Items used up or lost",
  "quest.progress": "Quest progress",
  "quest.complete": "Quest complete",
  "quest.fail": "Quest failed",
  "ve.award": "VE granted",
  "party.invite": "Party invitation",
  "party.answer": "Answer to an invitation",
  "counter.tick": "A count toward a title",
};

export function ActionDraftCard({
  view,
  engine,
  names,
  run,
  item,
  cited,
  onChanged,
  onRecorded,
  onDismiss,
}: {
  view: GmView;
  engine: Engine;
  names: Names;
  run: DraftRun;
  item: DraftItem;
  cited: React.ReactNode;
  onChanged: (item: DraftItem) => void;
  onRecorded: Parameters<typeof Commit>[0]["onRecorded"];
  onDismiss: () => void;
}) {
  const [action, setAction] = useState<Action>(item.action!);
  const quest = "questId" in action ? view.quests.find((q) => q.id === action.questId) : undefined;
  const questNames: Names = (id) => (id === quest?.id ? `[${quest.code}] ${quest.title}` : names(id));
  // An answer names its invitation: one drafted in the same run (recorded once the GM accepts
  // it, and named then by its recorded id), or one waiting in the record.
  const drafted = action.type === "party.answer" ? run.items.find((i) => i.itemId === action.inviteId) : undefined;
  const invitation = action.type === "party.answer" ? ((drafted?.action as { fromId: string; toId: string } | undefined) ?? view.invites.find((i) => i.id === action.inviteId)) : undefined;
  const waiting = drafted !== undefined && !(drafted.status === "accepted" && drafted.actionId && !drafted.undone);
  const recordable: Action =
    action.type === "party.answer" && drafted?.actionId && !waiting
      ? { ...action, inviteId: drafted.actionId }
      : action.type === "ve.award"
        ? { ...action, awards: action.awards.filter((w) => w.ve > 0) }
        : action;
  const heading =
    action.type === "party.answer" && invitation
      ? `${names(invitation.toId)} ${action.accept ? "joins" : "declines"} ${names(invitation.fromId)}'s invitation`
      : action.type === "party.invite"
        ? `${names(action.fromId)} invites ${names(action.toId)}`
        : describe(action, questNames, () => undefined);
  const problem =
    (action.type === "item.give" && action.items.some((s) => !s.name.trim() || s.count < 1)) ||
    ((action.type === "item.move" || action.type === "item.remove") && (!action.name.trim() || action.count < 1)) ||
    (action.type === "item.move" && action.from === action.to)
      ? "Name the item, a count from 1, and two different holders."
      : action.type === "party.invite" && action.fromId === action.toId
        ? "An invitation goes from one character to another."
        : action.type === "ve.award" && !action.awards.some((w) => w.ve > 0)
          ? "Give someone VE, or dismiss the draft."
          : waiting
            ? "Accept the invitation it answers first."
            : null;
  return (
    <li className="draft">
      <h4 className="draft-kind">
        {KIND_LABEL[action.type] ?? action.type}: <span className="muted">{heading}</span>
      </h4>
      {cited}
      {item.undone && <p className="small warning">Accepted, and it was undone in the log. Accept it again or dismiss it.</p>}
      {item.why && (
        <p className="why">
          <b>Drafted because:</b> {item.why}
        </p>
      )}
      <ActionFields view={view} engine={engine} names={names} action={action} onChange={setAction} />
      <Commit
        campaignId={view.campaign.id}
        action={problem ? null : recordable}
        problem={problem}
        names={names}
        label="Accept"
        submitWith={async (id, a) => {
          const out = await acceptDraft(view.campaign.id, item, id, a);
          onChanged(out.item);
          return out.appended;
        }}
        {...(onRecorded ? { onRecorded } : {})}
        actions={
          <button className="btn" onClick={onDismiss}>
            Dismiss
          </button>
        }
      />
    </li>
  );
}

/** A prepared item whose cue the table reached: fired from Prep, dismissed here. */
export function CueCard({ view, item, cited, onDismiss }: { view: GmView; item: DraftItem; cited: React.ReactNode; onDismiss: () => void }) {
  const prep = view.prep.find((p) => p.id === item.prepId);
  return (
    <li className="draft">
      <h4 className="draft-kind">
        Prep cue: <span className="muted">{prep?.title ?? item.prepId}</span>
        {item.fired && <span className="tag">fired</span>}
      </h4>
      {cited}
      {item.why && (
        <p className="why">
          <b>Drafted because:</b> {item.why}
        </p>
      )}
      {prep?.note && <p className="small">Its cue: {prep.note}</p>}
      {!prep && <p className="small warning">That prepared item is no longer in Prep.</p>}
      <div className="form-row">
        {prep && !item.fired && (
          <a className="button" href="#prep">
            Fire it from Prep
          </a>
        )}
        <button className="btn btn--sm" onClick={onDismiss}>{item.fired ? "Clear" : "Dismiss"}</button>
      </div>
    </li>
  );
}
