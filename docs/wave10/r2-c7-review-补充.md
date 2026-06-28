# Wave 10 R2 C7 E2E Spec Skeleton Plan Review

> 审查对象：`docs/wave10/r2-c7-e2e-spec-skeletons-plan.md`  
> 结论：方向正确，但需要先处理 R1 已生成 30 个 skeleton 与 R2 C6 43 用例的编号/目录漂移；CI 不能假设 GitHub-hosted runner 能稳定安装并认证 4 个真实 CLI。

## 1. 目录调整建议

### 1.1 保留按能力域拆分，但先做一次迁移映射

当前计划的 8 个目录基本合理：

| 目录 | 评价 | 建议 |
|---|---|---|
| `onboarding/` | 合理 | 保留 E2E-01/02/03，补首次登录 flow 与 runtime 半连态时可以继续放这里 |
| `chat-core/` | 合理 | 保留流式、markdown、copy、stop、regenerate；不要把多 agent 并发混在这里 |
| `session-mgmt/` | 合理 | 保留 session CRUD/search/archive/export；C5 回放用例也放这里 |
| `agent-edit/` | 合理 | 保留 instructions/template/delete；命名可改 `agent-mgmt/` 以覆盖创建/编辑/删除 |
| `attachments/` | 合理 | PDF、截图、图片预览、Mermaid、LaTeX 都在同一域 |
| `runtime-mgmt/` | 合理 | runtime version/offline/recovery/binary override 属于同一域 |
| `edge-cases/` | 偏泛 | 建议拆成 `resilience/` + `security/`，与现有 R1 skeleton 更接近 |
| `iron-rules/` | 必须保留 | C2/C4/C5 护栏应独立可 grep、可 release gate |

需要先新增一张 `docs/wave10/r2-c7-r1-to-r2-skeleton-map.md` 或写入 README：

- 现有 `tests/e2e/wave10/` 已有 30 个 R1 skeleton，不应直接再生成 43 个造成重复。
- 先按 `OAC-W10-E2E-xx` 统一编号；旧 `OAC-Wave10-E2E-xx / R1 Px-xx` 作为 `Source` 字段保留。
- R2 新增的 13 个 spec 只补缺口；R1 语义不同的旧 spec 要 rename/move，而不是保留双份。

### 1.2 建议最终结构

```text
tests/e2e/wave10/
├── README.md
├── fixtures/
│   ├── true-runtime.matrix.ts
│   ├── owner-auth.fixture.ts
│   └── artifact-redaction.ts
├── onboarding/
├── chat-core/
├── session-mgmt/
├── agent-mgmt/
├── attachments/
├── runtime-mgmt/
├── resilience/
├── iron-rules/
└── regression/
```

`fixtures/` 放 wave10 专用 fixture；跨 wave 可复用的能力再下沉到 `tests/helpers/`。这样不会把 Playwright fixture、DB 查询、进程控制全部塞进一个大 harness。

## 2. 类型 A/B/C 模板审查

### 2.1 类型 A：真 CLI + 语义断言

覆盖核心路径，但模板要收紧：

- prompt 不要只用 "42" 单断言。建议每个真 CLI 用 `prompt + expectedRegex + maxLatency` 的 matrix，避免只验证 Claude。
- `expect(reply).toContain('42')` 太宽，建议对 deterministic prompt 用 `/^42[。\s]*$/`，对长回答用结构化 marker。
- C1/C2 断言不能夹在每个普通 A 类用例里重复写，应该由 helper 提供 `assertNoPlaintextLeak(secret)`。
- `beforeAll` 里持有 `page` 容易跨 test 污染；建议每个 test 创建独立 session，重型 runtime host 可 worker-scoped。

### 2.2 类型 B：UI 交互验证

覆盖基础 UI，但还缺两类：

- **状态型 UI**：loading/streaming/stopped/failed/cancelled/archived/deleted 这些状态应有专门模板。
- **可回放 UI**：reload、session switch、history pagination 需要 `act -> reload -> assert same state` 标准结构。

### 2.3 类型 C：C2 铁律护栏

方向正确，但不能用固定 `/tmp/qrclaw-logs/gateway.log`：

- CI 与本地都应由 `gateway-log.ts` 返回本次 run 的 log path。
- 日志断言必须检查 prompt、reply、attachment text、host token、owner JWT 五类 secret。
- DB 断言应通过列白名单验证：`content_encrypted` 存在，`content` 不存在或为 null，`metadata` 不含明文片段。

### 2.4 建议补两类模板

| 类型 | 用途 | 示例 |
|---|---|---|
| D：环境/依赖 preflight | 检查真实 CLI、Supabase、Gateway、Go host 是否可用 | `test.skip(!preflight.ok, preflight.reason)`；release lane 不允许 skip |
| E：故障注入 | runtime kill、gateway kill、network block、invalid JWT | 所有故障注入必须隔离 worker，避免污染其他 spec |

## 3. Helper 详细设计

现有 4 个 helper 名称够作为第一层，但职责需要拆清楚。

### 3.1 `tests/helpers/wave10-harness.ts`

职责：组合 auth、host、runtime、page object，提供用户级动作。

```typescript
export interface Wave10Harness {
  page: Page;
  owner: { jwt: string; ownerId: string };
  runtime: RuntimeHandle;
  agentId: string;
  sessionId: string;
  log: GatewayLogHandle;
  db: DbQuery;

  openChat(): Promise<void>;
  createSession(opts?: { agentId?: string; title?: string }): Promise<string>;
  sendMessage(text: string, opts?: { attachments?: TestAttachment[] }): Promise<void>;
  waitForReply(opts: { timeoutMs: number; expected?: RegExp }): Promise<string>;
  assertNoPlaintextLeak(secret: string): Promise<void>;
  stop(): Promise<void>;
}

export async function createWave10Harness(
  browser: Browser,
  opts: {
    runtime: 'claude' | 'openclaw' | 'cursor' | 'codex';
    requireRealCli: boolean;
    workerIndex: number;
  },
): Promise<Wave10Harness> {
  const preflight = await runtimePreflight(opts.runtime);
  if (!preflight.ok && opts.requireRealCli) throw new Error(preflight.reason);

  const context = await browser.newContext();
  const page = await context.newPage();
  const owner = await loginOrSeedOwner(page);
  const log = await startGatewayLogCapture({ workerIndex: opts.workerIndex });
  const runtime = await startRuntimeControl({ runtime: opts.runtime, owner });
  const agentId = await ensureAgentForRuntime({ page, owner, runtime });
  const db = createDbQuery({ ownerJwt: owner.jwt });

  return new HarnessImpl({ page, owner, runtime, agentId, log, db });
}
```

### 3.2 `tests/helpers/db-query.ts`

职责：只做只读查询与安全断言，不隐藏表名。

```typescript
export interface DbQuery {
  latestOwnerAgentMessage(sessionId: string): Promise<OwnerAgentMessageRow>;
  messagesForSession(sessionId: string): Promise<OwnerAgentMessageRow[]>;
  assertEncryptedAtRest(opts: { sessionId: string; forbiddenPlaintext: string }): Promise<void>;
  assertOwnerCannotReadSession(opts: { attackerJwt: string; sessionId: string }): Promise<void>;
}

export function createDbQuery(opts: { ownerJwt?: string; serviceRole?: string }): DbQuery {
  const client = createSupabaseRestClient(opts);
  return {
    async latestOwnerAgentMessage(sessionId) {
      return client.selectOne('owner_agent_messages', {
        session_id: sessionId,
        order: 'created_at.desc',
      });
    },
    async assertEncryptedAtRest({ sessionId, forbiddenPlaintext }) {
      const rows = await this.messagesForSession(sessionId);
      for (const row of rows) {
        expect(row.content_encrypted).toBeTruthy();
        expect(JSON.stringify(row)).not.toContain(forbiddenPlaintext);
      }
    },
  };
}
```

注意：service role 只允许在 CI secret/本地 `.env` 可用时使用；普通 owner JWT 路径用于 RLS/权限断言。

### 3.3 `tests/helpers/gateway-log.ts`

职责：捕获本次 test worker 的 gateway stdout/stderr，并做密文边界断言。

```typescript
export interface GatewayLogHandle {
  path: string;
  snapshot(): Promise<string>;
  assertNotContains(values: string[], label: string): Promise<void>;
  stop(): Promise<void>;
}

export async function startGatewayLogCapture(opts: {
  workerIndex: number;
  source?: 'spawned' | 'existing';
}): Promise<GatewayLogHandle> {
  const path = testInfoOutputPath(`gateway-${opts.workerIndex}.log`);
  const stream = createRedactingWriteStream(path, {
    redactPatterns: [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.E2E_OWNER_PASSWORD],
  });
  return new GatewayLogHandleImpl({ path, stream });
}
```

最低要求：

- helper 自己管理 log path，不写死 `/tmp`。
- 所有 token/secret 写入前先 redact。
- `assertNoPlaintextLeak` 要同时查 gateway log、go-host log、Playwright console log。

### 3.4 `tests/helpers/runtime-control.ts`

职责：真实 CLI 的发现、启动、停止、故障注入与版本读取。

```typescript
export interface RuntimeHandle {
  type: RuntimeType;
  binaryPath: string;
  version: string;
  pid?: number;
  kill(signal?: NodeJS.Signals): Promise<void>;
  restart(): Promise<void>;
  waitOnline(timeoutMs: number): Promise<void>;
  waitOffline(timeoutMs: number): Promise<void>;
}

export async function runtimePreflight(type: RuntimeType): Promise<PreflightResult> {
  const binaryPath = process.env[`QRCLAW_PROVIDER_${type.toUpperCase()}_PATH`] ?? findOnPath(type);
  if (!binaryPath) return { ok: false, reason: `${type} binary not found` };
  const version = await runVersion(binaryPath);
  const auth = await checkRuntimeAuth(type, binaryPath);
  return auth.ok ? { ok: true, binaryPath, version } : { ok: false, reason: auth.reason };
}

export async function startRuntimeControl(opts: {
  runtime: RuntimeType;
  owner: { jwt: string; ownerId: string };
}): Promise<RuntimeHandle> {
  const preflight = await runtimePreflight(opts.runtime);
  if (!preflight.ok) throw new Error(preflight.reason);
  return attachToGoHostProvider({ ...preflight, owner: opts.owner });
}
```

故障注入要分两层：

- `runtime.kill()`：只杀本 worker 启动的 provider/host 进程。
- `gateway.kill()`：单独 resilience project 才能用，不能和并行用例共享 gateway。

## 4. CI 策略修正

### 4.1 GitHub-hosted runner 不应承诺真 CLI

`openclaw` 可以通过 npm/git 安装或克隆源码，但 `claude`、`cursor-agent`、`codex` 的安装、登录态、配额、交互式认证都不适合普通 PR CI。即使能下载 binary，也会遇到：

- 无法在公开 PR 暴露登录 token。
- 供应商 CLI 版本/输出格式漂移，导致 flaky。
- macOS/Linux 支持差异；真实本机 runtime 更接近 macOS 用户环境。
- AI CLI 调用有成本与速率限制，不适合每 PR 全量跑。

### 4.2 建议三条 lane

| Lane | Runner | 触发 | 内容 | 失败策略 |
|---|---|---|---|---|
| `wave10-skeleton-discovery` | GitHub-hosted Ubuntu | 每 PR | `npx playwright test --list e2e/wave10` + helper typecheck + README 编号一致性 | 必须绿 |
| `wave10-browser-smoke` | 现有 Playwright chromium | 每 PR | 不依赖真实 CLI的 UI smoke / skipped skeleton 发现 | 必须绿 |
| `wave10-real-runtime-nightly` | self-hosted macOS 或受控机器 | nightly / 手动 / release | 真实 `claude/openclaw/cursor/codex` + Supabase + Go host | nightly 可报表；release 必须绿 |

### 4.3 CI 需要的具体改动

```yaml
wave10-real-runtime-nightly:
  if: github.event_name == 'schedule' || inputs.real_runtime == 'true'
  runs-on: [self-hosted, macOS, qrclaw-e2e]
  env:
    WAVE10_REQUIRE_REAL_RUNTIME: "1"
    E2E_OWNER_EMAIL: ${{ secrets.E2E_OWNER_EMAIL }}
    E2E_OWNER_PASSWORD: ${{ secrets.E2E_OWNER_PASSWORD }}
  steps:
    - uses: actions/checkout@v4
    - run: npm ci
      working-directory: tests
    - run: npm ci && npm run build
      working-directory: web
    - run: npm ci && npm run build
      working-directory: gateway
    - run: make -C qrclaw-agent-host build
    - run: node scripts/seed-e2e-owner.mjs
    - run: npx playwright test e2e/wave10 --project=chromium --grep @p0
      working-directory: tests
```

真实 CLI lane 应增加 preflight 输出：

- binary path + version。
- auth 状态（只输出 ok/error，不输出 token）。
- runtime matrix：哪些用例因 runtime 不存在被 skip。
- C2 artifact：gateway/go-host/browser log 的 leak scan 结果。

## 5. Sprint 验收标准修正

原计划 `Sprint 3 末 P0 18/18 全绿，P1 ≥ 13` 作为愿景可以，但不适合作为唯一 Sprint 通过标准。建议拆成：

| 阶段 | 验收 |
|---|---|
| Sprint 1 | 43 个 skeleton 全部存在；`--list` 能发现；全部默认 `test.skip`；README 与 C6 编号一致 |
| Sprint 2 | helper 可编译；P0 中不依赖真实 AI 输出的 UI/session/onboarding 用例先解 8-10 个 |
| Sprint 3 | self-hosted lane 上 P0 18/18；C2 iron-rules 4/4 必须绿；P1 以报告为主，不强行 13/15 |
| Release gate | P0 18/18 + C2 4/4 + visitor QR regression 1/1；失败阻塞发布 |

P1 的 attachments/Mermaid/LaTeX/voice-adjacent 能力与产品实现耦合更高，建议设为 nightly 可见红，不在 Sprint 3 阻塞主线。最小落地顺序：先更新 README 到 R2 43 项，再复用/rename 现有 30 个 skeleton，只新增缺的 13 个 spec；随后补 `fixtures/true-runtime.matrix.ts`、4 个 helper 与 skeleton discovery CI，真实 CLI 留给 self-hosted/nightly/release lane。
