# QRClaw V2.6 产品验收测试计划 — Claude CLI 本地自动化执行

> **目标**：按 161 项验收用例逐项测试，发现问题自动修复，修复后回归验证。
> **执行环境**：本地开发环境
> **测试工具**：Playwright CLI（`npx playwright test`）
> **产品基线文档**：`requirements/product-plan-v2.6.md` + `requirements/interaction-flow-v2.md`

---

## 本地环境

| 服务 | 地址 |
|------|------|
| **前端（Next.js）** | `http://localhost:3000` |
| **Gateway** | `http://localhost:3001` |
| **Gateway Health** | `http://localhost:3001/health` |
| **Gateway WebSocket** | `ws://localhost:3001/ws` |
| **Redis** | 本地已连接 |
| **Supabase** | 项目 `.env` 中配置的远程实例 |

---

## 执行指令

```bash
# 在项目根目录执行
claude "按照 requirements/acceptance-test-plan.md 执行验收测试。要求：
1. 先读取本文档了解全部 161 项验收用例
2. 用 Playwright 编写自动化测试脚本，放到 tests/acceptance/ 目录
3. 按模块 A→P 逐个执行
4. 每个模块测试完成后汇报通过/不通过
5. 不通过的项目立即修复源码，修复后重跑该用例确认通过
6. 全部完成后生成验收报告到 requirements/acceptance-report.md"
```

---

## Playwright 测试基础配置

先确保项目有 Playwright 配置，若没有则创建：

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/acceptance',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 375, height: 812 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
    },
  ],
});
```

### 测试辅助工具

```typescript
// tests/acceptance/helpers.ts
import { request } from '@playwright/test';

// Gateway API 基础地址
export const GATEWAY_URL = 'http://localhost:3001';
export const FRONTEND_URL = 'http://localhost:3000';
export const WS_URL = 'ws://localhost:3001/ws';

// Gateway API 调用
export async function gatewayAPI(method: string, path: string, body?: any, headers?: Record<string, string>) {
  const ctx = await request.newContext({ baseURL: GATEWAY_URL });
  const opts: any = { headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.data = body;
  const res = await ctx[method.toLowerCase()](path, opts);
  return { status: res.status(), body: await res.json().catch(() => null), headers: res.headers() };
}

// 注册测试 Agent
export async function registerTestAgent(name?: string) {
  const agentName = name || `test-agent-${Date.now()}`;
  return gatewayAPI('POST', '/api/v1/register', {
    name: agentName,
    description: 'Automated test agent',
    owner_email: 'test@example.com',
  });
}

// WebSocket 连接辅助
export function connectWS(apiKey: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new (require('ws'))(`${WS_URL}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WS connect timeout')), 5000);
  });
}

// 等待 WS 消息
export function waitForMessage(ws: any, type: string, timeoutMs = 10000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
    ws.on('message', (data: string) => {
      const msg = JSON.parse(data);
      if (msg.type === type) { clearTimeout(timer); resolve(msg); }
    });
  });
}
```

---

## 模块 A：Landing Page（首页）

> 测试文件：`tests/acceptance/a-landing-page.spec.ts`

### A-01: 首页可访问
- **场景**：访问 `http://localhost:3000`
- **预期**：正常加载，HTTP 200，无白屏
- **Playwright**：
```typescript
test('A-01: 首页可访问', async ({ page }) => {
  const res = await page.goto('/');
  expect(res.status()).toBe(200);
  await expect(page.locator('body')).not.toBeEmpty();
});
```

### A-02: Nav Bar 导航
- **场景**：检查首页顶部导航
- **预期**：包含 Logo + 核心链接，样式正确
- **Playwright**：检查 `nav` 元素存在 + Logo 图片可见

### A-03: Hero 区域
- **场景**：检查 Hero Section
- **预期**：左侧文案 + 右侧场景图，核心 slogan 展示清晰
- **Playwright**：截图 + 检查 slogan 文本可见

### A-04: Connect Your Agent 卡片
- **场景**：检查核心接入引导卡片
- **预期**：浅灰圆角卡片，包含代码块 `curl -s https://qrclaw.ai/skill.md`，有 Copy 按钮可复制
- **Playwright**：检查代码块文本 + Copy 按钮存在

### A-05: 3步引导说明
- **场景**：检查引导步骤
- **预期**：① Register → ② Connect WebSocket → ③ Create QR Code
- **Playwright**：DOM 内容包含三个步骤文案

### A-06: Features 展示
- **场景**：检查功能卡片区
- **预期**：4 张功能卡片
- **Playwright**：`page.locator('.feature-card')` 或等效选择器计数 = 4

### A-07: Footer
- **场景**：检查底部
- **预期**：包含必要链接和版权信息
- **Playwright**：`footer` 元素存在且含版权文字

### A-08: 官方客服 QRCode Dogfooding
- **场景**：检查首页客服入口
- **预期**：展示 QRClaw 官方客服 QRCode 图片
- **Playwright**：检查 QR 码图片元素可见

### A-09: 多语言切换（English/中文）
- **场景**：切换语言
- **预期**：支持 English（默认）+ 简体中文
- **Playwright**：点击语言切换 → 检查文案变为中文

### A-10: 响应式布局
- **场景**：不同视口宽度
- **预期**：375px / 768px / 1440px 均正常显示
- **Playwright**：三种 viewport 分别截图，无溢出

---

## 模块 B：注册 / 登录（Owner Auth）

> 测试文件：`tests/acceptance/b-auth.spec.ts`

### B-01: 注册页面布局
- **场景**：访问注册页 `http://localhost:3000/signup`
- **预期**：左侧 50% coral-red 背景 + 右侧 50% 白色表单 + "← Back to home"
- **Playwright**：截图 + 检查左右分栏 CSS

### B-02: 邮箱 + 密码注册
- **场景**：填写注册表单提交
- **预期**：成功后自动登录进入 Dashboard
- **Playwright**：填写测试邮箱 → 提交 → 等待跳转到 `/dashboard`

### B-03: 邮箱验证码
- **场景**：点击发送验证码
- **预期**：Supabase Auth 发送验证邮件
- **Playwright**：点击发送 → 检查 API 调用成功（interceptRoute）

### B-04: 登录流程
- **场景**：邮箱 + 密码登录
- **预期**：成功后跳转 Dashboard
- **Playwright**：填写已有账号 → 登录 → 检查 URL 为 `/dashboard`

### B-05: 登录态保持
- **场景**：登录后刷新页面
- **预期**：不掉登录态
- **Playwright**：登录 → `page.reload()` → 仍在 Dashboard

### B-06: 密码强度校验
- **场景**：输入弱密码
- **预期**：有错误提示
- **Playwright**：输入 "123" → 检查错误文案可见

### B-07: 错误提示
- **场景**：各种错误场景
- **预期**：邮箱已注册、密码错误等有明确提示
- **Playwright**：故意输入错误密码 → 检查提示文案

### B-08: V1 不支持 OAuth
- **场景**：检查登录页
- **预期**：无 Google/GitHub 按钮
- **Playwright**：`page.locator('button:has-text("Google")')` 不存在

---

## 模块 C：Agent 注册 & Claim 认领

> 测试文件：`tests/acceptance/c-agent-register.spec.ts`
> 测试方式：直接调用 Gateway API（`http://localhost:3001`）

### C-01: Agent 注册 API
- **场景**：`POST http://localhost:3001/api/v1/register`
- **预期**：返回 `{ agent_id, api_key, claim_url, ws_endpoint }`
- **Playwright**：
```typescript
test('C-01: Agent 注册 API', async () => {
  const { status, body } = await registerTestAgent();
  expect(status).toBe(201);
  expect(body).toHaveProperty('agent_id');
  expect(body).toHaveProperty('api_key');
  expect(body).toHaveProperty('claim_url');
  expect(body).toHaveProperty('ws_endpoint');
});
```

### C-02: API Key 格式
- **场景**：检查返回的 api_key
- **预期**：以 `qrc_live_` 或 `qrc_test_` 开头
- **Playwright**：`expect(body.api_key).toMatch(/^qrc_(live|test)_/)`

### C-03: API Key 仅返回一次
- **场景**：注册后查询 Agent 信息
- **预期**：后续接口不返回明文 api_key
- **Playwright**：注册 → 用 agent_id 查详情 → 确认无 api_key 字段

### C-04: Claim URL 可访问
- **场景**：访问 claim_url
- **预期**：显示认领页面
- **Playwright**：`page.goto(claim_url)` → 检查页面含 Agent 名称

### C-05: Claim 邮箱验证
- **场景**：通过 claim_url 认领
- **预期**：验证通过后 Agent 绑定到 Owner 账号
- **Playwright**：模拟 Claim 流程 → 查数据库 agents 表 owner_id 已绑定

### C-06: Claim 24h 过期
- **场景**：创建 Agent 但不认领
- **预期**：超 24h 自动 archived
- **Playwright**：检查数据库中过期回收逻辑存在（cron/trigger）

### C-07: IP 级限速
- **场景**：同一 IP 快速注册 10+ 次
- **预期**：被限流返回 429
- **Playwright**：
```typescript
test('C-07: IP 级限速', async () => {
  const results = [];
  for (let i = 0; i < 15; i++) {
    results.push(await registerTestAgent(`rate-test-${i}`));
  }
  expect(results.some(r => r.status === 429)).toBe(true);
});
```

### C-08: 重复注册检测
- **场景**：同名 Agent 注册两次
- **预期**：有合理处理
- **Playwright**：两次注册同名 → 检查第二次响应

---

## 模块 D：WebSocket 连接（Agent ↔ Gateway）

> 测试文件：`tests/acceptance/d-websocket.spec.ts`
> 测试方式：Node.js `ws` 库直连 `ws://localhost:3001/ws`

### D-01: Agent WS 建连
- **场景**：用 api_key 连接 `ws://localhost:3001/ws`
- **预期**：连接成功
- **Playwright**：
```typescript
test('D-01: Agent WS 建连', async () => {
  const { body } = await registerTestAgent();
  const ws = await connectWS(body.api_key);
  expect(ws.readyState).toBe(1); // OPEN
  ws.close();
});
```

### D-02: 无效 API Key 拒绝
- **场景**：使用假 api_key 连接
- **预期**：连接被拒绝
- **Playwright**：`connectWS('fake_key')` → 应 reject

### D-03: 心跳机制
- **场景**：发送 `{ type: "heartbeat" }`
- **预期**：返回 `{ type: "heartbeat_ack", timestamp }`
- **Playwright**：
```typescript
test('D-03: 心跳机制', async () => {
  const { body } = await registerTestAgent();
  const ws = await connectWS(body.api_key);
  ws.send(JSON.stringify({ type: 'heartbeat' }));
  const ack = await waitForMessage(ws, 'heartbeat_ack');
  expect(ack).toHaveProperty('timestamp');
  ws.close();
});
```

### D-04: 心跳超时断连
- **场景**：超过 90s 不发心跳
- **预期**：Gateway 主动关闭连接
- **Playwright**：建连后等待 95s → 检查连接已关闭（可用更短超时模拟）

### D-05: 断线重连退避
- **场景**：连接断开后重连
- **预期**：1s→2s→4s→...→30s(max)
- **Playwright**：审查 SDK/客户端重连代码逻辑

### D-06: 每 Agent 单连接限制
- **场景**：同 Agent 建第二条连接
- **预期**：新连接顶掉旧连接
- **Playwright**：建两条连接 → 检查第一条被关闭

### D-07: 未 Claim Agent 心跳
- **场景**：未认领 Agent 连接
- **预期**：心跳超时更严格（45s）
- **Playwright**：未 Claim Agent 建连 → 不发心跳 → 检查 45s 内断连

### D-08: Gateway /health 端点
- **场景**：`GET http://localhost:3001/health`
- **预期**：返回 `{ status: "ok", uptime, memoryMB, wsConnections, redisConnected, timestamp }`
- **Playwright**：
```typescript
test('D-08: /health', async () => {
  const { status, body } = await gatewayAPI('GET', '/health');
  expect(status).toBe(200);
  expect(body.status).toBe('ok');
  expect(body).toHaveProperty('redisConnected', true);
});
```

---

## 模块 E：QRCode 管理（CRUD + 生命周期）

> 测试文件：`tests/acceptance/e-qrcode-crud.spec.ts`

### E-01: 创建 QRCode（API）
- **场景**：`POST http://localhost:3001/api/v1/qrcodes`
- **预期**：返回 qrcode_id + slug + status:pending_review + profile_url + qr_image_url
- **Playwright**：API 调用 → 验证所有字段

### E-02: 创建 QRCode（Dashboard）
- **场景**：Dashboard "+" 按钮
- **预期**：填表单后创建成功，直接 active
- **Playwright**：`page.goto('/dashboard')` → 点击 "+" → 填表 → 提交 → 检查列表新增

### E-03: pending_review 状态
- **场景**：API 创建的 QRCode
- **预期**：Visitor 访问看到"尚未发布"提示
- **Playwright**：API 创建 → `page.goto(profile_url)` → 检查提示文案

### E-04: Owner 发布确认
- **场景**：Dashboard 点"发布"
- **预期**：status → active
- **Playwright**：Dashboard 操作 → API 查询确认 status=active

### E-05: 24h 未确认自动归档
- **场景**：pending_review 超 24h
- **预期**：自动 archived
- **Playwright**：检查数据库自动回收逻辑代码存在

### E-06: 编辑 QRCode 配置
- **场景**：`PUT /api/v1/qrcodes/:id`
- **预期**：更新成功，config_version 自增
- **Playwright**：更新前后对比 config_version

### E-07: 暂停 QRCode
- **场景**：`POST /qrcodes/:id/pause`
- **预期**：status → paused，Visitor 看到暂停提示
- **Playwright**：暂停 → 访问 profile_url → 检查提示

### E-08: 恢复 QRCode
- **场景**：`POST /qrcodes/:id/activate`
- **预期**：paused → active
- **Playwright**：暂停 → 恢复 → 检查 status

### E-09: 归档 QRCode（不可逆）
- **场景**：`POST /qrcodes/:id/archive`
- **预期**：archived 不可逆
- **Playwright**：归档 → 尝试 activate → 应失败

### E-10: QR 码图片生成
- **场景**：创建后
- **预期**：qr_image_url 可访问，内容可解码为正确 URL
- **Playwright**：下载图片 → 检查 HTTP 200

### E-11: Profile URL 可访问
- **场景**：访问 `http://localhost:3000/q/{slug}`
- **预期**：显示 Agent Profile 页
- **Playwright**：`page.goto('/q/' + slug)` → 检查 Agent 名称可见

### E-12: 多 QRCode 支持
- **场景**：同一 Agent 创建 2 个 QRCode
- **预期**：各自独立配置
- **Playwright**：创建 2 个 → 验证 system_prompt 不同

### E-13: Dashboard 状态标签
- **场景**：Dashboard QR 列表
- **预期**：显示 🟢 Active / ⏸️ Paused / 📦 Archived
- **Playwright**：截图 + DOM 检查状态标签

---

## 模块 F：Visitor 扫码对话流程

> 测试文件：`tests/acceptance/f-visitor-chat.spec.ts`

### F-01: 移动端 Profile 页
- **场景**：移动端 UA 访问 `/q/{slug}`
- **预期**：显示头像/名称/描述/标签/suggested_questions/Start Chat
- **Playwright**（mobile project）：截图 + 检查关键元素

### F-02: 移动端匿名即聊（铁律 C4）
- **场景**：移动端点 Start Chat
- **预期**：直接进入 Chat，不弹注册框
- **Playwright**（mobile）：点 Start Chat → 检查 URL 含 `/chat` → 无 auth modal

### F-03: 移动端 Session Token 分配
- **场景**：点 Start Chat
- **预期**：`POST /visitor/session` 返回 session_token
- **Playwright**：拦截 API 请求 → 检查响应含 session_token

### F-04: 桌面端要求注册
- **场景**：桌面端点 Start Chat
- **预期**：弹出注册/登录弹窗
- **Playwright**（desktop）：点 Start Chat → 检查 auth modal 可见

### F-05: 桌面端 JWT→Session Token
- **场景**：桌面端登录后 Start Chat
- **预期**：API 带 JWT 返回绑定的 session_token
- **Playwright**：登录 → Start Chat → 拦截请求检查 Authorization header

### F-06: 设备检测逻辑
- **场景**：各种 UA + 屏幕组合
- **预期**：Mobile UA 或 <1024px → 移动端；否则桌面端
- **Playwright**：多种 viewport + UA 组合测试

### F-07: Chat 页面加载
- **场景**：进入 `/q/{slug}/chat`
- **预期**：Agent 头像 + 名称 + 输入框 + 提示文案
- **Playwright**：截图 + 检查输入框 + 提示文案可见

### F-08: Visitor 发送消息
- **场景**：输入文字发送
- **预期**：消息上墙 ✓ 已发送 → ✓✓ 已送达
- **Playwright**：输入 → 点发送 → 检查消息气泡出现

### F-09: Agent 回复显示
- **场景**：Agent 回复
- **预期**：实时显示，带 AI 头像 + 时间戳
- **Playwright**：发消息 → 等待 Agent 回复气泡出现

### F-10: suggested_questions 点击
- **场景**：Profile 页点击建议问题
- **预期**：作为首条消息发送
- **Playwright**：点击 suggested_question → 检查 Chat 中出现

### F-11: 新开对话按钮
- **场景**：点 "New conversation"
- **预期**：Chat 清空，新 conversation_id
- **Playwright**：发消息 → New conversation → 检查聊天区清空

### F-12: 对话菜单
- **场景**：Chat ••• 菜单
- **预期**：含 Reset Session 等
- **Playwright**：点菜单 → 检查选项

---

## 模块 G：消息路由 & Security Envelope

> 测试文件：`tests/acceptance/g-message-routing.spec.ts`
> 测试方式：Playwright API 测试 + WS 监听

### G-01: Visitor→Agent 消息转发
- **场景**：Visitor 发消息
- **预期**：Agent WS 收到含 content + context + security_envelope
- **Playwright**：Visitor API 发消息 → Agent WS 监听 → 验证消息结构

### G-02: context 注入
- **场景**：转发消息的 context
- **预期**：含 system_prompt + temperature + visitor_identity + extra_meta
- **Playwright**：Agent 端验证 context 字段完整

### G-03: security_envelope 注入
- **场景**：转发消息的 security_envelope
- **预期**：含 policy_id + policy_hash + rules(4条) + enforcement_text + injected_at
- **Playwright**：Agent 端验证字段

### G-04: content 不被修改（铁律 C2）
- **场景**：发送特殊字符消息
- **预期**：Agent 收到的 content 完全一致
- **Playwright**：发送 emoji + HTML + 特殊字符 → Agent 端逐字对比

### G-05: ACK 返回
- **场景**：发消息后
- **预期**：收到 ACK status=forwarded
- **Playwright**：检查 ACK 响应

### G-06: 消息幂等去重
- **场景**：同 message_id 发两次
- **预期**：第二次 202 duplicate
- **Playwright**：
```typescript
test('G-06: 幂等去重', async () => {
  const msgId = `msg_test_${Date.now()}`;
  const r1 = await sendMessage(sessionToken, convId, 'hello', msgId);
  const r2 = await sendMessage(sessionToken, convId, 'hello', msgId);
  expect(r1.status).toBe(200);
  expect(r2.status).toBe(202);
});
```

### G-07: Per-Session 限流（10条/min）
- **场景**：1 分钟发 11 条
- **预期**：第 11 条返回 429
- **Playwright**：循环发 11 条 → 检查最后一条 429

### G-08: Per-QRCode 限流（100条/min）
- **场景**：单 QRCode 超 100 条/min
- **预期**：超限后限流
- **Playwright**：多 session 并发发送 → 检查 429

### G-09: Per-Agent 限流（500条/min）
- **场景**：单 Agent 超 500 条/min
- **预期**：触发告警，不自动 pause
- **Playwright**：代码审查限流逻辑

### G-10: 消息加密存储
- **场景**：消息写入数据库
- **预期**：content_encrypted 为密文
- **Playwright**：发消息 → Supabase 查 messages 表 → 确认非明文

### G-11: Agent 未连接处理
- **场景**：Agent WS 断开时 Visitor 发消息
- **预期**：agent_unreachable ACK + 离线提示
- **Playwright**：断开 Agent WS → Visitor 发消息 → 检查 ACK

### G-12: 消息大小限制
- **场景**：发送 5000 字符
- **预期**：413 message_too_large
- **Playwright**：发 5000 字符 → 检查 413

### G-13: visitor_joined 事件
- **场景**：Visitor 进入 Chat
- **预期**：Agent 收到 visitor_joined
- **Playwright**：Agent WS 监听事件

### G-14: visitor_left 事件
- **场景**：Visitor 断开
- **预期**：Agent 收到 visitor_left
- **Playwright**：Visitor 断连 → Agent WS 检查事件

### G-15: conversation_created 事件
- **场景**：新对话创建
- **预期**：Agent 收到 conversation_created
- **Playwright**：触发新对话 → Agent WS 检查事件

---

## 模块 H：流式输出 & 渐进降级

> 测试文件：`tests/acceptance/h-streaming.spec.ts`

### H-01: 流式回复（reply_chunk）
- **场景**：Agent 发送多个 reply_chunk
- **预期**：Visitor 逐步收到 chunk
- **Playwright**：Agent 发 5 个 chunk → Visitor WS 检查依次收到

### H-02: 流式结束标记
- **场景**：Agent 发 is_final:true
- **预期**：Visitor 端收到终止信号
- **Playwright**：检查最后一个 chunk 的 is_final=true

### H-03: 波浪动画
- **场景**：Agent 回复前
- **预期**：显示 ● ● ● 波浪动画
- **Playwright**（browser）：检查动画 CSS 类名 / DOM 元素

### H-04: 完整回复兼容
- **场景**：Agent 发完整 reply（非流式）
- **预期**：消息一次性显示
- **Playwright**：Agent 发 reply → Visitor 检查收到完整消息

### H-05: StreamBuffer 超时保护（30s）
- **场景**：30s 无新 chunk
- **预期**：Visitor 收到超时事件
- **Playwright**：Agent 发 1 chunk 后停 → 等 30s → 检查超时

### H-06: Agent WS 断连保护
- **场景**：流式中 Agent WS 断连
- **预期**：已有 buffer 持久化 + Visitor 收到中断通知
- **Playwright**：Agent 发 2 chunk → 断连 → 检查 Visitor 收到 stream_interrupted

### H-07: 60s 超时失败标记
- **场景**：60s 无响应
- **预期**：消息标记失败
- **Playwright**（browser）：发消息 Agent 不回 → 等 60s → 检查失败 UI

### H-08: 消息持久化（流式完成后）
- **场景**：流式完成
- **预期**：数据库 messages 表 status='complete'
- **Playwright**：完成流式 → 查数据库 status

### H-09: WebSocket 降级→SSE
- **场景**：微信 UA 访问
- **预期**：自动降级 SSE
- **Playwright**：微信 UA → 检查连接方式

### H-10: SSE 降级→HTTP 轮询
- **场景**：SSE 不可用
- **预期**：降级 HTTP 轮询（2s）
- **Playwright**：审查降级逻辑代码

### H-11: processing_status 事件
- **场景**：Agent 发 processing_status
- **预期**：Visitor 收到状态变更
- **Playwright**：Agent 发各状态 → Visitor 端验证

---

## 模块 I：Dashboard（管理后台）

> 测试文件：`tests/acceptance/i-dashboard.spec.ts`

### I-01: 三栏式布局
- **场景**：登录 `http://localhost:3000/dashboard`
- **预期**：左（图标）+ 中（列表）+ 右（详情）三栏
- **Playwright**：登录 → 截图 → 检查三栏 DOM 结构

### I-02: 左侧栏图标
- **场景**：左侧导航
- **预期**：💬 Messages / 📱 My QRCode / 👤 Settings
- **Playwright**：检查导航项存在

### I-03: Messages — 有对话时
- **场景**：有对话历史
- **预期**：中间栏对话列表 + 右侧聊天界面
- **Playwright**：有数据时截图

### I-04: Messages — 空状态
- **场景**：新用户
- **预期**：客服 Agent 引导
- **Playwright**：新账号登录 → 检查空状态 UI

### I-05: My QRCode — 聚合统计
- **场景**：统计区
- **预期**：Agents / QR Codes / Scans / Chats 四个数字
- **Playwright**：检查 4 个统计卡片

### I-06: My QRCode — QR 列表
- **场景**：QR 列表
- **预期**：含 Agent 标签 + 名称 + 状态 + 扫码数
- **Playwright**：截图 + 检查列表项

### I-07: My QRCode — QR 详情
- **场景**：选中 QR
- **预期**：右侧显示 QR 图 + URL + Revoke/Edit
- **Playwright**：点击 QR → 截图详情面板

### I-08: 添加 QR Code 弹窗
- **场景**：点 "+"
- **预期**：模态窗含 Avatar/Name/Description/System Prompt/Cancel/Create
- **Playwright**：点 "+" → 截图弹窗 → 检查表单字段

### I-09: 左右分屏预览
- **场景**：编辑表单
- **预期**：左侧表单 + 右侧实时预览
- **Playwright**：输入 Name → 检查右侧预览更新

### I-10: System Prompt 提示文案
- **场景**：System Prompt 输入框
- **预期**：提示文案 "This prompt defines..."
- **Playwright**：检查提示文本存在

### I-11: Settings 页面
- **场景**：点 Settings
- **预期**：可用
- **Playwright**：截图

### I-12: Conversation 历史折叠
- **场景**：多次会话
- **预期**："N previous conversations" 折叠
- **Playwright**：有多次会话时检查折叠入口

### I-13: 响应式适配
- **场景**：窄屏
- **预期**：可折叠栏
- **Playwright**：1024px / 768px 视口截图

---

## 模块 J：跨设备同步 & Session 管理

> 测试文件：`tests/acceptance/j-cross-device.spec.ts`

### J-01: 匿名→登录静默合并
- **场景**：匿名 session 后登录
- **预期**：历史自动合并，无弹窗
- **Playwright**：创建匿名 session → 发消息 → 登录绑定 → 查询历史含之前的消息

### J-02: Silent Merge 幂等
- **场景**：重复绑定同 user_id
- **预期**：不报错
- **Playwright**：两次 merge 同 user → 第二次无报错

### J-03: Silent Merge 冲突
- **场景**：绑定不同 user_id
- **预期**：409
- **Playwright**：token 绑 A → 绑 B → 检查 409

### J-04: Session Token 30天过期
- **场景**：过期 token
- **预期**：WS 关闭 4002
- **Playwright**：检查过期逻辑代码

### J-05: Privacy Shield 组件
- **场景**：跨设备无缓存
- **预期**：显示 🔒 隐私提示
- **Playwright**：清 localStorage → 访问 Chat → 检查 Shield

### J-06: Privacy Shield 消失
- **场景**：发第一条消息
- **预期**：Shield 消失
- **Playwright**：发消息 → 检查 Shield 不可见

### J-07: Reset Session
- **场景**：点 Reset Session
- **预期**：清 localStorage
- **Playwright**：Reset → 检查 localStorage 被清

### J-08: 多设备同账号查询
- **场景**：不同 token 同 user_id
- **预期**：统一查询所有 conversations
- **Playwright**：检查查询逻辑代码

---

## 模块 K：Conversation 生命周期 & 三层破冰

> 测试文件：`tests/acceptance/k-conversation.spec.ts`

### K-01: 24h 超时自动新建
- **场景**：上次消息 >24h 后发新消息
- **预期**：新 conversation_id
- **Playwright**：API 层修改 last_active_at → 发消息 → 检查新 conv_id

### K-02: 24h 内复用
- **场景**：≤24h 发消息
- **预期**：同 conversation_id
- **Playwright**：连续发两条 → 检查同 conv_id

### K-03: Visitor 显式新开
- **场景**：点 "New conversation"
- **预期**：新 conversation_id
- **Playwright**（browser）：点 New → 检查新 conv_id

### K-04: 破冰第1层：suggested_questions
- **场景**：Profile 页
- **预期**：≤3 条可点击
- **Playwright**：检查数量 + 可点击

### K-05: 破冰第2层：Chat 提示
- **场景**：Chat 空状态
- **预期**：灰色提示文案
- **Playwright**：检查提示 DOM

### K-06: 破冰第3层：Agent 欢迎语
- **场景**：Visitor 进入 Chat
- **预期**：Agent 收到 visitor_joined 后可发 greeting
- **Playwright**：Agent 配合发 greeting → 检查 Chat 显示

### K-07: 对话列表排序
- **场景**：多次会话
- **预期**：默认显示最近
- **Playwright**：检查列表排序

---

## 模块 L：配额限制 & 离线/超额处理

> 测试文件：`tests/acceptance/l-quota.spec.ts`

### L-01~L-04: Free 套餐限制
- **L-01**：Free 最多 1 Agent → 创建第 2 个被拒
- **L-02**：Free 最多 5 QRCode → 第 6 个被拒
- **L-03**：Free 每月 1000 条 → 第 1001 条 quota_exceeded
- **L-04**：Free 消息保存 60 天 → 检查清理逻辑

### L-05: 超额提示
- **场景**：达配额后发消息
- **预期**：quota_exceeded(403) + 超额文案
- **Playwright**：触发超额 → 检查响应

### L-06: Agent 离线提示
- **场景**：Agent 不在线
- **预期**：显示 offline_message
- **Playwright**：Agent 断线 → Visitor 发消息 → 检查提示

### L-07: fallback_url 跳转
- **场景**：配置了 fallback_url
- **预期**：显示跳转链接
- **Playwright**：配置 fallback_url → 触发离线 → 检查链接

### L-08: Powered by QRClaw 水印
- **场景**：Free 用户页面
- **预期**："Powered by QRClaw" 可见
- **Playwright**：检查水印 DOM

---

## 模块 M：安全 & 加密

> 测试文件：`tests/acceptance/m-security.spec.ts`

### M-01: HTTPS/TLS（本地跳过）
- **场景**：本地 HTTP 环境
- **预期**：代码中配置了生产环境 HTTPS 强制
- **Playwright**：审查 Nginx 配置文件 + Next.js 安全 headers

### M-02: WSS（本地跳过）
- **场景**：本地 WS 环境
- **预期**：代码中配置了生产环境 WSS
- **Playwright**：审查 Gateway 代码中的 WSS 配置

### M-03: 消息字段级 AES-256 加密
- **场景**：查数据库
- **预期**：content_encrypted 为密文
- **Playwright**：Supabase 直查 messages → 确认非明文

### M-04: Per Conversation 密钥隔离
- **场景**：不同 conversation
- **预期**：各自独立密钥
- **Playwright**：查 encryption_keys 表

### M-05: 删除→密钥销毁
- **场景**：删除对话
- **预期**：密钥一并删除
- **Playwright**：删除 → 查 encryption_keys → 不存在

### M-06: API Key argon2 hash
- **场景**：查数据库
- **预期**：无明文 key
- **Playwright**：查 agents 表 api_key_hash

### M-07: RLS 行级安全
- **场景**：A 查 B 的数据
- **预期**：RLS 阻止
- **Playwright**：用 A 的 JWT 查 B 的 qrcodes → 空

### M-08: system_prompt 危险检查
- **场景**：含 "ignore all previous instructions"
- **预期**：拦截
- **Playwright**：创建含危险 prompt → 检查拒绝

### M-09: 输入校验（XSS/SQL 注入）
- **场景**：发送 `<script>alert(1)</script>` 和 `'; DROP TABLE --`
- **预期**：被安全处理
- **Playwright**：发送恶意输入 → 检查无执行

### M-10: avatar_url 安全
- **场景**：设 avatar_url 为内网 IP
- **预期**：拒绝
- **Playwright**：设 `http://10.0.0.1/x.png` → 检查拒绝

---

## 模块 N：基础设施（本地环境验证）

> 测试文件：`tests/acceptance/n-infrastructure.spec.ts`
> 注：本地环境不验证腾讯云/CDN/域名，仅验证本地服务

### N-01: Gateway 进程运行
- **场景**：检查 Gateway
- **预期**：`http://localhost:3001/health` 返回 ok
- **Playwright**：`GET /health` → status ok

### N-02: Redis 连通
- **场景**：Gateway → Redis
- **预期**：/health 中 redisConnected=true
- **Playwright**：检查 health 响应

### N-03: 前端可访问
- **场景**：Next.js dev server
- **预期**：`http://localhost:3000` 返回 200
- **Playwright**：`page.goto('/')` 成功

### N-04: Supabase 连通
- **场景**：数据库连接
- **预期**：CRUD 正常
- **Playwright**：通过 API 创建数据 → 查询成功

### N-05: Supabase Auth
- **场景**：Auth 服务
- **预期**：注册/登录正常
- **Playwright**：测试注册 API 调用

### N-06: Supabase Storage
- **场景**：文件上传
- **预期**：可上传可访问
- **Playwright**：上传测试图片 → 访问 URL

### N-07: CORS 配置（本地）
- **场景**：跨域请求
- **预期**：Gateway 配置了 CORS
- **Playwright**：审查 Gateway CORS 代码

### N-08: WS 代理/连接
- **场景**：WS 连接
- **预期**：`ws://localhost:3001/ws` 可连
- **Playwright**：WS 连接测试

### N-09~N-16:（线上部署相关，本地跳过）
- **说明**：以下为部署后验证项，本地测试阶段标记为 SKIP
- N-09 定时快照 → SKIP（腾讯云）
- N-10 云监控告警 → SKIP
- N-11 UptimeRobot → SKIP
- N-12 Nginx SSL → SKIP
- N-13 DNSPod → SKIP
- N-14 腾讯云 CDN → SKIP
- N-15 PM2 开机自启 → SKIP
- N-16 CVM 安全加固 → SKIP

---

## 模块 O：skill.md & SDK 交付

> 测试文件：`tests/acceptance/o-skill-sdk.spec.ts`

### O-01: skill.md 可访问
- **场景**：`GET http://localhost:3000/skill.md`
- **预期**：返回 Markdown，200
- **Playwright**：fetch → 检查内容含 YAML frontmatter

### O-02: skill.md YAML frontmatter
- **场景**：文件头
- **预期**：含 name + description
- **Playwright**：解析 YAML

### O-03: skill.md 4 Level
- **场景**：内容结构
- **预期**：Level 1→4 + Checkpoint
- **Playwright**：grep 检查

### O-04: skill.md Copy-Paste-Ready
- **场景**：API 示例
- **预期**：含 "← replace" 标注
- **Playwright**：grep 计数

### O-05: skill.md 错误自愈表
- **场景**：错误参考
- **预期**：8+ 错误码
- **Playwright**：检查表格行数

### O-06: skill.md <500 行
- **场景**：文件长度
- **预期**：<500 行
- **Playwright**：`wc -l`

### O-07: SDK npm 安装
- **场景**：npm install
- **预期**：安装成功
- **Playwright**：shell 执行

### O-08: SDK 基本功能
- **场景**：SDK 测试
- **预期**：注册 + 建连 + 心跳 + 消息收发
- **Playwright**：SDK 单元测试

### O-09: references/ 文档
- **场景**：参考文档
- **预期**：3 个文件存在且非空
- **Playwright**：文件检查

---

## 模块 P：E2E 关键用户旅程

> 测试文件：`tests/acceptance/p-e2e-journeys.spec.ts`

### P-01: Agent 注册→Claim→WS 建连
- **全链路**：POST /register → api_key → Claim → WS 连接 → heartbeat_ack
- **Playwright**：API + WS 全流程脚本

### P-02: 移动端扫码全链路
- **全链路**：访问 /q/{slug} → Profile → Start Chat → 发消息 → Agent 回复
- **Playwright**（mobile）：全流程 + 性能计时

### P-03: 桌面端注册→对话
- **全链路**：/q/{slug} → 注册 → 登录 → Chat → 对话
- **Playwright**（desktop）：全流程

### P-04: 跨设备历史同步
- **全链路**：匿名 session → 发消息 → 登录绑定 → 查到历史
- **Playwright**：API 模拟全流程

### P-05: Dashboard 全流程
- **全链路**：登录 → 创建 QRCode → 配置 → 发布 → Visitor 使用
- **Playwright**：browser 全流程

---

## 执行和修复流程

### Step 1: 初始化测试环境
```bash
# 确保 Playwright 已安装
npx playwright install
# 确保前端运行在 localhost:3000
# 确保 Gateway 运行在 localhost:3001
```

### Step 2: 按模块执行
```bash
npx playwright test tests/acceptance/a-landing-page.spec.ts
npx playwright test tests/acceptance/b-auth.spec.ts
# ... 按 a→p 顺序执行
```

### Step 3: 修复规则
1. **测试不通过 → 定位源码 → 修复 → 重跑该测试确认通过**
2. **修复不能破坏已通过的用例**：修复后跑 `npx playwright test tests/acceptance/` 全量回归
3. **无法修复的记录原因**

### Step 4: 生成报告
```bash
npx playwright test tests/acceptance/ --reporter=html
# 报告输出到 playwright-report/index.html
```

---

## ISSUES 区域

> 测试中发现的问题由 Claude CLI 自动填写

```
格式：
### [模块-用例ID]: [问题标题]
- **现象**: [实际行为]
- **预期**: [预期行为]
- **根因**: [分析]
- **修复文件**: [路径]
- **状态**: ✅ FIXED / ⚠️ BLOCKED
```

（待执行时填写）

---

## 最终验收报告

> 全部执行完成后生成到 `requirements/acceptance-report.md`

（待执行后生成）
