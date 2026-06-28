# QRClaw 项目开发计划

> **用途**: 提供给 Agent Teams (Team Lead) 的完整开发执行计划
> **更新日期**: 2026-03-12
> **执行方式**: 4 个 Teammate 并行（前端 + 后端 + 数据库 + 测试）
> **模型**: 全员 Opus 4.6 (`claude-opus-4-6`)
> **ECC 版本**: v1.8.0
> **预计周期**: 8-10 天

---

## 一、项目结构规划

开发启动时，先创建以下目录结构：

```
qrclaw/
├── web/                          # 前端（Next.js 15 App Router）
│   ├── src/
│   │   ├── app/                  # App Router 页面
│   │   │   ├── (auth)/           # Auth 路由组
│   │   │   │   ├── login/
│   │   │   │   ├── signup/
│   │   │   │   └── verify/
│   │   │   ├── (dashboard)/      # Dashboard 路由组（需认证）
│   │   │   │   ├── messages/
│   │   │   │   ├── qrcodes/
│   │   │   │   └── settings/
│   │   │   ├── chat/[agentId]/   # Visitor Chat（公开）
│   │   │   ├── claim/[token]/    # Claim Agent（公开）
│   │   │   └── layout.tsx
│   │   ├── components/           # 可复用组件
│   │   │   ├── ui/               # 基础 UI 组件（Button, Input, Avatar...）
│   │   │   ├── chat/             # 聊天相关组件
│   │   │   ├── dashboard/        # Dashboard 组件
│   │   │   └── layout/           # 布局组件（TopBar, TabBar, Sidebar）
│   │   ├── lib/                  # 工具库
│   │   │   ├── supabase/         # Supabase 客户端
│   │   │   ├── ws/               # WebSocket 客户端
│   │   │   └── utils/
│   │   ├── hooks/                # React Hooks
│   │   ├── stores/               # 状态管理（Zustand）
│   │   └── types/                # TypeScript 类型
│   ├── public/
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── package.json
│
├── gateway/                      # 后端 Gateway（Node.js + ws）
│   ├── src/
│   │   ├── server.ts             # 入口
│   │   ├── ws/                   # WebSocket 处理
│   │   │   ├── handler.ts
│   │   │   ├── auth.ts           # Ticket 验证
│   │   │   └── router.ts         # 消息路由
│   │   ├── crypto/               # 加密模块
│   │   │   ├── envelope.ts       # AES-256-GCM 信封加密
│   │   │   └── key-manager.ts    # DEK 管理
│   │   ├── redis/                # Redis 连接
│   │   │   ├── client.ts
│   │   │   ├── dedup.ts          # 消息去重
│   │   │   └── rate-limiter.ts   # 限流
│   │   ├── routes/               # HTTP 路由（health check 等）
│   │   ├── middleware/           # 中间件
│   │   └── types/
│   ├── ecosystem.config.js       # PM2 配置
│   └── package.json
│
├── supabase/                     # 数据库
│   ├── migrations/               # SQL 迁移文件
│   ├── functions/                # Edge Functions
│   │   ├── get-decrypted-messages/
│   │   ├── create-qrcode/
│   │   ├── agent-ws-ticket/
│   │   └── visitor-ws-ticket/
│   └── config.toml
│
├── tests/                        # 测试
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
│
├── requirements/                 # 需求和技术文档
├── design/                       # 设计资源
│   ├── frontend-dev-guide.md     # 前端开发指南
│   ├── design-tokens.css         # 设计令牌
│   ├── qrclaw-interaction-design.md  # 交互设计文档
│   └── layer/                    # 页面截图（PNG）
└── .claude/                      # ECC 配置
    ├── agents/                   # 17 个 ECC Agent
    ├── commands/                 # 43 个斜杠命令
    ├── rules/                    # 24 条规则
    ├── skills/                   # 25 个 Skill
    ├── hooks/                    # 自动化钩子
    ├── contexts/                 # 上下文定义
    ├── progress/                 # Teammate 进度文件（容错恢复用）
    │   ├── frontend-notes.md
    │   ├── backend-notes.md
    │   ├── database-notes.md
    │   └── test-notes.md
    └── settings.json             # 模型: claude-opus-4-6
```

**关键文件隔离原则（避免 Git 冲突）**:
- 前端 Teammate → 只修改 `web/` 目录
- 后端 Teammate → 只修改 `gateway/` 目录
- 数据库 Teammate → 只修改 `supabase/` 目录
- 测试 Teammate → 只修改 `tests/` 目录
- 共享类型 → `web/src/types/` 由前端维护，后端通过协议文档对齐

---

## 二、开发阶段

### Phase 0: 项目初始化（Day 1 上午）

**全员**同时执行，无依赖：

| Teammate | 任务 | 参考文档 |
|----------|------|---------|
| 数据库 | 创建 Supabase Schema（全部 8 张表 + RLS） | 技术方案 §11 |
| 前端 | `npx create-next-app web` + 导入 design-tokens.css + 实现 8 个基础组件 | `design/frontend-dev-guide.md` 第二章 |
| 后端 | 初始化 `gateway/` Node.js 项目 + TypeScript + ws 库 + PM2 配置 | 技术方案 §2-§4 |
| 测试 | 搭建测试框架（Vitest + Playwright） + 测试目录结构 + CI 配置 | 测试策略 §T1 |

**Phase 0 交付物**:
- [ ] 数据库: 8 张表全部 created with RLS
- [ ] 前端: Next.js 项目可运行 + 8 个 UI 组件
- [ ] 后端: Gateway 项目可启动 + health check endpoint
- [ ] 测试: 测试框架可运行 + 示例测试通过

---

### Phase 1: 认证系统（Day 1 下午 - Day 2）

**前置依赖**: Phase 0 完成

| Teammate | 任务 | 参考文档 |
|----------|------|---------|
| 数据库 | Edge Function: `visitor-ws-ticket`、`agent-ws-ticket` | 补充协议 §P2 |
| 前端 | 实现 Auth 页面（Login, SignUp, Verify） + Supabase Auth 集成 | PRD §6.4 + 设计截图 `Mobile-Login.png` 等 |
| 后端 | 实现 WS Ticket 验证 + JWT Bearer 认证中间件 | 技术方案 §15 + 补充协议 §P2 |
| 测试 | Auth 单元测试（ticket-verifier, session-validator） | 测试策略 §T2-T3 |

**Phase 1 交付物**:
- [ ] Owner 可以注册/登录/邮件验证
- [ ] Visitor 可以获取匿名 Session Token
- [ ] WS Ticket 签发和验证通过
- [ ] Auth 测试覆盖率 ≥ 80%

---

### Phase 2: 消息核心（Day 3 - Day 4）

**前置依赖**: Phase 1 完成

| Teammate | 任务 | 参考文档 |
|----------|------|---------|
| 数据库 | Edge Function: `get-decrypted-messages`（Owner 解密代理） + 消息留存策略 | 补充协议 §P7 |
| 前端 | 实现 Visitor Chat 页面（消息气泡、输入栏、流式显示） | PRD §6.2-6.3 + 设计截图 `Mobile-Chat*.png` |
| 后端 | 实现 WebSocket 消息路由管线（Visitor→Agent、Agent→Visitor） + 流式输出 + Redis 去重 | 技术方案 §5-§7 + 补充协议 §P1 |
| 测试 | WebSocket 集成测试（连接、消息路由、流式输出、断线重连） | 测试策略 §T4-T5 |

**Phase 2 交付物**:
- [ ] Visitor 可以通过 WebSocket 与 Agent 实时聊天
- [ ] Agent 的流式输出可以逐字显示
- [ ] 消息经 AES-256-GCM 加密存储
- [ ] 断线后自动重连 + 消息不丢失
- [ ] 消息路由测试覆盖率 ≥ 80%

---

### Phase 3: QR Code 管理（Day 5 - Day 6）

**前置依赖**: Phase 1 完成（认证系统）

可与 Phase 2 **并行**执行（QR 管理不依赖消息系统）。

| Teammate | 任务 | 参考文档 |
|----------|------|---------|
| 数据库 | Edge Function: `create-qrcode`、QR Code 状态管理、Agent Claim 绑定 | 技术方案 §12 + PRD §4 |
| 前端 | 实现 Web Dashboard（Messages列表、QR Code 管理、创建向导 4 步、设置页） | PRD §7 + 设计截图 `Web-Dashboard*.png`、`Web-CreateQR*.png` |
| 后端 | 实现 Agent 接入流程（skill.md 自动注册、Claim 绑定 API） | 技术方案 §17 + PRD §4.1-4.2 |
| 测试 | QR Code CRUD 测试 + Claim 流程 E2E 测试 | 测试策略 §T6 |

**Phase 3 交付物**:
- [ ] Owner 可以创建/编辑/暂停/删除 QR Code
- [ ] Agent 可以通过 skill.md 自动注册并请求 Claim
- [ ] Owner 可以在 Dashboard 确认 Claim
- [ ] QR Code 创建向导完整可用

---

### Phase 4: Mobile 端补齐（Day 6 - Day 7）

**前置依赖**: Phase 2（消息系统）+ Phase 3（QR 管理）

| Teammate | 任务 | 参考文档 |
|----------|------|---------|
| 前端 | 实现剩余 Mobile 页面：Profile、Messages 列表、Me、MyQRCodes、ScanQR、404 | PRD §6 + 所有 `Mobile-*.png` 截图 |
| 后端 | 实现 Agent 在线状态检测 + 离线消息推送 | 技术方案 §4.3 + §6 |
| 测试 | Mobile 页面 E2E 测试（Playwright mobile viewport） | 测试策略 §T7 |

**Phase 4 交付物**:
- [ ] Mobile 全部 20 个页面实现完成
- [ ] Agent 离线时显示离线提示 + 消息队列
- [ ] Mobile E2E 测试通过

---

### Phase 5: Web 端补齐（Day 7 - Day 8）

**前置依赖**: Phase 3（Dashboard 骨架）

| Teammate | 任务 | 参考文档 |
|----------|------|---------|
| 前端 | 实现剩余 Web 页面：Landing Page、Pricing、Docs、SignUp 双栏、Claim 页面 | PRD §7 + 所有 `Web-*.png` 截图 |
| 后端 | Landing Page SEO 优化 + i18n 基础框架 | 技术方案 §16 |
| 数据库 | 数据留存策略实现 + 用量统计 Edge Function | 技术方案 §11.4 |
| 测试 | Web 页面 E2E 测试 + 跨浏览器测试 | 测试策略 §T7-T8 |

**Phase 5 交付物**:
- [ ] Web 全部 18 个页面实现完成
- [ ] Landing Page SEO 友好
- [ ] Web E2E 测试通过

---

### Phase 6: 安全加固 + 集成测试（Day 8 - Day 9）

**全员参与**：

| Teammate | 任务 | 参考文档 |
|----------|------|---------|
| 前端 | XSS 防护、CSP 配置、敏感数据脱敏 | 技术方案 §10 |
| 后端 | 三级限流实现、OWASP Top 10 加固、Security Envelope | 技术方案 §10.2-10.6 |
| 数据库 | RLS 策略审查、encryption_keys 安全加固 | 技术方案 §10.5-10.6 |
| 测试 | 安全测试（注入、XSS、认证绕过）+ 全链路集成测试 | 测试策略 §T8 |

**Phase 6 交付物**:
- [ ] OWASP Top 10 全部通过
- [ ] 全链路集成测试通过（注册→创建QR→扫码→聊天→回复）
- [ ] 测试覆盖率 ≥ 80%

---

### Phase 7: 部署上线（Day 9 - Day 10）

| Teammate | 任务 | 参考文档 |
|----------|------|---------|
| 前端 | Vercel 部署配置 + 环境变量 + CDN 优化 | 技术方案 §14 |
| 后端 | 腾讯云 CVM 部署 + Nginx + SSL + PM2 | 技术方案 §14.3 |
| 数据库 | 生产环境迁移 + 数据备份策略 | 技术方案 §9 |
| 测试 | 生产环境冒烟测试 | — |

---

## 三、Teammate 配置（ECC 标准）

> 所有 Teammate 统一使用 **Opus 4.6** (`claude-opus-4-6`)。
> 每个 Teammate 自动继承 `CLAUDE.md` + `.claude/rules/` 中的全部 ECC 规则。
> ECC v1.8.0 提供 **17 个 Agent**，按角色分配给 Lead 和 Teammate。

### ECC Agent 完整清单与分配

| ECC Agent | 角色说明 | 分配给 |
|-----------|---------|--------|
| **architect** | 系统架构设计、技术决策、可扩展性评估 | **Team Lead**（Phase 0 架构设计） |
| **planner** | 任务规划、拆解步骤、依赖分析 | **Team Lead**（每个 Phase 开始时规划） |
| **chief-of-staff** | 多渠道沟通分诊、任务优先级 | **Team Lead**（协调 Teammate 间沟通） |
| **harness-optimizer** | Agent 配置优化、成本与吞吐分析 | **Team Lead**（监控团队效率） |
| **loop-operator** | 自主循环执行、停滞检测与干预 | **Team Lead**（长任务监控） |
| **tdd-guide** | TDD 流程（Red→Green→Refactor）、80%+ 覆盖率 | **frontend / backend / test** |
| **code-reviewer** | 代码质量、安全、可维护性审查 | **全员**（每次代码变更后） |
| **security-reviewer** | OWASP Top 10、密钥检测、注入防护 | **backend / database** |
| **database-reviewer** | PostgreSQL 优化、Schema 设计、RLS 审查 | **database** |
| **e2e-runner** | Playwright E2E 测试生成与执行 | **test** |
| **build-error-resolver** | 构建/TypeScript 错误快速修复 | **全员**（构建失败时自动触发） |
| **refactor-cleaner** | 死代码清理、重复代码合并 | **全员**（Phase 6 重构阶段） |
| **doc-updater** | 文档同步、README/CODEMAP 更新 | **Team Lead**（Phase 7 部署前） |
| go-reviewer | Go 代码审查 | *本项目不使用* |
| go-build-resolver | Go 构建错误修复 | *本项目不使用* |
| kotlin-reviewer | Kotlin/Android 代码审查 | *本项目不使用* |
| python-reviewer | Python 代码审查 | *本项目不使用* |

### 编排工作流

```
Team Lead 使用 /orchestrate 管理每个 Feature:

  architect → planner → [分配给 Teammate] → tdd-guide → code-reviewer → security-reviewer
       ↑                                                                       │
       └───────── 如有架构问题，反馈给 architect 重新评估 ──────────────────────────┘

构建失败时: build-error-resolver 自动介入
Phase 6:    refactor-cleaner 清理全项目死代码
Phase 7:    doc-updater 生成最终文档
```

---

### 前端 Teammate（frontend）

```yaml
名称: frontend
模型: claude-opus-4-6
职责: Next.js 15 前端开发（Owner Dashboard + Visitor Chat + Landing Page）
文件范围: web/
ECC Agent:
  开发: tdd-guide
  审查: code-reviewer
  构建修复: build-error-resolver
  重构: refactor-cleaner（Phase 6）
必读文档:
  - CLAUDE.md（自动加载，语义路由器）
  - design/frontend-dev-guide.md（组件规格、布局模式）
  - design/design-tokens.css（CSS 变量，禁止硬编码）
  - design/qrclaw-interaction-design.md（交互行为）
  - requirements/product-requirements.md §6-§8（页面需求）
ECC 技能:
  - .claude/skills/pencil-to-code/（设计稿还原，强制遵循）
  - .claude/skills/frontend-patterns/（React/Next.js 模式）
  - .claude/skills/tdd-workflow/（先写测试）
  - .claude/skills/verification-loop/（自验证循环）
ECC 工作流:
  1. 阅读 design/layer/<PageName>.png 截图作为视觉基准
  2. 按 pencil-to-code 流程还原 UI
  3. 遵循 /tdd 命令（Red → Green → Refactor）
  4. 完成后触发 code-reviewer 审查
  5. 构建失败时使用 /build-fix（build-error-resolver）
规则:
  - 严格像素级还原设计截图
  - 使用 design-tokens.css 变量，禁止硬编码颜色/字体
  - 先实现 8 个基础组件，再组装页面
  - 图标统一使用 lucide-react
```

### 后端 Teammate（backend）

```yaml
名称: backend
模型: claude-opus-4-6
职责: Node.js Gateway 开发（WebSocket 消息路由 + 加密 + Redis）
文件范围: gateway/
ECC Agent:
  开发: tdd-guide
  审查: code-reviewer + security-reviewer
  构建修复: build-error-resolver
  重构: refactor-cleaner（Phase 6）
必读文档:
  - CLAUDE.md（自动加载，语义路由器）
  - requirements/technical-specification-v3.0.3-combined.md §2-§10, §15
  - requirements/technical-specification-supplement-protocol.md（WebSocket 帧格式）
ECC 技能:
  - .claude/skills/backend-patterns/（API、缓存、服务模式）
  - .claude/skills/api-design/（REST API 设计）
  - .claude/skills/tdd-workflow/（先写测试）
  - .claude/skills/security-review/（安全清单）
  - .claude/skills/docker-patterns/（容器化部署）
ECC 工作流:
  1. 阅读补充协议 §P1-P7 确认接口规范
  2. 遵循 /tdd 命令开发每个模块
  3. 完成后触发 code-reviewer + security-reviewer 双重审查
  4. 构建失败时使用 /build-fix
规则:
  - Gateway 只负责消息路由，不处理 AI 推理（铁律 C1）
  - 消息内容使用 AES-256-GCM 信封加密
  - WebSocket 协议严格按 §P1 的 JSON Schema
  - 使用 PM2 进程管理
```

### 数据库 Teammate（database）

```yaml
名称: database
模型: claude-opus-4-6
职责: Supabase Schema + RLS + Edge Functions
文件范围: supabase/
ECC Agent:
  审查: database-reviewer + security-reviewer
  构建修复: build-error-resolver
必读文档:
  - CLAUDE.md（自动加载，语义路由器）
  - requirements/technical-specification-v3.0.3-combined.md §11
  - requirements/technical-specification-supplement-protocol.md §P7
ECC 技能:
  - .claude/skills/postgres-patterns/（PostgreSQL 优化）
  - .claude/skills/database-migrations/（迁移模式）
  - .claude/skills/security-review/（加密密钥安全）
ECC 工作流:
  1. 阅读技术方案 §11 确认 Schema 设计
  2. 创建迁移文件 → RLS 策略 → Edge Functions
  3. 完成后触发 database-reviewer + security-reviewer 双重审查
规则:
  - 所有表必须启用 RLS
  - 迁移文件命名: YYYYMMDD_description.sql
  - Edge Functions 使用 Deno/TypeScript
  - 加密密钥存储在 encryption_keys 表
```

### 测试 Teammate（test）

```yaml
名称: test
模型: claude-opus-4-6
职责: 单元测试 + 集成测试 + E2E 测试
文件范围: tests/
ECC Agent:
  开发: tdd-guide
  E2E: e2e-runner
  审查: code-reviewer
必读文档:
  - CLAUDE.md（自动加载，语义路由器）
  - requirements/technical-specification-supplement-testing.md
ECC 技能:
  - .claude/skills/tdd-workflow/（TDD 方法论）
  - .claude/skills/e2e-testing/（Playwright E2E 模式）
  - .claude/skills/eval-harness/（验证评估）
  - .claude/skills/verification-loop/（持续验证）
  - .claude/skills/autonomous-loops/（自主循环测试）
ECC 工作流:
  1. 阅读测试策略文档确认覆盖率目标
  2. 按 /tdd 流程编写测试（Red → Green → Refactor）
  3. 用 /e2e 生成关键路径 E2E 测试（e2e-runner）
  4. 用 /verify 运行验证循环
  5. 用 /test-coverage 检查覆盖率门禁
规则:
  - 覆盖率目标: ≥ 80% branches + functions + lines
  - 框架: Vitest (Unit/Integration) + Playwright (E2E) + Supertest (HTTP)
  - TDD 流程: 先写测试 → 实现 → 重构
  - 关键路径 E2E 必须通过
```

---

## 四、跨 Teammate 协作点

### 关键接口约定

| 接口 | 生产方 | 消费方 | 参考 |
|------|--------|--------|------|
| WebSocket 消息帧格式 | 后端 | 前端 | 补充协议 §P1 |
| WS Ticket API | 数据库 (Edge Func) | 前端 + 后端 | 补充协议 §P2 |
| QR Code CRUD API | 数据库 (Edge Func) | 前端 | 补充协议 §P4 |
| 解密消息 API | 数据库 (Edge Func) | 前端 | 补充协议 §P7 |
| TypeScript 类型 | 前端 (`web/src/types/`) | 全员参考 | — |

### 同步检查点

| 时机 | 事件 | 参与方 |
|------|------|--------|
| Phase 0 结束 | Schema 完成 → 通知前端和后端 | 数据库 → 全员 |
| Phase 1 结束 | WS Ticket API 完成 → 通知前端对接 | 后端 + 数据库 → 前端 |
| Phase 2 中期 | 消息帧格式确认 → 前端对接 WebSocket | 后端 → 前端 |
| Phase 3 中期 | QR Code API 完成 → 前端对接 Dashboard | 数据库 → 前端 |
| Phase 6 | 全链路集成测试 → 全员修复 | 测试 → 全员 |

---

## 五、Agent Teams 启动

### 启动前置步骤（必须按顺序执行）

```bash
# Step 1: 创建 tmux 会话（分屏模式的前提，不可跳过）
tmux new -s qrclaw

# Step 2: 进入项目目录
cd /Users/zeze/qrclaw

# Step 3: 在 tmux 内启动 Claude CLI
claude-internal

# Step 4: 在 Claude 对话框中粘贴下方的启动 Prompt
```

> **注意**: 必须先 `tmux new` 再启动 Claude，否则 Teammate 不会以分屏窗格显示。

### 启动 Prompt

复制以下内容到 Claude Code 对话中启动开发：

```
读取 requirements/project-plan.md 和 CLAUDE.md，按照 ECC v1.8.0 标准组建 Agent Team 开发 QRClaw。

你是 Team Lead（Opus 4.6），使用以下 ECC Agent 角色：
- architect: 架构设计与技术决策
- planner: 每个 Phase 开始时拆解任务
- chief-of-staff: 协调 Teammate 间沟通
- harness-optimizer: 监控团队效率
- loop-operator: 长任务自主循环监控

按 /orchestrate 工作流编排每个 Feature:
  architect → planner → [分配给 Teammate] → tdd-guide → code-reviewer → security-reviewer

创建 4 个 Teammate（全部 Opus 4.6）：

1. frontend — 前端（web/ 目录）
   先读: design/frontend-dev-guide.md + design/design-tokens.css + .claude/skills/pencil-to-code/SKILL.md
   需求: requirements/product-requirements.md §6-§8
   Agent: tdd-guide → code-reviewer，构建失败用 build-error-resolver

2. backend — 后端 Gateway（gateway/ 目录）
   先读: requirements/technical-specification-v3.0.3-combined.md §2-§10
   协议: requirements/technical-specification-supplement-protocol.md
   Agent: tdd-guide → code-reviewer + security-reviewer 双重审查

3. database — Supabase 数据库（supabase/ 目录）
   先读: requirements/technical-specification-v3.0.3-combined.md §11 + requirements/technical-specification-supplement-protocol.md §P7
   Agent: database-reviewer + security-reviewer 双重审查（不走 tdd-guide）

4. test — 测试工程（tests/ 目录）
   先读: requirements/technical-specification-supplement-testing.md
   Agent: tdd-guide + e2e-runner，/verify 验证循环

=== 容错与持续运行规则 ===

进度文件: 每个 Teammate 启动后立即创建 .claude/progress/<name>-notes.md，按模板记录进度。
每完成一个子任务更新，每次 /compact 前更新，遇到失败必须记录。

持续监控: 作为 Lead 你必须使用 loop-operator 模式:
- /loop-start sequential --mode safe 启动安全模式循环
- /loop-status --watch 持续监控各 Teammate 状态
- 检测停滞: 连续 2 个 checkpoint 无进展 → 暂停 Teammate → 缩小任务范围 → 重试
- 检测重试风暴: 同一错误重复 3 次 → 冻结 → /harness-audit → 诊断后给方向

构建失败 3 级修复链:
  1st: build-error-resolver 自动修复
  2nd: loop-operator 缩小范围重试
  3rd: 冻结 + /harness-audit + 通知我介入

上下文管理:
- CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50 已设置（上下文达 50% 自动压缩）
- 每 50 次工具调用，提醒 Teammate 考虑 /compact
- 每个 Phase 结束强制: 更新 progress notes → git commit → /compact
- 压缩前 PreCompact hook 会自动保存状态

质量门禁（每个子任务必过）:
  /quality-gate → /verify → /eval check <feature> → code-reviewer
  不通过不能进入下一个子任务

恢复能力:
- 如果任何 Teammate 中断，读取 .claude/progress/<name>-notes.md + git log 恢复
- 如果全局中断，按 project-plan.md §6.7 中断恢复流程操作

=== 执行规则 ===

- 从 Phase 0（项目初始化）开始，4 个 Teammate 并行
- 每个 Teammate 自动继承 .claude/rules/ 的全部 ECC 规则
- 默认 Agent 链: architect → planner → tdd-guide → code-reviewer → security-reviewer
  （database Teammate 例外: architect → planner → database-reviewer → security-reviewer）
- 构建失败: 自动使用 build-error-resolver（/build-fix）
- Phase 6: 全员使用 refactor-cleaner 清理死代码
- Phase 7: doc-updater 生成最终文档
- 每个 Phase 完成后 git commit + 向我汇报，确认后进入下一阶段
- 使用 tmux 分屏模式
- 绝不因为单个失败而停止整个团队，使用 loop-operator 隔离故障 Teammate
```

---

## 六、容错与持续运行策略（ECC v1.8.0）

> **目标**: Agent Teams 一旦启动，尽可能不中断。失败自动重试，停滞自动检测，断开可恢复。

### 6.1 ECC Hooks（自动触发，无需人工干预）

项目已配置 `.claude/hooks/hooks.json`，提供以下自动化保护：

| Hook 阶段 | 触发时机 | 保护行为 |
|-----------|---------|---------|
| **SessionStart** | 每次 Teammate 启动/恢复 | 自动加载上次会话上下文 + 检测包管理器 |
| **PreToolUse:Bash** | 执行 shell 命令前 | tmux 提醒（长任务必须在 tmux 中）、git push 审查 |
| **PreToolUse:Edit/Write** | 编辑文件前 | 建议 `/compact`（防止上下文溢出）、文档文件警告 |
| **PostToolUse:Edit** | 编辑文件后 | 自动格式化 + TypeScript 检查 + console.log 警告 |
| **PostToolUse:Edit/Write** | 文件变更后 | 运行 `/quality-gate` 质量检查 |
| **PostToolUse:Bash** | 命令执行后 | 构建分析 + PR 创建日志 |
| **PreCompact** | 上下文压缩前 | 自动保存当前状态到文件系统 |
| **Stop** | 每轮回答结束 | 持久化会话状态 + 提取学习模式 + **成本追踪** |
| **SessionEnd** | 会话结束 | 生命周期标记，便于恢复 |

### 6.2 loop-operator 自主循环监控

Team Lead 使用 `loop-operator` Agent 对每个 Teammate 执行持续监控：

```
loop-operator 工作流:
  1. /loop-start sequential --mode safe
     ├── 启动前: 验证测试通过 + ECC_HOOK_PROFILE 激活 + 显式停止条件
     └── 创建 .claude/plans/ 下的 runbook

  2. 运行中持续检查:
     ├── /loop-status --watch（定期刷新状态）
     ├── 检测停滞: 连续 2 个 checkpoint 无进展 → 暂停 + 缩小范围
     ├── 检测重试风暴: 相同堆栈错误重复 → 冻结循环 + /harness-audit
     ├── 成本漂移: 超出预算窗口 → 告警
     └── 合并冲突: 阻塞队列推进 → 上报

  3. 恢复策略:
     ├── 冻结循环
     ├── 运行 /harness-audit 诊断
     ├── 缩小到失败的单元
     └── 使用明确的验收标准重新执行
```

### 6.3 SHARED_TASK_NOTES.md 跨迭代上下文桥

每个 Teammate 维护一份进度文件，确保中断后可恢复：

```
qrclaw/
├── .claude/
│   └── progress/
│       ├── frontend-notes.md      # 前端进度 + 下一步
│       ├── backend-notes.md       # 后端进度 + 下一步
│       ├── database-notes.md      # 数据库进度 + 下一步
│       └── test-notes.md          # 测试进度 + 下一步
```

**每个 Teammate 在以下时机更新自己的 notes 文件：**
- 每完成一个子任务
- 每个 Phase 结束
- 遇到阻塞/失败时（记录失败上下文）
- 会话压缩前（保存关键状态）

**格式模板：**
```markdown
## Progress
- [x] Phase 0: Next.js 项目初始化 (commit: abc1234)
- [x] Phase 1: Auth 页面 Login/SignUp/Verify (commit: def5678)
- [ ] Phase 2: Visitor Chat 页面（进行中）

## Current Task
实现消息气泡组件 + 流式显示

## Blocked
无

## Next Steps
- 完成输入栏组件
- 对接 WebSocket 客户端

## Failed Attempts
- 尝试用 framer-motion 做流式动画 → 性能差，改用 CSS transition
```

### 6.4 构建失败自动修复链

```
构建/测试失败
    │
    ├── 1st attempt: build-error-resolver 自动修复（/build-fix）
    │   └── 通过? → 继续
    │
    ├── 2nd attempt: 相同错误再次失败
    │   └── loop-operator 检测到重试风暴 → 缩小范围 → 重试
    │
    ├── 3rd attempt: 仍然失败
    │   ├── loop-operator 冻结该 Teammate → /harness-audit 诊断
    │   └── 通知 Team Lead 人工介入
    │
    └── 恢复: Team Lead 审查后，给出修复方向，Teammate 恢复
```

### 6.5 上下文溢出防护

| 机制 | 触发条件 | 行为 |
|------|---------|------|
| **strategic-compact** hook | 工具调用 ≥ 50 次 | 建议 `/compact`，之后每 25 次再提醒 |
| **PreCompact** hook | `/compact` 执行前 | 自动保存当前状态到文件系统 |
| **SHARED_TASK_NOTES** | 每次压缩前 | Teammate 必须更新进度文件 |
| **CLAUDE_AUTOCOMPACT_PCT_OVERRIDE** | 上下文达到阈值 | 自动触发压缩（推荐设为 50%） |
| **Phase 间强制压缩** | 每个 Phase 结束 | `/compact Phase N 完成，进入 Phase N+1` |

### 6.6 质量门禁（每个 Teammate 的验证循环）

```
代码变更
    │
    ├── PostToolUse Hook: 自动格式化 + TypeScript 检查
    │
    ├── /quality-gate: lint + type + format 检查
    │
    ├── /verify: 完整验证（Build → Type → Lint → Test → Security → Diff）
    │   └── 输出 VERIFICATION REPORT
    │   └── READY / NOT READY 判定
    │
    ├── /eval check <feature>: 能力评估 + 回归测试
    │   └── pass@3 ≥ 90% → 通过
    │   └── pass^3 = 100% → 回归测试必须全过
    │
    └── code-reviewer + security-reviewer: Agent 审查
        └── CRITICAL 问题 → 阻塞
        └── HIGH 问题 → 警告
        └── 其他 → 通过
```

### 6.7 中断恢复流程

**场景 A：网络断开 / 终端关闭**

```bash
# 1. 重新启动（必须先进 tmux）
tmux new -s qrclaw
cd /Users/zeze/qrclaw
claude-internal

# 2. 恢复指令（粘贴到 Claude）
请恢复 QRClaw Agent Team 开发。

读取以下文件了解进度:
- .claude/progress/frontend-notes.md
- .claude/progress/backend-notes.md
- .claude/progress/database-notes.md
- .claude/progress/test-notes.md

检查 git log 确认最后提交，从上次停止的位置继续。
重建 4 个 Teammate（全部 Opus 4.6），按 project-plan.md 继续执行。
```

**场景 B：某个 Teammate 停滞**

```
在 Lead 窗口说:
"<Teammate名称> 队友停滞了，请使用 loop-operator 诊断:
1. 读取 .claude/progress/<teammate>-notes.md 了解它的进度
2. 运行 /loop-status 检查状态
3. 如果是重复失败，缩小任务范围重试
4. 如果是上下文溢出，先 /compact 再恢复"
```

**场景 C：全局 context 达到上限**

```
在 Lead 窗口说:
"请执行全局 checkpoint:
1. 让所有 Teammate 更新各自的 progress notes
2. 全员 git commit 当前进度
3. 全员执行 /compact
4. 从 progress notes 恢复继续"
```

---

## 七、风险与缓解

| 风险 | 缓解措施 | ECC 机制 |
|------|---------|---------|
| Git 冲突 | 严格文件隔离（web/ / gateway/ / supabase/ / tests/） | — |
| 上下文溢出 | Phase 间强制 /compact + strategic-compact hook | `strategic-compact` skill + PreToolUse hook |
| 构建失败 | 3 级自动修复链 | `build-error-resolver` + `loop-operator` |
| Teammate 停滞 | 连续 2 checkpoint 无进展自动暂停 | `loop-operator` agent |
| 重试风暴 | 相同错误 3 次冻结 + /harness-audit | `loop-operator` + `/harness-audit` |
| 接口不一致 | 所有 API 严格按补充协议 §P1-P7 | code-reviewer 审查 |
| 测试滞后 | 测试 Teammate 从 Phase 0 开始工作 | `tdd-guide` + `e2e-runner` |
| Token 成本 | 成本追踪 hook + 不需要的 Teammate 及时关闭 | Stop hook: `cost-tracker` |
| 中途断开 | SHARED_TASK_NOTES + git commit + 恢复 Prompt | SessionStart/End hooks |
| 会话状态丢失 | PreCompact hook 自动保存 + 进度文件 | `PreCompact` + `Stop` hooks |
