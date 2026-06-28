# QRClaw CI/CD Wave 0 — 加固计划

> **状态**: DRAFT（2026-04-19）
> **作者**: AI assistant（Claude）
> **方法学**: 遵循 `superpowers:writing-plans` + `superpowers:subagent-driven-development`。
> **前序**: `docs/superpowers/plans/2026-04-19-qrclaw-phase1-refactor.md`（Phase 1 — 已完成）
> **后续**: Phase 2 Wave 1（HTTP 契约 SSoT）、Wave 2（Outbound WS Zod）

---

## 0. Context（小白版：这次要干嘛）

### 前情回顾

- Phase 1 已完成 WebSocket 入站帧的契约统一（`shared/contracts/ws/`），本地 16 个 commit、696/696 测试过、三处构建路径（tsc gateway / tsc web / vitest）全绿。
- 用户补充了 `docs/ci-cd-optimization-plan.md`（codex 的现网审查建议）。我通读评估后，取其实、舍其虚。

### 当前 CI/CD 真相

| 维度 | 现状 | 风险 |
|---|---|---|
| CI 跑的东西 | tests（vitest）、web lint+build、gateway typecheck+build、contracts-sync-check | 四项都是**静态/单元**级；**没有 E2E 拦截**，所以 Playwright 8+ specs 等于白写 |
| 依赖漏洞扫描 | 无 Dependabot | 上游 CVE 依赖人肉发现 |
| Prettier gate | 无 | 风格靠自觉，diff 夹杂格式噪声 |
| Gateway 部署 | 开发者 SSH 登录腾讯云，`docker compose up -d --build` | 手动操作、无审计、深夜合并没人能部署 |
| Supabase migration | `supabase/migrations/*.sql` 手动 push | 坏 SQL 可合入 main、生产库偏移 |
| CODEOWNERS | 无 | 合并策略无归属 |

### Wave 0 目标（一句话）

把 **「E2E 拦截」「migration PR gate」「Gateway auto deploy」「db push」** 这四条生死线补上，再顺手加 Dependabot / Prettier / CODEOWNERS 三件小事。这样 Phase 2 大改业务代码时，CI/CD 能兜底。

### 不在范围内（明确排除，避免作用域蔓延）

- ❌ Turborepo / pnpm workspaces 改造（MVR 立场，当前 CI 5–7 分钟不是瓶颈）
- ❌ PR 级临时 Gateway 后端（Railway 等，成本 ≫ 双人并发收益）
- ❌ semantic-release / 自动 changelog（MVP 阶段手工 CHANGELOG 更透明）
- ❌ "100% PR 阶段拦截" 口号（这是文化不是配置）
- ❌ 重写 playwright.config.ts 的 5 浏览器矩阵（CI 只跑 chromium 子集）

---

## 1. 关键约束与决策

### 约束 1：本地仓库，无法 push 到 GitHub

与 Phase 1 同构。**意味着**：

| 验证类型 | 本地可做 | 只能 GitHub 跑 |
|---|---|---|
| yaml 语法 | `actionlint` / `yamllint` | — |
| dependabot.yml | 结构校验 | 真正触发 PR |
| Prettier | 本地 `prettier --check` | — |
| CODEOWNERS | 语法 + 用户名校验（手动） | 真正拦合并 |
| E2E job yaml | 本地 `playwright test` | 真正的 `GITHUB_TOKEN` / 缓存 |
| migration dry-run | 本地 `supabase db start` | — |
| Gateway CD | SSH key 形式校验 | 真机部署 |
| Supabase db push | token 形式校验 | 真库推送 |

**交付标准**：代码 + 静态校验通过 + 本地能模拟的脚本跑通。
**放行标准**：用户 push 到 GitHub 后首轮 PR workflow 跑绿。

### 约束 2：生产环境改动的安全性

- **Gateway CD**：首次必须用 `workflow_dispatch` 手动触发测试，确认后再改 `main` push 自动触发。
- **Supabase `db push`**：放在 GitHub Environment（`production`）后面，强制 required reviewers（即使双人也要点"approve"），给人肉最后一道闸。

### 决策 1：E2E job 只跑 chromium + `flows/` + `mobile/` + `web/`

- Playwright config 有 5 个 projects。CI 全跑约 5×N 个浏览器实例，太慢。
- `visual-audit/` 是截图抓图基线，不在 PR 流水线跑（由人工本地 `visual-audit:capture` / `compare`）。
- CI 只跑 chromium（交互行为覆盖），mobile-chrome 留给局部 spec。
- 失败时上传 trace + screenshot 作为 artifact。

### 决策 2：Prettier 一次性整仓 format（选项 A）

- 选项 B/C（只 gate 新文件 / 过渡期不 gate）会长期留下"新旧风格混杂"的烂摊子。
- 一次性 `prettier --write .` 提一个"chore(format): repo-wide prettier bootstrap" commit，从此风格统一。
- 单独 commit、不混业务改动，以便 `git blame ignore-revs-file` 忽略。

### 决策 3：Gateway CD 默认 path-filter

- workflow 只在 `gateway/**` 或 `shared/**` 改动时触发部署，避免每次 web/docs 改动白跑 SSH。
- 配合 `workflow_dispatch` 人工手动触发兜底。

### 决策 4：Supabase db push 不自动触发，用 `workflow_dispatch`

- 自动 push 到生产库对 MVP 阶段风险太高。
- 固定流程：PR gate 跑 `supabase db start` dry-run → main 合入后，用户在 Actions 面板手动点 "Run workflow" 触发 db push → required reviewer approve → 执行。
- 后续稳定了再改自动触发（out of scope）。

### 决策 5：Dependabot 只扫 npm + GitHub Actions，不扫 Docker

- Gateway Dockerfile 里 `node:20-alpine` 之类 base image 改动需要人工验证（不是随便 bump）。
- npm workspaces 里每个包单独 schedule（`web/`、`gateway/`、`tests/`、`shared/`）。

---

## 2. 架构图

```
.github/
├── CODEOWNERS                          # Task W0-T7
├── dependabot.yml                      # Task W0-T1
└── workflows/
    ├── ci.yml                          # Task W0-T2/T3/T6 扩展
    ├── deploy-gateway.yml              # Task W0-T4（新）
    └── deploy-supabase.yml             # Task W0-T5（新）

<repo-root>/
├── .prettierrc.json                    # Task W0-T6（新）
├── .prettierignore                     # Task W0-T6（新）
├── .git-blame-ignore-revs              # Task W0-T6（新）
└── package.json                        # Task W0-T6 追加 prettier devDep + scripts
```

---

## 3. 全局验证口径

三个面板必须同时绿：

| 面板 | 命令 |
|---|---|
| Prettier | `npx prettier --check .` |
| Playwright（本地） | `cd tests && npm run test:e2e -- --project=chromium --grep-invert visual-audit` |
| Supabase migration dry-run | `npx supabase db start && npx supabase db reset` |
| actionlint | `actionlint .github/workflows/*.yml` |
| yamllint | `yamllint .github/` |
| Phase 1 遗留 | `node scripts/sync-contracts.mjs --check` + `cd gateway && npm run typecheck` + `cd web && npx tsc --noEmit` + `cd tests && npx vitest run`（696 tests） |

---

## 4. 任务分解

> 每个任务独立可提交。串行执行，每个任务完成后跑"受影响面板"验证、commit、再进入下一个。

---

### Task W0-T1 — Dependabot 配置

**Goal**: 给仓库加自动依赖扫描。

**Files**:
- **新增**: `.github/dependabot.yml`

**Steps**:
1. 配置四个 npm ecosystem（`web/`、`gateway/`、`tests/`、`shared/`）+ 一个 `github-actions`（根）。
2. 每周一（Asia/Shanghai）一次扫描。`open-pull-requests-limit: 5`。
3. 为每个 package 加 `groups` 分组，把 types/@types/* 合并成一个 PR 以降噪。
4. 给生成的 PR 加 `labels: ["dependencies", "automated"]`。

**Tests**:
- `yamllint .github/dependabot.yml`。
- 用 Dependabot config validator（在线）或 `npx dependabot --help` 做结构校验（如果可用）。

**Done when**:
- `.github/dependabot.yml` 文件存在且 yamllint 通过。
- README 或 CLAUDE.md 简短记录扫描频率（可合并进后续 docs 任务）。

**Rollback**: `git revert <sha>` 即可。无副作用。

---

### Task W0-T2 — E2E Playwright 接入 CI

**Goal**: 在 PR 流水线里跑 `tests/e2e/` 的交互子集，阻断 UI 回归。

**Files**:
- **修改**: `.github/workflows/ci.yml`（新增 `tests-e2e` job）
- **可能修改**: `tests/playwright.config.ts`（CI 专用 `grep-invert visual-audit`、chromium-only 投影）

**Steps**:
1. 新增 job `tests-e2e`：
   - runs-on: `ubuntu-latest`
   - container: `mcr.microsoft.com/playwright:v1.58.2-jammy`（与 `@playwright/test` 版本对齐）。
   - needs: `[web-lint, tests]`（确保基础不坏再跑 E2E）。
   - Steps：checkout → setup-node 20 → `cd web && npm ci` → `cd tests && npm ci` → 编译 `web`（`next build` 或跑 `next dev`，Playwright 自动启） → `cd tests && npx playwright test --project=chromium --grep-invert visual-audit`。
2. 失败时上传 artifact：
   - `playwright-report/`（HTML report）
   - `test-results/`（截图 + trace）
   - 保留 7 天。
3. 将 CI 专用行为封进 env var：在 `playwright.config.ts` 里 `process.env.CI ? skip visual-audit : include all`（或直接 CLI `--grep-invert`）。
4. 需要 Supabase 环境变量的 spec 先 `test.skip()` 或用 mock（已有 `tests/e2e/web/pages.spec.ts` 只测静态页可直接跑）。
5. 用户补充：`SUPABASE_URL` + `SUPABASE_ANON_KEY` 如果是 public test stack，可放到 GitHub repo secrets；否则 CI 只跑 "静态页面 + auth 前" 的子集。

**Tests**:
- 本地跑 `cd tests && npm run test:e2e -- --project=chromium --grep-invert visual-audit`（需要 Playwright 浏览器已安装：`npx playwright install chromium`）。
- 必须绿。失败时查看 playwright-report。

**Done when**:
- 本地 chromium 子集全绿。
- `.github/workflows/ci.yml` 的 `tests-e2e` job 加了 `actionlint` 过检。
- artifact 路径正确（本地模拟：`test-results/` 目录存在）。

**Rollback**: 删 `tests-e2e` job 段即可。`playwright.config.ts` 改动如果影响本地体验也 revert。

**Risks**:
- Playwright docker 镜像 ~1.5GB，首次拉取 5–10 分钟。之后 GitHub runner cache 命中后秒级。
- `next dev` 启动 + TS 编译，CI 单轮 E2E 预计 3–6 分钟。
- 若 specs 里有依赖 WS gateway 的（如 `qr-scan-chat.spec.ts`），需要同时起 gateway 或直接 skip。**首轮建议 skip，后续扩展再补 compose up。**

---

### Task W0-T3 — Supabase migration PR gate

**Goal**: PR 阶段在 docker 里跑 `supabase db start`，验证 migration 语法和 RLS 不炸。

**Files**:
- **修改**: `.github/workflows/ci.yml`（新增 `supabase-migration-check` job）

**Steps**:
1. 新增 job `supabase-migration-check`：
   - runs-on: `ubuntu-latest`
   - trigger: 仅 `supabase/migrations/**` 或 `supabase/config.toml` 改动时（paths filter）。
   - Steps：checkout → `supabase/setup-cli@v1` → `supabase db start`（启动本地 postgres 容器并自动应用所有 migrations）→ `supabase db lint`（如果 CLI 支持）→ `supabase db diff --schema public`（确认本地应用完等价生产 schema）。
2. 失败时输出最后 50 行 `supabase logs db`。
3. 缓存：Supabase CLI 二进制 + docker layer（`actions/cache@v4`）。

**Tests**:
- 本地 `npx supabase db start && npx supabase db reset`（前提：已 `supabase init`）。
- 必须能跑完所有 10 个 migration 无错。

**Done when**:
- 本地 `supabase db reset` 零报错。
- CI job yaml `actionlint` 过。

**Rollback**: 删 `supabase-migration-check` job。

**Risks**:
- `supabase db start` 需要 Docker 在 runner 上可用（GitHub ubuntu runner 原生支持）。
- migration 依赖 storage/auth schema 而本地 CLI 默认不装，首次可能要在 config.toml 里 enable。若 10 个 migration 引用了 `storage.objects` 等跨 schema 对象，需验证本地启起来。
  - **Mitigation**: 先在本地 `supabase start --debug` 验证 10 个 migration 可一键跑通；如果不通，回退只做 SQL lint 不做 reset。

---

### Task W0-T4 — Gateway 自动部署 workflow

**Goal**: main 分支合并且影响 `gateway/**` 或 `shared/**` 时，自动 SSH 到腾讯云执行 `git pull && docker compose up -d --build`。

**Files**:
- **新增**: `.github/workflows/deploy-gateway.yml`

**Steps**:
1. trigger：
   - `push: branches: [main]` + `paths: [gateway/**, shared/**, .github/workflows/deploy-gateway.yml]`
   - `workflow_dispatch`（人工触发兜底）
2. job `deploy-gateway`：
   - runs-on: `ubuntu-latest`
   - environment: `production`（强制 required reviewers，首次跑必须 approve）
   - steps：
     - checkout（仅用于日志）
     - `appleboy/ssh-action@v1` → 连到 `${{ secrets.DEPLOY_SERVER_IP }}`，用户 `${{ secrets.DEPLOY_SSH_USER }}`，key `${{ secrets.DEPLOY_SSH_KEY }}`
     - 远端命令序列（失败 `set -e` 回滚）：
       ```
       cd /opt/qrclaw
       git fetch --all
       git checkout main
       git pull --ff-only
       cd gateway
       docker compose pull redis      # pull 基础镜像
       docker compose build gateway   # 重建 gateway image
       docker compose up -d           # 滚动重启
       docker compose ps              # 健康确认
       ```
     - **健康检查**：`curl -fsS http://localhost:3001/health` 重试 10 次（间隔 3s）。失败则退出非零。
3. 失败通知：
   - 作为后续任务；本轮只输出 `GITHUB_STEP_SUMMARY`（含部署结果）。
4. **首次部署策略**：
   - 本地修改完 workflow 后，用户需要先在 GitHub UI 点 `workflow_dispatch` 跑一次验证 SSH 连通；确认成功后再推 main 触发 auto。

**Tests**:
- 本地：`actionlint .github/workflows/deploy-gateway.yml` 过。
- 静态 secrets 名称清单校对（`DEPLOY_SERVER_IP` / `DEPLOY_SSH_KEY` / `DEPLOY_SSH_USER` 与 codex 文档一致）。

**Done when**:
- workflow yaml 合法。
- `paths` filter 精确。
- environment `production` 在 workflow 里正确引用。
- 用户在 GitHub 仓库 Settings → Environments 里已创建 `production` environment 并配了 reviewers（这一步是人工操作，plan 里要提醒）。

**Rollback**:
- `git revert` 即可。回滚后手工 SSH 继续用。
- 如果 workflow 已部署坏版本：SSH 手动 `git checkout <last-good-sha> && docker compose up -d --build`。

**Risks**:
- `docker compose build` 依赖 `shared/` 被 COPY（FU1 已处理）。确认 Dockerfile context 对。
- `.env.production` 必须存在于 `/opt/qrclaw/gateway/` 且与代码同步。本 workflow **不**修改 `.env.production`，由运维人工维护。
- 若 SSH key 轮换，secrets 要跟着更新。

---

### Task W0-T5 — Supabase 自动 db push

**Goal**: main 合入后，人工 `workflow_dispatch` 触发 → `supabase db push` 到生产库。

**Files**:
- **新增**: `.github/workflows/deploy-supabase.yml`

**Steps**:
1. trigger：仅 `workflow_dispatch`（本轮不做自动）。inputs：
   - `confirm`: string（要求输入 `I-UNDERSTAND-PROD` 才继续）
   - `dry_run`: boolean（默认 true；先跑 `supabase db diff` 预览）
2. environment: `production`（required reviewers 同 T4）。
3. steps：
   - checkout
   - `supabase/setup-cli@v1`
   - `supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}` with `SUPABASE_ACCESS_TOKEN`
   - 若 `dry_run == true`：`supabase db diff --linked` → 输出到 `GITHUB_STEP_SUMMARY`，job 结束。
   - 否则：`supabase db push --password ${{ secrets.SUPABASE_DB_PASSWORD }}` → 输出到 summary。
4. **首次使用 SOP**（放入 `README` 或 workflow summary）：
   1. 开发者 PR → `supabase-migration-check` 通过 → 合 main。
   2. 开发者到 Actions 面板，选 `deploy-supabase`，`confirm=I-UNDERSTAND-PROD`，`dry_run=true`。
   3. 审阅 diff，无误后再触发一次 `dry_run=false`。

**Tests**:
- 本地：`actionlint .github/workflows/deploy-supabase.yml`。
- 静态校验 secrets 名称。

**Done when**:
- yaml 合法。
- `confirm` input 校验逻辑正确（用 `if: ${{ inputs.confirm == 'I-UNDERSTAND-PROD' }}` 卫兵）。
- environment 引用正确。

**Rollback**:
- `git revert`。
- 若 db push 执行了坏迁移：走 Supabase 的 point-in-time recovery（非本 plan 范围）。

**Risks**:
- `supabase db push` 不幂等——如果两次触发同一 migration，第二次会报 already exists。已由 `migrations` 表状态控制。
- 极端情况下 schema drift（本地 migration 与线上实际不一致）可能导致 push 失败。`dry_run` 模式用于提前发现。

---

### Task W0-T6 — Prettier bootstrap

**Goal**: 统一代码风格，消除 diff 噪声，CI gate 新增/修改代码必须格式化。

**Files**:
- **新增**: `.prettierrc.json`、`.prettierignore`、`.git-blame-ignore-revs`
- **修改**: `package.json`（根）→ 添加 devDep `prettier@^3.3.0` + scripts `format` / `format:check`
- **修改**: 仓库全量 format 后的所有文件（一次性 commit，单独成 PR）
- **修改**: `.github/workflows/ci.yml` 新增 `format-check` job

**Steps**:
1. `.prettierrc.json` 统一配置（2-space、single-quote、trailing comma es5、print width 100 etc）。与 `web/eslint.config.mjs` 兼容（web 用 Next ESLint，需确认无冲突）。
2. `.prettierignore` 排除：
   - `**/node_modules/`、`**/dist/`、`**/.next/`、`**/test-results/`
   - `supabase/functions/_shared/contracts/` （sync-contracts.mjs 生成产物，hand-off copy）
   - `**/*.lock`、`**/*-lock.json`
   - `dev-log/`、`design/`（设计截图相关）
3. 根 `package.json` 追加：
   ```json
   "scripts": {
     "format": "prettier --write .",
     "format:check": "prettier --check ."
   },
   "devDependencies": {
     "prettier": "^3.3.0"
   }
   ```
4. 在根目录 `npm install` 后运行 `npm run format`，产生大 diff。
5. **提交策略**（关键，避免破坏 git blame）：
   - **Commit A**（小）：`.prettierrc.json` + `.prettierignore` + `package.json` + `.git-blame-ignore-revs`。
   - **Commit B**（大）：`chore(format): repo-wide prettier bootstrap` —— 纯 format 变更，**把此 commit sha 写进 `.git-blame-ignore-revs`**。
   - **Commit C**（小）：`.github/workflows/ci.yml` 加 `format-check` job。
6. CI job `format-check`：
   - runs-on: `ubuntu-latest`
   - steps: checkout → setup-node 20 → `npm ci` → `npm run format:check`

**Tests**:
- 本地 `npm run format:check` 在 commit B 之后必须 pass（零 diff）。
- 随机修改一个文件加坏格式，`npm run format:check` 必须 fail。
- `git log --stat <commit-B>` 验证 diff 只是格式，没有逻辑变更（抽样 5 个文件看）。

**Done when**:
- 三个 commit 都有。
- `.git-blame-ignore-revs` 包含 commit B sha。
- CI job `actionlint` 过。
- `git blame` 在默认 config 下可读性不受影响（本地 `git config blame.ignoreRevsFile .git-blame-ignore-revs`，说明文档补 README）。

**Rollback**:
- 若 `.prettierrc` 与 ESLint 冲突（常见场景：单 vs 双引号、semi 规则），revert commit B、调整 `.prettierrc`、重跑 format、重新 commit B'。
- 若 CI 长期失败拖累合并：临时在 `format-check` job 加 `continue-on-error: true`，待整改后去掉。

**Risks**:
- Commit B 会触碰几百个文件，PR review 视觉负担大。文档里明确"不看逻辑只看 config"。
- 若仓库里混杂 CRLF / LF 行尾，需在 `.prettierrc` 设 `endOfLine: 'lf'`（已默认），配合 `.gitattributes * text=auto eol=lf`（本次不做，留意）。
- web ESLint Next 预设可能启用 `no-unused-vars` 之类的非格式规则，不受 Prettier 影响，互不冲突。

---

### Task W0-T7 — CODEOWNERS

**Goal**: 给关键路径设 owner，PR 必须 owner review。

**Files**:
- **新增**: `.github/CODEOWNERS`

**Steps**:
1. 与用户确认 owner 用户名（本 plan 里用 `@zeze` 占位，执行时替换为真实 GitHub handle）。
2. 规则：
   ```
   # Global default
   *                                     @zeze

   # Contracts SSoT（改这里必须 extra review）
   /shared/contracts/**                  @zeze
   /scripts/sync-contracts.mjs           @zeze

   # DB schema
   /supabase/migrations/**               @zeze
   /supabase/config.toml                 @zeze

   # CI/CD（改这里意味着改变部署链路）
   /.github/**                           @zeze

   # Agent 导航
   /.claude/skills/qrclaw-map/**         @zeze
   /CLAUDE.md                            @zeze
   /AGENTS.md                            @zeze
   ```
3. 在 GitHub 仓库 Settings → Branches → `main` → Protection Rule，开启 "Require review from Code Owners"（人工动作，plan 里提醒）。

**Tests**:
- 本地：文件语法校对（行格式 `path @owner`）。
- GitHub 合并后：提个改 `shared/contracts/ws/types.ts` 的小 PR，确认 owner 被自动 request。

**Done when**:
- 文件存在且通过 GitHub CODEOWNERS parser（`/tree/main/.github/CODEOWNERS` 会显示是否有错误）。

**Rollback**: 删文件。

**Risks**:
- 双人团队里 owner 自己是自己的 reviewer，可能需要 "Require approval from Code Owners" 配合 "Allow specified actors to bypass" —— 这是仓库设置，不是 plan 范围。本 plan 只交付 CODEOWNERS 文件。

---

## 5. 执行协议（与 Phase 1 同构）

对每个 task：

1. **Implementer**（我，作为串行主 agent）
   - Read 相关文件
   - 编辑
   - 运行对应验证命令
   - 展示 diff 给用户确认（**涉及 workflow 变更必须 show yaml + 人类可读解释**）
   - 用户 approve 后 commit
2. **Reviewer**（subagent，readonly）
   - `explore` 子代理 readonly 审
   - 对 yaml task（T1/T2/T3/T4/T5/T7）：用 `actionlint` / yamllint 思路审
   - 对 T6：抽查 10 个 format 变更文件，确认无逻辑偏移
3. **Verification gate**
   - 本地三面板验证通过才进入下个 task
4. **Commit 规范**（与 Phase 1 同 Conventional Commits）：
   - `chore(ci): add dependabot config`（T1）
   - `ci(e2e): wire playwright into CI pipeline`（T2）
   - `ci(supabase): add migration pr gate`（T3）
   - `feat(cd): automate gateway deployment on main`（T4）
   - `feat(cd): add supabase db push dispatch workflow`（T5）
   - `chore(format): repo-wide prettier bootstrap`（T6 commit B）+ `chore(ci): enforce prettier formatting`（T6 commit C）
   - `chore(gov): add codeowners`（T7）

---

## 6. 风险寄存器

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| E2E 依赖 Supabase/ws gateway，CI 跑不通 | 中 | 中 | 首轮仅跑静态页子集，其他 `test.skip` |
| Playwright runner cache miss 导致 CI 时间膨胀 | 低 | 低 | 第二次及以后命中，接受首轮慢 |
| Supabase migration 10 个脚本有跨 schema 依赖 | 中 | 中 | 先本地 `supabase db reset` 验证；若失败，T3 降级为 SQL lint only |
| Prettier 全量 format 与 ESLint 冲突 | 低 | 中 | 用 `eslint-config-prettier` 关闭冲突规则（如有需要） |
| `.env.production` 与代码版本不匹配导致 T4 部署后健康检查失败 | 低 | 高 | 健康检查失败时 workflow 非零退出；运维手动回滚 |
| Supabase db push 破坏线上 schema | 低 | 高 | T5 强制 `workflow_dispatch` + `confirm` input + environment review |
| CODEOWNERS 用户名错导致合并卡死 | 低 | 中 | 首次合并由用户人工验证 request 确实发给 owner |

---

## 7. 交付边界（再次强调，因为本地仓库）

| Task | 本地可交付 | 需 GitHub 验证 |
|---|---|---|
| T1 | yaml 文件 | Dependabot 真正 PR |
| T2 | yaml + 本地 playwright 跑通 | CI runner 真跑 |
| T3 | yaml + 本地 `supabase db reset` 跑通 | runner docker |
| T4 | yaml + secrets 名称校验 | 真 SSH + `workflow_dispatch` 首次 |
| T5 | yaml + inputs 逻辑校验 | 真 token + 人工 dispatch |
| T6 | 整仓 format + CI yaml | format-check 真跑 |
| T7 | 文件 | CODEOWNERS 真拦 |

**我的 done 定义 = 所有"本地可交付"项完成 + 本地静态校验通过 + execution-log 记录 + 用户 push 前最后一次 review。**

---

## 8. 完成 Wave 0 后的后续

1. **execution-log 更新**：`docs/refactor/execution-log.md` 加 Wave 0 段，记录 commits / 偏差 / 风险。
2. **map.md 更新**：在 `qrclaw-map` skill 里加"CI/CD 拓扑"小节。
3. **启动 Phase 2 Wave 1**：HTTP 契约 SSoT plan 起草（独立文档，编号 `2026-04-20-qrclaw-phase2-http-contracts.md`）。
4. **启动 Phase 2 Wave 2**：Outbound WS Zod plan（编号 `2026-04-20-qrclaw-phase2-ws-outbound.md`）。

---

## 9. 与 `docs/ci-cd-optimization-plan.md` 的对应关系

| codex 建议 | Wave 0 对应 | 备注 |
|---|---|---|
| 阶段一 #1 E2E + 视觉回归 | T2 | 视觉回归本轮不做，由人工 visual-audit |
| 阶段一 #2 Monorepo 构建加速（Turborepo） | ❌ out of scope | MVR，不做 |
| 阶段一 #3 Prettier + Dependabot | T6 + T1 | 全收 |
| 阶段二 #1 Gateway 自动部署 | T4 | 全收，加 `workflow_dispatch` 兜底 |
| 阶段二 #2 Supabase migration 自动化 | T3 + T5 | 全收，`db push` 降级为人工 dispatch（比 codex 原案更保守） |
| 阶段三 #1 Preview 环境 | ❌ out of scope | MVR |
| 阶段三 #2 semantic-release | ❌ out of scope | MVP 阶段过度 |

---

**END OF PLAN**
