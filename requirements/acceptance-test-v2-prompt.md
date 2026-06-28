# QRClaw V2.6 验收测试 V2 — 解锁被 SKIP 的 102 项

> 本文档基于 V1 测试报告（44 pass / 102 skip），目标是解锁剩余的 SKIP 用例。

## 背景

V1 测试报告发现 69.9% 用例被 SKIP，根因：
1. **API 地址错误**：Gateway 只有 `/health` + `/ws`，REST API 全在 Supabase Edge Functions
2. **缺少 Mock Agent**：G/H/D/K 模块需要 Agent WS 客户端配合
3. **缺少登录态**：I 模块 Dashboard 内容测试需要 Auth
4. **缺少测试数据**：没有预置的 Owner/Agent/QRCode 数据

## 执行 Prompt

```bash
claude --dangerously-skip-permissions "你是 QRClaw V2.6 验收测试工程师，可以组建agent team执行第二轮测试。全程自主决策，遇错记录后继续，不要停下来等人。

## 前置任务：阅读报告 + 理解架构

1. 读 requirements/acceptance-test-v2-prompt.md（本文件）
2. 读 V1 测试报告了解哪些 SKIP 了
3. 读项目源码理解实际架构：
   - Gateway 代码（找到 WS 认证方式、ticket 机制、消息协议）
   - Supabase Edge Functions 目录（找到所有 API 端点）
   - 前端代码（找到 API 调用方式、Auth 流程）

## Step 1: 启动本地 Edge Functions

执行 supabase functions serve --env-file .env.local
如果 supabase CLI 没装就先装：npm i -g supabase
确认 Edge Functions 跑在 localhost:54321

## Step 2: 创建测试基础设施

基于源码中的实际接口，创建以下工具文件：

### 2a. tests/acceptance/mock-agent.ts
- 读 Gateway 源码找到 WS 认证方式（ticket? api_key? 哪个 header?）
- 实现：connect(认证参数) → 建连
- 实现：heartbeat() → 发心跳
- 实现：reply(convId, content) → 完整回复
- 实现：replyChunk(convId, text, isFinal) → 流式回复
- 实现：waitFor(eventType) → 等待特定消息
- 实现：received[] → 收到的所有消息

### 2b. tests/acceptance/api-helper.ts
- 读 Edge Functions 源码找到所有端点和参数
- 封装：registerAgent() → 调用实际的 Agent 注册端点
- 封装：createQRCode(agentId, config) → 创建 QRCode
- 封装：manageQRCode(id, action) → pause/activate/archive
- 封装：createVisitorSession(qrcodeId) → 获取 session_token
- 封装：sendVisitorMessage(sessionToken, content) → 发消息

### 2c. tests/acceptance/auth-setup.ts（Playwright global setup）
- 通过 Supabase Auth API 创建测试用户（或用已有测试账号）
- 登录获取 JWT → 保存 storageState 到 tests/.auth/owner.json
- 后续 Dashboard 测试直接复用登录态

### 2d. tests/acceptance/seed-data.ts
- 用 Supabase service_role key 直接操作数据库
- 创建测试 Owner + Agent + QRCode + Conversation 数据
- 提供 cleanup() 函数测试后清理

## Step 3: 逐模块补测

按优先级从高到低：

### P0 — 后端核心（解锁最多用例）
- C: Agent 注册 → 用 api-helper 调 Edge Function
- E: QRCode CRUD → 用 api-helper 调 Edge Function
- D: WebSocket 完整测试 → 用 mock-agent 建连+心跳+断连
- G: 消息路由 → mock-agent 接收 + api-helper 发消息 → 验证转发
- H: 流式输出 → mock-agent 发 reply_chunk → 前端检查逐步显示

### P1 — Dashboard + Auth
- I: 用 auth-setup 登录态 → 测试 Dashboard 所有页面内容
- B-02~B-05: 实际注册登录流程（用测试邮箱）

### P2 — 高级功能
- J: 跨设备 → 匿名 session + 登录合并（seed-data + api-helper）
- K: 对话生命周期 → seed-data 修改 last_active_at 模拟 24h
- L: 配额 → seed-data 设置 quota 计数接近上限

### P3 — 集成
- M: 安全加密 → seed-data 直查数据库验证加密字段
- P: E2E 全链路 → 组合以上所有工具

## Step 4: 生成 V2 报告

完成后生成 requirements/acceptance-report-v2.md：
- 对比 V1 和 V2 的覆盖率提升
- 新发现的问题 + 修复记录
- 仍然 SKIP 的项 + 原因

## 执行原则
- 所有接口地址从源码中读取，不要硬编码错误的 URL
- 先读代码再写测试，确保测试匹配实际实现
- 回归保护：每修复一个问题，跑全量确认不破坏已通过的
- 阻塞的记录后继续，不要停"
```

## 关键提醒

这轮的核心区别是 **先读源码再写测试**，不再假设 API 结构。Claude CLI 需要：
1. `grep -r "router\.\|app\." gateway/src/` 找 Gateway 路由
2. `ls supabase/functions/` 找所有 Edge Functions
3. 读每个 Edge Function 的入口文件理解参数和返回值
4. 基于实际代码封装测试工具

这样就不会再出现"地址错误全部 SKIP"的问题。
