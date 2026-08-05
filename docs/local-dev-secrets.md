# Local Dev Secrets — Minimal Playbook

> 一处保存，三处消费：shell env / 项目 `.env` / GitHub Actions。
> Cursor CLI agent / Multica agent 做 Supabase 开发前，先读 `docs/supabase-dev-guide.md`。

## 0. Cursor CLI Agent 入口

需要查本地 Supabase 连接和密钥时，看这里：

| 问题 | 去哪里 |
|------|--------|
| 本地 secret 存在哪里 | 本文 §1 |
| Supabase CLI / MCP 怎么连 | `docs/supabase-dev-guide.md` |
| Edge Function 要哪些 secret | `supabase/EDGE_FUNCTIONS_ENV.md` |
| Gateway/Web env 怎么填 | 本文 §2 |
| Owner Agent Chat Host token pepper | 本文 §1 + `docs/supabase-dev-guide.md` §3 |

不要在终端、日志、PR 描述里打印 secret 原文。检查是否存在时只输出 `${VAR:+set}` / `${VAR:+ok}`。

## 1. 本地存哪里

**主文件**：`~/.config/qrclaw/secrets.env`（repo 之外，永远不会被 `git add` 抓到）

```bash
mkdir -p ~/.config/qrclaw
chmod 700 ~/.config/qrclaw
cat > ~/.config/qrclaw/secrets.env <<'EOF'
# Supabase — account level
export SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxx              # Dashboard → Account → Access Tokens
export SUPABASE_PROJECT_ID=your-project-id

# Supabase — project level
export SUPABASE_URL=https://your-project-id.supabase.co
export SUPABASE_ANON_KEY=eyJhbGciOi...                 # Dashboard → Settings → API
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...         # Dashboard → Settings → API（敏感）
export SUPABASE_DB_PASSWORD=xxxxxxxx                   # Dashboard → Settings → Database

# QRClaw 加密
export WS_TICKET_SECRET=xxxxxxxx                       # openssl rand -base64 48
export QRCLAW_KEK_V1=xxxxxxxx                          # openssl rand -hex 32
export QRCLAW_HOST_TOKEN_PEPPER=xxxxxxxx               # openssl rand -hex 32（Owner Agent Chat Host token hash pepper）

# 部署（可选）
# export VERCEL_TOKEN=xxxxxxxx
EOF
chmod 600 ~/.config/qrclaw/secrets.env
```

**让 shell 自动加载**（每个 terminal / Cursor agent 都会继承）：

```bash
echo '[ -f ~/.config/qrclaw/secrets.env ] && source ~/.config/qrclaw/secrets.env' \
  >> ~/.zshrc
source ~/.zshrc
```

**Supabase CLI 额外配一份**（这样 `npx supabase` 不用手动带 env）：

```bash
mkdir -p ~/.supabase
echo "$SUPABASE_ACCESS_TOKEN" > ~/.supabase/access-token
chmod 600 ~/.supabase/access-token
```

## 2. 项目 `.env` 怎么填

`gateway/.env` 和 `web/.env.local` 都 **gitignored**。第一次创建或轮换 secret 后，直接把 SSoT 里对应的值拷过去：

```bash
# gateway/.env — 参考 gateway/.env.example 的字段清单，照着填
# web/.env.local — 参考 web/.env.local.example 的字段清单，照着填
```

两个文件字段少、轮换不频繁，手抄一次比写同步脚本划算。

## 3. GitHub Actions 怎么同步

一次性操作，用 `gh` CLI（`gh auth login` 先装好）：

```bash
# 把当前 shell 里的值一条条推上去
for name in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_DB_PASSWORD \
            SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY \
            WS_TICKET_SECRET QRCLAW_KEK_V1 QRCLAW_HOST_TOKEN_PEPPER; do
  printf '%s' "${!name}" | gh secret set "$name" --body -
done
```

单条更新：`printf '%s' "$QRCLAW_KEK_V1" | gh secret set QRCLAW_KEK_V1 --body -`

用 `--body -` 读 stdin，不会把值写进 shell history 或 `ps` 输出。

## 4. Supabase Edge Function secrets

`QRCLAW_KEK_V1` 必须在 Edge Function runtime **额外**设一次（因为 Supabase Edge Function 和 GitHub Actions 是两个独立的 secret store）：

```bash
npx supabase secrets set \
  --project-ref "$SUPABASE_PROJECT_ID" \
  QRCLAW_KEK_V1="$QRCLAW_KEK_V1"
```

矩阵（每个 function 需要哪些 secret）见 `supabase/EDGE_FUNCTIONS_ENV.md`。

`QRCLAW_HOST_TOKEN_PEPPER` 当前由 Gateway Host token API 使用，不需要注入 Edge Function。只有未来把 Host token 校验移入 Edge Function 时，才更新 `supabase/EDGE_FUNCTIONS_ENV.md`。

## 5. 检查是否生效

```bash
echo "${WS_TICKET_SECRET:+ok}"          # 期望输出 ok
echo "${QRCLAW_KEK_V1:+ok}"             # 期望输出 ok
echo "${QRCLAW_HOST_TOKEN_PEPPER:+ok}"  # Owner Agent Chat Wave 3 前必须 ok
ls -la ~/.config/qrclaw/secrets.env     # 期望 -rw------- (600)
cd gateway && npm run dev               # 期望不报 "X is required"
```

## 轮换 `QRCLAW_KEK_V1` 的特殊约束

KEK 是 DEK 的 wrapper，**不能直接换**，否则历史消息解密全失败。需要多版本并存迁移：

1. 生成 `QRCLAW_KEK_V2`（`openssl rand -hex 32`），同时写入 SSoT、`gateway/.env`、Edge Function secret。
2. 编写迁移任务：把 `encryption_keys` 表里所有 V1 wrap 的 `encrypted_dek` 用 V1 解开、再用 V2 重新 wrap，同时把 `dek_info.kek_version` 改成 2。
3. 一个完整备份周期后移除 V1。

这不是常规操作，只在密钥泄露确认或多年一次的防御轮换时做。

## 路径速查

| 用途 | 位置 | 状态 |
|------|------|------|
| 主密钥清单 (SSoT) | `~/.config/qrclaw/secrets.env` | 本地，chmod 600 |
| Supabase CLI token | `~/.supabase/access-token` | 本地，chmod 600 |
| Gateway 运行时 env | `gateway/.env` | gitignored |
| 前端运行时 env | `web/.env.local` | gitignored |
| Gateway 模板 | `gateway/.env.example` | 入库 |
| 前端模板 | `web/.env.local.example` | 入库 |
| Edge Function secret 矩阵 | `supabase/EDGE_FUNCTIONS_ENV.md` | 入库 |
| Supabase 开发入口 | `docs/supabase-dev-guide.md` | 入库 |
| GitHub Actions 已配清单 | `docs/ci-cd-optimization-plan.md` §2 | 入库 |
