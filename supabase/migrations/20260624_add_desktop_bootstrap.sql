-- Desktop bootstrap tables for QRClaw macOS app
-- RLS: no direct client access; Gateway service role only

create table if not exists desktop_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  owner_email text,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  expires_at timestamptz not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists desktop_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id) on delete cascade,
  device_name text not null,
  app_version text not null,
  token_hash text not null unique,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table desktop_invites enable row level security;
alter table desktop_devices enable row level security;

-- No policies: only service role (Gateway) can access via bypass RLS

create index if not exists desktop_invites_code_hash_idx on desktop_invites(code_hash);
create index if not exists desktop_devices_owner_id_idx on desktop_devices(owner_id);
create index if not exists desktop_devices_token_hash_idx on desktop_devices(token_hash);
