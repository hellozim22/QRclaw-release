# QRClaw 产品需求文档 V3.0

> **版本**: V3.0
> **日期**: 2026-03-11
> **状态**: 开发基线版
> **配套文档**: 《QRClaw 技术方案文档 V3.0》(`technical-specification.md`)
> **交互设计稿**: `design/qrclaw-interaction-design.md` (v2.2) + `design/pencil-new.pen`
> **目标读者**: Agent Teams（Gateway / Frontend / Backend / SDK / QA）

---

## 📚 目录

### [一、产品概述](#一产品概述)
- 1.1 一句话定义
- 1.2 核心价值
- 1.3 四条铁律（v1.3）
- 1.4 产品范围边界（V2 做什么 / 不做什么）

### [二、用户角色与场景](#二用户角色与场景)
- 2.1 Agent Owner（智能体主人）
- 2.2 Visitor（访客）
- 2.3 Agent（智能体）
- 2.4 统一 Dashboard 角色（Owner + Visitor 双重身份）
- 2.5 核心用户旅程

### [三、核心概念与数据模型](#三核心概念与数据模型)
- 3.1 实体关系
- 3.2 关键实体定义
- 3.3 同一 Agent 的多个 QRCode
- 3.4 QRCode 生命周期（Active / Paused / Revoked / Draft）
- 3.5 Conversation 生命周期

### [四、接入方式](#四接入方式)
- 4.1 核心接入范式：Skill.md
- 4.2 延迟认证（Deferred Auth / Claim）
- 4.3 渐进式接入 Level
- 4.4 QRCode 创建双路径

### [五、Visitor 设备分流策略](#五visitor-设备分流策略)
- 5.1 设备检测方案
- 5.2 移动端流程（匿名即聊）
- 5.3 桌面端流程（需注册）
- 5.4 跨设备同步

### [六、Mobile 移动端页面设计（21 screens）](#六mobile-移动端页面设计21-screens)
- 6.1 M1: 扫码入口 Scan Entry
- 6.2 M2: 聊天核心 Chat Core
- 6.3 M3: 聊天交互细节
- 6.4 M4: 注册/登录 Auth
- 6.5 M5: 注册后主页
- 6.6 M6: QR Code 管理
- 6.7 M7: 扫码引导

### [七、Web 网页端页面设计（18 screens）](#七web-网页端页面设计18-screens)
- 7.1 W1: Landing Page
- 7.2 W2: 注册流程
- 7.3 W3: Claim Agent 绑定
- 7.4 W4: Dashboard 正常使用
- 7.5 W5: 创建 QR Code（4步向导）
- 7.6 W6: 编辑/设置/定价
- 7.7 W7: 文档/QR 样式

### [八、交互规范与设计系统](#八交互规范与设计系统)
- 8.1 颜色系统
- 8.2 字体规范
- 8.3 间距与圆角
- 8.4 可复用组件
- 8.5 消息传输交互规则
- 8.6 消息状态机
- 8.7 QRCode 状态管理
- 8.8 Agent Claim 绑定规则
- 8.9 三层破冰方案

### [九、套餐与定价](#九套餐与定价)
- 9.1 定价总览
- 9.2 功能矩阵
- 9.3 成本推导
- 9.4 竞品对标
- 9.5 定价逻辑
- 9.6 年付优惠
- 9.7 收入预测
- 9.8 Agent 皮肤
- 9.9 付费系统 Stripe（V3）

### [十、多语言国际化（i18n）](#十多语言国际化i18n)
- 10.1 多语言策略
- 10.2 覆盖范围
- 10.3 URL 路由策略
- 10.4 语言检测与切换
- 10.5 Visitor Chat 语言规则
- 10.6 SEO 多语言

### [十一、数据埋点与运营分析](#十一数据埋点与运营分析)
- 11.1 前端埋点体系
- 11.2 后端数据采集
- 11.3 运营分析框架（INTERNAL）

### [十二、Skill.md 接入文档规范](#十二skillmd-接入文档规范)

### [十三、开发任务计划](#十三开发任务计划)
- 13.1 Agent Team 分工
- 13.2 Sprint 计划
- 13.3 测试策略
- 13.4 E2E 关键用户旅程

### [十四、V2 交付清单](#十四v2-交付清单)

### [十五、里程碑与成功指标](#十五里程碑与成功指标)

### [十六、关键风险与缓解](#十六关键风险与缓解)

### [附录](#附录)

---

## 一、产品概述

### 1.1 一句话定义

QRClaw 是为 AI Agent 打造的**连接物理世界、服务真实用户的对话平台**。Agent Owner 通过 Skill.md 接入，创建二维码；终端用户扫码即对话，零注册、零安装，跨设备同步历史。

### 1.2 核心价值

- ✅ **消息路由**：Visitor ↔ Agent 双向实时通信，每个 QRCode 携带独立上下文
- ✅ **跨设备同步**：手机/电脑/平板无缝切换，历史完整保留
- ✅ **零门槛接入**：扫码即用，无需下载 App
- ✅ **隐私保护**：消息加密存储，用户可随时删除
- ✅ **Agent 自主接入**：`curl -s https://qrclaw.ai/skill.md` 一条命令完成接入

### 1.3 四条铁律（不可违反的产品约束，v1.3 生效于 2026-04-20）

| 铁律 | 定义 | 体现 |
|------|------|------|
| **C1 中立中继** | QRClaw 不执行 AI 推理、不解读消息语义 | Gateway 只接收、加密、持久化、转发；不调用 LLM；不对 content 做基于内容的路由或改写 |
| **C2 加密存储** | 平台持久化的消息必须是密文；明文只存在于两处：(a) 端侧客户端；(b) 已授权的 Edge Function `decrypted-messages` 内存态——不落盘、不写日志、函数结束即释放 | AES-256-GCM + KEK 包装的 DEK；Gateway **写路径**持 KEK 加密新消息，**读路径**不再解密（M3 起）；Supabase Edge Function 是唯一被授权的服务端解密点 |
| **C4 移动端扫码零注册** | 移动端 Visitor 无需注册，扫码即用；桌面端需注册 | 移动端 Session Token 标识；桌面端要求 auth.users 记录 |
| **C5 消息可回放** | 任一身份（visitor / owner / agent-plugin）断线、换机、重启后能拿回历史消息 | Visitor `POST /api/messages`（M3 走 `decrypted-messages` Edge Function）；Owner `functions/v1/decrypted-messages`（M3 从 `get-decrypted-messages` 合并）；Agent-Plugin `POST /api/agent/history` → Edge Function（M3 落地） |

> **演进说明**：v1.2 之前是"三条铁律"。C1 由"纯转发"改为"中立中继"（不再暗示"不持久化"）；C2 措辞在 v1.3 再次收紧：显式穷举明文允许存在的 2 个边界（客户端 + Edge Function 内存态），堵住 M3 Edge Function 解密造成的语义歧义；C5 新增以覆盖 agent-plugin 历史回放。决策记录见 `docs/refactor/execution-log.md` §D-REV-01 / §D-REV-02。

### 1.4 产品范围边界

#### V2 做什么（Must Have）

| 类别 | 内容 |
|------|------|
| **Agent 接入** | Skill.md 自主接入、Claim 绑定、WebSocket 实时连接 |
| **QRCode 管理** | 双路径创建（Agent 对话式 + Dashboard 向导）、4 种状态、3 种视觉样式 |
| **对话系统** | 实时消息路由、流式输出、加密存储、跨设备同步 |
| **用户系统** | 邮箱注册（6 位验证码）、Claim 一体化注册、匿名 Session |
| **Mobile H5** | 21 screens 完整体验（扫码→Profile→Chat→Messages→QR 管理） |
| **Web Dashboard** | 18 screens（Landing→注册→Claim→Dashboard→创建 QR→设置） |
| **定价** | Free / Pro / Max 三档，V2 仅实现 Free 限额检查 |
| **i18n** | English（默认）+ 简体中文 |
| **数据埋点** | 前端全量埋点 + 后端指标 + 内部运营分析 |
| **安全** | Security Envelope、信封加密、OWASP Top 10 防护 |

#### V2 不做什么（Won't Have）

| 类别 | 延后到 |
|------|--------|
| Stripe 付费实现 | V3 |
| 多语言（ja/ko/更多） | V3 |
| 原生 App（iOS/Android） | V4+ |
| AI 推理托管 | 永不 |
| 消息内容分析/推荐 | 永不 |

---

## 二、用户角色与场景

### 2.1 Agent Owner（智能体主人）

- 拥有运行中的 AI Agent（如 OpenClaw 实例）
- 通过 Skill.md 引导 Agent 自主注册，获得 Claim URL
- 打开 Claim URL 完成注册/登录 + Agent 绑定
- 在 Web Dashboard 管理 Agent、创建/编辑 QR Code
- 在 Mobile 端可查看消息和管理 QR Code
- 一个 Owner 可绑定多个 Agent，每个 Agent 可创建多个 QRCode

### 2.2 Visitor（访客）

- **移动端**（手机/平板）：扫码即对话，**无需注册**（铁律 C4）
- **桌面端**（电脑浏览器）：必须**注册/登录后**才能对话
- 移动端使用 Gateway 分配的 Session Token 标识
- 桌面端使用 Supabase Auth 账号标识

### 2.3 Agent（智能体）

- 第三方 AI Agent，通过 Skill.md 引导自主完成注册
- 通过 WebSocket 与 QRClaw Gateway 保持长连接
- 接收 `visitor_message`，回复 `reply` 或 `reply_chunk`（流式）
- 遵守 Security Envelope 安全策略

### 2.4 统一 Dashboard 角色

同一注册用户可**同时**扮演两种角色：
- **作为 Visitor**：跟别人的 Agent 聊天（Messages 中可见）
- **作为 Owner**：管理自己的 QRCode（My QRcode 中可见）

### 2.5 核心用户旅程

#### Journey 1: Agent Owner 首次接入（核心路径）

```
Owner 向 Agent 发送: "请接入 QRClaw"
  → Agent 执行 curl -s https://qrclaw.ai/skill.md
  → Agent 读取 Skill.md → 自主调用 POST /register
  → 返回 { agent_id, api_key, claim_url }
  → Agent 将 claim_url 展示给 Owner
  → Owner 点击 claim_url
    → [未登录] 显示注册+Claim 一体化页面 → 填写邮箱 → 6位验证码 → 完成注册+绑定
    → [已登录] 显示确认绑定页面 → Confirm & Bind
  → Agent 绑定成功 → Owner 跳转 Dashboard
  → Owner 在 Dashboard 创建 QRCode（4步向导）
  → QRCode 发布 → 下载二维码 → 贴到物理世界
```

#### Journey 2: Visitor 扫码对话

```
Visitor 用手机扫描 QRCode
  → 打开 Agent Profile 页面（H5）
  → 点击 "💬 Message" 按钮
  → 进入 Chat 页面（匿名，无需注册）
  → 发送消息 → Gateway 路由到 Agent → Agent 流式回复
  → 对话完成
  → [可选] 点击注册 → 保存对话历史 → 跨设备同步
```

#### Journey 3: Owner 通过 Agent 创建 QRCode

```
Owner 与已绑定的 Agent 沟通: "帮我创建一个客服二维码"
  → Agent 调用 POST /api/v1/qrcodes 创建草稿（status: draft）
  → Agent 返回确认发布链接给 Owner
  → Owner 在 qrclaw.ai 官网确认发布
  → QRCode 状态: draft → active
  → Visitor 可以扫码对话
```

---

## 三、核心概念与数据模型

### 3.1 实体关系

```
Owner (1) ──→ Agent (N) ──→ QRCode (N)
                 │            ├── Profile（头像/名称/描述）
                 │            ├── system_prompt（角色提示词）
                 │            ├── Template（模板类型）
                 │            ├── Visual Style（Standard / Dark / Minimal）
                 │            ├── Visitor Identity（label + context_hint）
                 │            ├── Security Envelope Config
                 │            ├── Offline Config（离线文案 + fallback_url）
                 │            └── Status（active / paused / revoked / draft）
                 │
                 └── WebSocket Connection（1 条长连接，服务该 Agent 所有 QRCode）
```

### 3.2 关键实体定义

| 实体 | 说明 |
|------|------|
| **Owner** | 智能体主人，Supabase Auth 管理，独立 owners 表存业务属性 |
| **Agent** | AI Agent 实例，通过 WebSocket 连接 QRClaw，状态：pending/active/suspended |
| **QRCode** | Agent 的一个对话入口，包含 Profile、system_prompt、模板、样式等完整配置 |
| **Conversation** | 对话会话（仅元数据），24h 超时自动新建 |
| **Session** | Visitor 的 Session Token，支持匿名→登录静默合并 |

### 3.3 同一 Agent 的多个 QRCode

```
餐厅老板的 Agent（1 个 WS 连接）
├── QRCode A: 堂食客户入口
│   ├── Profile: 🍜 "点餐助手", "帮您推荐和下单"
│   ├── Template: Customer Service
│   ├── Style: Standard（白色）
│   ├── system_prompt: "你是点餐助手..."
│   └── visitor_identity: "堂食顾客"
│
├── QRCode B: 外卖客户入口
│   ├── Profile: 🚚 "外卖客服", "下单/查询配送"
│   ├── Template: Customer Service
│   ├── Style: Dark（黑色）
│   ├── system_prompt: "你是外卖客服..."
│   └── visitor_identity: "外卖用户"
│
└── QRCode C: VIP 客户入口
    ├── Profile: 👑 "VIP 专属", "尊享服务"
    ├── Template: Custom
    ├── Style: Minimal（简约）
    ├── system_prompt: "你是 VIP 专属助手..."
    └── visitor_identity: "VIP会员"
```

### 3.4 QRCode 生命周期

```
QRCode 状态（4 态）：
  draft     — 已创建但未发布（Agent 通过 API 创建 / Dashboard 创建中）
  active    — 已发布，Visitor 可扫码对话
  paused    — Owner 手动暂停，Visitor 扫码看到暂停提示
  revoked   — Owner 撤销，不可恢复

状态转换：
  draft → active       （Owner 在官网确认发布）
  active ↔ paused     （双向，Owner 可随时切换）
  active → revoked    （单向，不可恢复）
  paused → revoked    （单向，不可恢复）
  draft → revoked     （单向，取消创建）

Dashboard UI 标签：
  📝 Draft  |  🟢 Active  |  ⏸️ Paused  |  🔴 Revoked

超时规则：
  draft 状态 24h 未发布 → 自动 revoked
```

### 3.5 Conversation 生命周期

```
标识：conversation_id = Gateway 生成的唯一 ID
归属：(qrcode_id, session_token) 确定一个"对话槽位"

新开会话触发条件（满足任一）：
  1) 超时新开：距上次任一方消息 > 24h（V1 硬编码）
  2) Visitor 显式新开：点击 "New conversation" 按钮

列表展示：
  每个 QRCode 默认显示最近一次会话
  同一 QRCode 有多次会话时，显示折叠入口 "N previous conversations"
```

---

## 四、接入方式

### 4.1 核心接入范式：Skill.md（Agent 自主接入）

```
┌─────────────────────────────────────────────────────────┐
│  Agent 只需要执行一条命令：                                │
│                                                         │
│  curl -s https://qrclaw.ai/skill.md                     │
│                                                         │
│  → Agent 读取文档 → 自主完成注册、建连、创建 QRCode        │
│  → Owner 收到 Claim URL → 确认绑定 → 上线                │
│  → 全程 < 60 秒                                         │
└─────────────────────────────────────────────────────────┘
```

> Skill.md 完整内容（411 行）见 §十二，独立文件路径：`skill/SKILL.md`

### 4.2 延迟认证（Deferred Auth / Claim）

Agent 注册后获得 `claim_url`。**大部分用户在 Claim 页面完成首次注册**（这是最重要的入口）。

```
Agent 执行:
  POST /api/v1/register → { agent_id, api_key, claim_url }

Owner 操作:
  打开 claim_url →
    [未登录] 注册+Claim 一体化表单（W3 Claim 未登录页面）
    [已登录] 确认绑定页面（W3 Claim 已登录页面）

时限:
  24h 未认领 → agent 自动回收
```

### 4.3 渐进式接入 Level（skill.md 分级）

| Level | 能力 | 必需 | Agent 自主可完成？ |
|-------|------|------|------------------|
| 1 | 注册 + Claim + WS 连接 | ✅ | ✅ 全自主 |
| 2 | 创建 QRCode | ✅ | ✅ 创建草稿自主，**发布需 Owner 在官网确认** |
| 3 | 消息收发 + 安全信封解析 | ✅ | ✅ 全自主 |
| 4 | QRCode 管理 + 统计查询 | 可选 | ✅ 全自主 |

### 4.4 QRCode 创建双路径

#### 路径 A：Agent 对话式创建（推荐）

用户与已绑定的 Agent 对话，Agent 通过 API 创建 QRCode 草稿：

```
用户: "帮我创建一个客服二维码"
  → Agent: POST /api/v1/qrcodes { profile, system_prompt, ... }
  → API 返回: { qrcode_id, status: "draft", publish_url: "https://qrclaw.ai/publish/xxx" }
  → Agent 展示给用户: "二维码已创建为草稿，请点击以下链接确认发布: [publish_url]"
  → 用户在 qrclaw.ai 官网确认发布
  → status: draft → active
  → Visitor 可扫码对话
```

**核心原则：发布上线必须在官网确认。** Agent 只能创建草稿，不能自动发布。

#### 路径 B：Dashboard 4 步向导（W5 设计稿）

Owner 在 Web Dashboard 手动创建：

```
Step 0: Select Agent — 选择已绑定的 Agent
Step 1: Template — 选择模板（Customer Service / Data Analyst / Email Assistant / Custom）
Step 2: Configure — 填写配置 + 右侧实时手机预览
Step 3: Success — QR 码预览 + 3 种样式选择 + 下载
```

Dashboard 创建的 QRCode 直接为 `active` 状态（Owner 本人操作，无需二次确认）。

---

## 五、Visitor 设备分流策略

### 5.1 设备检测方案（UA + 屏幕宽度组合）

```typescript
function detectDevice(): 'mobile' | 'desktop' {
  const isMobileUA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile/i.test(navigator.userAgent);
  const isNarrowScreen = window.innerWidth < 768;
  return (isMobileUA || isNarrowScreen) ? 'mobile' : 'desktop';
}
```

### 5.2 移动端流程（匿名即聊，铁律 C4）

```
扫码 → Profile 页 → 点击 Message → 自动获取 Session Token → Chat
     （全程无注册，匿名体验）
     → [可选] 注册后 Session 自动合并到账号
```

### 5.3 桌面端流程（需注册）

```
打开链接 → Profile 页 → 点击 Message → 跳转登录/注册 → Chat
     （必须有账号才能对话）
```

### 5.4 跨设备同步

用户在移动端匿名聊天后注册，桌面端登录同一账号可看到历史对话。Session Token 自动合并到 User ID。

## 六、Mobile 移动端页面设计（21 screens）

> **平台**: H5 移动网页（PWA 兼容）
> **设计尺寸**: 390 × 844
> **目标用户**: Visitor（扫码访客）+ Owner（轻量管理）
> **设计稿**: `design/pencil-new.pen` + 截图 `design/mobile-*.png`

---

### 6.1 M1: 扫码入口 Scan Entry（3 screens）

**场景**: Visitor 扫描二维码后的首屏体验，是产品的**第一印象**。

📐 **交互视觉稿**: `mobile-profile.png` / `mobile-error-404.png`

#### 6.1.1 Agent Profile（设计稿 ID: e1DDM）

| 元素 | 说明 |
|------|------|
| 头部 | 红色渐变背景 |
| Agent 头像 | 160×160 圆角方形（圆角 16px） |
| Agent 名称 | 粗体标题 |
| 对话数统计 | "X conversations" |
| 描述文字 | Agent description 正文 |
| 主按钮 | 红色（`#E24A3F`）「💬 Message」— 发起对话 |
| 注册引导 | "Sign in to save your conversations" 文字链接 |
| 品牌标识 | 页面底部固定「Powered by QRClaw」 |

**交互规则**:
- 扫码后 0.5s 内加载，超时显示骨架屏
- 未登录用户也可点击 Message 进入聊天（移动端匿名即聊）

#### 6.1.2 Profile Paused（设计稿 ID: sJcOR）

| 元素 | 说明 |
|------|------|
| Agent 头像 | 半透明（opacity: 0.5）表示不可用 |
| 暂停横幅 | 橙色横幅「Service Temporarily Paused」 |
| Message 按钮 | 灰色（`#D1D5DB`）不可点击 |
| 品牌标识 | 保留 |

**触发条件**: Owner 在 Dashboard 点击 Pause → Visitor 端实时生效

#### 6.1.3 404 Page（设计稿 ID: k0nbt）

| 元素 | 说明 |
|------|------|
| Logo | QRClaw 红色圆角方块 |
| 标题 | 「Page Not Found」 |
| 说明文字 | 引导返回首页 |
| 按钮 | 灰色描边「Go Home」 |

**触发条件**: QR Code 已删除 / URL 无效

---

### 6.2 M2: 聊天核心 Chat Core（4 screens）

**场景**: Visitor 点击 Message 按钮后进入的实时对话界面。

📐 **交互视觉稿**: `mobile-chat.png` / `mobile-agent-no-reply.png`

#### 6.2.1 Chat（设计稿 ID: IgH0g）

| 元素 | 说明 |
|------|------|
| 顶部导航栏 | Agent 名称 + 返回按钮 |
| Agent 消息气泡 | 灰色背景，左对齐 |
| 用户消息气泡 | 红色（`#E24A3F`）背景，右对齐 |
| 输入栏 | 底部固定，文本框 + 发送按钮 |
| 注册横幅 | 未登录用户顶部展示 |

#### 6.2.2 Chat Streaming（设计稿 ID: K6mbw）

| 元素 | 说明 |
|------|------|
| 打字指示器 | 「● typing...」红色文字 |
| 流式输出 | 文本逐字显示，末尾闪烁红色光标 `|` |
| 完成后 | 光标消失，显示时间戳 |

**技术协议**: `reply_chunk` with `is_final` flag（详见《技术方案文档》§七）

#### 6.2.3 Agent No Reply（设计稿 ID: 9KYND）

| 元素 | 说明 |
|------|------|
| 提示文字 | 用户消息发送后 30s 未收到响应 |
| 显示 | 气泡下方灰色「Agent is not responding」 |

#### 6.2.4 Agent Offline（设计稿 ID: J6l3h）

| 元素 | 说明 |
|------|------|
| 警告卡片 | 聊天区顶部粉色卡片「Agent disconnected」 |
| 发送失败 | 消息显示「Failed to send」+ 红色「Retry」链接 |
| 超时 | 60s → ⚠️「Send failed, tap to retry」 |

---

### 6.3 M3: 聊天交互细节 Chat Interactions（2 screens）

📐 **交互视觉稿**: `mobile-long-press-copy.png`

#### 6.3.1 Long Press Copy（设计稿 ID: nNVxR）

| 操作 | 说明 |
|------|------|
| 触发 | 长按任意消息气泡 0.5s |
| 弹出 | 黑色圆角 tooltip「Copy」 |
| 反馈 | 点击后复制文本到剪贴板，toast 提示「Copied」 |

#### 6.3.2 Scan QR Code（设计稿 ID: RXEpt）

| 元素 | 说明 |
|------|------|
| 取景框 | 黑色全屏摄像头，四角红色边框 |
| 功能按钮 | 「Album」从相册选取 / 「Flash」开关闪光灯 |
| 导航 | 顶部返回按钮 |

---

### 6.4 M4: 注册/登录 Auth（3 screens）

**场景**: 用户从匿名 Visitor 转为注册用户。

📐 **交互视觉稿**: `mobile-profile-signin.png`

#### 6.4.1 Login（设计稿 ID: 9nzBk）

| 元素 | 说明 |
|------|------|
| Logo | QRClaw Logo 居中 |
| 表单 | Email + Password 输入框 |
| 主按钮 | 红色「Sign In」 |
| 跳转 | "Don't have an account? Sign Up" |

#### 6.4.2 Sign Up（设计稿 ID: rgesk）

| 元素 | 说明 |
|------|------|
| 表单 | Email / Password / Confirm Password |
| 主按钮 | 红色「Sign Up」 |
| 跳转 | "Already have an account? Sign In" |

#### 6.4.3 Email Verify — 6 位验证码（设计稿 ID: 1QsK7）

| 元素 | 说明 |
|------|------|
| 图标 | 邮件图标 + 「Check your email」标题 |
| 副标题 | 显示发送的邮箱地址 |
| 验证码输入 | **6 个独立输入框**，当前框红色边框高亮 |
| 主按钮 | 红色「Verify」 |
| 重发 | "Didn't receive? Resend" 链接 |

**交互规则**:
- 每输入一位自动跳转下一个输入框
- 验证码有效期 **10 分钟**
- **3 次错误后锁定 60 秒**

---

### 6.5 M5: 注册后主页 Home After Auth（3 screens）

**场景**: 用户登录后的主页面。底部 Tab Bar: **Messages / Scan / Me**

📐 **交互视觉稿**: `mobile-messages.png` / `mobile-empty-messages.png` / `mobile-me-owner.png`

#### 6.5.1 Messages — 新用户（设计稿 ID: j8P8r）

| 元素 | 说明 |
|------|------|
| 标题 | 「Messages(1)」 |
| 欢迎消息 | QRClaw Support 发送的引导消息 |
| 内容 | 终端代码块引导用户绑定 Agent |
| Tab Bar | Messages（选中）/ Scan / Me |

#### 6.5.2 Messages — 正常态（设计稿 ID: Qxtxk）

| 元素 | 说明 |
|------|------|
| 标题 | 「Messages(3)」 |
| 消息列表 | 每行: Agent 头像 + 名称 + 最后消息预览 + 时间戳 |
| Tab Bar | Messages（选中）/ Scan / Me |

#### 6.5.3 Me（设计稿 ID: 5poPN）

| 元素 | 说明 |
|------|------|
| 用户信息 | 头像 + 名称 + 邮箱 |
| 菜单列表 | Share / My QR Codes / Help Center / Sign Out |
| Tab Bar | Messages / Scan / Me（选中） |

---

### 6.6 M6: QR Code 管理 QR Management（5 screens）

**场景**: Owner 在移动端管理自己创建的 QR Code。

📐 **交互视觉稿**: `mobile-my-portals.png` / `mobile-portal-detail.png` / `mobile-qr-card.png` / `mobile-messages-swipe.png` / `mobile-revoked-portal.png`

#### 6.6.1 My QR Codes（设计稿 ID: X2xHg）

| 元素 | 说明 |
|------|------|
| 列表 | 每条: 名称 + 创建时间 + 状态标签 |
| 状态标签 | 🟢 Active（绿色）/ 🔴 Revoked（红色）/ 📝 Draft（灰色）/ ⏸️ Paused（橙色） |

#### 6.6.2 QR Code Detail（设计稿 ID: eZDQG）

| 元素 | 说明 |
|------|------|
| QR 卡片 | 红色主题，含 Agent 头像 + 二维码 + 名称 |
| 统计数据 | Scans / Conversations / Created |
| 主按钮 | 「Download」下载二维码 |
| 次要按钮 | 「Deactivate」暂停 QR Code |

#### 6.6.3 Swipe Delete（设计稿 ID: sPwFf）

| 操作 | 说明 |
|------|------|
| 触发 | 消息列表中左滑某条 |
| 效果 | 右侧滑出红色「Delete」按钮 |
| 确认 | 点击后二次确认弹窗 |

#### 6.6.4 My QR Codes Empty（设计稿 ID: 7X6Kn）

| 元素 | 说明 |
|------|------|
| 图标 | 灰色空状态图标 |
| 标题 | 「No QR Codes Yet」 |
| 引导 | 链接到 qrclaw.ai 创建 |

---

### 6.7 M7: 扫码引导 Scan Guide（1 screen）

#### 6.7.1 Scan QR Agent Guide（设计稿 ID: DFoBo）

| 元素 | 说明 |
|------|------|
| 对话页面 | QRClaw Support 对话 |
| 引导内容 | 终端代码块展示 curl 命令，5 步引导 Agent 绑定 |
| 注册横幅 | 底部引导用户注册 |

---

## 七、Web 网页端页面设计（18 screens）

> **平台**: Web 浏览器（Chrome / Safari / Firefox / Edge）
> **设计尺寸**: 1440 × 900
> **目标用户**: Owner（完整管理后台）
> **设计稿**: `design/pencil-new.pen` + 截图 `design/web-*.png`

---

### 7.1 W1: Landing Page 着陆页（2 screens）

📐 **交互视觉稿**: `web-landing.png`

#### 7.1.1 Landing Page（设计稿 ID: tD9CD）

| 区域 | 说明 |
|------|------|
| **顶部导航** | Logo / Features / Pricing / Docs / Sign In |
| **Hero 区域** | 左: 标题「Give Your AI Agent a Face」+ 描述 + CTA 按钮；右: QR 卡片 + 手机预览动态展示 |
| **Connect 区域** | 3 步流程: Connect → Customize → Share |
| **用例展示** | 两个真实场景图片 |
| **Subscribe** | 邮箱订阅输入框 |
| **Footer** | 链接 + 版权信息 |

**CTA 按钮**: 主按钮链接到注册 / Docs 页面
**Hero 动态效果**: 右侧手机预览展示扫码后对话效果

#### 7.1.2 Docs Page（设计稿 ID: aiwB4）

| 区域 | 说明 |
|------|------|
| 左栏 | 导航树（Getting Started / API Reference / Guides） |
| 中栏 | Markdown 渲染内容 + 代码块（语法高亮） |
| 右栏 | 当前页目录（Table of Contents） |

---

### 7.2 W2: 注册流程 Registration（4 screens）

📐 **交互视觉稿**: `web-signup.png`

#### 7.2.1 Sign Up — 双栏布局（设计稿 ID: S3TMu）

| 区域 | 说明 |
|------|------|
| 左栏 | 红色渐变品牌区: 手机 + QR 卡片视觉 |
| 右栏 | 注册表单: Full Name / Email / Password / Confirm Password |
| 主按钮 | 红色「Create Account」 |
| 跳转 | "Already have an account? Sign In" |

#### 7.2.2 Email Verify — 6 位验证码（设计稿 ID: JMDpZ）

| 区域 | 说明 |
|------|------|
| 背景 | 渐变（白 → 浅粉 → 浅蓝） |
| 卡片 | 白色居中卡片 |
| 验证码 | 6 位输入框，第 3 位红色边框表示当前位 |
| 主按钮 | 「Verify Email」 |
| 重发 | "Didn't receive? Resend" |

#### 7.2.3 Dashboard Support Welcome（设计稿 ID: 18eSq）

| 区域 | 说明 |
|------|------|
| 布局 | 三栏: 左导航 + 中消息列表 + 右对话详情 |
| 欢迎内容 | QRClaw Support 对话: curl 命令引导 + 3 步绑定说明 |
| 引导目标 | 引导用户将 skill.md 发送给 Agent |

#### 7.2.4 Dashboard QR Empty — Onboarding（设计稿 ID: s4lvD）

| 区域 | 说明 |
|------|------|
| 空状态 | 「No Agents Connected Yet」 |
| 引导内容 | 终端代码块 + 3 步流程（Install Skill → Agent Registers → Confirm Binding） |

---

### 7.3 W3: Claim Agent 绑定（2 screens）— ⭐ 关键入口

> **这是大部分用户的首次注册入口**。用户在 Agent 返回的 claim_url 页面完成注册+绑定。

📐 **交互视觉稿**: （设计稿内含）

#### 7.3.1 Claim 未登录（设计稿 ID: c2cAy）

| 区域 | 说明 |
|------|------|
| 背景 | 渐变背景 |
| 卡片 | 白色居中卡片 |
| 头部 | Agent 头像 + 「Sign up to claim your Agent」 |
| Agent ID | 黄色高亮显示 |
| 倒计时 | 「Claim expires in 24h」 |
| 表单 | Email / Password |
| 主按钮 | 红色「Sign Up & Claim Agent」 |
| 跳转 | "Already have an account? Log in" |

**核心流程**: 注册 + Claim 一体化 — 用户一个表单完成两件事

#### 7.3.2 Claim 已登录（设计稿 ID: r2OZD）

| 区域 | 说明 |
|------|------|
| 卡片 | 渐变背景居中白色卡片 |
| 内容 | 「Claim Your Agent」+ Agent 名称 + Agent ID |
| 倒计时 | 黄色「Claim expires in 24h」 |
| 按钮组 | 灰色「Decline」+ 红色「Confirm & Bind」 |
| 底部 | 显示当前登录邮箱 |

**绑定成功后**: 自动跳转 Dashboard，Agent 出现在侧边栏

---

### 7.4 W4: Dashboard 正常使用（3 screens）

📐 **交互视觉稿**: `web-dashboard-messages.png`

#### 7.4.1 Dashboard Messages（设计稿 ID: FCW4Y）

| 区域 | 说明 |
|------|------|
| 左栏 | 固定导航栏: Logo + Messages / My QRCode / Settings |
| 中栏 | 消息列表: Visitor 头像 + 名称 + 最后消息 + 时间 |
| 右栏 | 对话详情: 聊天气泡 + 输入框 |

**实时更新**: WebSocket 推送新消息，未读消息红色数字角标

#### 7.4.2 Dashboard Streaming（设计稿 ID: mcCu7）

| 区域 | 说明 |
|------|------|
| 对话详情 | Agent 流式回复: Markdown 渲染（标题、列表、代码块、链接） |
| 实时追加 | 文本内容实时追加显示 |

#### 7.4.3 Dashboard Support（设计稿 ID: 18eSq）

| 用途 | QRClaw Support 内置对话，包含帮助信息和绑定引导 |

---

### 7.5 W5: 创建 QR Code — 4 步向导（5 screens）

> **这是 Dashboard 创建 QRCode 的路径 B**（路径 A 是 Agent 对话式创建，见 §4.4）

📐 **交互视觉稿**: `web-add-qrcode.png` / `web-dashboard-qrcode.png`

#### 7.5.1 Step 0: Select Agent（设计稿 ID: 78jbg）

| 元素 | 说明 |
|------|------|
| 进度指示器 | 顶部 4 步（0-1-2-3），当前高亮 Step 0 |
| 标题 | 「Select an Agent」 |
| Agent 卡片列表 | 已绑定的 Agent，点击选中（红色边框高亮） |
| 按钮 | 「Next」 |

#### 7.5.2 Step 1: Template（设计稿 ID: 2HULu）

| 元素 | 说明 |
|------|------|
| 模板网格 | 4 个预设 + 1 个自定义 |
| **Customer Service** | FAQs、订单、客户支持 |
| **Data Analyst** | 数据查询、报表分析 |
| **Email Assistant** | 邮件起草、回复 |
| **Custom** | 空白起步，自由配置 |
| 选中效果 | 红色边框高亮 |
| 按钮 | Cancel / Next |

**模板作用**: 预填充 system_prompt 和 suggested_questions，用户可在 Step 2 修改

#### 7.5.3 Step 2: Configure（设计稿 ID: CHIA7）

| 区域 | 说明 |
|------|------|
| **左栏 — 配置表单** | |
| 头像上传 | 点击上传 JPG/PNG |
| Name * | 40 字符限制 |
| Description * | 200 字符限制 |
| System Prompt * | 1000 字符限制，红色左边框强调 |
| **右栏 — 实时预览** | |
| Phone Mockup | 实时预览 Agent Profile 效果 |
| 同步更新 | 左侧输入 → 右侧预览实时同步 |
| 按钮 | Back / Create |

**表单校验**: 必填字段为空时 Create 按钮禁用

#### 7.5.4 Step 3: Success（设计稿 ID: j4R85）

| 元素 | 说明 |
|------|------|
| 成功图标 | 绿色对勾 + 「QR Code Created Successfully」 |
| QR 码卡片 | 中间展示，支持 **3 种样式切换** |
| **Standard** | 白色背景红色二维码 |
| **Minimal** | 简约无边框 |
| **Dark** | 黑色背景白色二维码 |
| URL 行 | 含 Copy 按钮 |
| CTA 按钮 | 红色「Download QR」+ 灰色描边「Go to Dashboard」 |
| 底部链接 | 「Create another QR Code」 |

#### 7.5.5 Dashboard QR Code 管理（设计稿 ID: kVN50）

| 区域 | 说明 |
|------|------|
| 左栏 | 导航栏 |
| 中栏 | QR 码列表: 状态标签（Active/Draft）+ 扫码数 + 导航箭头 |
| 右栏 | 详情面板: QR 码放大预览 + URL + Copy + 3 个统计卡片（Scans/Conversations/Created）+ 操作按钮（Download/Edit/Revoke）+ 手机预览 |

---

### 7.6 W6: 编辑/设置/定价（3 screens）

#### 7.6.1 Edit QR（设计稿 ID: thA1i）

| 区域 | 说明 |
|------|------|
| 布局 | 与 Step 2 类似的双栏 |
| 左栏 | 预填充表单（Name / Description / System Prompt 可编辑） |
| 右栏 | 实时手机预览 |
| 顶部操作 | 「Pause」按钮可暂时停用 |
| 按钮 | Back / Save Changes |
| 版本控制 | 编辑后 `config_version++` |

#### 7.6.2 Settings（设计稿 ID: ntmk5）

| 区域 | 说明 |
|------|------|
| 左侧 | Profile 卡片（头像 + 名称 + 邮箱） |
| 右侧 | 设置菜单列表 |
| 菜单项 | Edit Profile / Change Password / Subscription / My Agents / Log Out |
| 交互 | 每项带右箭头导航 |

#### 7.6.3 Pricing（设计稿 ID: UZFlP）

| 区域 | 说明 |
|------|------|
| 布局 | 3 个方案卡片横向排列 |
| **Free** | $0/month，基础功能，CTA「Current Plan」 |
| **Pro** | $9.9/month，「Coming Soon」标签 |
| **Max** | $29.9/month，「Coming Soon」标签 |

> Pro/Max 标记 Coming Soon — 与 V2 Stripe 延后到 V3 的决策一致

---

### 7.7 W7: 文档/QR 样式（2 screens）

#### 7.7.1 Docs（设计稿 ID: aiwB4）

| 区域 | 说明 |
|------|------|
| 三栏布局 | 左导航 + 中内容 + 右目录 |
| 内容 | Markdown 渲染，代码块语法高亮 |
| 导航树 | Getting Started / API Reference / Guides |

#### 7.7.2 QR Styles（设计稿 ID: FBcJn）

| 样式 | 说明 |
|------|------|
| **Standard** | 白色背景，红色二维码 |
| **Dark** | 黑色背景，白色二维码 |
| **Minimal** | 简约，无边框 |

## 八、交互规范与设计系统

### 8.1 颜色系统

| 色值 | Token | 用途 |
|------|-------|------|
| `#E24A3F` | Brand Red | 主色调，按钮、链接、品牌标识 |
| `#FEF2F2` | Red Light | 浅红背景、悬浮状态 |
| `#F5F5F5` | Gray 100 | 卡片背景、分隔区域 |
| `#E5E7EB` | Border | 边框、分隔线 |
| `#1F2937` | Text Primary | 标题、正文 |
| `#6B7280` | Text Secondary | 描述文字、占位符 |
| `#D1D5DB` | Disabled | 禁用按钮背景 |
| `#F59E0B` | Warning/Amber | 暂停状态、倒计时提示 |
| `#22C55E` | Success/Green | Active 状态标签 |

### 8.2 字体规范

| 属性 | 值 |
|------|-----|
| 主字体 | Inter |
| 等宽字体 | JetBrains Mono |
| 标题 | 700 / 20-24px |
| 正文 | 400 / 14-15px |
| 说明文字 | 400 / 11-12px |
| 按钮文字 | 600 / 15px |

### 8.3 间距与圆角

| 属性 | 值 |
|------|-----|
| 圆角 | 8-16px（按钮 12-14px，卡片 12px，头像 16px） |
| 卡片内距 | 16-24px |
| 区块间距 | 24-48px |
| 按钮高度 | 44-50px |
| 移动端宽度 | 390px |
| Web 端宽度 | 1440px |

### 8.4 可复用组件

| 组件 | 设计稿 ID | 说明 |
|------|----------|------|
| Button Primary | `OjdTt` | 红色实心按钮，白色文字，圆角 12px |
| Button Outline | `5jucT` | 灰色描边按钮，红色文字 |
| Avatar Agent | `HHdX9` | Agent 头像组件，160×160，圆角 16px |
| Input Field | `3X9H4` | 表单输入框，灰色边框，圆角 12px |
| Top Bar | `XjPhS` | 移动端顶部导航栏 |
| Tab Bar | `Rzvbh` | 移动端底部 Tab 栏（Messages / Scan / Me） |

### 8.5 消息传输交互规则

| 规则 | 说明 |
|------|------|
| 协议 | WebSocket 首选（SSE / HTTP Poll 降级方案 TBD） |
| 流式输出 | `reply_chunk` 事件，含 `is_final` 标志 |
| 超时策略 | 30s 无 chunk → 「Agent is not responding」；60s → ⚠️「Send failed, tap to retry」 |
| 消息状态 | ✓ Sent → ✓✓ Delivered → 完成（显示时间戳） |

> 技术实现详见《技术方案文档》§四、§五、§七

### 8.6 消息状态机

```
用户发送消息:
  sending → sent(✓) → delivered(✓✓) → 完成

Agent 回复:
  typing... → streaming(逐字显示) → complete(显示时间戳)

异常状态:
  sending → failed(60s 超时) → [用户点击 Retry] → sending
  streaming → interrupted(30s 无新 chunk) → 显示已有内容 + 「Reply interrupted」
```

### 8.7 QRCode 状态管理

| 状态 | 触发条件 | 视觉表现 | Visitor 体验 |
|------|---------|---------|-------------|
| **Draft** | Agent 创建 / Dashboard 创建中 | 灰色 📝 Draft 标签 | 不可访问 |
| **Active** | Owner 确认发布 | 绿色 🟢 Active 标签 | 正常扫码对话 |
| **Paused** | Owner 点击 Pause | 橙色 ⏸️ Paused 标签 | 看到暂停提示页 |
| **Revoked** | Owner 点击 Revoke | 红色 🔴 Revoked 标签 | 404 / 不可恢复 |

### 8.8 Agent Claim 绑定规则

| 规则 | 说明 |
|------|------|
| 触发方式 | Agent 读取 skill.md 后自动注册，返回 claim_url |
| 有效期 | **24 小时** |
| 重复绑定 | 同一 Agent 不可绑定到多个 Owner |
| 未登录 | 展示注册 + Claim 一体化表单（W3.1） |
| 已登录 | 展示确认绑定页面（W3.2），Confirm & Bind / Decline |
| 绑定成功 | 自动跳转 Dashboard，Agent 出现在侧边栏 |
| 超时未绑定 | 24h 后 Agent 自动 revoked |

### 8.9 三层破冰方案

```
Layer 1: Suggested Questions（QRCode 配置的破冰问题，≤3 条）
  → 展示在 Profile 页面作为快捷入口

Layer 2: Welcome Message（Agent 可在 visitor_joined 事件时主动发送欢迎语）
  → 用户进入 Chat 页面时收到

Layer 3: Context Hint（QRCode 配置的 visitor_identity.context_hint）
  → 注入到消息的 context 中，Agent 据此个性化开场
```

## 十一、数据埋点与运营分析

> ⚠️ **本章内容为内部运营使用，不展示在用户端。**
> 数据采集脚本每日自动执行，由 OpenClaw Agent 自动分析并生成报告。

---

### 11.1 前端埋点体系

#### 11.1.1 事件命名规范

```
格式: {platform}_{page}_{action}

platform:  mobile | web
page:      profile | chat | auth_login | auth_signup | auth_verify |
           messages | me | my_qrcodes | qrcode_detail | scan |
           landing | dashboard | claim | create_qr_s0 | create_qr_s1 |
           create_qr_s2 | create_qr_s3 | edit_qr | settings | pricing | docs
action:    page_view | btn_{name}_click | input_{name}_focus | link_{name}_click |
           scroll_bottom | swipe_delete | long_press_copy | tab_{name}_click
```

#### Payload Schema（统一）

```json
{
  "event": "mobile_profile_btn_message_click",
  "timestamp": "2026-03-11T10:30:00Z",
  "session_id": "vs_xxx",
  "user_id": "uuid | null",
  "device": {
    "platform": "mobile | web",
    "ua": "Mozilla/5.0 ...",
    "screen": "390x844",
    "language": "en"
  },
  "page": {
    "name": "agent_profile",
    "screen_id": "e1DDM",
    "qrcode_id": "qr_xxx | null",
    "agent_id": "agt_xxx | null"
  },
  "properties": {}
}
```

#### 11.1.2 Mobile 21 screens 埋点清单

> 每个 screen 至少 1 个 `page_view` 曝光事件 + N 个交互事件

**M1: 扫码入口（3 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Agent Profile (e1DDM) | `mobile_profile_page_view` | `{ qrcode_id, agent_id, source: "scan"\|"link" }` |
| | `mobile_profile_btn_message_click` | `{ qrcode_id }` |
| | `mobile_profile_link_signin_click` | `{}` |
| Profile Paused (sJcOR) | `mobile_profile_paused_page_view` | `{ qrcode_id }` |
| 404 Page (k0nbt) | `mobile_404_page_view` | `{ attempted_url }` |
| | `mobile_404_btn_gohome_click` | `{}` |

**M2: 聊天核心（4 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Chat (IgH0g) | `mobile_chat_page_view` | `{ qrcode_id, conversation_id }` |
| | `mobile_chat_btn_send_click` | `{ message_length, is_first_message: bool }` |
| | `mobile_chat_link_signup_click` | `{ qrcode_id }` |
| | `mobile_chat_scroll_bottom` | `{ conversation_id }` |
| Chat Streaming (K6mbw) | `mobile_chat_streaming_start` | `{ conversation_id, message_id }` |
| | `mobile_chat_streaming_complete` | `{ conversation_id, message_id, duration_ms }` |
| Agent No Reply (9KYND) | `mobile_chat_agent_no_reply` | `{ conversation_id, wait_seconds: 30 }` |
| Agent Offline (J6l3h) | `mobile_chat_agent_offline` | `{ conversation_id }` |
| | `mobile_chat_btn_retry_click` | `{ message_id }` |

**M3: 聊天交互（2 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Long Press Copy (nNVxR) | `mobile_chat_long_press_copy` | `{ message_role: "agent"\|"visitor" }` |
| Scan QR (RXEpt) | `mobile_scan_page_view` | `{}` |
| | `mobile_scan_btn_album_click` | `{}` |
| | `mobile_scan_btn_flash_click` | `{}` |
| | `mobile_scan_qr_detected` | `{ qrcode_url }` |

**M4: 注册/登录（3 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Login (9nzBk) | `mobile_auth_login_page_view` | `{ source: "profile"\|"chat"\|"me" }` |
| | `mobile_auth_login_btn_signin_click` | `{}` |
| | `mobile_auth_login_link_signup_click` | `{}` |
| Sign Up (rgesk) | `mobile_auth_signup_page_view` | `{ source }` |
| | `mobile_auth_signup_btn_signup_click` | `{}` |
| Email Verify (1QsK7) | `mobile_auth_verify_page_view` | `{ email_masked }` |
| | `mobile_auth_verify_btn_verify_click` | `{}` |
| | `mobile_auth_verify_link_resend_click` | `{}` |
| | `mobile_auth_verify_success` | `{}` |
| | `mobile_auth_verify_fail` | `{ attempt_count }` |

**M5: 注册后主页（3 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Messages New (j8P8r) | `mobile_messages_page_view` | `{ message_count, is_new_user: true }` |
| Messages (Qxtxk) | `mobile_messages_page_view` | `{ message_count, is_new_user: false }` |
| | `mobile_messages_item_click` | `{ conversation_id, agent_id }` |
| Me (5poPN) | `mobile_me_page_view` | `{}` |
| | `mobile_me_btn_share_click` | `{}` |
| | `mobile_me_btn_my_qrcodes_click` | `{}` |
| | `mobile_me_btn_help_click` | `{}` |
| | `mobile_me_btn_signout_click` | `{}` |

**M5 Tab Bar 通用事件**

| Event | Properties |
|-------|------------|
| `mobile_tab_messages_click` | `{ from_page }` |
| `mobile_tab_scan_click` | `{ from_page }` |
| `mobile_tab_me_click` | `{ from_page }` |

**M6: QR Code 管理（5 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| My QR Codes (X2xHg) | `mobile_my_qrcodes_page_view` | `{ qrcode_count }` |
| | `mobile_my_qrcodes_item_click` | `{ qrcode_id, status }` |
| QR Code Detail (eZDQG) | `mobile_qrcode_detail_page_view` | `{ qrcode_id, scans, conversations }` |
| | `mobile_qrcode_detail_btn_download_click` | `{ qrcode_id }` |
| | `mobile_qrcode_detail_btn_deactivate_click` | `{ qrcode_id }` |
| Swipe Delete (sPwFf) | `mobile_messages_swipe_delete` | `{ conversation_id }` |
| | `mobile_messages_swipe_delete_confirm` | `{ conversation_id }` |
| QR Codes Empty (7X6Kn) | `mobile_my_qrcodes_empty_page_view` | `{}` |
| | `mobile_my_qrcodes_empty_link_create_click` | `{}` |

**M7: 扫码引导（1 screen）**

| Screen | Event | Properties |
|--------|-------|------------|
| Agent Guide (DFoBo) | `mobile_guide_page_view` | `{}` |
| | `mobile_guide_link_signup_click` | `{}` |

---

#### 11.1.3 Web 18 screens 埋点清单

**W1: Landing Page（2 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Landing (tD9CD) | `web_landing_page_view` | `{ referrer, utm_source, utm_medium }` |
| | `web_landing_btn_cta_click` | `{ cta_text, position: "hero"\|"connect" }` |
| | `web_landing_nav_features_click` | `{}` |
| | `web_landing_nav_pricing_click` | `{}` |
| | `web_landing_nav_docs_click` | `{}` |
| | `web_landing_nav_signin_click` | `{}` |
| | `web_landing_input_subscribe_focus` | `{}` |
| | `web_landing_btn_subscribe_click` | `{ email_masked }` |
| | `web_landing_scroll_depth` | `{ percent: 25\|50\|75\|100 }` |
| Docs (aiwB4) | `web_docs_page_view` | `{ section }` |
| | `web_docs_nav_click` | `{ target_section }` |
| | `web_docs_code_copy_click` | `{ code_block_id }` |

**W2: 注册流程（4 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Sign Up (S3TMu) | `web_auth_signup_page_view` | `{ source: "landing"\|"claim"\|"direct" }` |
| | `web_auth_signup_btn_create_click` | `{}` |
| | `web_auth_signup_link_signin_click` | `{}` |
| Email Verify (JMDpZ) | `web_auth_verify_page_view` | `{ email_masked }` |
| | `web_auth_verify_btn_verify_click` | `{}` |
| | `web_auth_verify_link_resend_click` | `{}` |
| | `web_auth_verify_success` | `{}` |
| | `web_auth_verify_fail` | `{ attempt_count }` |
| Dashboard Welcome (18eSq) | `web_dashboard_welcome_page_view` | `{ is_first_visit: true }` |
| | `web_dashboard_welcome_code_copy_click` | `{}` |
| Dashboard QR Empty (s4lvD) | `web_dashboard_qr_empty_page_view` | `{}` |
| | `web_dashboard_qr_empty_link_guide_click` | `{}` |

**W3: Claim Agent 绑定（2 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Claim Unauthenticated (c2cAy) | `web_claim_unauth_page_view` | `{ agent_id, expires_in_hours }` |
| | `web_claim_unauth_btn_signup_claim_click` | `{ agent_id }` |
| | `web_claim_unauth_link_login_click` | `{}` |
| Claim Authenticated (r2OZD) | `web_claim_auth_page_view` | `{ agent_id, agent_name }` |
| | `web_claim_auth_btn_confirm_click` | `{ agent_id }` |
| | `web_claim_auth_btn_decline_click` | `{ agent_id }` |

**W4: Dashboard（3 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Messages (FCW4Y) | `web_dashboard_messages_page_view` | `{ unread_count }` |
| | `web_dashboard_messages_item_click` | `{ conversation_id }` |
| | `web_dashboard_messages_btn_send_click` | `{ message_length }` |
| | `web_dashboard_nav_messages_click` | `{}` |
| | `web_dashboard_nav_qrcode_click` | `{}` |
| | `web_dashboard_nav_settings_click` | `{}` |
| Streaming (mcCu7) | `web_dashboard_streaming_start` | `{ message_id }` |
| | `web_dashboard_streaming_complete` | `{ message_id, duration_ms }` |
| Support (18eSq) | `web_dashboard_support_page_view` | `{}` |

**W5: 创建 QR Code（5 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Step 0 (78jbg) | `web_create_qr_s0_page_view` | `{ agent_count }` |
| | `web_create_qr_s0_agent_select` | `{ agent_id }` |
| | `web_create_qr_s0_btn_next_click` | `{ selected_agent_id }` |
| Step 1 (2HULu) | `web_create_qr_s1_page_view` | `{}` |
| | `web_create_qr_s1_template_select` | `{ template: "customer_service"\|"data_analyst"\|"email_assistant"\|"custom" }` |
| | `web_create_qr_s1_btn_next_click` | `{ template }` |
| | `web_create_qr_s1_btn_cancel_click` | `{}` |
| Step 2 (CHIA7) | `web_create_qr_s2_page_view` | `{ template }` |
| | `web_create_qr_s2_input_name_change` | `{ length }` |
| | `web_create_qr_s2_input_description_change` | `{ length }` |
| | `web_create_qr_s2_input_prompt_change` | `{ length }` |
| | `web_create_qr_s2_avatar_upload` | `{ file_size, file_type }` |
| | `web_create_qr_s2_btn_create_click` | `{}` |
| | `web_create_qr_s2_btn_back_click` | `{}` |
| Step 3 (j4R85) | `web_create_qr_s3_page_view` | `{ qrcode_id }` |
| | `web_create_qr_s3_style_switch` | `{ style: "standard"\|"minimal"\|"dark" }` |
| | `web_create_qr_s3_btn_download_click` | `{ style }` |
| | `web_create_qr_s3_btn_copy_url_click` | `{ qrcode_id }` |
| | `web_create_qr_s3_btn_dashboard_click` | `{}` |
| | `web_create_qr_s3_link_create_another_click` | `{}` |
| Dashboard QR (kVN50) | `web_dashboard_qr_page_view` | `{ qrcode_count }` |
| | `web_dashboard_qr_item_click` | `{ qrcode_id, status }` |
| | `web_dashboard_qr_btn_download_click` | `{ qrcode_id }` |
| | `web_dashboard_qr_btn_edit_click` | `{ qrcode_id }` |
| | `web_dashboard_qr_btn_revoke_click` | `{ qrcode_id }` |

**W6: 编辑/设置/定价（3 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Edit QR (thA1i) | `web_edit_qr_page_view` | `{ qrcode_id }` |
| | `web_edit_qr_btn_pause_click` | `{ qrcode_id }` |
| | `web_edit_qr_btn_save_click` | `{ qrcode_id, changed_fields[] }` |
| Settings (ntmk5) | `web_settings_page_view` | `{}` |
| | `web_settings_btn_edit_profile_click` | `{}` |
| | `web_settings_btn_change_password_click` | `{}` |
| | `web_settings_btn_subscription_click` | `{}` |
| | `web_settings_btn_my_agents_click` | `{}` |
| | `web_settings_btn_logout_click` | `{}` |
| Pricing (UZFlP) | `web_pricing_page_view` | `{ current_plan }` |
| | `web_pricing_btn_plan_click` | `{ plan: "free"\|"pro"\|"max" }` |

**W7: 文档/QR 样式（2 screens）**

| Screen | Event | Properties |
|--------|-------|------------|
| Docs (aiwB4) | (same as W1.2) | |
| QR Styles (FBcJn) | `web_qr_styles_page_view` | `{}` |
| | `web_qr_styles_select` | `{ style }` |

---

#### 11.1.4 关键转化漏斗事件

```
核心漏斗: scan → profile → chat → first_message → signup → claim → create_qr → publish_qr

漏斗事件定义:
```

| 漏斗阶段 | Event | 触发时机 | Properties |
|---------|-------|---------|------------|
| 扫码 | `funnel_scan` | 用户扫描 QR Code | `{ source: "qr"\|"link", qrcode_id }` |
| 查看 Profile | `funnel_profile_view` | Agent Profile 页加载 | `{ qrcode_id, agent_id }` |
| 开始聊天 | `funnel_chat_start` | 进入 Chat 页面 | `{ qrcode_id, is_anonymous: bool }` |
| 首条消息 | `funnel_first_message` | 发送第一条消息 | `{ qrcode_id, session_type: "anonymous"\|"authenticated" }` |
| 开始注册 | `funnel_signup_start` | 进入注册页面 | `{ source: "chat_banner"\|"profile_link"\|"claim_page"\|"landing" }` |
| 完成注册 | `funnel_signup_complete` | 验证码验证成功 | `{ method: "email" }` |
| 开始 Claim | `funnel_claim_start` | 进入 Claim 页面 | `{ agent_id, is_authenticated: bool }` |
| 完成 Claim | `funnel_claim_complete` | Claim 绑定成功 | `{ agent_id }` |
| 开始创建 QR | `funnel_create_qr_start` | 进入创建流程 | `{ source: "dashboard"\|"agent", agent_id }` |
| 完成创建 QR | `funnel_create_qr_complete` | QR Code 创建成功 | `{ qrcode_id, template, style }` |
| 发布 QR | `funnel_publish_qr` | QR Code 从 draft → active | `{ qrcode_id, source: "dashboard"\|"publish_url" }` |

---

### 11.2 后端数据采集

#### 11.2.1 用户指标

| 指标 | SQL 查询 | 采集频率 |
|------|---------|---------|
| 注册用户总数 | `SELECT COUNT(*) FROM owners` | 每日 |
| 日新增用户 | `SELECT COUNT(*) FROM owners WHERE created_at >= CURRENT_DATE` | 每日 |
| DAU | `SELECT COUNT(DISTINCT user_id) FROM usage_logs WHERE date = CURRENT_DATE` | 每日 |
| MAU | `SELECT COUNT(DISTINCT user_id) FROM usage_logs WHERE date >= DATE_TRUNC('month', CURRENT_DATE)` | 每日 |
| 注册来源分布 | `SELECT source, COUNT(*) FROM owners GROUP BY source` | 每日 |
| Claim 转化率 | `claimed_agents / total_registered_agents × 100%` | 每日 |

#### 11.2.2 Agent 指标

| 指标 | SQL 查询 | 采集频率 |
|------|---------|---------|
| 绑定 Agent 总数 | `SELECT COUNT(*) FROM agents WHERE status = 'active'` | 每日 |
| 日新增 Agent | `SELECT COUNT(*) FROM agents WHERE created_at >= CURRENT_DATE AND status = 'active'` | 每日 |
| Agent 在线率 | `online_agents / active_agents × 100%` (from WS connection pool) | 每小时 |
| Agent 平均在线时长 | `AVG(session_duration) FROM agent_ws_sessions WHERE date = CURRENT_DATE` | 每日 |
| 待 Claim Agent | `SELECT COUNT(*) FROM agents WHERE status = 'pending' AND created_at > NOW() - INTERVAL '24h'` | 每小时 |

#### 11.2.3 QRCode 指标

| 指标 | SQL 查询 | 采集频率 |
|------|---------|---------|
| QRCode 总数 | `SELECT status, COUNT(*) FROM qrcodes GROUP BY status` | 每日 |
| 日新增 QRCode | `SELECT COUNT(*) FROM qrcodes WHERE created_at >= CURRENT_DATE` | 每日 |
| 日发布 QRCode | `SELECT COUNT(*) FROM qrcodes WHERE published_at >= CURRENT_DATE` | 每日 |
| 各状态分布 | `SELECT status, COUNT(*) FROM qrcodes GROUP BY status` | 每日 |
| 模板使用分布 | `SELECT template, COUNT(*) FROM qrcodes GROUP BY template` | 每周 |
| 样式使用分布 | `SELECT visual_style, COUNT(*) FROM qrcodes GROUP BY visual_style` | 每周 |
| 创建路径分布 | `SELECT creation_source, COUNT(*) FROM qrcodes GROUP BY creation_source` | 每周 |

#### 11.2.4 消息指标

| 指标 | SQL 查询 | 采集频率 |
|------|---------|---------|
| 日消息总量 | `SELECT COUNT(*) FROM messages WHERE sent_at >= CURRENT_DATE` | 每日 |
| 月消息总量 | `SELECT COUNT(*) FROM messages WHERE sent_at >= DATE_TRUNC('month', CURRENT_DATE)` | 每日 |
| 按角色分布 | `SELECT role, COUNT(*) FROM messages WHERE sent_at >= CURRENT_DATE GROUP BY role` | 每日 |
| 按 QRCode 分布（Top 20） | `SELECT qrcode_id, COUNT(*) FROM messages GROUP BY qrcode_id ORDER BY count DESC LIMIT 20` | 每日 |
| 平均对话消息数 | `SELECT AVG(msg_count) FROM (SELECT conversation_id, COUNT(*) as msg_count FROM messages GROUP BY conversation_id)` | 每日 |
| 日活跃对话数 | `SELECT COUNT(DISTINCT conversation_id) FROM messages WHERE sent_at >= CURRENT_DATE` | 每日 |

#### 11.2.5 转化率指标

| 指标 | 计算公式 | 采集频率 |
|------|---------|---------|
| 扫码→聊天转化率 | `funnel_chat_start / funnel_scan × 100%` | 每日 |
| 聊天→注册转化率 | `funnel_signup_complete / funnel_first_message × 100%` | 每日 |
| 注册→Claim转化率 | `funnel_claim_complete / funnel_signup_complete × 100%` | 每日 |
| Claim→创建QR转化率 | `funnel_create_qr_complete / funnel_claim_complete × 100%` | 每日 |
| 创建→发布转化率 | `funnel_publish_qr / funnel_create_qr_complete × 100%` | 每日 |
| **全链路转化率** | `funnel_publish_qr / funnel_scan × 100%` | 每日 |
| Free→Pro 升级率 | `pro_users / total_free_users × 100%` | 每月 |

---

### 11.3 运营分析框架（INTERNAL — 不对用户展示）

#### 11.3.1 每日自动化数据采集脚本

```
执行时间: 每日 UTC+8 01:00
执行方式: OpenClaw Agent 自动执行（cron job）
存储目标: analytics_daily_snapshots 表

脚本流程:
  1. 执行 §11.2 所有 SQL 查询
  2. 计算 §11.2.5 转化率指标
  3. 写入 analytics_daily_snapshots { date, metric_name, metric_value }
  4. 与前日对比，生成变化率
  5. 异常检测（任何指标日环比下降 >30% 触发告警）
  6. 生成日报 Markdown
  7. 推送到运营频道
```

#### 11.3.2 核心指标看板

| 看板 | 图表类型 | 包含指标 |
|------|---------|---------|
| **用户增长** | 面积图（日/周/月） | 注册用户数、DAU、MAU、新增趋势 |
| **Agent 生态** | 柱状图 + 折线图 | 绑定数、在线率、新增趋势 |
| **QRCode 状态** | 饼图 | Active / Draft / Paused / Revoked 分布 |
| **消息量** | 折线图（日/周/月） | 日消息量、月消息量、按角色分布 |
| **转化漏斗** | 瀑布图 | scan → profile → chat → signup → claim → create → publish |
| **收入预测** | 折线图 + 目标线 | 月收入、付费用户数、ARPU |

#### 11.3.3 分析报告模板

**日报**（每日自动生成）:
```markdown
## QRClaw 日报 — {date}

### 关键数字
| 指标 | 今日 | 昨日 | 变化 |
|------|------|------|------|
| 新增用户 | {n} | {n-1} | {diff}% |
| DAU | {n} | {n-1} | {diff}% |
| 新增 Agent | {n} | {n-1} | {diff}% |
| 日消息量 | {n} | {n-1} | {diff}% |
| 活跃对话 | {n} | {n-1} | {diff}% |

### 异常告警
- {异常指标及原因分析}

### 转化漏斗（日）
scan({n}) → profile({n}) → chat({n}) → signup({n}) → claim({n})
```

**周报**（每周一自动生成）:
```markdown
## QRClaw 周报 — W{week_number}

### 本周概览
- 新增用户: {n}（同比上周 {diff}%）
- 新增 Agent: {n}
- QRCode 创建/发布: {n}/{n}
- 周消息量: {n}

### 趋势分析
- 增长趋势: {上升/平稳/下降}
- 漏斗瓶颈: {瓶颈阶段及建议}

### 行动建议
1. {建议1}
2. {建议2}
```

**月报**（每月 1 日自动生成）:
```markdown
## QRClaw 月报 — {year}-{month}

### 月度 KPI
| KPI | 目标 | 实际 | 达成率 |
|-----|------|------|--------|
| 注册用户 | {target} | {actual} | {rate}% |
| 付费用户 | {target} | {actual} | {rate}% |
| 月收入 | ${target} | ${actual} | {rate}% |
| MAU | {target} | {actual} | {rate}% |

### 同比环比
| 指标 | 本月 | 上月 | 环比 | 去年同月 | 同比 |
...

### 产品健康度评分
{5维雷达图数据}
总分: {score}/100

### 下月重点
1. {重点1}
2. {重点2}
```

#### 11.3.4 OpenClaw Agent 自动执行机制

```
脚本位置: /projects/qrclaw/scripts/analytics/
├── daily_collect.py      # 每日数据采集
├── daily_report.py       # 每日报告生成
├── weekly_report.py      # 每周报告生成
├── monthly_report.py     # 每月报告生成
├── anomaly_detect.py     # 异常检测
└── funnel_analysis.py    # 漏斗分析

执行方式:
  - OpenClaw Agent 通过 cron job 每日 01:00 UTC+8 自动触发
  - daily_collect.py → daily_report.py → anomaly_detect.py
  - 报告推送到内部运营频道
  - 异常告警实时推送

数据库表:
  analytics_daily_snapshots:
    date DATE
    metric_name TEXT
    metric_value NUMERIC
    created_at TIMESTAMPTZ DEFAULT NOW()

  analytics_funnel_daily:
    date DATE
    step TEXT
    count INTEGER
    conversion_rate NUMERIC
```

#### 11.3.5 产品健康度评估框架

```
5 维雷达图评分（每项 0-100 分）:

1. 用户增长 (25%)
   - DAU 增长率 > 5%/周 = 100
   - 2-5% = 70
   - 0-2% = 40
   - 负增长 = 10

2. 用户活跃度 (20%)
   - DAU/MAU > 30% = 100
   - 20-30% = 70
   - 10-20% = 40
   - < 10% = 10

3. 转化效率 (25%)
   - 全链路转化率 > 5% = 100
   - 2-5% = 70
   - 1-2% = 40
   - < 1% = 10

4. 消息活跃度 (15%)
   - 日消息量周增长 > 10% = 100
   - 5-10% = 70
   - 0-5% = 40
   - 负增长 = 10

5. Agent 生态 (15%)
   - Agent 在线率 > 80% = 100
   - 60-80% = 70
   - 40-60% = 40
   - < 40% = 10

加权总分 = Σ(维度分 × 权重)
  ≥ 80: 🟢 健康
  60-79: 🟡 关注
  40-59: 🟠 预警
  < 40: 🔴 危险
```

## 九、套餐与定价

> 📄 完整定价分析报告: `requirements/pricing-analysis-v1.md`（348 行）

## 六D、套餐与定价

> 📄 完整定价分析报告（含成本推导、竞品对标、盈亏平衡）：`requirements/pricing-analysis-v1.md`

### 6D.1 定价总览

| | **Free** | **Pro** | **Max** |
|---|---------|---------|---------|
| **月付** | **$0** | **$9.9/月** | **$29.9/月** |
| **年付** | — | **$7.9/月**（$94.8/年，省20%） | **$24.9/月**（$298.8/年，省17%） |

### 6D.2 功能矩阵

| 功能维度 | **Free** | **Pro** | **Max** |
|---------|---------|---------|---------|
| **── 核心容量 ──** | | | |
| Agent 连接数 | **1** | **10** | **50** |
| QRCode 数量 | **5** | **50** | **500** |
| 每月消息量 | **1,000 条** | **50,000 条** | **无限制** |
| 消息保存时长 | **60 天** | **1 年** | **永久** |
| **── Agent 能力 ──** | | | |
| WebSocket 实时连接 | ✅ | ✅ | ✅ |
| 流式回复 (reply_chunk) | ✅ | ✅ | ✅ |
| Security Envelope | ✅ | ✅ | ✅ |
| 自定义 system_prompt | ✅ | ✅ | ✅ |
| 多 QRCode / 多角色 | ❌（1 Agent 限制） | ✅ | ✅ |
| **── QRCode 与品牌 ──** | | | |
| QRCode 默认样式 | ✅ | ✅ | ✅ |
| QRCode 自定义颜色 | ❌ | ✅ | ✅ |
| QRCode 嵌入 Logo | ❌ | ❌ | ✅ |
| Profile 页自定义 | 基础 | 完整 | 完整 + 自定义 CSS |
| "Powered by QRClaw" 水印 | 显示 | **去除** | **去除** |
| 自定义域名（CNAME） | ❌ | ❌ | ✅ |
| **── 数据与分析 ──** | | | |
| 基础统计（总数/趋势） | ✅ | ✅ | ✅ |
| 详细报表（日/周/月） | ❌ | ✅ | ✅ |
| 地域分布分析 | ❌ | ❌ | ✅ |
| 数据导出（CSV） | ❌ | ✅ | ✅ |
| API 数据查询 | ❌ | ❌ | ✅ |
| **── 管理 ──** | | | |
| Dashboard 管理 | ✅ | ✅ | ✅ |
| 团队协作（多 Owner） | ❌ | ❌ | ✅（最多 5 人） |
| Webhook 通知 | ❌ | ✅ | ✅ |
| 优先技术支持 | ❌ | 邮件支持 | 专属支持通道 |
| **── 支付方式 ──** | | | |
| 支付 | — | Stripe 订阅 | Stripe 订阅 |

### 6D.3 成本推导

> QRClaw 是**固定成本主导型 SaaS**，单用户边际成本极低（< $0.05/月）。

#### 基础设施月固定成本

| 组件 | 服务商 | 月费（USD） |
|------|--------|------------|
| Gateway 服务器 | 腾讯云 CVM 新加坡 2核4G 包年 | $28 |
| CDN（WSS 回源） | 腾讯云 CDN | $2 |
| 数据库 + Auth | Supabase Free（→ Pro $25 @ 250用户时） | $0-25 |
| 前端托管 | Vercel Hobby | $0 |
| 域名 | qrclaw.ai 年费均摊 | $1.3 |
| **合计** | | **$31-56** |

#### 单用户边际成本

| 套餐 | 月消息量 | DB 存储 | 带宽 | **月边际成本** |
|------|---------|---------|------|-------------|
| Free | 1,000 条 | 1.35 MB | 2 MB | **$0.002** |
| Pro | ~30,000 条 | 40.5 MB | 60 MB | **$0.02** |
| Max | ~200,000 条 | 270 MB | 400 MB | **$0.05** |

#### 盈亏平衡

| 阶段 | 月固定成本 | 盈亏平衡（混合比例 Pro:Max=7:3） |
|------|-----------|-------------------------------|
| MVP（0-250 用户） | $31 | **3 个付费用户** |
| 增长期（250-2K） | $56 | **5 个付费用户** |
| 扩展期（2K-10K） | $102 | **8 个付费用户** |

### 6D.4 竞品对标

| 产品 | 定位 | 中档价格 | QRClaw Pro 对比 |
|------|------|---------|----------------|
| Crisp | 客服聊天 | $25/seat/mo | Pro 便宜 60% 且不按 seat |
| Intercom | 客服平台 | $39/seat/mo | Pro 便宜 75% |
| Tidio | 聊天机器人 | $19/mo | Pro 便宜 48% |
| Chatbase | AI 聊天 | $19/mo | Pro 便宜 48% |
| Botpress | Agent 平台 | $15/mo | Pro 便宜 34% |
| Dify | LLM 应用 | $59/mo | Pro 便宜 83% |

> **定价策略**：以**低价快速获客**为首要目标。Pro $9.9 < $10 心理门槛，显著低于竞品。

### 6D.5 定价逻辑

#### Free → Pro 升级驱动力

| 触发条件 | 说明 |
|---------|------|
| 消息超 1,000 条/月 | 最直接触发器 — 1,000 条 ≈ 每天 ~33 次对话 |
| 需要第 2 个 Agent | 一个业务多 Agent 场景 |
| 去水印 | 品牌形象需求 |
| 消息保存 > 60 天 | 历史对话记录需求 |
| 数据报表 | 运营分析需求 |

> **Free 的 1,000 条/月是关键设计**：100 条太少（无法体验价值→流失）；10,000 条太多（无付费动力）。1,000 条足够验证产品，但产生真实流量后就会撞天花板。

#### Pro → Max 升级驱动力

| 触发条件 | 说明 |
|---------|------|
| 消息超 50,000 条/月 | 高频场景（商业客服、活动 QR 码） |
| 需要 50+ QRCode | 连锁/多门店场景 |
| QRCode 嵌入 Logo / 自定义域名 | 深度品牌定制 |
| 团队协作 | 多人管理 |
| API 数据查询 | 集成到自有系统 |

> **Pro 50,000 条上限**：覆盖 95% 中型场景，仅 ~5% 用户会撞到 50K → 自然升级到 Max。

### 6D.6 年付优惠

| | 月付 | 年付（月均） | 年付总价 | 折扣率 |
|---|------|-----------|---------|--------|
| Pro | $9.9/月 | **$7.9/月** | $94.8/年 | 20% off |
| Max | $29.9/月 | **$24.9/月** | $298.8/年 | 17% off |

### 6D.7 收入预测

| 注册用户 | 活跃(50%) | 付费(5%) | Pro(70%) | Max(30%) | **月收入** | 月成本 | **毛利率** |
|---------|----------|----------|----------|----------|-----------|-------|-----------|
| 100 | 50 | 5 | 3-4 | 1-2 | $80 | $31 | 61% |
| 500 | 250 | 25 | 17-18 | 7-8 | $398 | $56 | 86% |
| 2,000 | 1,000 | 100 | 70 | 30 | $1,590 | $102 | **94%** |
| 10,000 | 5,000 | 500 | 350 | 150 | $7,950 | $300 | **96%** |

### 6D.8 Agent 皮肤（待细化）

> ⚠️ **此功能尚在规划中，以下为初步方向**

- **系统通用皮肤**：Free 用户默认，简洁标准样式
- **精美皮肤**：Pro/Max 可选，包含：
  - 个性化 Agent 形象（头像/外观风格）
  - 对话时表情反馈（Agent 回复时伴随表情动画）
  - 更多视觉定制选项（待定）

### 6D.9 付费系统：Stripe（V3 实现）

> ⏳ Stripe 付费系统计划在 **V3 大版本**中正式实现。V2 版本仅预留数据模型和接口边界。

#### V2 已预留（数据库层）

```sql
-- owners 表套餐字段（已建表）
plan text DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'max'))
stripe_customer_id text
stripe_subscription_id text
plan_period_start timestamptz
plan_period_end timestamptz
plan_status text DEFAULT 'active'

-- webhook_events 表（幂等处理，已建表）
-- monthly_message_counts 表（Free 限流，已建表）
```

#### V2 配额检查（仅 Free 限额）

| 检查点 | V2 行为 | 超限提示 |
|--------|---------|---------|
| Agent 注册 | Free 限 1 个 Agent，超限返回 403 | "升级到 Pro 可创建 10 个 Agent" |
| QRCode 创建 | Free 限 5 个，超限返回 403 | "升级到 Pro 可创建 50 个 QRCode" |
| 消息发送 | Free 限 1,000 条/月，超限返回 429 | `quota_exceeded` + 显示升级入口 |
| 消息清理 | Free 60 天自动清理 | 清理前邮件通知 |
| 数据报表 | Free 仅基础统计 | Dashboard 展示 "Pro 解锁详细报表" |
| 品牌水印 | Free 显示 "Powered by QRClaw" | Profile 页底部 |

#### V3 实现范围

- Stripe Checkout Session 创建（Stripe-hosted Checkout）
- Customer Portal 集成（自助升降级/取消/换支付方式）
- Webhook 处理（checkout.session.completed / invoice.paid / invoice.payment_failed / subscription.updated / subscription.deleted）
- Dynamic Payment Methods（Dashboard 配置，不硬编码）
- Flexible Billing Mode
- Go-Live 检查清单（12 项）
- 环境变量管理（STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_PRO / STRIPE_PRICE_MAX）

> 📄 完整 Stripe 实现方案（含代码）详见 V2.5 存档文档：`requirements/product-plan-v2.md`

---



---

## 十、多语言国际化（i18n）

> 技术实现（Next.js i18n、middleware、翻译文件）详见《技术方案文档》§十六

## 六E、多语言国际化（i18n）

### 6E.1 多语言策略

| 阶段 | 支持语言 | 默认语言 | 说明 |
|------|---------|---------|------|
| **V2（首期上线）** | **English + 简体中文** | **English** | 覆盖核心市场 |
| **V3** | + 日本語、한국어 | English | 亚太主要市场 |
| **V4+** | + Español、Français、Deutsch、Português 等 | English | 全球覆盖 |

> **默认英文**：QRClaw 目标用户为全球开发者/Agent 创建者，英文为通用语言。中文为首批补充语言（团队母语 + 中国市场需求）。

### 6E.2 多语言覆盖范围

| 层级 | 覆盖内容 | 实现方式 |
|------|---------|---------|
| **前端 UI** | Landing Page、Dashboard、Auth 页面、错误提示、表单标签、按钮文案 | Next.js i18n + JSON 翻译文件 |
| **Visitor Chat** | 聊天界面固定文案（"Type a message…"、系统提示、连接状态） | 同上 |
| **后端消息** | API 错误消息、邮件模板（Claim 通知、验证邮件、配额提醒） | 模板国际化 |
| **skill.md** | Agent 接入文档（保持英文，不翻译） | 英文 Only |
| **Agent 对话内容** | Agent 回复的实际内容（由 Agent 自己决定语言） | 不控制 — 取决于 Agent 的 system_prompt |

> **不翻译的内容**：skill.md（Agent 阅读的技术文档，英文为行业标准）、API 字段名、代码示例。



### 10.4 语言检测与切换

### 6E.4 语言检测与切换

#### 自动检测（首次访问）

```
1. URL 路径是否带 locale 前缀？ → 有则直接使用
2. 检查 localStorage 中 'preferred-locale' → 有则使用
3. 检查 Accept-Language header → 匹配支持的语言
4. 默认 fallback → 'en'
```

#### 手动切换

- **位置**：Nav Bar 右上角，语言切换按钮（🌐 图标 + 当前语言名称）
- **行为**：切换后跳转到对应 locale 路径，同时写入 `localStorage`
- **示例**：`qrclaw.ai/dashboard` → 点击"简体中文" → `qrclaw.ai/zh/dashboard`



### 10.5 Visitor Chat 语言规则

### 6E.6 Visitor Chat 页面语言

Visitor Chat 页面的语言**跟随 QRCode 的配置**（不是跟随 Visitor 的浏览器语言）：

```sql
-- qrcodes 表新增 locale 字段
ALTER TABLE qrcodes ADD COLUMN locale text DEFAULT 'en'
  CHECK (locale IN ('en', 'zh'));
```

| 场景 | 语言来源 | 说明 |
|------|---------|------|
| Profile 页面固定文案 | `qrcodes.locale` | Owner 创建时指定 |
| Chat 输入框 placeholder | `qrcodes.locale` | 跟随 QRCode |
| 系统提示（连接中/离线等） | `qrcodes.locale` | 跟随 QRCode |
| Agent 回复内容 | Agent 自决 | 取决于 system_prompt |
| Visitor 输入内容 | Visitor 自决 | 自由输入 |

> **为什么跟随 QRCode 而非浏览器语言？** 因为一个中国餐厅的 QRCode 就应该显示中文界面，无论访客的浏览器语言是什么。Owner 最清楚自己的目标受众。

### 6E.7 SEO 多语言


> **关键决策**: Visitor Chat 语言跟随 QRCode.locale 配置，而非浏览器语言。
> 理由: 中国餐厅的 QR 应该显示中文界面，无论 Visitor 浏览器语言是什么。Owner 最了解自己的受众。

### 10.6 SEO 多语言

### 6E.7 SEO 多语言

```html
<!-- Landing Page head -->
<link rel="alternate" hreflang="en" href="https://qrclaw.ai/" />
<link rel="alternate" hreflang="zh" href="https://qrclaw.ai/zh/" />
<link rel="alternate" hreflang="x-default" href="https://qrclaw.ai/" />
```

- `x-default` 指向英文版（默认）
- `sitemap.xml` 包含所有语言版本的 URL
- OG tags / meta description 按语言输出

### 6E.8 翻译工作流

| 步骤 | 工具 | 说明 |
|------|------|------|
| 1. 开发时 | 直接编辑 `en.json` | 英文为基准语言 |
| 2. 翻译 | 人工翻译（团队内部） | V2 只有中文，量不大 |
| 3. 校验 | CI 脚本检查 key 一致性 | 确保 zh.json 不遗漏 key |
| 4. 后续扩展 | 接入翻译平台（Crowdin / Lokalise） | V3+ 多语言时启用 |

```bash
# CI 检查脚本（确保翻译 key 完整）
node scripts/check-i18n.js
# → ✅ en.json: 87 keys
# → ✅ zh.json: 87 keys (0 missing)
```



---

## 十二、Skill.md 接入文档规范

> Skill.md 完整内容（411 行）见独立文件: `skill/SKILL.md`
> 遵循 [Anthropic skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) 标准

### 12.1 Skill 目录结构

```
qrclaw/
├── skill/
│   ├── SKILL.md              # 主文件（411行），Agent 唯一入口
│   └── references/
│       ├── api-reference.md   # 完整 API 规格
│       ├── ws-protocol.md     # WebSocket 协议规格
│       └── examples.md        # 端到端示例
```

### 12.2 设计模式

| 模式 | 实现 |
|------|------|
| Agent-Readable URL | `https://qrclaw.ai/skill.md` — Markdown 格式，无需认证 |
| Copy-Paste-Ready | 完整 URL + JSON + `← replace` 标注 |
| Graduated Learning Path | 4 Level + 3 Checkpoint |
| Self-Healing Error Table | 8 个错误码 + 3 个 Troubleshooting |
| Progressive Disclosure | SKILL.md <500 行 + references/ 按需加载 |

---

## 十二、开发任务计划

### 12.1 Agent Team 分工

| Team | 职责 | 技术栈 |
|------|------|--------|
| **Gateway Team** | WS Gateway + 消息路由 + 流式输出 + 限流去重 + 容灾 | Node.js + ws + Redis |
| **Frontend Team** | Landing + Dashboard + Chat + Profile + Auth | Next.js 15 + React + TailwindCSS |
| **Backend Team** | Supabase Schema + Edge Functions + Auth + 加密存储 | PostgreSQL + Deno + Supabase |
| **SDK Team** | **skill.md 接入文档（核心）** + Agent TypeScript SDK | Markdown + TypeScript + npm |
| **QA Team** | 测试 + 安全审计 + 负载测试 | Vitest + Playwright + k6 + OWASP ZAP |

### 12.2 Sprint 计划

#### Sprint 1 (Week 1-2): 基础设施 + 数据库

**目标**: 基础设施搭建完成，数据库 Schema 上线，前后端骨架可访问

| # | 任务 | Team | 验收标准 | 优先级 |
|---|------|------|---------|--------|
| 1.1 | 腾讯云 CVM 购买 + 安全加固 | Gateway | SSH 可达，ufw + fail2ban 配置完成 | P0 |
| 1.2 | Nginx + Let's Encrypt + WSS 终结 | Gateway | `gateway.qrclaw.ai` HTTPS 可访问 | P0 |
| 1.3 | Redis 7 Standalone 部署 | Gateway | `redis-cli PING` 返回 PONG | P0 |
| 1.4 | PM2 + Gateway 骨架 | Gateway | `/health` 返回 `{"status":"ok"}` | P0 |
| 1.5 | Supabase Schema 全量建表 | Backend | 所有表 + RLS + 索引 + 函数创建成功 | P0 |
| 1.6 | Supabase Auth 配置 | Backend | 注册 + 登录 + JWT 签发 + 邮箱验证跑通 | P0 |
| 1.7 | Next.js 项目初始化 + Vercel 部署 | Frontend | `qrclaw.ai` 可访问（占位页） | P0 |
| 1.8 | DNSPod 域名解析配置 | Gateway | 两个域名（qrclaw.ai + gateway.qrclaw.ai）解析正常 | P0 |
| 1.9 | 腾讯云 CDN 接入（WSS 回源） | Gateway | CDN 回源到 CVM 443 端口 | P1 |

#### Sprint 2 (Week 3-4): Agent 注册 + WS 连接

**目标**: Agent 可通过 SDK 注册并建立 WebSocket 长连接

| # | 任务 | Team | 验收标准 | 优先级 |
|---|------|------|---------|--------|
| 2.1 | Agent 注册 API | Backend | `POST /register` 返回 agent_id + api_key + claim_url | P0 |
| 2.2 | Claim 认领流程 | Backend | 邮箱验证 + 24h 过期回收 + IP 级限速 | P0 |
| 2.3 | Agent WS 鉴权 + 心跳 | Gateway | API Key 验证 + 60s 心跳 + 断线重连退避 | P0 |
| 2.4 | SDK 骨架 `@qrclaw/agent-sdk` | SDK | npm init + 注册 + 建连 + 心跳基本功能 | P0 |
| 2.5 | Auth 页面（注册/登录） | Frontend | 📐 视觉稿：[待提供] — Supabase Auth 对接 | P0 |
| 2.6 | 前后端通信层搭建 | Frontend | Supabase 直连 + Gateway fetch/WS 客户端封装 | P0 |

#### Sprint 3 (Week 5-6): QRCode + 对话核心

**目标**: Visitor 扫码全链路对话成功（核心里程碑）

| # | 任务 | Team | 验收标准 | 优先级 |
|---|------|------|---------|--------|
| 3.1 | QRCode CRUD Edge Function | Backend | 创建/编辑/暂停/归档，config_version 自增 | P0 |
| 3.2 | QR 码生成 + Profile 页面 | Frontend | 📐 视觉稿：[待提供] — 扫码可达 Profile 页 | P0 |
| 3.3 | Visitor Session 分配 | Gateway | `POST /visitor/session` 匿名 + JWT 两种模式 | P0 |
| 3.4 | 消息路由管线（Visitor↔Gateway↔Agent） | Gateway | 全链路消息转发 + ACK 返回 | P0 |
| 3.5 | 消息加密存储（信封加密） | Backend | `store_encrypted_message()` KEK→DEK→Data | P0 |
| 3.6 | 流式输出 `reply_chunk` | Gateway | StreamBuffer 拼接 + 实时转发 + 超时/断连保护 | P0 |
| 3.7 | Chat 界面 | Frontend | 📐 视觉稿：[待提供] — 消息收发 + 流式显示 | P0 |
| 3.8 | Security Envelope 注入 | Gateway | 每条消息自动注入 security_envelope | P0 |
| 3.9 | 渐进降级（WS → SSE → HTTP Poll） | Gateway | 微信浏览器 SSE 回退正常 | P1 |
| 3.10 | SDK 消息收发 | SDK | send/receive + security_envelope 解析 | P0 |
| 3.11 | 消息幂等去重 | Gateway | Redis SET NX，300s TTL | P0 |

#### Sprint 4 (Week 7-8): Dashboard + 管理

**目标**: Owner 完整管理后台可用

| # | 任务 | Team | 验收标准 | 优先级 |
|---|------|------|---------|--------|
| 4.1 | Dashboard 三栏布局 | Frontend | 📐 视觉稿：[待提供] — 左/中/右三栏响应式 | P0 |
| 4.2 | Messages 视图 | Frontend | 📐 视觉稿：[待提供] — 对话列表 + 聊天界面 | P0 |
| 4.3 | My QRCode 视图 | Frontend | 📐 视觉稿：[待提供] — QR 列表 + 详情 + 2×2 统计 | P0 |
| 4.4 | 添加 QR Code 弹窗 | Frontend | 📐 视觉稿：[待提供] — 表单 + 左右分屏预览 | P0 |
| 4.5 | 桌面端设备分流 | Frontend + Gateway | UA 检测 + 注册弹窗 + JWT→Session Token | P0 |
| 4.6 | 跨设备同步（Silent Merge） | Gateway + Backend | 匿名→登录静默合并历史 | P1 |
| 4.7 | 三级限流 | Gateway | Per-session 10/min + Per-QRCode 100/min + Per-Agent 500/min | P1 |
| 4.8 | Privacy Shield 组件 | Frontend | 跨设备空状态隐私提示 | P1 |
| 4.9 | Conversation 生命周期 | Gateway | 24h 超时新建 + Visitor 显式新开 | P0 |
| 4.10 | 三层破冰 | Frontend + Gateway | suggested_questions + 本地提示 + visitor_joined 事件 | P1 |

#### Sprint 5 (Week 9-10): Landing + 打磨 + GA

**目标**: GA 发布 🚀

| # | 任务 | Team | 验收标准 | 优先级 |
|---|------|------|---------|--------|
| 5.1 | Landing Page | Frontend | 📐 视觉稿：[待提供] — Hero + Connect Agent + Features | P0 |
| 5.2 | **skill.md 完整接入文档**（核心交付物） | SDK | 4 Level 分级指南 + Copy-Paste-Ready 示例 + 错误自愈表，参考 EvoMap 模式 | P0 |
| 5.3 | SDK v0.1.0 npm 发布 | SDK | `npm install @qrclaw/agent-sdk` 可用 | P0 |
| 5.4 | 官方客服 Agent Dogfooding | All | 首页 QRCode 可对话 | P0 |
| 5.5 | 容灾配置 | Gateway | 快照 + 云监控告警 + UptimeRobot + 15min Runbook | P1 |
| 5.6 | E2E 测试（5 条关键路径） | QA | Playwright 全通过 | P0 |
| 5.7 | 负载测试 | QA | 1000 并发 WS，P95 < 200ms | P1 |
| 5.8 | 安全审计 | QA | OWASP ZAP 零高危漏洞 | P0 |
| 5.9 | Free 配额限制上线 | Backend + Gateway | 1 Agent / 5 QR / 1000 msg/mo / 60 天清理 | P0 |
| 5.10 | GA 部署 + 发布 | All | 🚀 全链路可用 | P0 |

### 12.3 测试策略

| 层级 | 工具 | 目标 |
|------|------|------|
| 单元测试 | Vitest | ≥85% 覆盖率 |
| 集成测试 | Vitest + MSW | 核心路径 100% |
| E2E 测试 | Playwright | 5 条关键用户旅程 |
| 负载测试 | k6 | 1000 并发 WS，P95 < 200ms |
| 安全审计 | OWASP ZAP | 零高危漏洞 |

### 12.4 E2E 关键用户旅程

| # | 旅程 | 验证点 |
|---|------|--------|
| E1 | Agent 注册 → Claim → WS 建连 | agent_id 有效 + WS 连通 |
| E2 | 移动端扫码 → Profile → Chat → 收到回复 | 全链路 < 3s |
| E3 | 桌面端注册 → 登录 → 扫码对话 | JWT→Session Token 正常 |
| E4 | 跨设备：手机匿名聊 → 电脑登录看到历史 | Silent Merge 成功 |
| E5 | Owner Dashboard → 创建 QRCode → 分享 → Visitor 使用 | CRUD + 扫码全流程 |



---

## 十四、V2 交付清单

## 十三、V2 交付清单

### Must Have（GA 前必须完成）

| # | 功能 | 验收标准 |
|---|------|---------|
| 1 | Owner 注册/登录 | Supabase Auth 邮箱+密码+验证码，JWT httpOnly Cookie |
| 2 | Agent 注册 API | skill.md 驱动，返回 agent_id + api_key + claim_url |
| 3 | Claim 认领流程 | 邮箱验证，24h 过期回收，IP 级限速 |
| 4 | WebSocket 连接 | Agent 建连 + 鉴权 + 心跳(60s) + 断线重连 |
| 5 | Portal CRUD | 创建/编辑/暂停/归档，含完整配置字段，config_version 自增 |
| 6 | QR 码生成 | 自动生成 + Profile 页面 |
| 7 | Visitor 对话 | 扫码→Profile→Chat，渐进降级连接 |
| 8 | 消息路由 | Visitor↔Gateway↔Agent 全链路，security_envelope 注入 |
| 9 | 消息幂等 | Redis hash 去重，300s TTL |
| 10 | 离线/超额处理 | Owner 配置静态文案 |
| 11 | 基础配额 | Free: 1 Agent / 5 QR / 消息保存 60 天 |
| 12 | skill.md | 完整接入文档，含 4 个 Level |
| 13 | TypeScript SDK | `@qrclaw/agent-sdk` v0.1.0，4 项能力 |
| 14 | Landing Page | Hero + Connect Your Agent + Features + 客服 Agent Dogfooding |
| 15 | 匿名 Session 绑定 | 静默合并 + 幂等 + 冲突 409 |
| 16 | Conversation 生命周期 | 24h 超时新开 + Visitor 显式新开 |
| 17 | 三层破冰 | suggested_questions + 本地提示 + visitor_joined 事件 |
| 18 | 三级限流 | Per-session 10/min + Per-portal 100/min + Per-agent 500/min |
| 19 | Privacy Shield | 跨设备空状态隐私组件 |
| 20 | Portal 统一三态 | active/paused/revoked，状态转换规则 |

### Should Have（GA 后尽快补齐）

| # | 功能 |
|---|------|
| 21 | Web Dashboard 三栏式 |
| 22 | Dashboard 创建 QR |
| 23 | 客服 Agent Dogfooding |
| 24 | QR 码自定义样式 |
| 25 | API Key 轮换 |
| 26 | 隐私告知页面 |
| 27 | processing_status 事件 |
| 28 | **Stripe 付费系统** | Checkout Sessions + Customer Portal + Webhook (完整 handler) + Dynamic Payment Methods + Go-Live 清单 |
| 29 | **Agent 皮肤系统** | 通用皮肤 + 精美皮肤（Pro/Max），含表情反馈 |

### Won't Have in V1

- E2E 消息加密
- 自定义域名
- Agent 间互联
- ~~多语言~~（V2 已支持 en + zh，详见 §6E）
- Python / Go SDK
- Webhook 接入方式
- GitHub OAuth / Google OAuth
- ~~流式输出~~（已实现，含持久化方案）
- Agent 下发 close_conversation
- Owner 可配置超时时长
- 后端 Session Detach

---



### 补充交付项

| 类别 | 交付物 |
|------|--------|
| 数据埋点 | 前端全量埋点（~130+ 事件）+ 后端指标采集脚本 |
| 运营分析 | 日报/周报/月报自动生成脚本 + 异常检测 + 健康度评估 |
| 设计还原 | Mobile 21 screens + Web 18 screens（设计稿 1:1 还原） |
| QRCode 创建 | 双路径（Agent 对话式 + Dashboard 4 步向导） |
| Claim 流程 | 2 个独立页面（未登录/已登录）|
| QR 样式 | 3 种样式（Standard / Dark / Minimal）|
| 模板系统 | 4 个预设模板（Customer Service / Data Analyst / Email Assistant / Custom）|

---

## 十四、关键风险与缓解

| 风险 | 缓解 |
|------|------|
| Agent 离线率高 | offline_message + fallback_url |
| WS 百万连接成本 | V1 验证模式，阶段扩展 |
| Owner 配置门槛 | 三条接入路径（SDK + Skill.md + Dashboard GUI） |
| 恶意内容 | 用户协议 + 举报 + Owner 责任制 |
| 微信浏览器兼容 | 渐进降级（SSE → HTTP 轮询） |
| Security Envelope 被 Agent 忽略 | SDK 强制 + 文档免责 |
| Session 合并数据不一致 | 幂等 + 事务 + 冲突检测 |

---



---

## 十五、里程碑与成功指标

## 十五、成功指标

| 指标 | V1 目标 |
|------|---------|
| Agent 注册数 | ≥50 |
| Portal 创建数 | ≥200 |
| 扫码→对话转化率 | ≥60% |
| 消息端到端延迟 P95 | < 500ms |
| WS 握手成功率 | ≥99% |
| 渐进降级覆盖率 | 100%（所有浏览器可用） |
| 系统可用性 | ≥99.5% |

---

---

> **V2.6 开发基线版** — 由 AI Agent Team 协同产出
> - 产品方案：`requirements/product-plan-v2.6.md`（本文档）
> - 数据库 Schema：`requirements/database-schema-v2.md`
> - V2.5 存档（含完整 Stripe 实现代码）：`requirements/product-plan-v2.md`
> - 视觉稿：[待 zimzheng 提供]


---

## 附录

### A. 设计参考图索引

| 页面 | 文件路径 | 设计稿 ID |
|------|---------|----------|
| Agent Profile (Mobile) | `design/mobile-profile.png` | e1DDM |
| Chat (Mobile) | `design/mobile-chat.png` | IgH0g |
| Messages (Mobile) | `design/mobile-messages.png` | Qxtxk |
| Me (Mobile) | `design/mobile-me-owner.png` | 5poPN |
| QR Card (Mobile) | `design/mobile-qr-card.png` | eZDQG |
| My QR Codes (Mobile) | `design/mobile-my-portals.png` | X2xHg |
| QR Detail (Mobile) | `design/mobile-portal-detail.png` | eZDQG |
| Error 404 (Mobile) | `design/mobile-error-404.png` | k0nbt |
| Landing Page (Web) | `design/web-landing.png` | tD9CD |
| Sign Up (Web) | `design/web-signup.png` | S3TMu |
| Dashboard Messages (Web) | `design/web-dashboard-messages.png` | FCW4Y |
| Dashboard QR Code (Web) | `design/web-dashboard-qrcode.png` | kVN50 |
| Dashboard Empty (Web) | `design/web-dashboard-empty.png` | s4lvD |
| Add QR Code (Web) | `design/web-add-qrcode.png` | CHIA7 |
| Architecture Diagrams | `diagrams/product-architecture.png` | — |
| Message Flow | `diagrams/message-flow.png` | — |
| Agent Onboarding | `diagrams/agent-onboarding.png` | — |

### B. 屏幕清单汇总（39 screens）

#### Mobile（21 screens）

| 流程 | 屏幕 | 设计稿 ID |
|------|------|----------|
| M1 扫码入口 | Agent Profile / Profile Paused / 404 Page | e1DDM / sJcOR / k0nbt |
| M2 聊天核心 | Chat / Streaming / No Reply / Offline | IgH0g / K6mbw / 9KYND / J6l3h |
| M3 聊天交互 | Long Press Copy / Scan QR | nNVxR / RXEpt |
| M4 注册登录 | Login / Sign Up / Email Verify | 9nzBk / rgesk / 1QsK7 |
| M5 注册后主页 | Messages (New) / Messages / Me | j8P8r / Qxtxk / 5poPN |
| M6 QR 管理 | My QR Codes / Detail / Swipe Delete / Empty | X2xHg / eZDQG / sPwFf / 7X6Kn |
| M7 扫码引导 | Agent Guide | DFoBo |

#### Web（18 screens）

| 流程 | 屏幕 | 设计稿 ID |
|------|------|----------|
| W1 Landing | Landing Page / Docs Page | tD9CD / aiwB4 |
| W2 注册 | Sign Up / Email Verify / Welcome / QR Empty | S3TMu / JMDpZ / 18eSq / s4lvD |
| W3 Claim | Claim 未登录 / Claim 已登录 | c2cAy / r2OZD |
| W4 Dashboard | Messages / Streaming / Support | FCW4Y / mcCu7 / 18eSq |
| W5 创建 QR | Step 0-3 / Dashboard QR | 78jbg / 2HULu / CHIA7 / j4R85 / kVN50 |
| W6 编辑设置 | Edit QR / Settings / Pricing | thA1i / ntmk5 / UZFlP |
| W7 文档样式 | Docs / QR Styles | aiwB4 / FBcJn |

### C. 更新记录

| 日期 | 版本 | 内容 |
|------|------|------|
| 2026-03-11 | V3.0 | 从 V2.6 重构为独立产品需求文档。融合设计团队交互设计稿（v2.2, 39 screens）。新增数据埋点与运营分析章节。QRCode 创建双路径。QRCode 状态更新为 4 态。Auth 更新为 6 位验证码。 |
| 2026-03-09 | V2.6 | 开发基线版（合并文档） |

---

> **交叉引用**: 系统架构、数据库 Schema、API 合约、安全机制、部署架构等技术内容详见《QRClaw 技术方案文档 V3.0》(`technical-specification.md`)
