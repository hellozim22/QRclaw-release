# Wave 10 E2E Spec Skeleton Index

真 CLI (禁 fake) + 语义断言 Playwright 骨架. 对应 `docs/wave10/r2-c6-test-cases-final.md` (43 用例) 与 `r2-c7-e2e-spec-skeletons-plan.md`.

## Sprint 1 交付范围 (本次 commit)

本 commit 是 Sprint 1 基建, 不覆盖全部 43 用例. 已落 harness + 5 个示范骨架, 覆盖三种断言类型:

| 用例 | Spec | 类型 | 铁律 |
|---|---|---|---|
| E2E-01 | `onboarding/auto-detect-runtimes.spec.ts` | A (真 CLI) | C4 |
| E2E-04 | `chat-core/send-real-reply-semantic.spec.ts` | A (真 CLI + 语义 nonce) | C1, C2 |
| E2E-05 | `chat-core/streaming-output.spec.ts` | A (流式时间 + 单调增长) | C1 |
| E2E-06 | `chat-core/markdown-code-block.spec.ts` | B (DOM 断言) | C1 |
| E2E-38 | `iron-rules/c2-logs-no-plaintext.spec.ts` | C (C2 护栏) | C1, C2 |
| E2E-39 | `iron-rules/c2-db-encrypted-rest.spec.ts` | C (C2 护栏) | C2 |

另外, R1 阶段已生成的 30 个 `test.skip` 骨架保留在 `onboarding/ chat-core/ session-mgmt/ agent-edit/ attachments/ resilience/ security/ performance/` 目录下 (按旧 `OAC-Wave10-E2E-xx` 编号, 见下方历史表). 后续 Sprint 会按 R2 C7 review §1.1 建议做一次编号迁移, 补齐剩余 13 个用例.

所有 spec 初始 `test.skip(...)`, 等 Sprint 1 CU-3 harness 真逻辑完成后逐步 unskip.

## Harness API (`tests/helpers/wave10-harness.ts`)

核心入口:

```typescript
const harness = await createRealClaudeHarness(browser, {
  runtime: 'claude',        // 'claude' | 'openclaw' | 'cursor' | 'codex'
  requireRealCli: true,     // self-hosted lane 为 true, PR CI 为 false
});
// harness.page, .sendMessage, .waitForReply, .assertNoPlaintextLeak,
// .db.latestOwnerAgentMessage / assertEncryptedAtRest,
// .log.path / snapshot / assertNotContains,
// .runtime.kill / restart / waitOnline / waitOffline
```

铁律辅助:

- `queryMessage(sessionId)` — 直连 Supabase service role 读 `owner_agent_messages`
- `readGatewayLog({path})` — plaintext 扫描; path 来自 `WAVE10_GATEWAY_LOG` env 或 harness
- `runtimePreflight(type)` — 检查 binary 存在 + 版本 + auth 状态 (stub, Sprint 1 CU-3 落地)

## 真断言范式 (禁 fake binary)

```typescript
const nonce = `UNIQUE_42_${Date.now()}`;
await harness.sendMessage(`只输出 ${nonce}`);
const reply = await harness.waitForReply({ timeoutMs: 60_000 });

expect(reply).toContain(nonce);              // 语义: 真 Claude 懂并回放
await harness.assertNoPlaintextLeak(nonce);  // C2: log/DB 不留明文
```

## CI lanes (参见 review §4)

| Lane | Runner | 触发 | 用例范围 |
|---|---|---|---|
| `wave10-skeleton-discovery` | GitHub-hosted | 每 PR | `playwright test --list e2e/wave10` + helper typecheck |
| `wave10-browser-smoke` | GitHub-hosted | 每 PR | 不需真 CLI 的 UI smoke |
| `wave10-real-runtime-nightly` | self-hosted macOS | nightly / 手动 / release | 真 `claude/openclaw/cursor/codex` + Supabase + Go host |

Release gate: P0 18/18 + C2 铁律 4/4 + visitor QR regression 1/1.

## Sprint 验收 (review §5)

| 阶段 | 验收 |
|---|---|
| **Sprint 1** | 43 个 skeleton 存在; `--list` 可发现; 默认 `test.skip`; README 对齐 R2 C6 编号 |
| Sprint 2 | helper 可编译; UI/session/onboarding 先 unskip 8-10 个 |
| Sprint 3 | self-hosted lane P0 18/18; C2 iron-rules 4/4 必须绿 |

## Discovery 命令

```bash
cd tests && npx playwright test --list e2e/wave10
```

---

## 历史: R1 骨架清单 (30 个, 待 Sprint 1 末迁移到 R2 编号)

> 这批是 `r2-c6-test-cases-final.md` 出现前生成的. 编号 `OAC-Wave10-E2E-xx`, 与 R2 `OAC-W10-E2E-xx` 有漂移, 按 review §1.1 建议后续 rename/move 而非保留双份.

| Case | Source | Priority | Spec Path | Status | Iron Laws |
|---|---|---|---|---|---|
| OAC-Wave10-E2E-01 | R1 P0-01 | P0 | `tests/e2e/wave10/onboarding/auto-detect-runtimes.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-02 | R1 P0-02 | P0 | `tests/e2e/wave10/onboarding/default-agents-provision.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-03 | R1 P0-03 | P0 | `tests/e2e/wave10/chat-core/claude-code-semantic-42.spec.ts` | `test.skip` skeleton | C1:covered, C2:covered, C4:not applicable, C5:covered |
| OAC-Wave10-E2E-04 | R1 P0-04 | P0 | `tests/e2e/wave10/chat-core/openclaw-json-reply.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-05 | R1 P0-05 | P0 | `tests/e2e/wave10/chat-core/cursor-agent-language.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-06 | R1 P0-06 | P0 | `tests/e2e/wave10/chat-core/codex-python-expression.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-07 | R1 P0-07 | P0 | `tests/e2e/wave10/chat-core/streaming-output.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-08 | R1 P0-08 | P0 | `tests/e2e/wave10/chat-core/markdown-rendering.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-09 | R1 P0-09 | P0 | `tests/e2e/wave10/session-mgmt/reload-history-replay.spec.ts` | `test.skip` skeleton | C1:not applicable, C2:covered, C4:not applicable, C5:covered |
| OAC-Wave10-E2E-10 | R1 P0-10 | P0 | `tests/e2e/wave10/session-mgmt/conversation-context.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:covered |
| OAC-Wave10-E2E-11 | R1 P0-11 | P0 | `tests/e2e/wave10/onboarding/offline-agent-state.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-12 | R1 P0-12 | P0 | `tests/e2e/wave10/onboarding/first-login-flow.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-13 | R1 P1-01 | P1 | `tests/e2e/wave10/attachments/drag-file-upload.spec.ts` | `test.skip` skeleton | C1:covered, C2:covered, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-14 | R1 P1-02 | P1 | `tests/e2e/wave10/attachments/image-preview.spec.ts` | `test.skip` skeleton | C1:covered, C2:covered, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-15 | R1 P1-03 | P1 | `tests/e2e/wave10/session-mgmt/multi-session.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:covered |
| OAC-Wave10-E2E-16 | R1 P1-04 | P1 | `tests/e2e/wave10/agent-edit/instructions-injection.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-17 | R1 P1-05 | P1 | `tests/e2e/wave10/chat-core/multi-agent-concurrency.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:covered |
| OAC-Wave10-E2E-18 | R1 P1-06 | P1 | `tests/e2e/wave10/session-mgmt/reload-during-stream.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:covered |
| OAC-Wave10-E2E-19 | R1 P1-07 | P1 | `tests/e2e/wave10/session-mgmt/reset-context-history.spec.ts` | `test.skip` skeleton | C1:not applicable, C2:covered, C4:not applicable, C5:covered |
| OAC-Wave10-E2E-20 | R1 P1-08 | P1 | `tests/e2e/wave10/chat-core/long-prompt-delivery.spec.ts` | `test.skip` skeleton | C1:covered, C2:covered, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-21 | R1 P1-09 | P1 | `tests/e2e/wave10/attachments/mixed-media-send.spec.ts` | `test.skip` skeleton | C1:covered, C2:covered, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-22 | R1 P1-10 | P1 | `tests/e2e/wave10/session-mgmt/session-activity-unread.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:covered |
| OAC-Wave10-E2E-23 | R1 P1-11 | P1 | `tests/e2e/wave10/agent-edit/instructions-persistence.spec.ts` | `test.skip` skeleton | C1:not applicable, C2:covered, C4:not applicable, C5:covered |
| OAC-Wave10-E2E-24 | R1 P1-12 | P1 | `tests/e2e/wave10/session-mgmt/run-survives-reload.spec.ts` | `test.skip` skeleton | C1:not applicable, C2:not applicable, C4:not applicable, C5:covered |
| OAC-Wave10-E2E-25 | R1 P2-01 | P2 | `tests/e2e/wave10/resilience/network-reconnect.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:covered |
| OAC-Wave10-E2E-26 | R1 P2-02 | P2 | `tests/e2e/wave10/resilience/runtime-crash-error.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-27 | R1 P2-03 | P2 | `tests/e2e/wave10/chat-core/oversized-prompt-error.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-28 | R1 P2-04 | P2 | `tests/e2e/wave10/resilience/sse-retry-fault-injection.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-29 | R1 P2-05 | P2 | `tests/e2e/wave10/security/decrypted-history-permission.spec.ts` | `test.skip` skeleton | C1:not applicable, C2:covered, C4:not applicable, C5:not applicable |
| OAC-Wave10-E2E-30 | R1 P2-06 | P2 | `tests/e2e/wave10/performance/concurrent-message-order.spec.ts` | `test.skip` skeleton | C1:covered, C2:not applicable, C4:not applicable, C5:covered |
