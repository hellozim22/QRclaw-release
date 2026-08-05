#!/usr/bin/env node
/**
 * ECC E2E — QRClaw macOS Desktop (desktop=1) + bundled runtime smoke.
 *
 * Prerequisites:
 *   - dev-up running OR bundled web/gateway on :3000/:3100
 *   - ~/.config/qrclaw/secrets.env for full chat (optional)
 *
 * Usage:
 *   node tests/ecc-local-verify-macos-desktop.mjs
 *   node tests/ecc-local-verify-macos-desktop.mjs --e2e
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'output/ecc-verify');
const BASE = process.env.QRCLAW_WEB_URL || 'http://localhost:3000';

const runE2E = process.argv.includes('--e2e');
const checks = [];
const issues = [];
let failed = 0;

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (err) {
    checks.push({ name, ok: false, error: err.message });
    issues.push({ check: name, error: err.message });
    console.error(`✗ ${name}: ${err.message}`);
    failed += 1;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (err) {
    checks.push({ name, ok: false, error: err.message });
    issues.push({ check: name, error: err.message });
    console.error(`✗ ${name}: ${err.message}`);
    failed += 1;
  }
}

check('apps/macos/QRClaw/Package.swift exists', () => {
  if (!fs.existsSync(path.join(REPO_ROOT, 'apps/macos/QRClaw/Package.swift'))) {
    throw new Error('missing');
  }
});

check('no invite-code gate in ServiceOrchestrator', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'apps/macos/QRClaw/Services/ServiceOrchestrator.swift'),
    'utf8'
  );
  if (src.includes('needsLogin')) throw new Error('needsLogin phase still present');
  if (src.includes('DesktopLoginView')) throw new Error('login view still referenced');
});

check('DesktopSecretsLoader exists', () => {
  if (
    !fs.existsSync(path.join(REPO_ROOT, 'apps/macos/QRClaw/Services/DesktopSecretsLoader.swift'))
  ) {
    throw new Error('missing');
  }
});

check('desktop bootstrap wired (isDesktopBootstrap)', () => {
  const bootstrap = fs.readFileSync(
    path.join(REPO_ROOT, 'web/src/app/api/dev/bootstrap/route.ts'),
    'utf8'
  );
  const shell = fs.readFileSync(path.join(REPO_ROOT, 'web/src/lib/local-app-shell.ts'), 'utf8');
  if (!bootstrap.includes('isDesktopBootstrap')) {
    throw new Error('bootstrap route missing isDesktopBootstrap');
  }
  if (!shell.includes('DESKTOP_AUTO_BOOTSTRAP')) {
    throw new Error('local-app-shell missing DESKTOP_AUTO_BOOTSTRAP');
  }
});

check('script/build_and_run.sh executable', () => {
  fs.accessSync(path.join(REPO_ROOT, 'script/build_and_run.sh'), fs.constants.X_OK);
});

check('dist/QRClaw.app bundle', () => {
  const app = path.join(REPO_ROOT, 'dist/QRClaw.app');
  if (!fs.existsSync(app)) throw new Error('run ./script/build_and_run.sh first');
});

check('Info.plist NSAllowsLocalNetworking', () => {
  const plist = fs.readFileSync(
    path.join(REPO_ROOT, 'dist/QRClaw.app/Contents/Info.plist'),
    'utf8'
  );
  if (!plist.includes('NSAllowsLocalNetworking')) throw new Error('missing ATS');
});

check('desktop update check sources wired', () => {
  const updateService = fs.readFileSync(
    path.join(REPO_ROOT, 'apps/macos/QRClaw/Services/UpdateService.swift'),
    'utf8'
  );
  const bridge = fs.readFileSync(
    path.join(REPO_ROOT, 'apps/macos/QRClaw/Services/WebViewBridge.swift'),
    'utf8'
  );
  const settings = fs.readFileSync(
    path.join(REPO_ROOT, 'web/src/app/(dashboard)/settings/page.tsx'),
    'utf8'
  );
  const buildScript = fs.readFileSync(path.join(REPO_ROOT, 'script/build_and_run.sh'), 'utf8');
  if (!updateService.includes('SPUStandardUpdaterController')) {
    throw new Error('UpdateService missing Sparkle updater');
  }
  if (!bridge.includes('checkForUpdates')) {
    throw new Error('WebView bridge missing checkForUpdates');
  }
  if (!settings.includes('检测更新')) {
    throw new Error('settings page missing update button');
  }
  if (!buildScript.includes('SUFeedURL') || !buildScript.includes('SUPublicEDKey')) {
    throw new Error('Info.plist Sparkle keys not wired');
  }
});

if (runE2E) {
  console.log('\n── E2E (Playwright) ──\n');

  await checkAsync('gateway /health', async () => {
    const r = await fetch('http://127.0.0.1:3100/health', { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
  });

  await checkAsync('web /chat?desktop=1', async () => {
    const r = await fetch(`${BASE}/chat?desktop=1`, { signal: AbortSignal.timeout(10000) });
    if (r.status !== 200) throw new Error(`status ${r.status}`);
  });

  await checkAsync('desktop bootstrap API', async () => {
    const r = await fetch(`${BASE}/api/dev/bootstrap`, {
      method: 'POST',
      headers: { Host: '127.0.0.1:3000' },
      signal: AbortSignal.timeout(10000),
    });
    const body = await r.text();
    if (!r.ok) {
      issues.push({
        check: 'desktop bootstrap API',
        error: `HTTP ${r.status}`,
        detail: body.slice(0, 200),
        fix: 'Ensure dev-up or desktop web has DESKTOP_AUTO_BOOTSTRAP=1 and LOCAL_DEV_* env',
      });
      throw new Error(`HTTP ${r.status}: ${body.slice(0, 80)}`);
    }
  });

  try {
    const { chromium } = await import('playwright');
    await checkAsync('Playwright desktop=1 chat page', async () => {
      const browser = await chromium.launch({ headless: true, channel: 'chrome' });
      const page = await browser.newPage();
      await page.goto(`${BASE}/chat?desktop=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);

      const hasLogin = page.url().includes('/login');
      if (hasLogin) throw new Error('redirected to /login');

      const boot = await page.evaluate(async () => {
        const r = await fetch('/api/dev/bootstrap', { method: 'POST' });
        return { ok: r.ok, status: r.status };
      });
      if (!boot.ok) throw new Error(`bootstrap failed ${boot.status}`);

      await page.screenshot({
        path: path.join(OUT_DIR, 'desktop-chat-verify.png'),
        fullPage: true,
      });
      await browser.close();
    });
  } catch (err) {
    issues.push({
      check: 'Playwright',
      error: err.message,
      fix: 'Install Chrome; run bash scripts/dev-up.sh first',
    });
    failed += 1;
    console.error(`✗ Playwright desktop flow: ${err.message}`);
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const report = {
  ts: new Date().toISOString(),
  mode: runE2E ? 'e2e' : 'static',
  passed: checks.length - failed,
  total: checks.length,
  issues,
};
fs.writeFileSync(
  path.join(OUT_DIR, 'macos-desktop-e2e-report.json'),
  JSON.stringify(report, null, 2)
);

console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (issues.length) {
  console.log('\n── Issues ──');
  for (const i of issues) {
    console.log(`- ${i.check}: ${i.error}${i.fix ? ` → ${i.fix}` : ''}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
