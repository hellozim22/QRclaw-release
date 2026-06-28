# QRClaw 测试策略与质量保障 — 技术方案补充章节

> **目标读者**：AI Coding Agent（Claude Code / Cursor / Copilot）
> **编码约束**：Agent 必须严格按照本文档的测试矩阵和 TDD 流程编写代码
> **覆盖率要求**：≥ 80% branches + functions + lines + statements
> **框架**：Vitest（Unit/Integration） + Playwright（E2E） + Supertest（HTTP）

---

## §T1 测试架构总览

```
tests/
├── unit/                    # 纯函数、工具类、加密模块
│   ├── crypto/
│   │   ├── envelope-encryption.test.ts
│   │   ├── dek-lifecycle.test.ts
│   │   └── key-rotation.test.ts
│   ├── auth/
│   │   ├── ticket-verifier.test.ts
│   │   └── session-validator.test.ts
│   ├── routing/
│   │   ├── route-cache.test.ts
│   │   └── circuit-breaker.test.ts
│   └── protocol/
│       ├── message-validator.test.ts
│       ├── ack-state-machine.test.ts
│       └── security-envelope.test.ts
├── integration/             # API 端点、数据库操作、Redis 交互
│   ├── gateway/
│   │   ├── ws-connection.test.ts
│   │   ├── ws-ticket-flow.test.ts
│   │   ├── message-routing.test.ts
│   │   └── stream-output.test.ts
│   ├── edge-functions/
│   │   ├── create-qrcode.test.ts
│   │   ├── agent-ws-ticket.test.ts
│   │   └── visitor-ws-ticket.test.ts
│   └── database/
│       ├── rls-policies.test.ts
│       ├── encryption-keys.test.ts
│       └── message-persistence.test.ts
├── e2e/                     # 端到端关键用户流
│   ├── visitor-chat-flow.spec.ts
│   ├── agent-connection-flow.spec.ts
│   ├── owner-qrcode-management.spec.ts
│   ├── ws-reconnection.spec.ts
│   └── stream-output-degradation.spec.ts
├── fixtures/                # 测试数据
│   ├── messages.ts
│   ├── qrcodes.ts
│   ├── agents.ts
│   └── visitors.ts
├── mocks/                   # 外部依赖 Mock
│   ├── supabase.ts
│   ├── redis.ts
│   └── ws-client.ts
└── helpers/                 # 测试工具
    ├── setup.ts
    ├── teardown.ts
    ├── ws-test-client.ts
    └── crypto-test-utils.ts
```

---

## §T2 TDD 工作流（强制执行）

Agent 编写任何新功能时，**必须**遵循以下流程：

```yaml
TDD Cycle (Red → Green → Refactor):

  Step 1 — RED（写失败测试）:
    action: 先写测试描述预期行为
    command: npx vitest run --reporter=verbose
    expected: 测试 FAIL（红色）
    rule: 不写实现代码，只写测试

  Step 2 — GREEN（最小实现）:
    action: 写刚好让测试通过的代码
    command: npx vitest run --reporter=verbose
    expected: 测试 PASS（绿色）
    rule: 不写多余代码，不提前优化

  Step 3 — REFACTOR（重构）:
    action: 消除重复、改善命名、优化结构
    command: npx vitest run --reporter=verbose
    expected: 测试仍然 PASS
    rule: 每次重构后必须跑测试

  Step 4 — COVERAGE（验证覆盖率）:
    command: npx vitest run --coverage
    expected: ≥ 80% 全维度
    rule: 低于 80% 必须补测试，不准跳过
```

---

## §T3 测试用例矩阵

### T3.1 加密模块测试矩阵

| # | 测试场景 | 类型 | 优先级 | 预期行为 |
|---|---------|------|--------|---------|
| C1 | AES-256-GCM 加密/解密 round-trip | Unit | P0 | `decrypt(encrypt(plaintext, dek), dek) === plaintext` |
| C2 | 不同 DEK 不可互相解密 | Unit | P0 | 用 DEK-A 加密，DEK-B 解密抛 `AuthenticationError` |
| C3 | 篡改密文导致 AuthTag 校验失败 | Unit | P0 | 修改密文任意字节，解密抛 `ERR_OSSL_BAD_DECRYPT` |
| C4 | 篡改 IV 导致解密失败 | Unit | P0 | 修改 IV，解密出错或抛异常 |
| C5 | KEK 加密/解密 DEK round-trip | Unit | P0 | `decryptDEK(encryptDEK(dek, kek), kek) === dek` |
| C6 | DEK 缓存命中（5分钟内） | Unit | P1 | 第二次调用 `getOrCreateDEK` 不查数据库 |
| C7 | DEK 缓存过期（5分钟后） | Unit | P1 | TTL 过期后重新查数据库加载 DEK |
| C8 | DEK 缓存 LRU 淘汰 | Unit | P1 | 缓存满时淘汰最久未用的 DEK |
| C9 | SIGTERM 清空所有 DEK 缓存 | Unit | P0 | 进程退出信号后 `dekCache.size === 0` |
| C10 | 并发请求同一 conversation DEK | Integration | P1 | 不产生重复 DEK 记录（singleflight） |
| C11 | 空字符串加密 | Unit | P1 | 正常加密，解密回空字符串 |
| C12 | Unicode/Emoji 消息加密 | Unit | P1 | `decrypt(encrypt("你好🎉"), dek) === "你好🎉"` |
| C13 | 大消息加密（1MB） | Unit | P2 | 正常完成，耗时 < 100ms |
| C14 | KEK 版本不存在 | Unit | P0 | 抛出 `KEKVersionNotFoundError` |

```typescript
// 示例：Agent 直接可用的测试代码
// tests/unit/crypto/envelope-encryption.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnvelopeEncryptionService } from '@/crypto/envelope-encryption';
import { randomBytes } from 'crypto';

describe('EnvelopeEncryptionService', () => {
  let service: EnvelopeEncryptionService;
  const testDEK = randomBytes(32);

  beforeEach(() => {
    service = new EnvelopeEncryptionService(mockSupabase, mockRedis);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('encrypt/decrypt round-trip', () => {
    it('C1: should encrypt and decrypt plaintext correctly', () => {
      const plaintext = 'Hello, World!';
      const cipherBundle = service.encrypt(plaintext, testDEK);
      const decrypted = service.decrypt(cipherBundle, testDEK);
      expect(decrypted).toBe(plaintext);
    });

    it('C2: should fail decryption with wrong DEK', () => {
      const plaintext = 'secret message';
      const wrongDEK = randomBytes(32);
      const cipherBundle = service.encrypt(plaintext, testDEK);
      expect(() => service.decrypt(cipherBundle, wrongDEK)).toThrow();
    });

    it('C3: should fail on tampered ciphertext', () => {
      const cipherBundle = service.encrypt('test', testDEK);
      // Tamper with ciphertext (after IV + AuthTag)
      cipherBundle[30] ^= 0xff;
      expect(() => service.decrypt(cipherBundle, testDEK)).toThrow();
    });

    it('C12: should handle Unicode and emoji', () => {
      const plaintext = '你好世界🎉🔥';
      const cipherBundle = service.encrypt(plaintext, testDEK);
      expect(service.decrypt(cipherBundle, testDEK)).toBe(plaintext);
    });
  });

  describe('DEK cache', () => {
    it('C6: should return cached DEK within TTL', async () => {
      const spy = vi.spyOn(mockSupabase.from('encryption_keys'), 'select');
      await service.getOrCreateDEK('conv-1');
      await service.getOrCreateDEK('conv-1'); // second call
      expect(spy).toHaveBeenCalledTimes(1); // only one DB call
    });

    it('C9: should clear all caches on SIGTERM', () => {
      process.emit('SIGTERM');
      // Verify caches are empty
      expect(service['dekCache'].size).toBe(0);
      expect(service['kekCache'].size).toBe(0);
    });
  });
});
```

### T3.2 Ticket 鉴权测试矩阵

| # | 测试场景 | 类型 | 优先级 | 预期行为 |
|---|---------|------|--------|---------|
| A1 | 有效 ticket 首次使用 | Unit | P0 | 返回 payload，Redis 删除 ticket |
| A2 | ticket 二次使用（重放攻击） | Unit | P0 | 返回 null（已被核销） |
| A3 | 过期 ticket（>30s） | Unit | P0 | 返回 null（Redis TTL 已过期） |
| A4 | 无效格式 ticket | Unit | P0 | 返回 null |
| A5 | ticket 前缀不是 `ws_` | Unit | P1 | 返回 null |
| A6 | 并发核销同一 ticket | Integration | P0 | 仅一个成功（Lua CAS 原子性） |
| A7 | Redis 不可用时 ticket 验证 | Integration | P0 | 抛出 ServiceUnavailableError |
| A8 | Agent ws-ticket 接口 — 有效 API Key | Integration | P0 | 201 + { ticket, expires_in: 30 } |
| A9 | Agent ws-ticket 接口 — 无效 API Key | Integration | P0 | 403 forbidden |
| A10 | Agent ws-ticket 接口 — 无 Authorization Header | Integration | P0 | 401 unauthorized |
| A11 | Visitor ws-ticket 接口 — 有效 session | Integration | P0 | 201 + { ticket, expires_in: 30 } |
| A12 | Visitor ws-ticket 接口 — 无效 session_token | Integration | P0 | 403 forbidden |
| A13 | ws-ticket 接口 — 频率限制 | Integration | P1 | 429 rate_limited |

```typescript
// tests/unit/auth/ticket-verifier.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { TicketVerifier } from '@/auth/ticket-verifier';
import { createMockRedis } from '../../mocks/redis';

describe('TicketVerifier', () => {
  let verifier: TicketVerifier;
  let redis: MockRedis;

  beforeEach(() => {
    redis = createMockRedis();
    verifier = new TicketVerifier(redis);
  });

  it('A1: should verify and consume valid ticket', async () => {
    const payload = { agent_id: 'agent-1', owner_id: 'owner-1', scope: 'ws:connect' };
    await redis.setex('ws_ticket:ws_abc123', 30, JSON.stringify(payload));

    const result = await verifier.verifyAndConsume('ws_abc123');
    expect(result).toEqual({ valid: true, ...payload });

    // Ticket consumed — second use should fail
    const result2 = await verifier.verifyAndConsume('ws_abc123');
    expect(result2).toEqual({ valid: false });
  });

  it('A4: should reject invalid format', async () => {
    const result = await verifier.verifyAndConsume('invalid_ticket');
    expect(result).toEqual({ valid: false });
  });

  it('A6: concurrent ticket consumption — only one succeeds', async () => {
    await redis.setex('ws_ticket:ws_race', 30, JSON.stringify({ agent_id: 'a1' }));
    const results = await Promise.all([
      verifier.verifyAndConsume('ws_race'),
      verifier.verifyAndConsume('ws_race'),
      verifier.verifyAndConsume('ws_race'),
    ]);
    const successes = results.filter(r => r.valid);
    expect(successes).toHaveLength(1);
  });
});
```

### T3.3 WebSocket 连接与消息路由测试矩阵

| # | 测试场景 | 类型 | 优先级 | 预期行为 |
|---|---------|------|--------|---------|
| W1 | Visitor 通过 ticket 建连成功 | Integration | P0 | WS open, 收到 `connection_ack` |
| W2 | Agent 通过 ticket 建连成功 | Integration | P0 | WS open, 收到 `connection_ack` |
| W3 | 无 ticket 建连 | Integration | P0 | WS close 4001 `missing_ticket` |
| W4 | 无效 ticket 建连 | Integration | P0 | WS close 4003 `invalid_ticket` |
| W5 | Visitor 发消息 → Agent 收到 | Integration | P0 | Agent WS 收到消息 + Visitor 收到 `ack:sent` |
| W6 | Agent 回复 → Visitor 收到 | Integration | P0 | Visitor WS 收到回复 |
| W7 | Agent 流式回复 → Visitor 逐 chunk 收到 | Integration | P0 | Visitor 收到多个 `stream_chunk` + 最终 `stream_end` |
| W8 | Agent 离线 → 消息标记 failed | Integration | P0 | Visitor 收到 `ack:failed` + reason=agent_unreachable |
| W9 | 心跳超时 → 连接关闭 | Integration | P1 | 30s 无 pong → WS close |
| W10 | 重连后消息恢复 | Integration | P1 | 重连后可从 Edge Function 拉取离线消息 |
| W11 | 消息幂等去重 | Integration | P0 | 相同 message_id 只处理一次 |
| W12 | 限流触发 | Integration | P1 | 超过频率返回 `rate_limited` 错误帧 |
| W13 | QRCode 已暂停 → 拒绝建连 | Integration | P1 | WS close 4004 `qrcode_paused` |
| W14 | 消息写入 DB 后才 ACK | Integration | P0 | persist 成功后才发 `ack:sent` |
| W15 | 1000 并发连接压力测试 | E2E | P2 | 全部成功建连，内存 < 512MB |

```typescript
// tests/integration/gateway/ws-connection.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import { createTestGateway, createTestRedis } from '../../helpers/setup';

describe('WebSocket Connection', () => {
  let gateway: TestGateway;
  let redis: TestRedis;

  beforeAll(async () => {
    redis = await createTestRedis();
    gateway = await createTestGateway({ redis });
    await gateway.start();
  });

  afterAll(async () => {
    await gateway.stop();
    await redis.disconnect();
  });

  it('W1: visitor connects with valid ticket', async () => {
    // Arrange: create ticket in Redis
    const ticket = 'ws_test_visitor_1';
    await redis.setex(`ws_ticket:${ticket}`, 30, JSON.stringify({
      visitor_session_id: 'sess-1',
      owner_id: 'owner-1',
      scope: 'ws:connect',
    }));

    // Act: connect
    const ws = new WebSocket(`${gateway.wsUrl}?ticket=${ticket}`);
    const msg = await waitForMessage(ws);

    // Assert
    expect(msg.type).toBe('connection_ack');
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('W3: connection without ticket is rejected', async () => {
    const ws = new WebSocket(gateway.wsUrl);
    const closeEvent = await waitForClose(ws);
    expect(closeEvent.code).toBe(4001);
    expect(closeEvent.reason).toBe('missing_ticket');
  });

  it('W4: connection with invalid ticket is rejected', async () => {
    const ws = new WebSocket(`${gateway.wsUrl}?ticket=ws_invalid`);
    const closeEvent = await waitForClose(ws);
    expect(closeEvent.code).toBe(4003);
    expect(closeEvent.reason).toBe('invalid_ticket');
  });
});
```

### T3.4 Redis 熔断器测试矩阵

| # | 测试场景 | 类型 | 优先级 | 预期行为 |
|---|---------|------|--------|---------|
| R1 | 正常状态（CLOSED）操作成功 | Unit | P0 | 返回结果，failureCount = 0 |
| R2 | 连续 5 次失败 → 熔断（OPEN） | Unit | P0 | 第 6 次立即抛 ServiceUnavailableError |
| R3 | 熔断 30s 后 → 半开（HALF_OPEN） | Unit | P0 | 允许一次尝试 |
| R4 | 半开状态成功 → 闭合（CLOSED） | Unit | P0 | 恢复正常 |
| R5 | 半开状态失败 → 重新打开（OPEN） | Unit | P0 | 重置计时器 |
| R6 | 熔断时降级行为：Ticket 验证 | Integration | P0 | 拒绝新连接 |
| R7 | 熔断时降级行为：路由缓存 | Integration | P1 | 直连 Supabase |
| R8 | 熔断时降级行为：限流 | Integration | P1 | 宽放通过 + 告警日志 |

### T3.5 E2E 测试场景

| # | 用户流程 | 覆盖场景 | 优先级 |
|---|---------|---------|--------|
| E1 | Visitor 完整聊天流 | 扫码→建连→发消息→收回复→关闭 | P0 |
| E2 | Agent 建连与接收 | 获取 ticket→建连→收到消息→回复 | P0 |
| E3 | Owner QRCode 管理 | 登录→创建 QR→配置→暂停→激活 | P0 |
| E4 | WS 断线重连 | 建连→断网→重连→消息恢复 | P1 |
| E5 | 流式输出降级 | WS→SSE→Polling 自动降级 | P1 |
| E6 | 多 Visitor 同时聊天 | 3 个 Visitor 同时与 1 个 Agent 对话 | P1 |

---

## §T4 Mock 策略

```typescript
// tests/mocks/supabase.ts — Agent 直接可用
import { vi } from 'vitest';

export function createMockSupabase() {
  const mockFrom = (table: string) => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  });

  return {
    from: vi.fn(mockFrom),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

// tests/mocks/redis.ts
export function createMockRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    get: vi.fn(async (key: string) => {
      const item = store.get(key);
      if (!item || item.expiresAt < Date.now()) { store.delete(key); return null; }
      return item.value;
    }),
    setex: vi.fn(async (key: string, ttl: number, value: string) => {
      store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    }),
    del: vi.fn(async (key: string) => { store.delete(key); }),
    eval: vi.fn(async (script: string, numKeys: number, ...keys: string[]) => {
      // Simulate Lua CAS for ticket consumption
      const key = keys[0];
      const item = store.get(key);
      if (item && item.expiresAt > Date.now()) {
        store.delete(key);
        return item.value;
      }
      return null;
    }),
    _store: store, // for test assertions
  };
}

// tests/helpers/ws-test-client.ts
export class WSTestClient {
  private ws: WebSocket;
  private messages: any[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()));
    });
  }

  async waitForMessage(type?: string, timeoutMs = 5000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const idx = type
        ? this.messages.findIndex(m => m.type === type)
        : 0;
      if (idx >= 0) return this.messages.splice(idx, 1)[0];
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`Timeout waiting for message ${type || 'any'}`);
  }

  send(payload: any) { this.ws.send(JSON.stringify(payload)); }
  close() { this.ws.close(); }
  get readyState() { return this.ws.readyState; }
}
```

---

## §T5 CI/CD 集成

```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]

jobs:
  unit-integration:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7
        ports: [6379:6379]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx vitest run --coverage --reporter=json --outputFile=coverage.json
      - name: Check coverage threshold
        run: |
          node -e "
            const c = require('./coverage.json');
            const { branches, functions, lines, statements } = c.total;
            const pass = [branches, functions, lines, statements].every(m => m.pct >= 80);
            if (!pass) { console.error('Coverage below 80%'); process.exit(1); }
          "

  e2e:
    runs-on: ubuntu-latest
    needs: unit-integration
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## §T6 覆盖率目标分解

| 模块 | 目标覆盖率 | 测试类型重心 | 理由 |
|------|-----------|------------|------|
| `crypto/` | 95% | Unit | 加密模块零容忍，任何路径都必须测试 |
| `auth/` | 90% | Unit + Integration | 安全关键路径 |
| `routing/` | 85% | Unit + Integration | 路由正确性直接影响消息投递 |
| `protocol/` | 85% | Unit | 消息格式校验必须严格 |
| `ws/` | 80% | Integration + E2E | WebSocket 需真实连接测试 |
| `edge-functions/` | 80% | Integration | 涉及 DB 操作 |
| **Overall** | **≥ 80%** | 混合 | CI 门禁 |

---

## §T7 辩论修正补充（第三轮共识）

### T7.1 测试治理与准入矩阵（覆盖六类测试）

| 测试类型 | 范围 | 工具 | Owner | 准入条件 | 通过标准 |
|---------|------|------|-------|---------|---------|
| 单元测试 | Gateway 核心模块 | Vitest | Backend | PR 合并前 | 覆盖率 ≥ 85% |
| 协议契约 | §P 所有帧类型 | JSON Schema + fixtures | SDK/Backend/QA | 每次协议变更 | 100% 通过 |
| 集成测试 | Gateway + Redis + DB | Docker Compose + Vitest | Backend | 提测前 | 主路径 100% |
| E2E | Browser ↔ Gateway ↔ Agent | Playwright | QA | 提测前 | 主链路 100% |
| 混沌测试 | Redis/断网/重连/流中断 | k6 + 故障注入 | Backend/QA | 预发前 | 关键场景 100% |
| 安全测试 | 鉴权/重放/注入/限流 | OWASP ZAP + 自研 | Security | 上线前 | 高危 0, 严重 0 |

### T7.2 协议合规 Fixtures 目录规范

```
fixtures/
  protocol/
    visitor.chat_message.valid.json
    visitor.chat_message.invalid_type.json
    visitor.chat_message.missing_id.json
    visitor.chat_message.too_large.json
    agent.stream_chunk.valid.json
    agent.stream_end.valid.json
    agent.stream_abort.agent_disconnected.json
    agent.stream_abort.timeout.json
    gateway.connection_ack.valid.json
    gateway.ack.sent.json
    gateway.ack.delivered.json
    gateway.ack.failed.json
    gateway.error.429.json
    gateway.error.503.json
    gateway.system.agent_online.json
    gateway.system.qrcode_paused.json
```

每个 fixture 必须附带 `*.schema.json`，CI 自动校验。

### T7.3 新增流式中断测试用例

| # | 测试场景 | 类型 | 优先级 | 预期行为 |
|---|---------|------|--------|---------|
| W16 | Agent 发 3 chunk 后断连 | Integration | P0 | Visitor 收到 stream_abort(agent_disconnected) |
| W17 | stream_abort 后 Agent 重发完整流 | Integration | P0 | 新 message_id，前端渲染新气泡 |
| W18 | 30s 无 chunk → 超时中断 | Integration | P0 | Visitor 收到 stream_abort(timeout) |
| W19 | Gateway 重启 → 所有进行中流中断 | Integration | P1 | 所有 Visitor 收到 stream_abort(gateway_shutdown) |

### T7.4 混沌工程四场景

```yaml
场景 A（断网重连去重）:
  步骤: TCP 断开 → 重连 → 重发同 client_msg_id
  断言: Redis 防重放拦截，不二次入库

场景 B（流式中断终止）:
  步骤: stream_chunk 序号 3 后断开 Agent WS
  断言: Gateway → Visitor stream_abort + 前端标记失败

场景 C（Redis 不可用）:
  步骤: kill Redis 进程
  断言: Gateway 500ms 内返回 503 + Redis 恢复后自动解除

场景 D（Gateway 重启）:
  步骤: PM2 restart
  断言: 前端自动重连 + Session 恢复 + 历史消息可拉取
```

### T7.5 发版门禁硬指标

| 指标 | 阈值 | 阻断级别 |
|------|------|---------|
| 协议契约测试 | 100% 通过 | 🔴 硬阻断 |
| 核心单测覆盖率 | ≥ 85% | 🔴 硬阻断 |
| E2E 主路径 | 100% 通过 | 🔴 硬阻断 |
| 高危漏洞 | 0 | 🔴 硬阻断 |
| 严重缺陷 | 0 | 🔴 硬阻断 |
| 并发 WS 压测 | ≥ 200 连接 | 🟡 软阻断（需审批） |
| 消息转发 p99 | < 300ms | 🟡 软阻断 |
| 流式首 token 开销 | < 500ms | 🟡 软阻断 |
| 历史解密 API p99 | < 800ms | 🟡 软阻断 |
| 压测轮次 | 连续 3 轮达标 | 🟡 软阻断 |

---

## §T8 第四轮辩论修正（R4, 2026-03-12）

### T8.1 数据安全不变量测试（CI 硬门禁）

> R4 共识: 以下测试在每次 CI 运行中强制执行，失败即阻断合并。

```typescript
// tests/security-invariants.test.ts
describe('数据安全不变量', () => {
  test('日志中不得出现明文内容', async () => {
    // 执行一组标准操作（发消息、建连、断连）
    const logs = await captureLogsDuring(async () => {
      await sendTestMessage('Hello secret content');
      await createWsConnection();
      await disconnectWs();
    });
    const logText = logs.join('\n');
    expect(logText).not.toContain('Hello secret content');
    expect(logText).not.toMatch(/session_token\s*[:=]\s*sess_/);
    expect(logText).not.toMatch(/api_key\s*[:=]\s*sk_/);
  });

  test('数据库中不得存在明文消息', async () => {
    await sendTestMessage('Sensitive plaintext 12345');
    const row = await db.from('messages').select('content_encrypted').single();
    // content_encrypted 是 bytea，不应包含明文片段
    const hexStr = Buffer.from(row.content_encrypted).toString('utf-8');
    expect(hexStr).not.toContain('Sensitive plaintext');
    expect(hexStr).not.toContain('12345');
  });

  test('ws_ticket 必须单次核销', async () => {
    const { ticket } = await getWsTicket();
    const conn1 = await connectWithTicket(ticket);
    expect(conn1.readyState).toBe(WebSocket.OPEN);
    // 二次使用必须失败
    const conn2Result = await connectWithTicket(ticket).catch(e => e);
    expect(conn2Result.closeCode).toBe(4003);
  });

  test('encryption_keys 表不存在明文 DEK', async () => {
    const keys = await db.from('encryption_keys').select('key_data_encrypted');
    for (const k of keys) {
      // key_data_encrypted 应该是 KEK 加密后的密文
      expect(Buffer.from(k.key_data_encrypted).length).toBeGreaterThan(32);
      // 不应以明文 AES key 的特征开头
      expect(Buffer.from(k.key_data_encrypted).toString('hex').startsWith('0000')).toBe(false);
    }
  });
});
```

### T8.2 StreamBuffer 背压与快速失败测试

```typescript
// tests/stream-buffer.test.ts
describe('StreamBuffer R4 共识', () => {
  test('C7: 落库失败时立即丢弃 buffer 并通知双端', async () => {
    // Mock DB 写入失败
    vi.spyOn(db, 'storeEncryptedMessage').mockRejectedValueOnce(new Error('DB timeout'));
    
    const visitorWsSpy = vi.fn();
    const buffer = new StreamBuffer();
    buffer.handleChunk('msg-1', 'Hello ', false, { visitorWs: { send: visitorWsSpy } });
    buffer.handleChunk('msg-1', 'World', true, {});
    
    await buffer.flush('msg-1', 'complete');
    
    // 验证: buffer 已释放
    expect(buffer.buffers.has('msg-1')).toBe(false);
    // 验证: Visitor 收到 stream_abort
    expect(visitorWsSpy).toHaveBeenCalledWith(expect.stringContaining('stream_abort'));
  });

  test('C8: 活跃 buffer 达 80% 时触发 Agent WS 背压', async () => {
    const buffer = new StreamBuffer(); // MAX = 500
    const agentWs = { pause: vi.fn(), resume: vi.fn() };
    buffer.registerAgent(agentWs);
    
    // 填充到 400 个 buffer (80%)
    for (let i = 0; i < 400; i++) {
      buffer.handleChunk(`msg-${i}`, 'chunk', false, {});
    }
    
    buffer.checkBackpressure();
    expect(agentWs.pause).toHaveBeenCalled();
  });
});
```

### T8.3 ACK 双层状态机测试

```typescript
// tests/ack-state-machine.test.ts
describe('ACK 双层分离 (R4 共识 C10)', () => {
  test('Layer 1: 摄入成功返回 persisted', async () => {
    const ack = await sendVisitorMessage('test');
    expect(ack.payload.status).toBe('persisted');
    expect(ack.payload.message_id).toBeDefined();
  });

  test('Layer 1: 幂等去重返回 duplicate', async () => {
    const msgId = crypto.randomUUID();
    await sendVisitorMessage('test', { idempotency_key: msgId });
    const ack2 = await sendVisitorMessage('test', { idempotency_key: msgId });
    expect(ack2.payload.status).toBe('duplicate');
  });

  test('Layer 2: 投递成功异步推送 dispatched', async () => {
    const dispatched = await waitForAck('dispatched', async () => {
      await sendVisitorMessage('hello agent');
    });
    expect(dispatched.payload.status).toBe('dispatched');
  });

  test('Layer 2: Agent 离线时投递返回 failed', async () => {
    await disconnectAgent();
    const ack = await sendVisitorMessage('hello offline agent');
    // Layer 1 仍然成功
    expect(ack.payload.status).toBe('persisted');
    // Layer 2 异步返回 failed
    const delivery = await waitForAck('failed');
    expect(delivery.payload.fail_reason).toBe('agent_unreachable');
  });
});
```

### T8.4 Owner Edge Function 解密测试

```typescript
// tests/owner-decrypt.test.ts
describe('Owner 历史消息解密 (R4 共识 C5)', () => {
  test('Owner 可通过 Edge Function 解密自己的消息', async () => {
    // 先通过 Gateway 发送一条加密消息
    await sendVisitorMessage('Secret message for owner');
    
    // Owner 通过 Edge Function 拉取
    const res = await supabase.functions.invoke('get-decrypted-messages', {
      body: { conversation_id: testConversationId, limit: 10 }
    });
    
    expect(res.data.data[0].content).toBe('Secret message for owner');
  });

  test('Owner 不能解密其他 Owner 的消息', async () => {
    const res = await otherOwnerClient.functions.invoke('get-decrypted-messages', {
      body: { conversation_id: testConversationId, limit: 10 }
    });
    expect(res.error.status).toBe(403);
  });

  test('Gateway 不暴露解密 HTTP 接口', async () => {
    const res = await fetch(`${GATEWAY_URL}/api/v1/messages/decrypt`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${ownerJwt}` }
    });
    expect(res.status).toBe(404); // Gateway 根本没有这个路由
  });
});
```

### T8.5 Redis 熔断器测试

```typescript
// tests/redis-circuit-breaker.test.ts
describe('Redis Fail-fast (R4 共识 C2)', () => {
  test('Redis 宕机时新连接返回 503', async () => {
    await killRedis();
    // 等待熔断器打开
    await triggerRedisFailures(5);
    
    const res = await fetch(`${GATEWAY_URL}/api/v1/visitor/ws-ticket`, {
      method: 'POST',
      headers: { 'X-Session-Token': validToken }
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
  });

  test('Redis 宕机时已有连接 30s 内优雅断开', async () => {
    const ws = await createWsConnection();
    await killRedis();
    await triggerRedisFailures(5);
    
    // 应收到 service_degraded 错误帧
    const errorFrame = await waitForWsMessage(ws, 'error');
    expect(errorFrame.payload.code).toBe('service_degraded');
    
    // 30s 内应收到 close
    const closeEvent = await waitForWsClose(ws, 35000);
    expect(closeEvent.code).toBe(1013);
  });

  test('Redis 恢复后自动接受新连接', async () => {
    await killRedis();
    await triggerRedisFailures(5);
    await restartRedis();
    
    // 等待熔断器恢复 (3 次 PING 成功)
    await sleep(8000);
    
    const res = await fetch(`${GATEWAY_URL}/api/v1/visitor/ws-ticket`, {
      method: 'POST',
      headers: { 'X-Session-Token': validToken }
    });
    expect(res.status).toBe(200);
  });
});
```
