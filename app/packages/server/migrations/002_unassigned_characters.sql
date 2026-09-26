-- Characters a player has built outside any campaign. Joining a campaign moves one into that
-- campaign's action log (a character.create or character.pregen) and deletes it here, so a
-- character is only ever in one place.

create table unassigned_characters (
  id text primary key,
  owner_id text not null references users (id),
  name text not null,
  -- {"kind":"custom","name":...,"background":...,"stats":{...}} or {"kind":"pregen","pregen":...}
  spec json not null,
  created_at timestamptz not null default now()
);

create index unassigned_characters_owner on unassigned_characters (owner_id);

alter table unassigned_characters enable row level security;
