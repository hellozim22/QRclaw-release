# Wave 10 R2 C2：Storage 策略定版（单人本地 vs Supabase）

> 输入：`r1-data-model.md`、`r1-arch-independent-review.md`、用户决策（单人本地部署，先自用爽）

## 最终决策

**Wave 10 保留 Supabase（选 C），但加入 Wave 11 预研 sqlite 本地模式（选 B）作为后置迭代。**

### 核心理由

1. **Wave 1-9 的 RLS / Edge Function / 加密基础都在 Supabase 上**。迁 sqlite 等于推翻 9 轮工作。
2. **铁律 C2 成文在 Supabase 路径**：`decrypted-messages` Edge Function 是唯一授权解密点。换存储就要重走加密边界审计。
3. **单人本地 ≠ 非 Supabase**。用户本机 Supabase CLI + 本地 postgres = 完全离线。Supabase 自身支持 `supabase start` 起 docker 本地栈。
4. **零云依赖的幻觉**：即使 sqlite 也要 auth（否则任意人访问 localhost 就能读密文），auth 层重建成本大于迁移收益。

---

## 三方案对比

### A. 完全 sqlite 本地（Multica 极简）

| 维度 | 评估 |
|---|---|
| 迁移工作量 | 25-40 天（重写 gateway/db、去 RLS、重做 auth、重做加密） |
| Wave 5-9 保留度 | 30-40%（Go host + adapter 保留，web / gateway / edge 大改） |
| C2 铁律处理 | **最脆弱**。sqlite 无 RLS，加密边界要全部重建；明文解密无"Edge Function 内存态"这一授权概念。 |
| 双击即用难度 | 高：需要打包 Electron 或 Tauri；单人工具发布成本 |
| 未来路径 | 难支持"QR publish"（visitor 对外），因为 visitor 需要公网可达的 API |

**结论**：不推荐。Multica 那套只适合"零网络交互"工具，QRClaw 长远要支持 visitor 对外则 sqlite 不行。

### B. 保留 Supabase 但 opt-in cloud（默认离线）

| 维度 | 评估 |
|---|---|
| 迁移工作量 | 10-15 天（supabase CLI `supabase start` 打包 + 本地 secret 管理 + Edge Function local dev） |
| Wave 5-9 保留度 | 90%（所有 schema / RLS / Edge 都复用，只换 endpoint URL） |
| C2 铁律处理 | **最清晰**。同一套代码路径，只是底层 postgres 在本机 docker 而非 Supabase 云 |
| 双击即用难度 | 中：依赖 docker 或 podman |
| 未来路径 | "本地优先 + 手动同步到云" / "按需 publish to cloud" |

**结论**：Wave 11+ 推荐路径，但不适合 Wave 10（docker 依赖会增加用户首次摩擦）。

### C. 保留现有架构（云 Supabase）

| 维度 | 评估 |
|---|---|
| 迁移工作量 | 0 |
| Wave 5-9 保留度 | 100% |
| C2 铁律处理 | 已验证合规 |
| 双击即用难度 | **最低**：打开浏览器即可，无需 docker |
| 未来路径 | 按需挂 self-host supabase |

**结论**：**Wave 10 选 C**。用户 "先自用爽" 的优先级 = 零摩擦 > 离线。

---

## 迁移分期（Wave 11+ 如需）

### Phase 1（Wave 11）：Supabase 本地栈支持
- `supabase start` 跑在 zimzheng 机器（postgres + auth + edge 全本机）
- 添加 `SUPABASE_MODE=local|cloud` 环境变量，切换 endpoint
- 数据不离开本机

### Phase 2（Wave 12）：SQLite Fallback（可选）
- 为"极端简化"场景提供 sqlite + sqlcipher（加密 at rest）
- 仅支持 Runtime/Agent/Session 最核心功能
- Visitor/QR 功能不走 sqlite 模式

### Phase 3（Wave 13+）：云同步 Opt-in
- 本地主 + 手动触发 push/pull
- 冲突解决基于 `updated_at` last-write-wins

---

## 单人本地当前最佳实践

即使用 Supabase 云，用户仍然是"单人使用"：

1. **邮箱仅一个**（zimzheng）→ owners 表只有 1 行
2. **RLS auth.uid() = owner.user_id** 确保私聊隔离
3. **visitor 流程冷冻** → cross-owner 污染不存在
4. **Edge Function secret 单人部署** → key rotation 简单

---

## 对 C2 铁律的护栏复核

Wave 10 新加 OpenAI SSE 端点时保证：

1. **SSE 路由不日志化 content**（只记 run_id / seq / bytes）
2. **禁止 `Last-Event-ID` 触发 DB 解密**（见 r2-c4-sse-spec-final.md）
3. **resume 只走 decrypted-messages Edge Function**（已合规）
4. **Gateway 加密写路径不变**（encrypt → persist → publish）

---

## 结论行动

- Wave 10 DB 层：Supabase 不变
- 新增 schema：按 `r2-c1-model-resolution.md` 做 `agent_runtimes` / agents 加 runtime_id / conversations 改名 sessions
- 不做 sqlite 迁移
- 不改 gateway 进程模型（继续 Express 独立进程）

### 记入 Wave 10 acceptance
"本 Wave 不做存储切换，如遇 Supabase 不可用，属于外部阻塞不影响 Wave 完成判定"。
