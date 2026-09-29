-- What the listening heard: one row per final stretch of one person's speech, as the speech-to-text
-- vendor returned it. The audio is never stored. A line is deleted 30 days after it was said
-- (listening.ts, HEARD_KEEP_DAYS), and the consent text says so.

create table heard_lines (
  id bigserial primary key,
  campaign_id text not null references campaigns (id),
  -- The session running when it was said (the session.start action's id).
  session_id text,
  user_id text not null references users (id),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  text text not null,
  -- Each word with its start and end in milliseconds from started_at.
  words jsonb
);

create index heard_lines_campaign on heard_lines (campaign_id, started_at);
create index heard_lines_said on heard_lines (started_at);

alter table heard_lines enable row level security;
