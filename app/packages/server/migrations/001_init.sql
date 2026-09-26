-- People, campaigns, invites, the rules snapshots campaigns pin, and the action log, all in
-- the private schema `gradebreaker` (db.ts sets the search path). Supabase's Data API is off
-- and exposes no part of this schema; row-level security is on with no policies as a second
-- lock, and the server connects as the tables' owner, which it does not bind.
-- Snapshots and actions are stored as json (not jsonb) so their text, key order included,
-- comes back exactly as it went in.

revoke all on schema gradebreaker from public;

-- A person, keyed by their Supabase Auth user id (the token's `sub`).
create table users (
  id text primary key,
  display_name text not null,
  email text,
  created_at timestamptz not null default now()
);

create table rules_snapshots (
  version text primary key,
  content_hash text not null,
  snapshot json not null,
  stored_at timestamptz not null default now()
);

create table campaigns (
  id text primary key,
  name text not null,
  rules_version text not null references rules_snapshots (version),
  created_at timestamptz not null default now()
);

create table memberships (
  campaign_id text not null references campaigns (id),
  user_id text not null references users (id),
  role text not null check (role in ('gm', 'player')),
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create unique index one_gm_per_campaign on memberships (campaign_id) where role = 'gm';

create table invites (
  code text primary key,
  campaign_id text not null references campaigns (id),
  created_by text not null references users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses integer,
  uses integer not null default 0,
  revoked_at timestamptz
);

create table actions (
  campaign_id text not null references campaigns (id),
  seq integer not null,
  id text not null,
  at timestamptz not null,
  actor json not null,
  source text not null,
  cause text,
  action json not null,
  primary key (campaign_id, seq),
  unique (campaign_id, id)
);

alter table users enable row level security;
alter table rules_snapshots enable row level security;
alter table campaigns enable row level security;
alter table memberships enable row level security;
alter table invites enable row level security;
alter table actions enable row level security;
