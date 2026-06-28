# R2-C2 Storage Resolution 补充审查

> 输入：`r2-c2-storage-resolution.md`、`r1-arch-independent-review.md`、Supabase / PGlite / Turso 公开资料。

## 结论

我同意 **Wave 10 不迁 sqlite、保留 Supabase 云路径**，因为当前阶段最重要的是把 chat 体验、Runtime/Agent/Session、SSE、E2E 这些用户可感知能力收敛，而不是重做存储底座。

但我不同意把 "sqlite 也要 auth，所以收益不大" 作为强理由。对单人本机 app，auth 可以退化为 OS 用户 + loopback + pairing token，不一定比 Supabase 更复杂。真正站得住的理由是：**QRClaw 已经不是从零 MVP，Wave 5-9 的 RLS / Edge Function / 加密读写边界已经形成沉没成本，Wave 10 迁移会破坏交付节奏。**

## 对原文 4 个理由的审查

| 原理由 | 判断 | 补充意见 |
|---|---|---|
| Wave 1-9 基础都在 Supabase 上 | 成立 | 这是最强理由。迁 sqlite 会牵动 schema、RLS、Edge Function、Gateway 写路径、E2E fixture，不只是换 driver。 |
| C2 成文在 Supabase 路径 | 成立但需收窄 | 对 cloud/operator 威胁模型成立；对纯本机单用户，R1 提出的 C2-local 并非荒谬。原文应明确 "Wave 10 继续采用 C2-cloud，不在本 wave 重新定义威胁模型"。 |
| `supabase start` 可跑本地栈 | 技术可行 | 官方本地开发要求 Docker-compatible runtime；`supabase start` 可启动本地 Postgres/Auth/Storage 等服务，本地 Edge Function 可通过 `supabase functions serve` 测试。可行，但不是双击即用。 |
| sqlite 仍要 auth | 部分成立 | 如果保留 visitor/QR publish、多 owner、跨设备同步，则 auth 必须保留；如果只做 zimzheng 单机本地，则可以弱化为 OS / pairing。建议改成 "sqlite 不能保留现有 RLS/Auth/Edge 语义"。 |

## `supabase start` 本地栈可行性

可行，但应写清楚边界：

1. 依赖 Docker Desktop / OrbStack / Rancher Desktop / Podman 等 Docker API 兼容 runtime。
2. 首次启动需要拉镜像；离线可用成立的前提是镜像和 CLI 已安装。
3. local stack 应绑定 `127.0.0.1`，不要暴露到公网；官方文档也提示不应公开本地栈。
4. 本地 endpoint / anon key / service role key 与云端不同，需要 `SUPABASE_MODE=local|cloud` 之外再配套 env 切换、seed、migration、Edge Function secret 注入。
5. `decrypted-messages` 这种函数本地开发需要明确 `supabase functions serve` 或等价进程管理；不能只写 `supabase start` 就假设 Edge Function 行为完全等同生产。

参考：
- https://supabase.com/docs/guides/local-development
- https://supabase.com/docs/guides/functions/quickstart

## Wave 11 分期是否乐观

原文把 Phase 1 估为 10-15 天偏乐观。若只是 "开发者机器能跑"，10-15 天合理；若目标是用户可用的本地模式，需要拆成两段：

| 阶段 | 建议范围 | 估时 |
|---|---|---:|
| W11a local dev parity | `supabase start`、migration/seed、local env、Edge Function 本地验证、C2 回归测试 | 8-12 天 |
| W11b local product mode | 安装向导、Docker/OrbStack 检测、端口冲突处理、secret 初始化、备份/恢复、云/本地切换 UX | 12-20 天 |

所以 Wave 11 若承诺 "本地开发可用" 可以；若承诺 "普通用户离线可用"，应改为 20-30 天并列为独立里程碑。

## 漏掉的存储层选项

### 1. PGlite + ElectricSQL

PGlite 是 WASM Postgres，可在 Node/Bun/Deno/浏览器运行，支持 filesystem / IndexedDB 持久化，并提供 live query / sync primitive。它比 sqlite 更接近现有 Postgres schema，适合作为 "无 Docker 的本地 Postgres-like" 预研。

限制：它不等于 Supabase；Auth、RLS、Storage、Edge Function 都要另行处理。适合 Wave 12+ 预研，不适合 Wave 10 切主线。

参考：https://electric-sql.com/primitives/pglite

### 2. Turso / libSQL

Turso 基于 SQLite/libSQL，定位 local-first，支持 embedded local database、periodic sync，并已有 offline writes beta。它比原生 sqlite 更适合作为未来 "本地优先 + 云同步" 候选。

限制：schema/SQL 能力与 Postgres 不完全一致；RLS/Auth/Edge Function 语义无法复用，C2 仍需重写。

参考：https://turso.tech/local-first

### 3. SQLite + SQLCipher + Litestream/rclone

这是最极简的 Multica-style 路线：本机 sqlite 文件加密，备份/同步交给 Litestream、rclone 或用户自己的云盘。

限制：它是全新产品形态，不是当前 QRClaw 架构的小改。适合 "真双击本地 app" 的 R3 备选，不应塞进 Wave 10。

### 4. 本地 Postgres / Postgres.app

比 Supabase local stack 更轻一点，但会丢 Auth、Storage、Edge Function、RLS policy 验证工具链的一体化收益。除非决定放弃 Supabase 平台语义，否则不如直接 `supabase start`。

## 是否需要改原文

建议小改，不必推翻结论：

1. 把 "选 C" 改成更明确的 "**Wave 10 选 C；Wave 11 只做 local Supabase spike，不承诺用户级离线模式**"。
2. 把 "sqlite 也要 auth" 改成 "sqlite 无法复用现有 Supabase Auth/RLS/Edge Function/C2 语义，迁移收益低于风险"。
3. 在 Phase 1 增加本地栈 caveat：Docker runtime、首次拉镜像、Edge Function 本地 serve、secret/seed/env 切换、localhost 绑定。
4. 增加 "存储备选观察池"：PGlite/Electric、Turso/libSQL、SQLite+SQLCipher，并明确都不进入 Wave 10。

最终建议：**保留 R2-C2 的结论，但把理由从 "Supabase 本身永远更好" 调整为 "在当前 QRClaw 阶段，保 Supabase 是最小风险交付路径"。**
