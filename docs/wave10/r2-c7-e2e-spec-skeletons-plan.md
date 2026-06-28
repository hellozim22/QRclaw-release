# Wave 10 R2 C7：E2E Spec 骨架实施计划

> 基于 `r2-c6-test-cases-final.md` 的 43 个用例，产出 Playwright spec 骨架清单。
> **实际骨架文件在 Sprint 1 开工时生成**（此文档定结构，不产文件避免脏基线）。

## 目录结构

```text
tests/e2e/wave10/
├── README.md                           # 用例索引
├── onboarding/
│   ├── auto-detect-runtimes.spec.ts    # E2E-01
│   ├── default-agents-provision.spec.ts # E2E-02
│   └── click-default-agent.spec.ts     # E2E-03
├── chat-core/
│   ├── send-real-reply-semantic.spec.ts # E2E-04 (关键)
│   ├── streaming-output.spec.ts         # E2E-05
│   ├── markdown-code-block.spec.ts      # E2E-06
│   ├── markdown-table.spec.ts           # E2E-07
│   ├── send-disabled-empty.spec.ts      # E2E-08
│   ├── reload-replay.spec.ts            # E2E-09
│   ├── stop-streaming.spec.ts           # E2E-16
│   ├── regenerate.spec.ts               # E2E-17
│   └── copy-message.spec.ts             # E2E-18
├── session-mgmt/
│   ├── multi-session-isolation.spec.ts  # E2E-10
│   ├── switch-session.spec.ts           # E2E-11
│   ├── new-session.spec.ts              # E2E-12
│   ├── rename-session.spec.ts           # E2E-13
│   ├── delete-session.spec.ts           # E2E-14
│   ├── search-session.spec.ts           # E2E-27
│   ├── archive-session.spec.ts          # E2E-28
│   └── export-session.spec.ts           # E2E-29
├── agent-edit/
│   ├── instructions-injection.spec.ts   # E2E-15
│   ├── edit-instructions.spec.ts        # E2E-24
│   ├── agent-template.spec.ts           # E2E-25
│   └── delete-agent.spec.ts             # E2E-26
├── attachments/
│   ├── drag-file.spec.ts                # E2E-19
│   ├── paste-screenshot.spec.ts         # E2E-20
│   ├── image-zoom.spec.ts               # E2E-21
│   ├── mermaid-diagram.spec.ts          # E2E-22
│   └── latex-math.spec.ts               # E2E-23
├── runtime-mgmt/
│   ├── runtime-version.spec.ts          # E2E-30
│   ├── runtime-offline.spec.ts          # E2E-31
│   ├── runtime-recovery.spec.ts         # E2E-32
│   ├── binary-path-override.spec.ts     # E2E-43
│   └── owner-logout.spec.ts             # E2E-33
├── edge-cases/
│   ├── long-reply.spec.ts               # E2E-34
│   ├── concurrent-sessions.spec.ts      # E2E-35
│   ├── network-interrupt.spec.ts        # E2E-36
│   └── invalid-jwt.spec.ts              # E2E-37
├── iron-rules/
│   ├── c2-logs-no-plaintext.spec.ts     # E2E-38 (核心)
│   ├── c2-db-encrypted-rest.spec.ts     # E2E-39 (核心)
│   ├── c2-last-event-id-guard.spec.ts   # E2E-40
│   └── cross-owner-isolation.spec.ts    # E2E-41
└── regression/
    └── visitor-qr-still-works.spec.ts   # E2E-42 (保 Wave 5-9 visitor)
```

**总计 40+ spec 文件，对应 43 个用例**。

## 骨架模板

### 类型 A：真 CLI + 语义断言

```typescript
import { expect, test } from '@playwright/test';
import { createRealClaudeHarness } from '../../helpers/wave10-harness';

test.describe('E2E-04 send real claude reply semantic', () => {
  let harness: Awaited<ReturnType<typeof createRealClaudeHarness>>;

  test.beforeAll(async ({ browser }) => {
    harness = await createRealClaudeHarness(browser);
  });

  test.afterAll(async () => await harness.stop());

  test('reply contains expected number', async () => {
    await harness.page.goto(`/chat/${harness.sessionId}`);
    await harness.sendMessage('只输出数字 42，不要其他任何内容');
    const reply = await harness.waitForReply({ timeout: 60_000 });

    // 语义断言：真 Claude 会返回含 "42" 的内容
    expect(reply).toContain('42');

    // C1：gateway 不解读
    const gatewayLog = await harness.readGatewayLog();
    expect(gatewayLog).not.toContain('42'); // plaintext not logged

    // C2：DB encrypted
    const dbRow = await harness.queryMessage(harness.sessionId);
    expect(dbRow.content_encrypted).toBeTruthy();
    expect(dbRow.content).toBeNull();
  });
});
```

### 类型 B：UI 交互验证

```typescript
test('E2E-11 switch session', async ({ page }) => {
  await page.goto('/chat');
  const sessionA = await createSession(page, 'Session A');
  const sessionB = await createSession(page, 'Session B');

  await sendMessage(page, 'hello A');
  await page.click(`[data-session-id="${sessionB}"]`);

  await expect(page).toHaveURL(new RegExp(`/chat/${sessionB}`));
  await expect(page.getByText('hello A')).not.toBeVisible();
});
```

### 类型 C：C2 铁律护栏

```typescript
test('E2E-38 server logs no plaintext', async () => {
  const secret = `UNIQUE_SECRET_${Date.now()}`;
  await sendMessage(page, secret);
  await waitForReply(page);

  const logs = readFileSync('/tmp/qrclaw-logs/gateway.log', 'utf8');
  expect(logs).not.toContain(secret);
});
```

## Helpers 需新建

| 文件 | 用途 |
|---|---|
| `tests/helpers/wave10-harness.ts` | 真 CLI 场景 harness（不像 Wave 9 的 fake） |
| `tests/helpers/db-query.ts` | 直连 Supabase service role 查 DB（C2 验证用） |
| `tests/helpers/gateway-log.ts` | 读 gateway stdout 做 plaintext 检查 |
| `tests/helpers/runtime-control.ts` | kill / restart 真 CLI 进程（E2E-31/32） |

## CI 运行策略

- 需要真实 CLI：CI runner 需预装 `claude` / `cursor-agent` / `openclaw` / `codex`
- P0 用例每 PR 跑
- P1/P2 每日定时跑
- iron-rules 用例必须 100% 绿才允许发布

## 验收

Sprint 1 开工后产出对应 spec 骨架文件。
每个 spec 初始 `test.skip()` 标记，开发完成后逐步解 skip。

Sprint 3 末交付：
- P0 18/18 全绿
- P1 ≥ 13 绿
- 验收报告 `docs/wave10-acceptance.md`
