#!/usr/bin/env node
// Seed an E2E Owner account for Playwright happy-path run (HEL-50).
// Creates (or reuses) a Supabase auth user + owner row. Prints env exports
// to stdout. Service role key must be available via env or gateway/.env.
//
// Usage:
//   node scripts/seed-e2e-owner.mjs [email] [password]
//
// The script is idempotent: re-running with the same email upserts and
// returns the same credentials.

import { readFileSync } from 'fs';
import path from 'path';

const EMAIL = process.argv[2] || 'e2e-owner@example.invalid';
const PASSWORD = process.argv[3] || 'CHANGE_ME_E2E_PASSWORD';

function loadEnv(file) {
  try {
    const txt = readFileSync(file, 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      if (!process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  } catch {
    // ignore missing file
  }
}

loadEnv(path.resolve('gateway/.env'));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (checked env + gateway/.env)',
  );
  process.exit(1);
}

async function supabaseAdmin(pathname, init = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${pathname} ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function ensureAuthUser() {
  // Try find by email first
  const list = await supabaseAdmin(
    `/auth/v1/admin/users?email=${encodeURIComponent(EMAIL)}`,
  );
  const existing = (list.users || []).find((u) => u.email === EMAIL);
  if (existing) {
    // Reset password to a known value so reruns work
    await supabaseAdmin(`/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
    });
    return existing.id;
  }
  const created = await supabaseAdmin(`/auth/v1/admin/users`, {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
    }),
  });
  return created.id;
}

async function ensureOwner(userId) {
  // Wave 10 B2: auth.users insert trigger now auto-creates owners rows.
  // This upsert remains idempotent (ON CONFLICT user_id, merge-duplicates)
  // so it works both with and without the trigger, and also updates
  // display_name/plan on re-runs.
  await supabaseAdmin(`/rest/v1/owners?on_conflict=user_id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([
      {
        user_id: userId,
        email: EMAIL,
        display_name: 'E2E Owner',
        plan: 'free',
        locale: 'zh',
      },
    ]),
  });
}

(async () => {
  const userId = await ensureAuthUser();
  await ensureOwner(userId);
  console.error(`✓ Seeded E2E owner: ${EMAIL} (user_id=${userId})`);
  console.log(`export E2E_OWNER_EMAIL='${EMAIL}'`);
  console.log(`export E2E_OWNER_PASSWORD='${PASSWORD}'`);
})().catch((err) => {
  console.error('seed failed:', err.message);
  process.exit(1);
});
