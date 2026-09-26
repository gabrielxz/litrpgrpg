/**
 * A campaign's record: the append-only action log and the sheets computed from it.
 *
 * `append` is the only way in. It is idempotent on the envelope id, and it refuses an action
 * that cannot apply to the record as it stands. `preview` answers "what would this do" for
 * any draft without appending it: a Consolidation's levels and healing, or a correction's
 * consequences ("without this award Kara is Level 3, and her Level 4 placement no longer
 * applies"). Undo and correction are `void` actions; nothing is ever removed from the log.
 */
import type { Engine } from "@gradebreaker/engine";
import type { Action, Draft, Envelope } from "./actions.ts";
import { type CharacterState, type Effect, type FoldResult, type Rejection, fold } from "./fold.ts";
import { type Sheet, type SheetDiff, diffSheets, sheetOf } from "./sheet.ts";

export class RecordError extends Error {
  override name = "RecordError";
}

export interface Appended {
  envelope: Envelope;
  effects: Effect[];
  /** True when the id was already in the log: nothing new was recorded. */
  duplicate: boolean;
}

export interface Preview {
  /** Whether the draft itself would apply; `reason` says why not. */
  accepted: boolean;
  reason?: string;
  effects: Effect[];
  changes: SheetDiff[];
  /** Later actions in the log that stop applying once the draft is in (a correction's fallout). */
  newlyRejected: Rejection[];
}

const sameContent = (a: Draft | Envelope, b: Draft | Envelope) =>
  JSON.stringify([a.actor, a.source, a.cause ?? null, a.action]) ===
  JSON.stringify([b.actor, b.source, b.cause ?? null, b.action]);

export class CampaignRecord {
  private readonly entries: Envelope[];
  private cache: FoldResult | undefined;

  /** `log` is a stored log to resume from, in sequence order. */
  constructor(
    readonly engine: Engine,
    log: readonly Envelope[] = [],
  ) {
    this.entries = [...log];
    this.entries.forEach((e, i) => {
      if (e.seq !== i) throw new RecordError(`stored log is out of order at ${e.id}: seq ${e.seq}, expected ${i}`);
    });
  }

  get log(): readonly Envelope[] {
    return this.entries;
  }

  get state(): FoldResult {
    this.cache ??= fold(this.engine, this.entries);
    return this.cache;
  }

  get rejected(): readonly Rejection[] {
    return this.state.rejected;
  }

  character(id: string): CharacterState | undefined {
    return this.state.characters.get(id);
  }

  sheet(id: string): Sheet | undefined {
    const c = this.character(id);
    return c && sheetOf(this.engine, c);
  }

  sheets(): Map<string, Sheet> {
    return new Map([...this.state.characters].map(([id, c]) => [id, sheetOf(this.engine, c)]));
  }

  find(id: string): Envelope | undefined {
    return this.entries.find((e) => e.id === id);
  }

  append<A extends Action>(draft: Draft<A>): Appended {
    const existing = this.find(draft.id);
    if (existing) {
      if (!sameContent(existing, draft)) throw new RecordError(`id ${draft.id} is already recorded with different content`);
      return { envelope: existing, effects: this.state.effects.get(existing.id) ?? [], duplicate: true };
    }
    const envelope: Envelope = { ...draft, seq: this.entries.length };
    const next = fold(this.engine, [...this.entries, envelope]);
    const refused = next.rejected.find((r) => r.envelope.id === envelope.id);
    if (refused) throw new RecordError(refused.reason);
    this.entries.push(envelope);
    this.cache = next;
    return { envelope, effects: next.effects.get(envelope.id) ?? [], duplicate: false };
  }

  preview<A extends Action>(draft: Draft<A>): Preview {
    const envelope: Envelope = { ...draft, seq: this.entries.length };
    const next = fold(this.engine, [...this.entries, envelope]);
    const refused = next.rejected.find((r) => r.envelope.id === envelope.id);
    const before = new Set(this.state.rejected.map((r) => r.envelope.id));
    const preview: Preview = {
      accepted: !refused,
      effects: next.effects.get(envelope.id) ?? [],
      changes: diffSheets(this.sheets(), new Map([...next.characters].map(([id, c]) => [id, sheetOf(this.engine, c)]))),
      newlyRejected: next.rejected.filter((r) => r.envelope.id !== envelope.id && !before.has(r.envelope.id)),
    };
    if (refused) preview.reason = refused.reason;
    return preview;
  }
}

export type { Sheet, SheetDiff };
