-- The GM's language-model key for a campaign, and what each request spent. The key is sealed
-- with the server's AI_KEY_SECRET (ai.ts) and never leaves the server; the hint is its last four
-- characters, for the GM to recognize it.

create table campaign_ai (
  campaign_id text primary key references campaigns (id),
  provider text not null default 'anthropic',
  model text not null,
  sealed_key text not null,
  key_hint text not null,
  set_by text not null references users (id),
  set_at timestamptz not null default now(),
  -- The last setup check: null until one ran.
  checked_at timestamptz,
  check_problem text,
  check_message text
);

alter table campaign_ai enable row level security;

create table ai_usage (
  id bigint generated always as identity primary key,
  campaign_id text not null references campaigns (id),
  at timestamptz not null default now(),
  -- What asked: "draft-events", "sweep", "class-offers".
  feature text not null,
  model text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  -- A request that failed spends nothing and records its problem instead.
  problem text
);

create index ai_usage_campaign on ai_usage (campaign_id, at);

alter table ai_usage enable row level security;
