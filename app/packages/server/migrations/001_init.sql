-- People, campaigns, invites, the rules snapshots campaigns pin, and the action log.
-- Snapshots and actions are stored as json (not jsonb) so their text, key order included,
-- comes back exactly as it went in.

create table users (
  id text primary key,
  display_name text not null,
  -- sha256 of the bearer token; the token itself is shown once, at issue
  token_hash text not null unique,
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
