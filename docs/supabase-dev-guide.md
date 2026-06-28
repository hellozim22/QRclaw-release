# Supabase Development Guide

> **用途**: Cursor CLI agent / Multica agent 在 QRClaw 里做 Supabase 数据库、Edge Function、RLS、types 开发时的入口文档。  
> **项目**: `zyxqadubhwrnsoujiyir` (`qrclaw`)  
> **配套密钥文档**: `docs/local-dev-secrets.md`  
> **Edge Function secret 矩阵**: `supabase/EDGE_FUNCTIONS_ENV.md`

---

## 1. Cursor CLI Agent 先读这里

做任何 Supabase 相关任务前，按顺序读：

```text
AGENTS.md
docs/local-dev-secrets.md
docs/supabase-dev-guide.md
supabase/EDGE_FUNCTIONS_ENV.md
```

Owner Agent Chat 相关任务还要读：

```text
requirements/owner-agent-chat-product-requirements.md
requirements/owner-agent-chat-technical-specification.md
requirements/owner-agent-chat-test-plan.md
docs/superpowers/plans/2026-04-27-owner-agent-chat-implementation-plan.md
requirements/owner-agent-chat-architecture-review.md
```

---

## 2. 本地密钥在哪里

本地密钥 SSoT 在仓库外：

```text
~/.config/qrclaw/secrets.env
```

该文件必须：

```text
chmod 600 ~/.config/qrclaw/secrets.env
```

`~/.zshrc` 会 source 它，因此新 terminal / Cursor agent 正常会继承这些 env。

不要把 secret 写进仓库、聊天记录、日志或测试快照。检查变量是否存在时只输出 `set/ok`，不要输出值。

安全检查命令：

```bash
printf 'SUPABASE_ACCESS_TOKEN=%s\n' "${SUPABASE_ACCESS_TOKEN:+set}"
printf 'SUPABASE_PROJECT_ID=%s\n' "${SUPABASE_PROJECT_ID:+set}"
printf 'SUPABASE_URL=%s\n' "${SUPABASE_URL:+set}"
printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "${SUPABASE_SERVICE_ROLE_KEY:+set}"
printf 'QRCLAW_KEK_V1=%s\n' "${QRCLAW_KEK_V1:+set}"
```

---

## 3. 必备 Supabase 变量

本地开发至少需要：

| Variable | 用途 | 来源 |
|----------|------|------|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI / MCP 项目操作 | Dashboard → Account → Access Tokens |
| `SUPABASE_PROJECT_ID` | 项目 ref，当前为 `zyxqadubhwrnsoujiyir` | 固定项目值 |
| `SUPABASE_URL` | Supabase API URL | Dashboard → Settings → API |
| `SUPABASE_ANON_KEY` | Web public client | Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Gateway / service role 写路径 | Dashboard → Settings → API |
| `SUPABASE_DB_PASSWORD` | 直连 DB / psql | Dashboard → Settings → Database |
| `QRCLAW_KEK_V1` | Gateway 写路径 + Edge Function 解密读路径 | `openssl rand -hex 32` |

Owner Agent Chat Host token 还需要：

| Variable | 用途 | 状态 |
|----------|------|------|
| `QRCLAW_HOST_TOKEN_PEPPER` | Gateway 计算 Host token HMAC hash | Wave 3 前必须补齐；不需要 Edge Function |

生成建议：

```bash
openssl rand -hex 32
```

---

## 4. Supabase CLI

当前本机已安装 Supabase CLI，期望版本：

```bash
supabase --version
```

应返回 `2.95.4` 或更新版本。

验证账号与项目：

```bash
supabase projects list
```

应看到 linked 项目：

```text
zyxqadubhwrnsoujiyir | qrclaw
```

Supabase CLI token 本地文件：

```text
~/.supabase/access-token
```

该文件也必须 `chmod 600`。

---

## 5. Supabase MCP

Cursor agent 优先使用 Supabase MCP 做只读探针和 schema 查询。

常用 MCP 工具：

```text
list_tables
list_migrations
execute_sql
get_advisors
generate_typescript_types
list_edge_functions
```

使用 MCP 前必须先读工具 descriptor。Descriptor 在：

```text
/Users/zeze/.cursor/projects/Users-zeze-qrclaw/mcps/plugin-supabase-supabase/tools/
```

只读连接探针：

```sql
select current_database() as database_name, current_user as db_user, now() as server_time;
```

不要在 MCP `execute_sql` 里直接做生产 DDL。需要 schema 变更时，先设计 migration。

---

## 6. Migration 工作流

Supabase schema 变更必须走 migration。

推荐流程：

```bash
supabase migration new <descriptive_name>
```

然后编辑生成的 SQL 文件。

要求：

- 新增 `public` 表必须 `ENABLE ROW LEVEL SECURITY`。
- RLS policy 必须按真实 owner/actor 关系写，不要默认套模板。
- 不要用 `user_metadata` 做授权。
- 新增索引、约束、FK、cascade 必须写清。
- 已部署 migration 不改原文件，后续修正用新 migration。

迁移后生成 types：

```bash
SUPABASE_ACCESS_TOKEN=... npx supabase gen types typescript \
  --project-id zyxqadubhwrnsoujiyir > supabase/types/database.types.ts
```

也可以使用 Supabase MCP `generate_typescript_types`。

---

## 7. Edge Function Secret

Edge Function secret 与 Gateway `.env` 是两套 secret store。

`decrypted-messages` 必须设置：

```text
QRCLAW_KEK_V1
```

同步命令：

```bash
npx supabase secrets set \
  --project-ref "$SUPABASE_PROJECT_ID" \
  QRCLAW_KEK_V1="$QRCLAW_KEK_V1"
```

完整矩阵见：

```text
supabase/EDGE_FUNCTIONS_ENV.md
```

`QRCLAW_HOST_TOKEN_PEPPER` 是 Gateway Host token hash pepper，本轮不需要注入 `decrypted-messages` Edge Function，除非后续设计把 Host token 校验移入 Edge Function。

---

## 8. Owner Agent Chat 开发注意

Owner Agent Chat Wave 1 会涉及：

```text
agent_hosts
agent_host_tokens
agent_host_providers
agent_bindings
owner_agent_conversations
owner_agent_messages
owner_agent_runs
owner_agent_run_events
owner_agent_conversation_keys
agents 扩展字段
```

关键约束：

- `owner_agent_conversation_keys` 不复用旧 `encryption_keys`。
- `owner_agent_messages` / `owner_agent_run_events` 正文必须密文存储。
- `decrypted-messages` 是历史读取的解密入口。
- Host token 原文不落库，只存 hash。
- `provider_work_dir` 和 `binary_path` 不存本机绝对路径。
- `QRCLAW_HOST_TOKEN_PEPPER` 文档同步必须在 Wave 3 Host token API 前完成。

---

## 9. 常用验证命令

不泄露 secret 的 env 检查：

```bash
printf 'SUPABASE_ACCESS_TOKEN=%s\n' "${SUPABASE_ACCESS_TOKEN:+set}"
printf 'SUPABASE_PROJECT_ID=%s\n' "${SUPABASE_PROJECT_ID:+set}"
printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "${SUPABASE_SERVICE_ROLE_KEY:+set}"
```

CLI 项目检查：

```bash
supabase projects list
supabase migration list
```

Advisors：

```bash
supabase db advisors
```

类型生成：

```bash
SUPABASE_ACCESS_TOKEN=... npx supabase gen types typescript \
  --project-id zyxqadubhwrnsoujiyir > supabase/types/database.types.ts
```

Edge Functions：

```bash
supabase functions list --project-ref "$SUPABASE_PROJECT_ID"
```

---

## 10. 阻塞排查

| 症状 | 先查 |
|------|------|
| `supabase projects list` 失败 | `SUPABASE_ACCESS_TOKEN` 是否 set；`~/.supabase/access-token` 是否存在 |
| Edge Function 解密 500 | `QRCLAW_KEK_V1` 是否同时在 Gateway 和 Edge Function secret |
| Gateway Supabase API 失败 | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 是否 set |
| Web 登录/查询失败 | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| RLS 查不到数据 | owner 映射、policy 的 `SELECT` 链、是否误用 `user_metadata` |
| types 不匹配 | 是否重新生成 `supabase/types/database.types.ts` |

