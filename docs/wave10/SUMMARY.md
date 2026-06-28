# Wave 10 架构决策汇总（4 份评估 + 综合）

> 2026-04-28 20:30
> 评估来源：cursor Q1/Q2/Q3 + claude Opus 战略审查 × 3

---

## 核心结论：4 路意见一致

| 问题 | 决策 | 理由共识 |
|---|---|---|
| **Q1 Fork 策略** | **组件抽取（C / C+）** | 保留 Wave 5-9 成果 85-95%，2-3 周交付，C2 合规成本最低 |
| **Q2 协议改造** | **OpenAI SSE Owner 面 + Host WS 保留** | Owner 面切 SSE 下线 HEL-57 WS 订阅；Host ↔ Gateway 继续 WS；历史走 decrypted-messages |
| **Q3 Session vs Conversation** | **保留 QRClaw Conversation 作 SSoT，LobeChat Session 只用 UI 层，中间加 adapter** | Conversation schema 更成熟且承载了加密/回放铁律；LobeChat session 带 agent config 耦合重 |
| **Path 推荐** | **Path C：route group 分层**（dashboard pivot + visitor 冷冻） | Path B 基础上显式切出 visitor，不参与活跃迭代 |

---

## 产品定位（从 claude 战略审查）

**QRClaw = zimzheng 的本机多 agent 控制台**
- 主 Chat：和 4 个本地 CLI（openclaw/claude/cursor/codex）同时对话
- 副分支：被访客 QR 触达（冷冻保留）
- 客户：1 个（zimzheng），target project：笔笔省
- 不做：SaaS / 多租户 / Agent Market / 语音通话

---

## 3 个月 Milestone

| 月 | 目标 | 成功判据 |
|---|---|---|
| **M1**（Wave 10 核心） | 本机 4 CLI 自动发现 + 一键 Chat + 流式 Markdown | dashboard 打开 5 秒内 4 agent 在线，点一个就能流式对话 |
| M2 | Agent 间手动转交任务 + 文件图片 | A 说"交给 B" → UI 一键转发到 B 的私聊 |
| M3 | 笔笔省 workspace 绑定 + 多 agent 协作 | 在 Chat 里说"改笔笔省记账页"，agent 各自去处理 |

---

## Wave 5-9 成果保留度（claude 战略审查）

**总评：75-80% 继续是战略资产**。

| 投入 | 保留 | 百分比 |
|---|---|---|
| Gateway 中立中继 + 加密写路径 | ✅ 核心保留 | 95% |
| Supabase owner_agent_* + decrypted-messages Edge | ✅ 核心保留 | 100% |
| Host WS 协议 (accepted/event/completed/failed) | ✅ 核心保留 | 100% |
| OpenClaw Channel Plugin M0-M4 | ✅ 保留 | 90% |
| Go host adapter | ✅ 保留 | 70% |
| agents/page.tsx 创建向导 | ✅ 保留 | 85% |
| Visitor/QR 链路 | ❄️ 冷冻保留 | 100% |
| Owner WS run-event fanout (HEL-57) | ❌ 废弃 | 20% |
| chat/page.tsx 现有气泡 | 🔄 重写 | 30% |

---

## 3 条不可破红线（Wave 10 acceptance 前置）

1. **C2 护栏成文**：Gateway SSE 路由禁止日志明文；禁止 `Last-Event-ID` 触发 DB 解密；resume 一律走 Edge Function
2. **LobeChat 只抽 UI 层**：带 store/service/provider/runtime 字样的代码一概不 vendor；Drizzle/agent-runtime/i18n-store/plugin-store 全部不进来
3. **Host WS 协议冻结**：不因 SSE 改造而改字段；Gateway 内部顺序固定为 encrypt → persist → publish → ack

---

## Onboarding 愿景（claude 产出）

**第一眼体验**（登录后默认落在 `/chat`）：

```
┌──────────────────────────────────────────────────┐
│ QRClaw                                  zimzheng │
├────────┬─────────────────────────────────────────┤
│ Chat(4)│  欢迎回来，zimzheng                      │
│ 智能体 │                                          │
│ 公开   │  我检测到你的机器上有 4 个可用的 CLI：   │
│ 设置   │  ✅ Claude Code    (~/.local/bin/claude) │
│        │  ✅ Cursor Agent   (/usr/local/bin/..)   │
│        │  ✅ Codex          (~/.bun/bin/codex)    │
│        │  ✅ OpenClaw       (npm -g openclaw)     │
│        │  （左栏点任意一个立即开聊）               │
└────────┴─────────────────────────────────────────┘
```

**不要**：
- ❌ 空列表 + "创建你的第一个 Agent" 按钮
- ❌ 请先下载 QRClaw Host
- ❌ host token 贴板 / curl 命令
- ❌ openclaw login 引导

**机制**：
- 本地 CLI detect 工具常驻跑（类似 mac menu bar 小助手），detect 到就 register host
- 自动 register：`default-local-host` 一个 host 顶 4 个 provider（openclaw/claude/cursor/codex）
- 登录后 gateway 给 owner 默认建 4 个 agent（每个 provider 一个），挂到 default-local-host
- 用户第一次看到就是"已经 work"的状态

---

## Wave 10 分期

### Sprint 1（第 1 周）：M1 骨架
- 重新定义 /chat 为首屏（不是 /messages）
- 本机 CLI auto-detect 守护进程（Go host 改长驻 + 自动 register）
- Gateway 侧 auto-provision 4 个默认 agent（每个 owner 首次登录）
- 废弃 agents/page.tsx 创建向导的强制路径（保留作为"高级创建"）

### Sprint 2（第 2 周）：SSE + LobeChat UI
- Gateway 新增 `POST /api/owner/agents/:id/chat` (OpenAI SSE)
- 废弃 HEL-57 Owner WS 订阅（切 SSE）
- 抽取 LobeChat Markdown renderer + ChatInput → web/src/components/chat/
- 老 chat/page.tsx 换成新组件

### Sprint 3（第 3 周）：完整性 + 真实 E2E
- 文件/图片上传（P1）
- **真 provider** E2E（不用 fake binary，用真 openclaw/claude 跑确定性 prompt）
- 验收报告按 CLAUDE.md Step 4 严格度重写

---

## 参考文档

- `docs/wave10/q1-fork-strategy.md` (cursor)
- `docs/wave10/q2-sse-protocol.md` (cursor)
- `docs/wave10/q3-session-vs-conversation.md` (cursor)
- `/tmp/wave10-strategic-arch-review.md` (claude Opus)
- `/tmp/wave10-recommended-path.md` (claude Opus)
- `/tmp/wave10-onboarding-vision.md` (claude Opus)
