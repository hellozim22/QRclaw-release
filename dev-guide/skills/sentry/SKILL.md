---
name: sentry
description: Sentry 错误监控最佳实践
---

# Sentry 错误监控规范

## Sentry vs PostHog

| 工具 | 用途 | 追踪内容 |
|------|------|----------|
| **Sentry** | 技术监控 | 崩溃、异常、性能 |
| **PostHog** | 产品分析 | 用户行为、页面浏览 |

## 架构

```
services/sentry.ts    # 初始化 + 工具函数
app/_layout.tsx       # Sentry.wrap() 包装根组件
```

## 标准实现

### services/sentry.ts

```typescript
/**
 * Sentry 错误监控服务
 * 
 * - Error Monitoring: 崩溃和异常捕获
 * - Tracing: 性能监控
 * - Session Replay: 仅错误时录制（产品分析用 PostHog）
 */
import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

/**
 * 初始化 Sentry SDK
 */
export function initSentry() {
  if (!DSN) {
    if (__DEV__) console.log('[Sentry] Disabled (no DSN)');
    return;
  }

  Sentry.init({
    dsn: DSN,
    environment: __DEV__ ? 'development' : 'production',
    debug: __DEV__,
    
    // Tracing - 性能监控
    tracesSampleRate: 0.2, // 20% 采样
    
    // Session Replay - 仅错误时录制
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [Sentry.mobileReplayIntegration()],
  });
}

/**
 * 捕获错误并上报
 */
export function captureError(error: Error, context?: Record<string, unknown>) {
  if (__DEV__) {
    console.error('[Sentry]', error.message, context);
  }
  Sentry.captureException(error, { extra: context });
}

/**
 * 捕获消息
 */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  if (__DEV__) {
    console.log('[Sentry]', message);
  }
  Sentry.captureMessage(message, level);
}

/**
 * 设置用户信息（登录后调用）
 */
export function setUser(userId: string, email?: string) {
  Sentry.setUser({ id: userId, email });
}

/**
 * 清除用户信息（登出时调用）
 */
export function clearUser() {
  Sentry.setUser(null);
}

/**
 * 添加面包屑（用于调试）
 */
export function addBreadcrumb(
  message: string, 
  category: string, 
  data?: Record<string, unknown>
) {
  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
}

// 导出 Sentry 实例供高级用法
export { Sentry };
```

### app/_layout.tsx 集成

```typescript
import * as Sentry from '@sentry/react-native';
import { initSentry } from '@/services/sentry';

// 尽早初始化 Sentry（在所有 import 之后）
initSentry();

function RootLayout() {
  return (
    <GestureHandlerRootView>
      <AppLayout />
    </GestureHandlerRootView>
  );
}

// 使用 Sentry.wrap 包装根组件（捕获渲染错误）
export default Sentry.wrap(RootLayout);
```

## 核心 API

```typescript
import { 
  captureError, 
  captureMessage,
  setUser, 
  clearUser,
  addBreadcrumb,
} from '@/services/sentry';

// 捕获错误
try {
  await riskyOperation();
} catch (err) {
  captureError(err as Error, { context: 'operation_name' });
}

// 捕获消息
captureMessage('User completed onboarding', 'info');

// 用户识别（登录后）
setUser(userId, email);

// 清除用户（登出时）
clearUser();

// 添加面包屑（调试用）
addBreadcrumb('Button clicked', 'ui', { buttonName: 'submit' });
```

## app.json 配置

```json
{
  "plugins": [
    ["@sentry/react-native/expo", {
      "organization": "your-org",
      "project": "your-project"
    }]
  ]
}
```

## 最佳实践

| DO ✅ | DON'T ❌ |
|-------|----------|
| 关键业务 catch 中调用 captureError | 预期的业务错误（验证失败） |
| 提供有意义的 context | 传敏感信息（密码/SSN） |
| 登录/登出同步用户状态 | 开发环境大量上报 |
| 使用 addBreadcrumb 记录关键操作 | 滥用 breadcrumb |
| DSN 存储在环境变量 | 硬编码 DSN |
| 使用 Sentry.wrap 包装根组件 | 跳过 Sentry.wrap |

## 环境变量

```bash
# .env.local
EXPO_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# EAS Secrets (用于 production build)
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value "xxx"
```

## 依赖版本

```json
{
  "dependencies": {
    "@sentry/react-native": "~7.7.0"
  },
  "devDependencies": {
    "@sentry/cli": "^2.58.2"
  }
}
```

## 项目一致性检查

所有项目必须遵循以下规范：

| 检查项 | 要求 |
|--------|------|
| 文件位置 | `services/sentry.ts` |
| DSN 来源 | `process.env.EXPO_PUBLIC_SENTRY_DSN` |
| 根组件包装 | `Sentry.wrap(RootLayout)` |
| 导出函数 | `initSentry`, `captureError`, `captureMessage`, `setUser`, `clearUser`, `addBreadcrumb` |
| Session Replay | `replaysOnErrorSampleRate: 1.0`, `replaysSessionSampleRate: 0` |
