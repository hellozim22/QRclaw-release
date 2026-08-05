#!/usr/bin/env node
// seed-local-owner.mjs — 本地单用户：创建/复用 Supabase 用户 + owners 行（无邮箱登录 UI）
//
// Usage:
//   node scripts/seed-local-owner.mjs
//
// 输出 stdout：JSON 一行 { user_id, email }，供 dev-up / mint-host 读取

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const EMAIL = process.env.LOCAL_DEV_EMAIL || 'local-dev@localhost';
const PASSWORD = process.env.LOCAL_DEV_PASSWORD || 'LocalDev-Only-9x!';
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const STATE_FILE = path.join(REPO_ROOT, '.local-dev-owner.json');

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
    // ignore
  }
}

loadEnv(path.resolve('gateway/.env'));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
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
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${pathname} ${res.status}: ${text.slice(0, 300)}`);
  }
  return json;
}

async function ensureAuthUser() {
  const list = await supabaseAdmin(`/auth/v1/admin/users?email=${encodeURIComponent(EMAIL)}`);
  const existing = (list.users || []).find((u) => u.email === EMAIL);
  if (existing) {
    await supabaseAdmin(`/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
    });
    return existing.id;
  }
  const created = await supabaseAdmin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: '本地用户' },
    }),
  });
  return created.id;
}

async function ensureOwner(userId) {
  await supabaseAdmin('/rest/v1/owners?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([
      {
        user_id: userId,
        email: EMAIL,
        display_name: '本地用户',
        plan: 'free',
        locale: 'zh',
      },
    ]),
  });
}

(async () => {
  const userId = await ensureAuthUser();
  await ensureOwner(userId);
  const payload = { user_id: userId, email: EMAIL };
  writeFileSync(STATE_FILE, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(payload));
})().catch((err) => {
  console.error('seed-local-owner failed:', err.message);
  process.exit(1);
});
