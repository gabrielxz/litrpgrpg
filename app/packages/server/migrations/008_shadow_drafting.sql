-- Drafting what the listening hears (live-drafting.ts): on, in shadow (drafted and kept from the
-- GM's review until the GM releases them, to measure the listener against the GM's own logging),
-- or off.
alter table campaigns add column live_drafting text not null default 'on' check (live_drafting in ('on', 'shadow', 'off'));

-- A window drafted in shadow, and when the GM put its drafts in review.
alter table draft_runs add column shadow boolean not null default false;
alter table draft_runs add column released_at timestamptz;
