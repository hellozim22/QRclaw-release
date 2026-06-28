# Wave 10 推荐路径（A/B/C + 推荐）

> 2026-04-28 · 配套 `wave10-strategic-arch-review.md`
> 提供三条可执行路径 + 明确推荐，不重复 Q1 的 fork 策略细节

---

## Path A — 激进：LobeChat 整换

**定义**：把 `web/` 换成 LobeChat fork，重接 Supabase auth + Gateway API + QRClaw 设计系统。

| 维度 | 评估 |
|------|------|
| 时间 | 4-6 周（优化估算：Q1 给的 18-30 天偏乐观，含 auth/Supabase 重接、Next 14↔16 对齐、设计系统迁移、测试重建） |
| 风险 | 高：LobeChat provider/session 语义易反向污染 Gateway；upstream sync 永久性冲突；Next/React 版本对齐是泥潭 |
| 3 个月后形态 | 一个长期漂移的 LobeChat 定制分叉；QRClaw 协议让位于 LobeChat 的 store 抽象 |
| 不可逆性 | **极高**。Wave 5-9 的 owner 前端和 chat store 基本全废。回退需要重启前端。 |
| C2 合规 | 最难。LobeChat 自带明文持久化假设（Drizzle 客户端库），需要逐文件 audit。 |
| M2 onboarding（开箱即用）实现难度 | 中。LobeChat 的 session auto-create 机制和"本机 CLI 检测"不对齐，需要手改 |

**何时选 A**：如果 zimzheng 决定 QRClaw 彻底放弃现有协议，把它当成"自己的 LobeChat 皮肤"。**当前明显不是**。

---

## Path B — 保守：组件抽取（Q1 推荐路径）

**定义**：保留 `web/` 现状 + Gateway + Supabase，仅从 LobeChat 移植 Markdown renderer / ChatInput / Conversation 气泡 / FileManager，逐块替换 `chat/page.tsx` 内联实现。

| 维度 | 评估 |
|------|------|
| 时间 | 2-3 周（P0：Markdown + ChatInput + 气泡；P1：SSE 改造；P2：FileManager） |
| 风险 | 低-中：组件边界清晰；SSE 改造是独立风险但 Q2 已给 migration 分阶段方案 |
| 3 个月后形态 | QRClaw 架构基本保持 + 对话体验达到 LobeChat 水平；owner-agent-chat-store 继续是主入口 |
| 不可逆性 | 低。每个组件都可以回退到当前内联实现；SSE 改造有 Phase A 双轨保护 |
| C2 合规 | 最好。组件层不碰持久化、不碰 auth、不碰 Gateway path |
| M2 onboarding 实现难度 | 中-高。现有 `agents/page.tsx` 创建向导是"手动填 name + 选 provider + 拿 token"——这和"开箱即用、打开就看到 CLI 连上了"的方向**不对齐**，需要单独做 onboarding 页。 |

**何时选 B**：**默认选择**。尤其在"pivot 判断还需要几天才能完全定型"时，B 的可回退性保护决策灵活度。

---

## Path C — 分层：visitor 保现有 + owner 侧新 fork

**定义**：`web/` 内部按身份分层：
- `(dashboard)/*`（owner 面，含 agents、chat）：走 **B 的组件抽取路线**（不整换）
- `(visitor)/*`（QR 扫码进来的路径）：冷冻在当前版本，不动
- 路由层用 Next 16 route group 天然隔离

**这和 B 的区别**：C 额外**成文**了"visitor 不参与 pivot"这件事，把 visitor 从活跃迭代里切出去——未来 visitor 要用 QR 发布 owner agent（`Publish as QR`）时再重新拉回。

| 维度 | 评估 |
|------|------|
| 时间 | 2-3 周（同 B） |
| 风险 | 低（同 B，附加一个 route group 梳理成本 0.5 天） |
| 3 个月后形态 | `(dashboard)` 是 Multica-style 主产品；`(visitor)` 是不变的 QR→chat 旧路径；共享 Gateway + Supabase + 设计系统 |
| 不可逆性 | 低 |
| C2 合规 | 最好（同 B） |
| M2 onboarding 实现难度 | 中。同 B，但因为 visitor 不在 onboarding 心智里，dashboard 初次打开体验可以更激进。 |

---

## 决策矩阵

| Path | 时间 | 风险 | 保留 Wave 5-9 | 铁律 | Pivot 匹配度 | 综合 |
|------|:---:|:---:|:-------------:|:---:|:-----------:|:----:|
| A 整换 | 4-6 周 | 高 | 20-35% | 难 | 表面高/实际过度 | 不推荐 |
| B 组件抽取 | 2-3 周 | 低-中 | 85-95% | 最好 | 高 | 次选 |
| **C 分层** | 2-3 周 | 低 | 85-95% | 最好 | **最高** | **推荐** |

---

## 推荐：Path C

### 理由

1. **业务匹配**：wave10-strategic-arch-review §1 判断 "QRClaw 是 zimzheng 的 personal workbench"。这意味着 dashboard（owner 面）应该被当成**主产品**深度投入，visitor 则是**副路径**——Path C 把这个心智在代码层直接成文。

2. **铁律风险最低**：和 B 一样不碰 Gateway、不改持久化、不引 LobeChat store。

3. **两周交付**：2-3 周的时间能交付"M1：4 个 CLI 自动发现 + 打开即 Chat"的最小闭环，这是 pivot 的**验证性里程碑**。如果 zimzheng 2 周后用下来不满意，可以零成本退回；如果满意，M2/M3 顺势展开。

4. **Visitor 不被锁**：`(visitor)` route group 冷冻不等于死掉。未来 `Publish as QR` 要把 owner agent 发布给访客时，visitor 代码作为"已验证的访客通道"被复用，不用重写。

5. **Q1 已隐含支持**：Q1 推荐 C（组件抽取），Path C 只是在 Q1 基础上**显式追加了"按 route group 分层"这一条**，把产品取舍写进目录结构。

### 不推荐 Path A 的关键一票

Path A 的最大隐性代价是 **"把 QRClaw 从协议产品变成客户端产品"**。当前 QRClaw 的战略护城河是 `shared/contracts/` + Edge Function 解密读路径 + OpenClaw plugin 的"后端零感知"边界——这些是**协议层资产**。LobeChat 整换会把产品重心平移到 UI/provider/session 模型上，等于扔掉过去 3-5 个 wave 的协议投入。

如果未来真想走 A，时机应该是"QRClaw 协议已经稳定服务 3 个月 + LobeChat 的 session/provider 模型已经被证明是 zimzheng 需要的"——**现在两个条件都没达到**。

---

## Path C 执行骨架（2 周）

> 作为战略建议，不替代 Q1/Q2 的详细实施清单。

### Week 1：协议 + 基础

- **Day 1-2**：
  - Gateway 新增 `POST /api/owner/agents/:agentId/chat` SSE 路由（Q2 §2-5）
  - Gateway 新增 `owner-agent-run-streams` in-memory hub
  - host-router 在 persist → publish → ack 顺序下推送 SSE
  - **C2 护栏**：路由日志禁 content，Last-Event-ID 忽略，禁止 DB 读解密
- **Day 3-4**：
  - 抽取 LobeChat Markdown renderer 到 `web/src/components/chat/MessageMarkdown.tsx`
  - 抽取 ChatInput 到 `web/src/components/chat/ChatInput.tsx`
  - 保留 `useOwnerAgentChatStore.sendMessage` 作为唯一发送入口
- **Day 5**：
  - `web/src/app/(dashboard)/chat/page.tsx` 改造为消费 SSE
  - `waitForRunReply` 轮询移除
  - 双轨保护：保留 HEL-57 WS fallback flag

### Week 2：onboarding + 交付

- **Day 6-7**：
  - 按 `wave10-onboarding-vision.md` 设计"打开即看到 CLI"体验
  - Local Host 自动发现 4 个 CLI 并注册为 agent（后端 host 端 + gateway endpoint）
- **Day 8**：
  - Visitor 路由移入 `(visitor)` route group，冷冻
  - CLAUDE.md 更新 pivot 事实，写清 visitor = 冷冻分支
- **Day 9**：
  - E2E：打开 dashboard → 看到 4 agent → 点一个 → SSE 流式对话 → 历史回放
  - 验证 C2 日志无明文（Grep `content` in gateway logs = 0）
- **Day 10**：
  - 验收 + 改单 + 发 Wave 10 报告

### 退出条件

Week 2 结束时，zimzheng 打开 dashboard：
- **5 秒内**看到本机 4 个 CLI 作为 agent 在线
- **1 次点击**进入 Chat 主会话
- **流式回复**可见、可复制、Markdown 渲染完整
- **断线重连**历史可回放（走 `decrypted-messages`）
- **visitor/QR** 分支完全不影响 dashboard 体验

如果上述任一失败，Wave 10 未交付。如果全达成，M1 闭环成立，进入 M2（agent 间转交）的 Wave 11 规划。
