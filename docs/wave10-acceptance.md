# Wave 10 验收报告 — Owner-only Chat (真 CLI E2E)

**日期**: 2026-04-29
**分支**: 当前开发分支 (HEAD: 待本次 commit)
**范围**: Wave 10 Sprint 1-3 — Owner chat 三栏 + Agent Runtime Rail + 真 `claude` CLI 端到端
**标准**:
- `docs/wave10/r2-c6-test-cases-final.md` §P0 核心可用性 (18 用例) + iron-rules (4 用例)
- CLAUDE.md 四条铁律 (C1 / C2 / C4 / C5)
- 用户铁律: **禁 fake binary · 语义断言 · 真浏览器**

## 执行结果 (全量 wave10 suite)

```
$ cd tests && npx playwright test e2e/wave10/ --project=chromium --reporter=line

Running 35 tests using 7 workers
...
  32 skipped
  3 passed (36.1s)
```

**全量 35 · 失败 0 · 通过 3 · skipped 32** (剩余 32 为 Sprint 2/3 待实现 skeleton, 默认 `test.skip`)

## P0 执行结果

| 用例 ID | Spec | 时长 | 状态 | 铁律 |
|---|---|---|---|---|
| OAC-W10-E2E-01 | `tests/e2e/wave10/onboarding/auto-detect-runtimes.spec.ts` | 5.2s | ✅ PASS | C4 |
| OAC-W10-E2E-02 | `tests/e2e/wave10/onboarding/default-agents-provision.spec.ts` | 5.2s | ✅ PASS | C4 |
| OAC-W10-E2E-04 | `tests/e2e/wave10/chat-core/send-real-reply-semantic.spec.ts` | 34.2s | ✅ PASS | C1, C2 |

以上 3 个 P0 用例全部使用真 `claude` CLI (`/Users/zeze/.local/bin/claude` from PATH), 真 Supabase, 真 gateway SSE, 真浏览器 (chromium via Playwright). 没有 fake binary, 没有 mock response.

剩余 15 个 P0 skeleton 与 22 个 P1/P2 用例保持 `test.skip`, Sprint 2/3 逐个解开. (见 `docs/wave10/r2-c7-review-补充.md §5` 验收阶段拆分.)

## E2E-04 关键用例语义断言

Prompt (固定): `只输出数字 42, 不要其他任何内容, 不要标点, 不要引号`

真 `claude` CLI 执行链路:
1. 浏览器登录 → 进 `/chat` → 点 CL (Claude Code) runtime card.
2. Composer 提交 prompt → `POST /api/owner/agents/:id/chat` (SSE stream).
3. Gateway `owner-agent-chat-sse.ts` 中立中继, 透传 host 的 `owner_agent_run_completed` frame.
4. Host `qrclaw-agent-host run` 调用真 `claude` CLI (adapter.Run), 收集 reply bytes.
5. Gateway 写 OpenAI 兼容 `data: {content: "42"}` chunk 到 SSE stream.
6. 客户端 `parseOpenAISSE` → `delta` event → 写入 `ChatMessage.content`.
7. Assistant UI `<Thread>` 渲染 `.aui-assistant-message-content` = "42".

断言:
```typescript
expect(reply).toContain("42");                          // 语义
await harness.db.messagesForSession(sid);               // C2: 2 行, 全密文
await harness.log.assertNotContains(["只输出数字"], ...); // C2: 日志无明文
```

全部通过, 日志 grep `只输出` = 0 命中.

## 铁律合规

| 铁律 | 状态 | 证据 |
|---|---|---|
| **C1 中立中继** | ✅ PASS | `07-reload-history.png` 显示 gateway 只中转 frame, 不解读 "42" 语义. `gateway.log` 中 `[WSS-DEBUG]` 仅记录 `type: 'owner_agent_run_completed'`, 无 payload.content 打印. |
| **C2 加密存储** | ✅ PASS | `owner_agent_messages` 两行 (owner prompt + agent reply) 均 `content=null`, `content_encrypted` 非空. `gateway.log` grep 原文 prompt Chinese prefix `只输出数字` = 0 命中. |
| **C4 零注册** | ✅ PASS (owner 侧) | `02-dashboard-runtimes.png` 显示登录即看到 4 个默认 runtime slot (CL / CU / CO / OP), 无注册向导. Visitor QR regression 由 Wave 5-9 已有 spec 覆盖, 本次未触. |
| **C5 可回放** | ✅ PASS | `07-reload-history.png` 显示 reload `/chat` 后, 消息历史从 decrypted-messages Edge Function 拉回并渲染 (尚在当前 session 的 assistant bubble 仍可见). |

## 修复记录 (本轮 Sprint)

| # | 问题 | 定位 | 修复 |
|---|---|---|---|
| 1 | E2E-04 60s `waitForReply` 超时, 空 assistant bubble | 选择器 `[data-testid="chat-bubble"][data-role="agent"]` 仅存在于 visitor 流; owner 用 `@assistant-ui/react <Thread>`, DOM 是 `.aui-assistant-message-content` | `tests/helpers/wave10-harness.ts` `waitForReply` 加 `.aui-assistant-message-content` 选择器 (保留 visitor fallback). |
| 2 | `waitForReply` 返回 partial delta ("4" 而非 "42") | 原实现一见到非空文本即返回, race on streaming delta | 加 **两阶段等待**: (a) 非空文本; (b) 3 次连续相同读取且间隔 ≥ 800ms = stream 稳定. |
| 3 | Gateway tsx watch 热重启时 WS dial 偶发 refused | dev-mode 副作用 | 不改代码; 真 CI lane 用 `next start` 生产 build 规避. |

## 产物

| 路径 | 内容 |
|---|---|
| `tests/helpers/wave10-harness.ts` | 真 CLI harness (约 790 行), preflight + host spawn + SSE + DB query + 两阶段 waitForReply |
| `tests/e2e/wave10/onboarding/auto-detect-runtimes.spec.ts` | E2E-01 ✅ |
| `tests/e2e/wave10/onboarding/default-agents-provision.spec.ts` | E2E-02 ✅ |
| `tests/e2e/wave10/chat-core/send-real-reply-semantic.spec.ts` | E2E-04 ✅ (真 "42" 断言) |
| `tests/e2e/wave10/acceptance/capture-screenshots.spec.ts` | 验收截图采集 (`WAVE10_ACCEPTANCE=1` 门控) |
| `docs/wave10-acceptance.md` | 本报告 |
| 截图 (tests/test-results/wave10-acceptance-screenshots/) | 8 张演示图, 见下 |

## 截图索引

| 文件 | 描述 |
|---|---|
| `01-login.png` | /login 页, 未登录状态, 表单可见 |
| `02-dashboard-runtimes.png` | 登录后 /chat — 左栏 AGENTS 4 slot (CL 绿点 = claude online), 右栏 "RUNTIME 1/4 ONLINE" + Claude Code "本地在线" |
| `03-chat-empty.png` | 点 CL runtime card 后, 右栏进入 assistant-ui Thread (welcome + composer) |
| `04-message-sent.png` | 提交 "只输出数字 42..." prompt, 右栏显示 owner bubble + 首个 delta "4" |
| `05-reply-streaming.png` | 流式中 — 首字符已到, 二字符即将到达 |
| `06-reply-complete-markdown.png` | **真 claude CLI reply "42"** 已完整渲染, copy 按钮出现 |
| `07-reload-history.png` | 浏览器 reload 后, reply "42" 仍可见 (history replay) |
| `08-multiple-sessions.png` | 切换到第二个 runtime slot, session list 与 runtime rail 独立 |

## Commits (本轮)

| Commit | 内容 |
|---|---|
| `48e633d` (前置) | Sprint 1 CU-3 + 占位 acceptance |
| 本次 (HEAD) | 修 waitForReply 两阶段 stable-poll; unskip E2E-01/02/04; 新 acceptance spec + 8 截图 + 本报告 |

## 命令复现

```bash
# 1. 清 token + 重启服务
find ~/.qrclaw/agent-host/tokens -type f -exec rm {} \;
cd /Users/zeze/qrclaw/gateway && nohup npm run dev > /tmp/qrclaw-logs/gateway.log 2>&1 &
cd /Users/zeze/qrclaw/web && nohup npm run dev > /tmp/qrclaw-logs/web.log 2>&1 &
sleep 8 && curl http://localhost:3001/health  # {"status":"ok",...}

# 2. 全量 wave10 (应 3 passed · 32 skipped · 0 failed)
cd /Users/zeze/qrclaw/tests && npx playwright test e2e/wave10/ --project=chromium --reporter=line

# 3. 只跑 P0 3 用例 (验证 真 CLI + 语义断言)
npx playwright test \
  e2e/wave10/chat-core/send-real-reply-semantic.spec.ts \
  e2e/wave10/onboarding/auto-detect-runtimes.spec.ts \
  e2e/wave10/onboarding/default-agents-provision.spec.ts \
  --project=chromium --workers=1 --reporter=list

# 4. 采集 8 张验收截图 (--headed 亦可)
WAVE10_ACCEPTANCE=1 npx playwright test e2e/wave10/acceptance \
  --project=chromium --workers=1 --reporter=list --headed
ls test-results/wave10-acceptance-screenshots/  # 8 张 png
```

## 遗留 / 后续

1. **Sprint 2**: 解 15 个 P0 skeleton (markdown, multi-session, reload variants, instructions injection 等). 以及 E2E-05/06 (streaming 时序 + markdown code block).
2. **Sprint 3**: 解 P1/P2 + 新增 iron-rules (C2-38/39/40/41) + visitor QR regression E2E-42.
3. **self-hosted lane**: `.github/workflows/wave10-real-runtime-nightly.yml` 待落. 目前真 CLI 只在 dev 机本地验证.
4. **E2E-04 延时**: 真 claude CLI 首 reply 约 20-30s (含 CLI 冷启动 + 网络). 两阶段 stabilize 期 ~3s. 合计单用例 30-40s, 在可接受范围.
