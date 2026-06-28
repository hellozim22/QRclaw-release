# T0: 现状审计（⚠️ archived，当前路线不用）

> **状态**: 🟡 **ARCHIVED** — 对应 v1.0 长期蓝图的 Phase 0。当前走路线 A（`refactor-plan-phase1.md`），**不做全量审计**，只做局部 Spike。若未来按触发式 roadmap 切回 v1.0 蓝图再启用此任务。
> **若启用前必读**：`docs/refactor/review/code-reviewer-feedback.md` 的 C2/C3/M3/M5 —— 本任务原版有多处硬阻塞（/tmp 非持久、rg 依赖、`\|\| true` 吞错、报告体积假通过），启用前必须重写。
>
> ---
>
> **Phase**: 0
> **前置**: 无
> **预计工期**: 1-2 天
> **执行者**: Trae Agent（只读扫描 + 生成报告）
> **Human Checkpoint**: ✅ 业务域清单需 Human 确认

---

## 🎯 目标

在正式动手重构前，对 qrclaw 仓库的**现状做量化审计**，产出 `docs/conventions/audit-report.md` 作为整个重构计划的事实基线。

**不做的事**：
- ❌ 不修改任何业务代码
- ❌ 不改任何配置文件
- ❌ 不新增依赖

**只做的事**：
- ✅ 只读扫描
- ✅ 生成一份 markdown 报告
- ✅ 可新建 `scripts/audit/` 存放扫描脚本（可选）

---

## 📚 上下文（Context）

### 必读文件

| 文件 | 用途 |
|---|---|
| `docs/refactor/refactor-plan.md` | 主计划（了解审计的战略定位） |
| `docs/refactor/tasks/README.md` | 任务卡通用规范 |
| `README.md` | 项目概览 |
| `CLAUDE.md` | 项目规范总入口 |

### 扫描范围

| 目录 | 文件类型 | 预期产出 |
|---|---|---|
| `web/src/` | `.ts`, `.tsx` | 业务域清单、类型定义、hooks、组件 |
| `gateway/src/` | `.ts` | HTTP 路由、WS 消息、类型定义 |
| `supabase/functions/` | `.ts` | Edge Function 清单 |
| `supabase/migrations/` | `.sql` | 数据库实体清单、枚举类型 |

---

## 📝 详细步骤

### Step 1: 统计项目体量

```bash
# 1.1 统计各目录 LOC
echo "=== Project LOC Stats ===" > /tmp/audit-loc.txt

echo "--- web/src (TS+TSX) ---" >> /tmp/audit-loc.txt
find web/src -type f \( -name "*.ts" -o -name "*.tsx" \) | xargs wc -l | tail -1 >> /tmp/audit-loc.txt

echo "--- gateway/src (TS) ---" >> /tmp/audit-loc.txt
find gateway/src -type f -name "*.ts" | xargs wc -l | tail -1 >> /tmp/audit-loc.txt

echo "--- supabase/functions (TS) ---" >> /tmp/audit-loc.txt
find supabase/functions -type f -name "*.ts" | xargs wc -l | tail -1 >> /tmp/audit-loc.txt

echo "--- supabase/migrations (SQL) ---" >> /tmp/audit-loc.txt
find supabase/migrations -type f -name "*.sql" | xargs wc -l | tail -1 >> /tmp/audit-loc.txt

# 1.2 文件数
echo "" >> /tmp/audit-loc.txt
echo "=== File Counts ===" >> /tmp/audit-loc.txt
echo "web: $(find web/src -type f \( -name '*.ts' -o -name '*.tsx' \) | wc -l)" >> /tmp/audit-loc.txt
echo "gateway: $(find gateway/src -type f -name '*.ts' | wc -l)" >> /tmp/audit-loc.txt
echo "supabase/functions: $(find supabase/functions -type f -name '*.ts' | wc -l)" >> /tmp/audit-loc.txt
```

### Step 2: 推断业务域

#### 2.1 从 `web/src/app/` 路由推断

```bash
# 列出所有 App Router 路由
find web/src/app -type d | sort > /tmp/audit-web-routes.txt
```

将路由映射到业务域。参考初步判断（Trae 需基于实际代码复核）：

| 路由路径 | 推断业务域 |
|---|---|
| `(auth)/*`, `auth/*` | auth |
| `(dashboard)/qrcodes/*`, `q/[slug]` | qrcode |
| `(dashboard)/settings/agents/*`, `agent/[agentId]` | agent |
| `(dashboard)/messages`, `chat/[agentId]`, `m/chat/*` | chat |
| `claim/[token]` | claim |
| `pricing`, `components/pricing` | subscription |
| `m/*` | （跨域移动端路由，标注为 `mobile` tag） |

#### 2.2 从 `web/src/hooks/` 命名推断

```bash
ls web/src/hooks/ | sort > /tmp/audit-web-hooks.txt
```

每个 hook 归属哪个业务域？产出映射表。

#### 2.3 从 `web/src/components/` 子目录推断

```bash
ls -d web/src/components/*/ > /tmp/audit-web-components.txt
```

#### 2.4 从 `gateway/src/routes/` 与 `supabase/functions/` 印证

```bash
ls gateway/src/routes/ > /tmp/audit-gateway-routes.txt
ls -d supabase/functions/*/ > /tmp/audit-supabase-functions.txt
```

#### 2.5 输出业务域候选清单

输出类似格式：

```markdown
## 业务域候选清单

### 1. qrcode（二维码）
- **web 相关**: app/(dashboard)/qrcodes/, app/q/[slug]/, hooks/useQRCodes.ts, lib/create-qrcode-*.ts, components/ui/QRCard.tsx
- **gateway 相关**: routes/create-qrcode.ts, routes/create-qrcode-avatar.ts
- **supabase 相关**: functions/create-qrcode/, functions/manage-qrcode/, migrations (qrcodes 表)
- **置信度**: 高
- **复杂度估计**: 中

### 2. chat（对话）
...
```

### Step 3: 列出 HTTP / WebSocket 端点

```bash
# 3.1 HTTP 路由
echo "=== Gateway HTTP Routes ===" > /tmp/audit-endpoints.txt
for f in gateway/src/routes/*.ts; do
  echo "--- $f ---"
  grep -nE "router\.(get|post|put|delete|patch)" "$f" || true
done >> /tmp/audit-endpoints.txt

# 3.2 Edge Function HTTP 入口
echo "" >> /tmp/audit-endpoints.txt
echo "=== Supabase Edge Functions ===" >> /tmp/audit-endpoints.txt
for d in supabase/functions/*/; do
  name=$(basename "$d")
  [ "$name" = "_shared" ] && continue
  echo "Function: $name ($d)"
done >> /tmp/audit-endpoints.txt

# 3.3 WebSocket 消息类型
echo "" >> /tmp/audit-endpoints.txt
echo "=== WebSocket Schemas ===" >> /tmp/audit-endpoints.txt
grep -nE "(z\.object|z\.discriminatedUnion|z\.enum|MessageType)" gateway/src/ws/*.ts >> /tmp/audit-endpoints.txt || true
grep -nE "(z\.object|MessageType)" web/src/lib/ws/*.ts >> /tmp/audit-endpoints.txt || true
```

### Step 4: 识别类型漂移风险点

```bash
# 4.1 所有 type/interface 定义
echo "=== Type/Interface Definitions Across Boundaries ===" > /tmp/audit-types.txt

for kw in "QRCode" "Message" "Agent" "Conversation" "User" "Status" "Subscription" "Claim"; do
  echo "" >> /tmp/audit-types.txt
  echo "### Keyword: $kw" >> /tmp/audit-types.txt
  rg -n "^(export )?(type|interface|enum|const enum) $kw" web/src/ gateway/src/ supabase/functions/ >> /tmp/audit-types.txt 2>/dev/null || true
done

# 4.2 Zod schema 定义
echo "" >> /tmp/audit-types.txt
echo "### Zod Schemas" >> /tmp/audit-types.txt
rg -n "z\.object\(|z\.enum\(|z\.discriminatedUnion\(" web/src/ gateway/src/ supabase/functions/ >> /tmp/audit-types.txt 2>/dev/null || true
```

**对每个关键词**（QRCode / Message / Agent / Conversation / User）：
- 在 web / gateway / supabase 各自出现多少次定义
- 定义是否一致（字段名、类型、枚举值）
- 输出**类型漂移风险点清单**，带 `file:line` 证据

### Step 5: 识别硬编码字符串

```bash
echo "=== Hardcoded Strings Audit ===" > /tmp/audit-hardcoded.txt

# 5.1 状态枚举硬编码
echo "--- Status string literals ---" >> /tmp/audit-hardcoded.txt
rg -nE "(\"|')(active|paused|revoked|draft|archived|ACTIVE|PAUSED|REVOKED|DRAFT)(\"|')" web/src/ gateway/src/ supabase/functions/ --type ts --type tsx >> /tmp/audit-hardcoded.txt 2>/dev/null || true

# 5.2 WebSocket message type 硬编码
echo "" >> /tmp/audit-hardcoded.txt
echo "--- WS message type literals ---" >> /tmp/audit-hardcoded.txt
rg -nE "type:\s*(\"|')[a-z_\.]+(\"|')" web/src/ gateway/src/ --type ts --type tsx >> /tmp/audit-hardcoded.txt 2>/dev/null || true

# 5.3 错误码硬编码
echo "" >> /tmp/audit-hardcoded.txt
echo "--- Error code literals ---" >> /tmp/audit-hardcoded.txt
rg -nE "(errcode|errorCode|error_code)\s*[:=]\s*\d+" web/src/ gateway/src/ supabase/functions/ --type ts --type tsx >> /tmp/audit-hardcoded.txt 2>/dev/null || true
```

### Step 6: 数据库实体清单

```bash
# 6.1 列出所有表
echo "=== Database Tables ===" > /tmp/audit-db.txt
rg -nE "CREATE TABLE (IF NOT EXISTS )?[\w\.]+" supabase/migrations/*.sql >> /tmp/audit-db.txt

# 6.2 列出所有 enum
echo "" >> /tmp/audit-db.txt
echo "=== Database Enums ===" >> /tmp/audit-db.txt
rg -nE "CREATE TYPE \w+ AS ENUM" supabase/migrations/*.sql >> /tmp/audit-db.txt

# 6.3 列出所有 RLS 策略
echo "" >> /tmp/audit-db.txt
echo "=== RLS Policies ===" >> /tmp/audit-db.txt
rg -nE "CREATE POLICY|ALTER TABLE .* ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql >> /tmp/audit-db.txt
```

### Step 7: 生成审计报告

创建 `docs/conventions/audit-report.md`，按以下结构写入（引用前面各步的 `/tmp/audit-*.txt`）：

```markdown
# QRClaw 架构现状审计报告

> **日期**: YYYY-MM-DD
> **执行者**: Trae Agent
> **扫描范围**: web/, gateway/, supabase/
> **对应任务**: T0 (docs/refactor/tasks/T0-audit.md)

---

## § 1. 项目体量

| 模块 | LOC | 文件数 | 语言 |
|---|---|---|---|
| web/src/ | {N} | {M} | TS + TSX |
| gateway/src/ | {N} | {M} | TS |
| supabase/functions/ | {N} | {M} | TS (Deno) |
| supabase/migrations/ | {N} | {M} | SQL |
| **合计** | **{总}** | **{总}** | — |

（从 Step 1 填入）

## § 2. 业务域候选清单

{按 Step 2 输出的业务域列表，每个域至少包含：
  - 名称 + 中文解释
  - web/gateway/supabase 相关文件（路径列表）
  - 置信度（高/中/低）
  - 复杂度估计（高/中/低）
  - 候选别名（如果有）}

**⚠️ Human Checkpoint**: 业务域清单需人工确认。可能存在歧义的边界情况：
- 例如 `m/*` 移动端路由，是否独立为域 `mobile`？
- 例如 `subscription`（邮件订阅）和 `pricing`（定价页）是一个域还是两个？

## § 3. HTTP 与 WebSocket 端点清单

### 3.1 Gateway HTTP 路由
{按 routes/*.ts 列出所有 router.get/post/... 端点，格式：`METHOD /path` → 文件:行号}

### 3.2 Supabase Edge Functions
{8 个 Function 名称 + 功能简述}

### 3.3 WebSocket 消息类型
{从 gateway/src/ws/schemas.ts 和 web/src/lib/ws/ 提取所有 message type}

## § 4. 类型漂移风险点

### 4.1 核心实体类型定义位置（按关键词分组）

| 实体 | web/ | gateway/ | supabase/ | 一致性 |
|---|---|---|---|---|
| QRCode | {file:line} | {file:line} | {file:line} | ✅ / ⚠️ / ❌ |
| Message | ... | ... | ... | ... |
| Agent | ... | ... | ... | ... |

### 4.2 具体漂移证据
{对每个不一致项，列出：
  - 涉及文件:行号
  - 差异字段
  - 推断的正确定义（以数据库为准）}

## § 5. 硬编码字符串清单

### 5.1 状态枚举
{文件:行号 → 字符串值}

### 5.2 WebSocket 消息类型
{...}

### 5.3 错误码
{...}

## § 6. 数据库实体清单

### 6.1 表
{从 Step 6 提取}

### 6.2 枚举类型
{...}

### 6.3 RLS 策略
{统计：N 个策略覆盖 M 个表}

## § 7. 已识别的架构债（优先治理）

| 优先级 | 问题 | 依据（证据） | 目标 Phase | 预计工时 |
|---|---|---|---|---|
| P0 | 类型漂移：QRCode 在 3 处定义 | § 4.1 | Phase 1 | 0.5 天 |
| P0 | 缺少 WebSocket 协议 SSOT | § 4.1, § 3.3 | Phase 1 | 1 天 |
| P0 | 业务域边界模糊（目录按技术层切分） | § 2 + 扫描 hooks/components | Phase 3 | 1-2 周 |
| P1 | ... | ... | ... | ... |

## § 8. 与主计划的对照

{对照 docs/refactor/refactor-plan.md 的 § 2.3 初步诊断，
 逐项确认或修正。如果发现新的架构债，标注"新增发现"。}

## § 9. 下一步建议

- 基于本报告，建议启动 Phase 1 契约层任务（T1）
- 契约层最先处理：{按严重程度排序的实体列表}
- Human Checkpoint 待决策项：
  - [ ] 业务域清单最终确认
  - [ ] mobile 是否独立为域
  - [ ] subscription/pricing 边界
```

### Step 8: （可选）沉淀扫描脚本

如果 Step 1-6 的 shell 片段有复用价值，整理到 `scripts/audit/`：

```
scripts/audit/
├── scan-loc.sh
├── scan-endpoints.sh
├── scan-types.sh
├── scan-hardcoded.sh
└── scan-db.sh
```

每个脚本附简短注释说明用途。**注意：这是可选步骤**，如时间紧迫可跳过。

---

## 📦 交付物

### 必须交付

- [ ] `docs/conventions/audit-report.md` — 完整的审计报告
- [ ] PR 描述中贴上审计报告的摘要（§ 7 架构债优先级清单）

### 可选交付

- [ ] `scripts/audit/*.sh` — 可复用的扫描脚本
- [ ] `docs/refactor/tasks/T0-findings.md` — 针对 Trae 执行过程中遇到的特殊情况的备注（非必需）

---

## ✅ 验收标准

### 自动验证

```bash
# 1. 报告存在且体积合理（预计 4-10KB）
test -f docs/conventions/audit-report.md
wc -c docs/conventions/audit-report.md  # 应 ≥ 4000

# 2. 必需章节完整
for section in "项目体量" "业务域候选清单" "HTTP 与 WebSocket 端点" "类型漂移风险点" "硬编码字符串" "数据库实体" "架构债"; do
  if ! grep -q "$section" docs/conventions/audit-report.md; then
    echo "FAIL: missing section $section"
    exit 1
  fi
done
echo "PASS: all sections present"

# 3. 所有证据带 file:line 引用
grep -cE "[a-zA-Z/_-]+\.(ts|tsx|sql):[0-9]+" docs/conventions/audit-report.md
# 应 ≥ 20 条引用
```

### 人工验证

- [ ] 业务域清单是否与 Human 认知一致？
- [ ] 架构债优先级是否合理？
- [ ] 类型漂移证据是否准确（抽查 2-3 个 file:line）？
- [ ] 是否有"凭空捏造"的数据（所有数据必须能被扫描命令复现）？

---

## 📤 PR 规范

### 分支

```
refactor/T0-audit
```

### PR 标题

```
refactor(T0): current-state audit report
```

### PR 描述

```markdown
## 任务
- 任务卡: `docs/refactor/tasks/T0-audit.md`
- Phase: 0 (现状审计)
- 前置: 无

## 变更摘要
基于 web/、gateway/、supabase/ 全量扫描，产出现状审计报告。
识别出 {N} 个业务域候选、{M} 个类型漂移风险点、{K} 条架构债。

## 交付物
- [x] docs/conventions/audit-report.md
- [ ] scripts/audit/*.sh (可选，如未完成可忽略)

## 关键发现（摘录）
<从 audit-report.md § 7 复制优先级 P0 的条目>

## 验收结果
<贴 Step 8 验收命令的输出>

## 待 Human 审批事项
- [ ] 业务域最终清单确认（§ 2）
- [ ] mobile 是否独立为域
- [ ] subscription/pricing 边界

## 风险提示
无（纯只读任务）
```

---

## ⚠️ 风险与回退

| 风险 | 概率 | 应对 |
|---|---|---|
| 扫描漏掉某些文件导致业务域不完整 | 中 | Human 审查时补充 |
| 类型漂移判定过宽（把本应独立的类型标为漂移） | 中 | 保留证据 file:line，Human 复核 |
| 报告过长失去可读性 | 低 | 摘要 + 附录结构，关键结论放在 § 7 |

**回退**：本任务无破坏性，直接 revert PR 即可。

---

## 🧠 执行时的注意事项

1. **不要猜测**：所有业务域归属、类型一致性判断，都必须基于实际扫描结果。存疑的，标"待 Human 确认"。
2. **保留证据链**：每条结论都要有 `file:line` 证据，Human 抽查时能快速验证。
3. **报告要结构化**：用 markdown 表格和列表，避免大段散文。
4. **对齐主计划**：生成报告时参照 `docs/refactor/refactor-plan.md § 2.3` 的初步诊断，**确认或修正**该章节的论断。
5. **遇到重大发现及时沟通**：如果扫描过程中发现主计划未预料到的问题（例如某个业务域实际上已分布在 10+ 个目录），在 PR 描述"关键发现"部分醒目标出。
