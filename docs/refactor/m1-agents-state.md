# M1-DB-AGENTS — 现状确认备忘录

**日期**：2026-04-20  
**作者**：执行 agent（M1 里程碑）  
**相关 Task Card**：`docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md` §12.3.1 M1-DB-AGENTS  
**决策选项**：B（跳过 `agent_connections` 表，复用现有 `agents` 表字段）  
**落地产物**：**零 migration**。本文档即 M1-DB-AGENTS 的交付物。

---

## 1. 调研结论

### 1.1 `agents` 表已原生支持"one owner → many agents"

Supabase staging 实际 schema（`public.agents`，截至 2026-04-20，42 行真实数据）：

```sql
agents (
  id              uuid PK default gen_random_uuid(),
  owner_id        uuid references owners(id) on delete cascade,  -- ❗ 无 UNIQUE 约束
  name            text not null,
  api_key_hash    text not null,
  status          text not null default 'pending'
                    check (status in ('pending','active','suspended')),
  ws_connected    boolean not null default false,
  last_seen_at    timestamptz,
  description     text,                  -- 后续 migration 已补
  registration_ip text,                  -- 后续 migration 已补
  claimed_at      timestamptz,           -- 后续 migration 已补
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
)
```

**关键事实**：

- `owner_id` 外键**无 UNIQUE 约束** → 同一个 owner 可以有任意多个 agents，**本就支持 OpenClaw 多 agent per account 的模型**
- RLS policies（`agents_select_own / insert_own / update_own / delete_own`）按 `owner_id ∈ (SELECT id FROM owners WHERE user_id = auth.uid())` 匹配，多 agent 语义下零歧义
- 现有 42 行数据中存在若干 `owner_id` 重复（多 agent per owner 已是线上事实）

### 1.2 `agents.ws_connected + last_seen_at` 已覆盖"在线态"需求

plan §12.3.1 原卡提到的 `agent_connections(agent_id PK, last_seen_at, is_online, account_label)` 字段，与现状对照：

| plan 卡字段 | 现状位置 | 备注 |
|---|---|---|
| `agent_id` | `agents.id` | 同一信息 |
| `last_seen_at` | `agents.last_seen_at` | ✅ 已有 |
| `is_online` | `agents.ws_connected`（bool） | ✅ 已有，语义等价 |
| `account_label` | `agents.name`（owner 可编辑）| ⚠️ 可沿用；若需区分"用户别名"与"技术 name"，未来在 `agents` 表加一列即可 |

→ 建一张独立 `agent_connections` 表会造成"同一事实两处写"（agents.ws_connected / agent_connections.is_online），工程风险大于收益。

---

## 2. B 方案 — 跳过建表，现阶段零 migration

### 2.1 决策

M1-DB-AGENTS 不新增 `agent_connections` 表；M2 Dashboard（§12.4.1 M2-DASH）直接读 `agents.ws_connected / agents.last_seen_at` 展示在线状态。

### 2.2 为什么选 B

1. **符合 v1.3 的"MVP 不提前工程化"基调**（与 D-REV-02 拒绝 M3 灰度同源）
2. **消除数据冗余风险**：`ws_connected` 已在 Gateway `authService.ts` 的心跳逻辑里写入，新加 `agent_connections.is_online` 会引入双源同步问题
3. **迁移成本低**：未来真出现"一个 agent 多条 WS connection（HA 多进程部署）"的需求，届时 `agent_connections` 表是全新实体，migration 干净独立

### 2.3 何时该回调 B → A

触发 A 方案（建独立表）的条件，任一成立：

- QRClaw Gateway 部署拓扑从"单进程"升级为"多进程 / 多实例"——此时一个 agent 可能同时持有 ≥ 2 条活跃 WS，`agents.ws_connected` 这个单 bool 无法承载
- OpenClaw 插件需要展示"同一 agent 的哪一个物理连接在线"（debug / 运维场景）
- 出现"account_label"与"技术 name"需要严格分离的产品需求
- 产品需求需要 **"per-QR-Code 级别"** 的在线状态展示（而非全局 bool）——`agents.ws_connected` 只能回答"agent 是否在线"，不能回答"agent 是否在某个特定 QR Code 的对话里活跃"（代码审查 C-2 / M-10 补充）

任一触发时，另起独立 plan（≤ 0.5 人日工作量）新建 `agent_connections` 表，现有 `agents.ws_connected` 作为兼容兜底。

---

## 3. 对下游里程碑的影响

| 里程碑 | 受影响的位置 | 应对 |
|---|---|---|
| **M2-DASH**（§12.4.1） | Dashboard Agent 列表 "online / offline" 徽标 | 直接 `select id, name, ws_connected, last_seen_at from agents where owner_id = ?`，无需 JOIN `agent_connections` |
| **M2-WS-OPT**（§12.4.2） | 无影响 | 协议层 Zod optional 字段与本表无关 |
| **M2-GW-FANOUT**（§12.4.3） | Gateway fanout 抽象 | 仍按 §12.4.3"仅抽象、行为不变"约束；connection 查询依然走 `agents.ws_connected` |
| **M3-EDGE**（§12.5.1） | 无影响 | Edge Function 解密只读 `messages` / `encryption_keys` |
| **M4-PLUGIN**（§12.6.x） | 插件端展示"连接到 QRClaw 的状态" | 无 server-side schema 变动；插件 SDK 侧维护自己的连接状态即可 |

---

## 4. 对 plan 文档的补丁

`docs/superpowers/plans/2026-04-20-qrclaw-openclaw-plugin-refactor.md` §12.3.1 加一行"v1.3 执行落点"，引用本备忘录；卡内容保留原样作为 A 方案的参考实现。

---

## 5. 验收（本备忘录即交付物）

- [x] Supabase 实际 schema 已核对（`information_schema.columns` 查询）
- [x] 42 行真实 agents 数据确认多 agent per owner 模型已在线上运行
- [x] `agents` 表字段与 `agent_connections` 卡字段逐项对照，证明能力覆盖
- [x] 回调条件（B → A）已写明
- [x] 下游里程碑（M2/M3/M4）影响已逐条分析

→ **M1-DB-AGENTS 交付完成，无 migration 改动**，推进 M1-DB-RESERVE。
