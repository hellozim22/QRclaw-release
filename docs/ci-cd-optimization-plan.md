# QRClaw CI/CD 优化与演进计划 (对标业界最佳实践)

> 本文档基于对当前项目持续集成 (CI) 与持续部署 (CD) 现状的审查而制定，旨在向业界顶尖工程化团队（如 Claude 等 AI 基础设施团队）的最佳实践靠拢。目标是实现 **Everything as Code**、**Shift-Left Testing (测试左移)**、**Zero-Downtime Deployment** 以及全自动的预览环境。

---

## 一、 当前架构现状与目标差距

### 当前现状
- **CI**: 基础的 Lint、Typecheck 和单元测试，存在重复安装依赖（Monorepo 管理粗糙）的问题，缺失核心的 E2E 测试拦截。
- **CD**: 前端依赖 Vercel 自动部署；后端和数据库高度依赖手工通过 SSH 登录服务器执行操作和 UI 界面操作，存在极高的人为操作风险。

### 业界最佳实践 (Claude/顶尖大厂标准)
1. **测试左移**：PR 阶段拦截 100% 的规范、逻辑、视觉和 E2E 交互问题。
2. **极速构建**：利用智能图谱和远程缓存（如 Turborepo），仅构建与测试改动影响的部分，将构建耗时从分钟级压缩至秒级。
3. **基础设施即代码 (IaC) 与无干预部署**：任何配置变更、数据库迁移均在代码中审查，合并即上线，拒绝手工连机器。
4. **全链路预览环境**：为每个 PR 提供包括前端、独立后端和分支数据库在内的隔离联调环境。

---

## 二、 三阶段演进计划

### 阶段一：补齐核心验证能力 (Quick Wins - 建议本周完成)

本阶段的重点是**提升信心**，确保合并入主分支的代码不会破坏线上核心功能。

**1. E2E 与视觉回归测试拦截**
- **任务**：在 CI 流水线中集成现有的 Playwright 测试集。
- **配置**：
  - 新增 `tests-e2e` Job，依赖 `tests` 和 `web` 的构建。
  - 使用 `mcr.microsoft.com/playwright` 官方镜像确保浏览器依赖一致性。
  - 上传测试失败时的截图和 Trace 文件至 GitHub Artifacts。

**2. Monorepo 构建加速与规范化**
- **任务**：废弃 `working-directory` 的重复 `npm ci` 安装，改用现代 Monorepo 工具（推荐 `pnpm workspaces` 或 `npm workspaces` 配合 `Turborepo`）。
- **收益**：缓存构建结果，只测试和构建改动的包，将 CI 执行时间降低 50% 以上。

**3. 代码规范与安全卡点**
- **任务**：
  - 在 CI 中加入统一的 Prettier 格式化检查 (`npm run format:check`)。
  - 开启 GitHub Dependabot 进行每日依赖漏洞扫描。

---

### 阶段二：打通全自动 CD 与数据库代码化 (核心痛点消除 - 建议下周完成)

本阶段的重点是**消除人为干预**，把所有部署动作交给机器人。

**1. Gateway/Redis 后端自动化部署**
- **任务**：不再允许手工 SSH 登录服务器执行部署。通过 GitHub Actions 在合并到 `main` 分支时自动下发指令。
- **机制**：
  - 监听 `main` 分支的 push 事件。
  - 使用 `appleboy/ssh-action` 连入腾讯云服务器。
  - 自动执行 `cd /opt/qrclaw/gateway && git pull && docker compose up -d --build`。

**2. Supabase 数据库变更自动化 (Migration)**
- **任务**：使用 Supabase CLI 将表结构和权限变更 (RLS) 纳入版本控制，避免通过网页控制台手动点点点。
- **机制**：
  - **CI 阶段 (PR)**: 使用 `supabase db start` 启动本地容器，运行所有 migration 脚本，验证语法合法性。
  - **CD 阶段 (Main)**: 使用 `supabase db push` 将通过审核的 migration 脚本应用到生产数据库。

---

### 阶段三：全自动预览环境与发版管理 (进阶工程化 - 长期规划)

本阶段的重点是**提效与规模化**，让前后端分离的开发体验达到极致。

**1. 全链路 Preview 环境 (Ephemeral Environments)**
- **前端**：继续利用 Vercel Preview Deployments。
- **后端与数据库**：
  - 为每个 PR，利用 Supabase Branching 创建独立的测试数据库。
  - 使用云平台（如 Railway 或轻量云临时容器）为每个 PR 拉起一套独立的 Gateway 后端。
  - 将 Vercel 的预览环境变量指向这些独立的临时后端和数据库，实现 PR 级别的全链路联调，合并后自动销毁。

**2. 语义化发版与 Changelog 生成**
- **任务**：引入 `semantic-release`。
- **机制**：根据 Conventional Commits (如 `feat:`, `fix:`)，自动决定版本号 (SemVer)，生成 Changelog.md，并创建 GitHub Release。

---

## 三、 详细操作指引与执行策略

### 1. 执行策略：由 Claude (AI Assistant) 自动完成代码撰写

本计划的后续所有 CI/CD 流程代码（包含 YAML 脚本、构建配置、部署指令等）**计划交由 Claude（AI 智能助手）自动撰写与提交**。
人类开发者只需确保下述环境变量配置完毕，并对 Claude 提交的 Pull Request 进行 Review 即可，无需人工手写复杂的自动化脚本。

### 2. 人工配置项：环境变量与凭证配置

在实施上述自动化计划前，必须在系统内进行以下一次性手工配置（**已验证完成 ✅**）：

#### [x] 1. 配置 GitHub Actions 自动部署后端的 SSH 凭证
为了让 GitHub Actions 能够自动登录腾讯云服务器，已完成以下配置并由测试流实验通过：
- `DEPLOY_SERVER_IP`：已配置。
- `DEPLOY_SSH_KEY`：已配置。
- `DEPLOY_SSH_USER`：已配置。

#### [x] 2. 配置 Supabase CLI 与自动化环境变量
为了让 GitHub Actions 能操作你的数据库迁移，已完成以下配置并由测试流实验通过：
- `SUPABASE_ACCESS_TOKEN`：已配置。
- `SUPABASE_PROJECT_ID`：已配置。
- `SUPABASE_DB_PASSWORD`：已配置。

#### 3. Vercel 生产环境变量同步
后续所有新增的非敏感环境变量，尽量维护在代码仓库的 `vercel.json` 或配合 Doppler/Infisical 等秘钥管理工具，以减少人为遗漏。

---

## 四、 预期收益总结

- **研发效率**：本地与 CI 构建时间减少 50% 以上；自动生成发版日志，告别人工整理。
- **质量保障**：杜绝 "It works on my machine" 的情况，通过 E2E 和独立环境彻底阻断回归 Bug。
- **安全管控**：消除个人 PC 直接操作生产环境的风险，所有的变更（代码、基础设施、数据库）都在 GitHub 的审计和权限管控之下。
