/**
 * Acceptance: Iron rules (v1.2) static red-line checks.
 *
 * Scope:
 *   C1 Neutral relay  — gateway/ source MUST NOT import or call any LLM SDK.
 *   C2 Encrypted storage — `supabase.from('messages').insert(...)` MUST only
 *     appear inside `gateway/src/db/persist.ts` (the single persistence path).
 *   C5 Replayable messages — the three documented history endpoints exist
 *     on disk (visitor / owner / agent-plugin). The agent-plugin endpoint
 *     is a todo until M3 lands; see `docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md`.
 *
 * These are intentionally grep-style static checks — no runtime required.
 * If any of them turn red, the diff almost certainly broke an iron rule
 * and should be stopped at review time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

// Repository root relative to this test file: tests/acceptance/ → two levels up.
const REPO_ROOT = resolve(__dirname, '..', '..');
const GATEWAY_SRC = join(REPO_ROOT, 'gateway', 'src');

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

function walkSourceFiles(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = readdirSync(current);
    for (const entry of entries) {
      const full = join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === 'node_modules' || entry === 'dist' || entry === 'build') continue;
        stack.push(full);
        continue;
      }
      const dot = entry.lastIndexOf('.');
      if (dot < 0) continue;
      const ext = entry.slice(dot);
      if (CODE_EXTENSIONS.has(ext)) out.push(full);
    }
  }
  return out;
}

function readAll(files: string[]): Array<{ file: string; lines: string[] }> {
  return files.map((file) => ({
    file,
    lines: readFileSync(file, 'utf8').split('\n'),
  }));
}

interface KeywordHit {
  file: string;
  lineNo: number;
  line: string;
}

/**
 * Known-safe occurrences of the C1 keywords inside gateway/src. Each entry
 * documents *why* the match is not a real LLM dependency. Adding a new
 * whitelist entry is a conscious policy decision — PR reviewers must sign off.
 */
const C1_WHITELIST: Array<{
  relativeFile: string;
  keyword: string;
  lineIncludes?: string;
  reason: string;
}> = [
  {
    relativeFile: 'monitoring/perf.ts',
    keyword: 'completion',
    reason:
      'JSDoc comment uses the English word "completion" for pipeline step completion — no AI inference.',
  },
  {
    relativeFile: 'ws/host-router.ts',
    keyword: 'completion',
    lineIncludes: 'Host run completion sequence gap',
    reason:
      'Gateway error string describes a Host run lifecycle completion event — no AI inference or SDK call.',
  },
  {
    relativeFile: 'routes/owner-agent-chat-sse.ts',
    keyword: 'completion',
    lineIncludes: "object: 'chat.completion.chunk'",
    reason:
      'OpenAI-compatible SSE wire envelope field name; Gateway still only relays Host frames and calls no LLM SDK.',
  },
  {
    relativeFile: 'services/default-owner-agents.ts',
    keyword: 'anthropic',
    lineIncludes: "command: 'npm install -g @anthropic-ai/claude-code'",
    reason:
      'Runtime install hint shown to owners; Gateway does not import or execute the Claude CLI or SDK.',
  },
  {
    relativeFile: 'services/default-owner-agents.ts',
    keyword: 'anthropic',
    lineIncludes: "docs_url: 'https://docs.anthropic.com/claude-code'",
    reason:
      'Runtime install documentation URL shown to owners; Gateway still performs no AI inference.',
  },
  {
    relativeFile: 'services/default-owner-agents.ts',
    keyword: 'openai',
    lineIncludes: "command: 'npm install -g @openai/codex'",
    reason:
      'Runtime install hint shown to owners; Gateway does not import or execute the Codex CLI or SDK.',
  },
  {
    relativeFile: 'services/default-owner-agents.ts',
    keyword: 'openai',
    lineIncludes: "docs_url: 'https://developers.openai.com/codex'",
    reason:
      'Runtime install documentation URL shown to owners; Gateway still performs no AI inference.',
  },
];

function isWhitelisted(fileFromGatewaySrc: string, keyword: string, line: string): boolean {
  return C1_WHITELIST.some(
    (w) =>
      w.keyword === keyword &&
      fileFromGatewaySrc.replace(/\\/g, '/') === w.relativeFile &&
      // Basic sanity: only allow the whitelist to match lines that are part
      // of a comment block or an explicitly documented string literal.
      // New `openai(...)` calls on the same file still fail.
      (w.lineIncludes ? line.includes(w.lineIncludes) : /^\s*(\*|\/\/)/.test(line))
  );
}

describe('Iron Rules (v1.2) — static red-line checks', () => {
  // --- C1: Neutral Relay ---------------------------------------------------
  describe('C1 Neutral Relay — gateway/ must not depend on any LLM SDK', () => {
    const files = walkSourceFiles(GATEWAY_SRC);
    const contents = readAll(files);

    const keywords: Array<{ name: string; re: RegExp }> = [
      // Full-token matches — we do NOT match inside larger identifiers to
      // reduce false positives. `\b` boundaries guard against e.g. `Allman`.
      { name: 'openai', re: /\bopenai\b/i },
      { name: 'anthropic', re: /\banthropic\b/i },
      { name: 'llm', re: /\bllm\b/i },
      { name: 'completion', re: /\bcompletion[s]?\b/i },
    ];

    it('no file under gateway/src imports or calls an LLM SDK', () => {
      const hits: KeywordHit[] = [];
      for (const { file, lines } of contents) {
        const relFromGateway = relative(GATEWAY_SRC, file);
        lines.forEach((line, i) => {
          for (const { name, re } of keywords) {
            if (!re.test(line)) continue;
            if (isWhitelisted(relFromGateway, name, line)) continue;
            hits.push({ file: relFromGateway, lineNo: i + 1, line: line.trim() });
          }
        });
      }

      if (hits.length > 0) {
        const render = hits.map((h) => `  ${h.file}:${h.lineNo}  ${h.line}`).join('\n');
        throw new Error(
          `C1 violation — LLM keyword found in gateway/src:\n${render}\n\n` +
            `If this is a false positive, add an explicit entry to the C1_WHITELIST\n` +
            `in tests/acceptance/iron-rules.spec.ts with a written reason.`
        );
      }
      expect(hits).toEqual([]);
    });

    it('gateway/package.json does not depend on openai / @anthropic-ai packages', () => {
      const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'gateway', 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      const banned = Object.keys(all).filter(
        (name) => name === 'openai' || name.startsWith('@anthropic-ai/') || name === 'langchain'
      );
      expect(banned).toEqual([]);
    });
  });

  // --- C2: Encrypted storage path is singular -----------------------------
  describe('C2 Encrypted Storage — messages.insert() lives only in db/persist.ts', () => {
    const files = walkSourceFiles(GATEWAY_SRC);
    const contents = readAll(files);
    const INSERT_RE = /\.from\(\s*['"`]messages['"`]\s*\)\s*\.insert\s*\(/;
    const RAW_SQL_RE = /INSERT\s+INTO\s+messages\b/i;

    it('only gateway/src/db/persist.ts writes into the messages table', () => {
      const offenders: Array<{ file: string; lineNo: number; line: string }> = [];
      for (const { file, lines } of contents) {
        const relFromGateway = relative(GATEWAY_SRC, file);
        if (relFromGateway.replace(/\\/g, '/') === 'db/persist.ts') continue;
        lines.forEach((line, i) => {
          if (INSERT_RE.test(line) || RAW_SQL_RE.test(line)) {
            offenders.push({ file: relFromGateway, lineNo: i + 1, line: line.trim() });
          }
        });
      }
      if (offenders.length > 0) {
        const render = offenders.map((o) => `  ${o.file}:${o.lineNo}  ${o.line}`).join('\n');
        throw new Error(
          `C2 violation — message INSERT found outside gateway/src/db/persist.ts:\n${render}\n\n` +
            `Every message write MUST flow through persistEncryptedMessage() so that\n` +
            `envelope encryption + DEK wrapping are guaranteed.`
        );
      }
      expect(offenders).toEqual([]);
    });

    it('gateway/src/db/persist.ts exposes persistEncryptedMessage', () => {
      const persistPath = join(GATEWAY_SRC, 'db', 'persist.ts');
      const source = readFileSync(persistPath, 'utf8');
      expect(source).toMatch(/export\s+const\s+persistEncryptedMessage\b/);
    });

    it('ws/router.ts calls persistEncryptedMessage (the only hot write path)', () => {
      const routerPath = join(GATEWAY_SRC, 'ws', 'router.ts');
      const source = readFileSync(routerPath, 'utf8');
      expect(source).toMatch(/persistEncryptedMessage\s*\(/);
    });
  });

  // --- C5: Replayable messages (history endpoints exist) ------------------
  describe('C5 Replayable Messages — the three history endpoints exist on disk', () => {
    it('visitor history endpoint — gateway/src/routes/messages.ts exposes POST /api/messages', () => {
      const filePath = join(GATEWAY_SRC, 'routes', 'messages.ts');
      expect(existsSync(filePath), 'gateway/src/routes/messages.ts must exist').toBe(true);
      const src = readFileSync(filePath, 'utf8');
      expect(src).toMatch(/['"`]\/api\/messages['"`]/);
    });

    // M3-T6: the legacy `get-decrypted-messages` Edge Function was retired
    // and folded into the unified `decrypted-messages` function which serves
    // owner, agent, and visitor alike.
    it('unified history endpoint — supabase/functions/decrypted-messages/index.ts exists', () => {
      const fnPath = join(REPO_ROOT, 'supabase', 'functions', 'decrypted-messages', 'index.ts');
      expect(existsSync(fnPath), 'supabase/functions/decrypted-messages/index.ts must exist').toBe(
        true
      );
    });

    it('unified history endpoint handles all three actors (owner / agent / visitor)', () => {
      const fnPath = join(REPO_ROOT, 'supabase', 'functions', 'decrypted-messages', 'index.ts');
      const src = readFileSync(fnPath, 'utf8');
      // The discriminator is imported from the shared contract; the inline
      // parseBody switches on these exact string literals.
      expect(src).toMatch(/actor === 'visitor'/);
      expect(src).toMatch(/authenticateOwner/);
      expect(src).toMatch(/authenticateAgent/);
    });

    it('legacy get-decrypted-messages Edge Function has been retired', () => {
      const legacyPath = join(
        REPO_ROOT,
        'supabase',
        'functions',
        'get-decrypted-messages',
        'index.ts'
      );
      expect(
        existsSync(legacyPath),
        'supabase/functions/get-decrypted-messages/index.ts must NOT exist (retired in M3-T6)'
      ).toBe(false);
    });
  });
});
