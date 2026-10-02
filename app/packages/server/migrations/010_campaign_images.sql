-- Images the GM uploads to show at the table (images.ts): stored here, since the machine's own
-- disk does not outlive a deploy. A content pack's images ship as files instead.

create table campaign_images (
  id text primary key,
  campaign_id text not null references campaigns (id),
  uploaded_by text not null references users (id),
  type text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);

create index campaign_images_campaign on campaign_images (campaign_id);

alter table campaign_images enable row level security;
