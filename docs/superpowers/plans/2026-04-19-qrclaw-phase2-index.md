# QRClaw Phase 2 — 规划索引（Draft）

> **用途**：Phase 2 被拆成两波独立的 plan，本文件是它们的"总图"。任何人接手 Phase 2 都应**先读本文件**，再根据当前进度跳到对应 Wave plan。

---

## 背景一句话

Phase 1 已经把客户端发给网关的 WebSocket 入站帧收进 `shared/contracts/ws/` 作为真相源（zod schema + TS types + parity tests + CI sync-check）。Phase 2 把同一个"单源契约"的 pattern 再推两步：

- **Wave 1**：HTTP 请求体 → `shared/contracts/http/`
- **Wave 2**：网关 → 客户端的 WebSocket 出站帧 → `shared/contracts/ws/outbound.ts`

全部完成后，QRClaw 的整个 wire protocol（HTTP in + WS in + WS out）都在一个目录里，一处写一遍，web 和 gateway 不再脑补彼此的数据形状。

---

## 用户已确认的范围（scope lock）

| 维度 | 选择 | 含义 |
|---|---|---|
| Scope | **A + C** | A = HTTP 请求体契约；C = 出站 WS Zod 校验。**不做** OpenAPI / tRPC / 响应体 Zod / codegen |
| Depth | **all endpoints** | 所有 web 能到达的 HTTP 端点（共 10 个，其中 5 个带 JSON body）+ 所有出站 WS 帧（9 个） |
| Validation stance | Wave 1 = strict（请求校验失败直接 400）；Wave 2 = γ hybrid（dev/test/CI 严格丢帧，prod 默认 log-only 观察 7 天再切严格） | 两波的校验强度不同，原因见各自 plan §3 |
| 交付边界 | 所有 commit 先落本地 `main`，再统一走 Part B 的 GitHub 发布流程 | 和 Wave 0 同策略 |

---

## 两波 plan 的位置

| Wave | 文件 | 行数 | 任务数 | 预计 commit | 关键决策 |
|---|---|---|---|---|---|
| Wave 1 — HTTP | [`2026-04-19-qrclaw-phase2-wave1-http-contracts.md`](./2026-04-19-qrclaw-phase2-wave1-http-contracts.md) | 776 | 9 (T1 + T2a–T2d + T3–T6) | 7–8 | `shared/contracts/http/` 按 domain 分目录；request-only Zod；web 永不 import zod |
| Wave 2 — Outbound WS | [`2026-04-19-qrclaw-phase2-wave2-outbound-ws.md`](./2026-04-19-qrclaw-phase2-wave2-outbound-ws.md) | 651 | 7 (T1–T6 + C1) | 9–12 | `shared/contracts/ws/outbound.ts` 新文件；`sendFrame()` 统一 emit helper；feature-flag 控 strict vs log-only |

---

## 执行顺序建议

```
Wave 1 (HTTP)          Wave 2 (Outbound WS)
   │                           │
   T1: scaffold+middleware    T1: schemas + parity tests
   T2a: tickets                T2: sendFrame helper + flag
   T2b: messages               T3a–T3e: migrate emit sites
   T2c: subscribers            T4: observability wiring
   T2d: qrcodes                T5: flip flag (test → prod)
   T3: web consumers           T6: qrclaw-map update
   T4: sync-check scope        C1: six-pane verify
   T5: qrclaw-map recipe
   T6 (optional): regressions
   C1: six-pane verify
```

**推荐顺序**：Wave 1 → Wave 2。理由：

1. Wave 1 可能顺手重构 `gateway/src/server.ts` 的 route 挂载方式（把 middleware 统一注入）。Wave 2 的 T3 需要 grep emit sites，如果 Wave 1 先动过 `gateway/src/ws/*` 文件结构，Wave 2 的 inventory 会失效。反过来顺序不会有此问题。
2. Wave 2 的 hybrid rollout 需要观测 7 天才切严格，和 Wave 1 并行会模糊"哪个 wave 引入的 warn 日志"。串行更好归因。
3. Wave 2 §0 的元数据已显式声明"Wave 1 可能先落地"，实现者会重跑 inventory。

**允许并行的前提**：两位不同的 implementer subagent 各做一波，且事先约定 `gateway/src/ws/send.ts`（Wave 2 新文件）和 `gateway/src/middleware/validate-request.ts`（Wave 1 新文件）没有 path 冲突。

**目前决定**：由于团队是 1–2 人，**串行执行**（Wave 1 完全合入 main 后再启动 Wave 2）。这也与 Wave 0 的 subagent-driven-development 执行经验一致。

---

## 两波之间的跨引用一致性（本 index 的主要价值）

| 共享依赖 / 约束 | Wave 1 出现位置 | Wave 2 出现位置 | 一致性 |
|---|---|---|---|
| Phase 1 SSoT pattern（types.ts + protocol.ts 分离） | §3.2 Split rule | §3.2 Why sibling file | ✓ 一致 |
| `shared/package.json` 拥有 zod | §0 depends-on | §0 tech stack | ✓ 一致 |
| `@shared/contracts/*` path alias | §3.6 tsconfig updates | 默认复用，不改 | ✓ 一致 |
| `scripts/sync-contracts.mjs` | §3.5 扩展策略 | T3 边界 —— 出站 schema 也需要同步到 supabase？ | ⚠️ **Wave 2 未明确讨论**。决议：Wave 2 的 outbound schemas 需要同步给 supabase/functions/_shared，因为 chat-agent edge function 会 consume。implementer 启动 Wave 2 T1 之前，先确认 `sync-contracts.mjs` 在 Wave 1 扩展后能覆盖 `outbound.ts`。 |
| Web bundle zod-free guardrail | §1.2 G2 + §4 T4 | §1.3 非目标 + §5 验证策略 | ✓ 一致（grep 校验两波都有） |
| Parity test pattern `expectTypeOf` | §5.3 | §5.3 | ✓ 一致（复用 Phase 1 文件） |
| CI six-pane | §5.4 | §5.5 | ✓ 一致（加入的新测试进同一套） |

---

## 两波之间的已知 follow-up（不属于任何一波）

从两份 plan 的 §9 汇总，这些是 Phase 2 **不做**但将来需要单独立项的事：

1. **响应体 Zod**（Wave 1 §9 #1）—— 需要 trust model 重新讨论，gateway 是否视为 untrusted producer？
2. **OpenAPI 文档 / tRPC**（Wave 1 §9 #2-3）—— 只有开始给第三方暴露 API 时才值得做
3. **Supabase Edge Function HTTP 契约统一**（Wave 1 §9 #4 + Wave 2 §9 "Supabase Edge 出站"）—— 需要 Deno + Node type consumption 的 mini-plan
4. **schema 版本演进策略**（Wave 2 §9）—— 添加字段的 rollout 手册
5. **stream_chunk 热路径 Zod benchmark**（Wave 2 R1）—— 50 chunks/s 时 Zod 验证开销实测
6. **Wave 1 drift F（system_prompt 截断行为变更）**—— 需要产品侧决定是 reject 还是保持 silent-truncate
7. **历史 mock frame 审计**（Wave 2 R3）—— `tests/acceptance/mock-agent.ts` 等手工 frame 是否符合新 Zod

---

## Status & Next actions

### 当前状态（2026-04-19）

- ✅ Wave 0（CI/CD 硬化）已完成 + commit 到本地
- ✅ Wave 1 plan draft 落地（待用户审阅）
- ✅ Wave 2 plan draft 落地（待用户审阅）
- ✅ Phase 2 index（本文件）落地
- ⏳ 用户 review 两份 plan + 决定是否启动 Wave 1 执行
- ⏳ 本地 commit 后经 [`../../release/github-publish-guide.md`](../../release/github-publish-guide.md) 推到 GitHub

### Orchestrator 的下一步（按优先级）

1. **先执行 GitHub 发布** —— 让 Wave 0 的 CI/CD 真正开始跑；Phase 2 的 plan 先作为 doc 落本地即可。
2. **用户 review Wave 1 plan** —— 尤其是 §2.3 的 5 条 drift 是否都认同修复方式。重点看 drift F（system_prompt 截断是否改变对外行为）。
3. **决定是否启动 Wave 1 T1** —— 进入 subagent-driven-development 执行流。
4. **Wave 2 先不启动** —— 等 Wave 1 完成后再重跑 emit-site inventory（Wave 2 §0 已预警）。

---

**修改历史**

- 2026-04-19：初版（串联 Wave 1 + Wave 2 两份 plan）
