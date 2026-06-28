# T-Spike: Deno ↔ Node 契约互通验证

> **计划**: [refactor-plan-phase1.md](../refactor-plan-phase1.md)（路线 A）
> **前置**: 无
> **预计工期**: 0.5-1 天
> **执行者**: Trae Agent
> **Human Checkpoint**: ✅ Spike 结论需 Human 确认，决定 T-WS 的实现方案
> **风险等级**: 低（纯实验代码，失败也只产出报告）

---

## 🎯 目标

验证**一份 Zod schema 能否同时被以下三端 import 并正确使用**：

1. **web**（Next.js 16 App Router + React 19 + Node 20，通过 Turbopack/Webpack 构建）
2. **gateway**（Node 20 + Express 5，tsc 直接构建）
3. **supabase function**（Deno 运行时，由 Supabase CLI 部署）

如果**成功** → T-WS 任务采用"统一 import" 方案。
如果**失败**（特别是 Supabase/Deno 侧）→ T-WS 任务采用"Node 共享 + Deno 复制"的降级方案（pre-commit 同步）。

**无论成败都必须产出 spike-report.md**，记录结论和证据。

---

## 📚 上下文（Context）

### 必读文件

| 文件 | 用途 |
|---|---|
| `docs/refactor/refactor-plan-phase1.md` | active 计划（了解战略定位） |
| `docs/refactor/tasks/README.md` | 任务卡通用规范 |
| `CLAUDE.md` | 项目铁律（特别注意 DB 链接、本地开发命令） |
| `README.md` | 项目结构概览 |
| `gateway/src/ws/schemas.ts` | 现有 Zod schema（Spike schema 灵感来源，不直接迁移） |
| `supabase/functions/_shared/` | Deno 共享代码存放处（如有） |

### 不要做的事（红线）

- ❌ 不修改 `gateway/src/ws/schemas.ts` （留给 T-WS）
- ❌ 不修改 `web/src/types/ws.ts`（留给 T-WS）
- ❌ 不修改 `.github/workflows/ci.yml`（留给 T-CI）
- ❌ 不安装 npm workspace 或 turbo、nx 等 monorepo 工具（路线 A 明确避免）
- ❌ 不引入新 Zod 版本（三端必须用现有版本）

### 关键技术约束

- web 当前 Zod 版本：检查 `web/package.json` 的 `zod` 字段
- gateway 当前 Zod 版本：检查 `gateway/package.json` 的 `zod` 字段
- Deno 版本：Supabase Edge Functions 当前运行时为 Deno 1.x（见 https://supabase.com/docs/guides/functions）
- **三端必须使用同一大版本 Zod**（如都是 3.x 或都是 4.x）

---

## 📝 详细步骤

### Step 1：环境准备

```bash
# 1.1 确认必要工具
node --version    # 要求 ≥ 20
which supabase || echo "NEED: install supabase CLI (brew install supabase/tap/supabase)"
which deno || echo "NEED: deno (not strictly required if only using supabase CLI)"

# 1.2 查看三端 Zod 版本
grep '"zod"' web/package.json
grep '"zod"' gateway/package.json
```

记录三端 Zod 版本。若不一致，记入 spike-report.md 的 § 已知问题，本 Spike 仍继续（可能是发现第一个要修的问题）。

### Step 2：创建 shared/contracts/ 最小 schema

```bash
mkdir -p shared/contracts/ws
```

创建 `shared/contracts/ws/spike-schema.ts`：

```typescript
/**
 * Spike schema - for contract interop verification only.
 * DO NOT merge to production usage. T-WS will design the real schema.
 */
import { z } from 'zod';

export const spikeEchoSchema = z.object({
  type: z.literal('spike_echo'),
  timestamp: z.string().min(1),
  payload: z.object({
    message: z.string().min(1).max(256),
  }),
});

export type SpikeEcho = z.infer<typeof spikeEchoSchema>;

export function validateSpikeEcho(input: unknown) {
  return spikeEchoSchema.safeParse(input);
}
```

附加 `shared/contracts/README.md`，说明：
- 这是 Phase 1 的临时共享目录
- SemVer：初期 v0.x，每次 breaking change 提升 minor
- **未来可能**迁入 npm package；当前只是 TS 源码目录

### Step 3：web 端 import 验证

#### 3.1 配置 web/tsconfig.json paths

查看当前 `web/tsconfig.json`，在 `compilerOptions.paths` 中新增（若未有 paths 则整体新增）：

```jsonc
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@shared/contracts/*": ["../shared/contracts/*"]
    }
  }
}
```

**注意**：Next.js 对 tsconfig 外部 include 有限制，可能需要同步修改 `tsconfig.json` 的 `include` 字段加上 `"../shared/contracts/**/*.ts"`。

#### 3.2 写一个临时消费处

**不要放在 `src/app/` 路由下**（会影响生产 build），放在一个可丢弃的位置：

创建 `web/src/lib/_spike-check.ts`（带下划线前缀表示临时）：

```typescript
import { spikeEchoSchema, validateSpikeEcho, type SpikeEcho } from '@shared/contracts/ws/spike-schema';

export function _spikeTryValidate(input: unknown) {
  const result = validateSpikeEcho(input);
  if (result.success) {
    const data: SpikeEcho = result.data;
    return data;
  }
  throw new Error(result.error.message);
}

export { spikeEchoSchema };
```

#### 3.3 运行验证

```bash
cd web
npm run lint || true  # 记录结果但不阻塞
npx tsc --noEmit      # 必须通过，否则 spike 在 web 侧失败
npm run build         # 必须通过，否则 spike 在 web 侧失败
```

记录结果到 spike-report.md 的 § web 端验证。

### Step 4：gateway 端 import 验证

#### 4.1 配置 gateway/tsconfig.json paths

类似 Step 3.1 处理 `gateway/tsconfig.json`，增加：

```jsonc
{
  "compilerOptions": {
    "paths": {
      "@shared/contracts/*": ["../shared/contracts/*"]
    }
  },
  "include": ["src/**/*", "../shared/contracts/**/*"]
}
```

#### 4.2 写临时消费处

创建 `gateway/src/_spike-check.ts`：

```typescript
import { validateSpikeEcho, spikeEchoSchema } from '@shared/contracts/ws/spike-schema';

export const _spikeEchoSchema = spikeEchoSchema;
export const _spikeValidate = validateSpikeEcho;
```

#### 4.3 运行验证

```bash
cd gateway
npm run typecheck     # 必须通过
npm run build         # 必须通过
```

记录结果到 spike-report.md 的 § gateway 端验证。

### Step 5：Supabase Edge Function（Deno）端 import 验证 ⚠️ 关键

这是 Spike 最关键的一步。三种方案依次尝试，**哪种成功就用哪种**：

#### 方案 A：`deno.json` imports map（推荐首选）

在 `supabase/functions/` 下新建或修改 `deno.json`（Supabase CLI 会读取）：

```json
{
  "imports": {
    "@shared/contracts/": "../../shared/contracts/"
  }
}
```

创建 `supabase/functions/_spike-echo/index.ts`：

```typescript
import { validateSpikeEcho } from '@shared/contracts/ws/spike-schema.ts';

Deno.serve((req) => {
  const result = validateSpikeEcho({
    type: 'spike_echo',
    timestamp: new Date().toISOString(),
    payload: { message: 'hello' },
  });
  return new Response(JSON.stringify(result), {
    headers: { 'content-type': 'application/json' },
  });
});
```

跑本地验证：

```bash
cd supabase
supabase functions serve _spike-echo --no-verify-jwt &
sleep 3
curl -s http://localhost:54321/functions/v1/_spike-echo | head -20
# 期望：返回 {"success":true,"data":{...}}
kill %1 2>/dev/null || true
```

**方案 A 成功判定**：
- `supabase functions serve` 启动无 import error
- `curl` 返回包含 `"success":true`

若 A 成功，跳到 Step 6。

#### 方案 B：相对路径 import（A 失败时）

修改 `_spike-echo/index.ts`：

```typescript
import { validateSpikeEcho } from '../../../shared/contracts/ws/spike-schema.ts';
```

重跑 Step 5 验证。若成功，记入方案 B。

**已知坑**：Supabase CLI 部署时会打包 function 目录为独立 bundle，可能无法跨出 `supabase/functions/` 范围。若 `supabase functions deploy _spike-echo --dry-run` 失败（需要配 project-ref 才能真实部署，dry-run 即可）→ 方案 B 不可行，进入 C。

#### 方案 C：复制 + 同步（A、B 都失败时的 fallback）

```bash
mkdir -p supabase/functions/_shared/contracts/ws
cp shared/contracts/ws/spike-schema.ts supabase/functions/_shared/contracts/ws/spike-schema.ts
```

修改 `_spike-echo/index.ts`：

```typescript
import { validateSpikeEcho } from '../_shared/contracts/ws/spike-schema.ts';
```

重跑 Step 5 验证。若成功 → 记入方案 C，**并在 spike-report.md 明确：后续 T-WS 必须引入 pre-commit hook 同步 `shared/contracts/` → `supabase/functions/_shared/contracts/`**。

#### Zod 在 Deno 的 import

上面示例假设 Zod 通过 shared/contracts/ws/spike-schema.ts 的 `import { z } from 'zod'` 间接引入。Deno 对 `import 'zod'` 需要指定来源：

- 方式 1（在 `supabase/functions/deno.json` 的 imports 中）：
  ```json
  { "imports": { "zod": "npm:zod@3" } }
  ```
- 方式 2（在 schema 文件中直接 import from `npm:`）：
  ```typescript
  import { z } from 'npm:zod@3.23.8';
  ```

**Spike 里试方式 1**（侵入性最小），失败则回退方式 2 并在 spike-report.md 记录：该方案的副作用是"contracts 文件变 Deno-specific 不能被 Node 直接 import"——此时方案必须走 C（复制），自动打破统一 SSOT 目标。

### Step 6：生成 spike-report.md

在 `docs/refactor/spike-report.md` 写入：

```markdown
# T-Spike 契约互通验证报告

> **日期**: YYYY-MM-DD
> **执行者**: Trae Agent
> **Spike schema**: shared/contracts/ws/spike-schema.ts
> **对应任务卡**: docs/refactor/tasks/T-spike-contract-interop.md

## § 1 结论（TL;DR）

- ✅ / ❌ web 端 import 成功
- ✅ / ❌ gateway 端 import 成功
- ✅ / ❌ supabase function 端 import 成功，采用方案 A/B/C
- **推荐 T-WS 实现方案**：[统一 import / Node 共享 + Deno 复制]

## § 2 三端 Zod 版本

| 端 | 版本 |
|---|---|
| web | z.x.x |
| gateway | z.x.x |
| supabase (resolved) | z.x.x |

一致性：✅ / ❌（若不一致，T-WS 需统一）

## § 3 web 端验证

### 3.1 tsconfig 变更
<diff 或 "新增 paths 和 include">

### 3.2 验证命令输出
- `npm run lint`: <PASS/FAIL + 摘要>
- `npx tsc --noEmit`: <PASS/FAIL + 摘要>
- `npm run build`: <PASS/FAIL + 摘要>

### 3.3 遇到的问题
<列表>

## § 4 gateway 端验证

（结构同 § 3）

## § 5 supabase function 端验证

### 5.1 尝试方案
- 方案 A (deno.json imports): ✅/❌ + 错误信息
- 方案 B (relative path): ✅/❌ + 错误信息
- 方案 C (copy): ✅/❌

### 5.2 采用方案
方案 X，理由...

### 5.3 deploy --dry-run 验证
<输出>

## § 6 Zod 在 Deno 的 import 方案

采用：方式 1 / 方式 2
副作用：<如有>

## § 7 对 T-WS 的指导

根据本 Spike 结果，T-WS 任务必须：
1. 使用方案 [X] 作为 contracts 文件引用方式
2. [如方案 C] 在 pre-commit hook 中同步 shared/contracts/ → supabase/functions/_shared/contracts/
3. tsconfig paths 配置见 § 3.1 和 § 4.1
4. Zod 版本统一要求：[是/否]，若是，需升级 [端] 的 Zod 从 x.x.x → y.y.y

## § 8 清理清单

Spike 完成后，本次 PR 合入前需删除的临时文件：
- [ ] web/src/lib/_spike-check.ts
- [ ] gateway/src/_spike-check.ts
- [ ] supabase/functions/_spike-echo/（整个目录）
- [ ] shared/contracts/ws/spike-schema.ts
- [ ] （保留）shared/contracts/ 空目录 + README.md（留给 T-WS 用）

## § 9 附录

### 完整命令回放
<bash 命令 + 输出，便于复现>

### 环境信息
- node: vX.X.X
- npm: vX.X.X
- supabase CLI: vX.X.X
- deno (if used): vX.X.X
```

### Step 7：清理 + PR

按 Step 6 § 8 的清理清单删除临时文件，只保留：
- `shared/contracts/README.md`
- `shared/contracts/` 空目录结构（供 T-WS 用）
- `docs/refactor/spike-report.md`
- `web/tsconfig.json` / `gateway/tsconfig.json` / `supabase/functions/deno.json` 的 path 配置（保留，T-WS 需要）

---

## 📦 交付物

### 必须交付

- [ ] `docs/refactor/spike-report.md` — Spike 验证报告（含三端验证结果、采用方案、对 T-WS 的指导）
- [ ] `shared/contracts/README.md` — 共享层占位说明
- [ ] `web/tsconfig.json` 新增 paths（保留）
- [ ] `gateway/tsconfig.json` 新增 paths（保留）
- [ ] `supabase/functions/deno.json` 新增 imports map（如方案 A 成功）

### 不可交付（必须删除）

- ❌ `shared/contracts/ws/spike-schema.ts`
- ❌ `web/src/lib/_spike-check.ts`
- ❌ `gateway/src/_spike-check.ts`
- ❌ `supabase/functions/_spike-echo/`

---

## ✅ 验收标准

### 自动验证

```bash
# 1. 报告存在且关键章节完整
test -f docs/refactor/spike-report.md
for section in "结论" "web 端验证" "gateway 端验证" "supabase function 端验证" "对 T-WS 的指导"; do
  grep -q "$section" docs/refactor/spike-report.md || { echo "MISSING: $section"; exit 1; }
done

# 2. 临时文件已清理
test ! -f shared/contracts/ws/spike-schema.ts
test ! -f web/src/lib/_spike-check.ts
test ! -f gateway/src/_spike-check.ts
test ! -d supabase/functions/_spike-echo

# 3. 三端无编译错误（清理后的代码）
cd web && npx tsc --noEmit && cd ..
cd gateway && npm run typecheck && cd ..

# 4. 共享目录结构保留
test -f shared/contracts/README.md
```

### 人工验证

- [ ] spike-report.md 的"对 T-WS 的指导"足够具体，能指导后续任务
- [ ] 采用的方案是否合理（方案 A > B > C，越靠前越好）
- [ ] 若采用方案 C，pre-commit hook 同步脚本思路清晰

---

## 📤 PR 规范

### 分支

```
refactor/spike-contract-interop
```

### PR 标题

```
spike: Deno-Node contract interop verification
```

### PR 描述模板

```markdown
## 任务
- 任务卡: `docs/refactor/tasks/T-spike-contract-interop.md`
- 计划: `docs/refactor/refactor-plan-phase1.md`（路线 A）
- 前置: 无

## 结论
<从 spike-report.md § 1 复制>

## 采用方案
- supabase function ↔ shared/contracts: 方案 [A/B/C]
- Zod 在 Deno 侧: 方式 [1/2]

## 对 T-WS 的影响
<从 spike-report.md § 7 复制要点>

## 变更摘要
- 新增 shared/contracts/README.md
- 新增三端 path alias 配置
- 新增 docs/refactor/spike-report.md
- 清理所有临时 spike 文件

## 验收结果
<贴自动验证命令的输出>

## 风险提示
<如有；如 Zod 版本不一致、Deno import 副作用等>
```

---

## ⚠️ 风险与回退

| 风险 | 概率 | 应对 |
|---|---|---|
| 方案 A、B、C 全失败 | 低 | 记录详细失败证据，Spike 不失败但**不推进 T-WS**，由 Human 决策是否改 shared 路径或彻底放弃 contracts 统一目标 |
| web 的 Turbopack 不认外部 tsconfig path | 中 | 降级用 **Webpack build**（`next build --no-turbopack`）或改用相对路径 |
| Supabase CLI 版本过旧不支持 deno.json imports | 低 | 记录 CLI 版本要求，Human 升级 |
| Zod 版本不一致 | 中 | 记录差异，T-WS 必须先统一（额外 0.5 天工作量） |

**回退**：整个 Spike 是只增不删（除临时文件），revert PR 即可干净回退。

---

## 🧠 执行时的注意事项

1. **保持只读心态**：Spike 是探索性任务，失败也是合法输出。不要为"让 Spike 成功"强行改动不该改的文件。
2. **完整记录失败证据**：方案 A 失败比方案 A 成功更重要——T-WS 的走向完全依赖真实证据。
3. **不扩大范围**：Spike 只验证"一份 schema 能否三端 import"，不涉及协议设计、不涉及现有 schemas.ts 迁移。
4. **版本号敏感**：三端 Zod 版本、Deno 版本、Supabase CLI 版本全部记录到 spike-report.md 的 § 9 附录。
5. **遇到决策点停下**：如果发现"要让方案 A 成功需要升级 Zod"，**停止执行，在 PR 描述中列出升级需求和风险**，由 Human 确认后再继续。
