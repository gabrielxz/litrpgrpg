-- A run drafts events and the table's bookkeeping. A draft is an event (reviewed in the event
-- editor), an action (an item, quest, or count, reviewed in its own form), or a Prep cue (a
-- pointer to a prepared item, which the GM fires from Prep). `why` is the drafter's reason for
-- an action or a cue; an event's reasons stay per character in `reasons`.

alter table draft_items add column kind text not null default 'event';
alter table draft_items add column why text;
alter table draft_items add column suggestion jsonb;
alter table draft_items alter column action drop not null;
