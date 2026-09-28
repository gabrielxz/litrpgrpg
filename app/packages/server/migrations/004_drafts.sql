-- Drafts the language model made from table talk, kept apart from the action log until the GM
-- accepts one (app/DESIGN.md, "Suggestions live apart from the log until accepted"). A run is one
-- request: the lines as read, and what came back; each draft in it is open, accepted, or
-- dismissed. Accepting records the GM's action in the log, and the draft keeps its id.

create table draft_runs (
  id text primary key,
  campaign_id text not null references campaigns (id),
  -- What drafted: "draft-events".
  feature text not null,
  created_by text not null references users (id),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  -- drafting, done, or failed.
  status text not null,
  problem text,
  message text,
  -- The speakers and lines as read, and how each typed name was read.
  talk jsonb not null,
  -- Repairs made to drafts that were kept, and drafts dropped with the reason.
  repaired jsonb not null default '[]',
  dropped jsonb not null default '[]'
);

create index draft_runs_campaign on draft_runs (campaign_id, created_at);

alter table draft_runs enable row level security;

create table draft_items (
  run_id text not null references draft_runs (id),
  item_id text not null,
  campaign_id text not null references campaigns (id),
  -- The line ids the draft cites, the drafted action, and the model's reason per character.
  lines jsonb not null,
  action jsonb not null,
  reasons jsonb not null,
  -- open, accepted, or dismissed.
  status text not null default 'open',
  -- The id of the action the GM recorded on accepting.
  action_id text,
  resolved_by text references users (id),
  resolved_at timestamptz,
  primary key (run_id, item_id)
);

alter table draft_items enable row level security;
