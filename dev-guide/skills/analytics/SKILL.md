---
name: analytics
description: PostHog 分析规范
---

# PostHog Analytics 规范

## 架构

```
services/analytics.ts    # PostHog 单例 + API 封装
stores/authStore.ts      # identify/reset 调用位置
```

## 数据上报策略（重要）

### 所有环境都上报

```typescript
// ✅ 正确：不禁用任何环境
export const posthog = new PostHog(API_KEY, {
  host: HOST,
  captureAppLifecycleEvents: true,
});

// ❌ 错误：禁用开发环境会导致无法测试上报
export const posthog = new PostHog(API_KEY, {
  disabled: __DEV__,  // 不要这样做
});
```

**为什么所有环境都上报**：
1. **可测试**：开发时能验证事件名、属性是否正确
2. **可追溯**：出问题时能回查开发环境的数据
3. **通过 Filter 过滤**：在 PostHog Dashboard 中区分环境

### 通过 EAS 属性区分环境

所有事件自动携带 EAS Update 信息，用于 Filter：

```typescript
posthog.register({
  eas_update_id: Updates.updateId ?? null,
  eas_channel: Updates.channel ?? null,        // 关键：用于区分环境
  eas_runtime_version: Updates.runtimeVersion ?? null,
  eas_is_embedded: Updates.isEmbeddedLaunch,
  app_version: Application.nativeApplicationVersion ?? null,
  app_build: Application.nativeBuildVersion ?? null,
});
```

### PostHog Dashboard Filter 示例

| 场景 | Filter |
|-----|--------|
| 仅生产数据 | `eas_channel = production` |
| 排除开发数据 | `eas_channel is set AND eas_channel != development` |
| 本地开发数据 | `eas_channel is not set` |

## 环境变量配置

```typescript
// ✅ 正确：使用 || '' 提供默认值，避免未配置时报错
const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

// ❌ 错误：使用 ! 断言会在未配置时导致运行时错误
const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY!;
```

## 身份识别（关键）

**规则**：`identifyUser` 必须在 `authStore` 中调用，不在 UI 组件中调用。

```typescript
// stores/authStore.ts
initialize: async () => {
  const session = await supabase.auth.getSession();
  if (session?.user) {
    // ✅ 获取 session 后立即 identify
    identifyUser(user.id, { email, provider, created_at });
    registerSuperProperties({ auth_provider, is_company_verified: false });
  }
}

// onAuthStateChange SIGNED_IN 事件中同样处理

signOut: async () => {
  resetAnalytics();  // ✅ 登出时重置，生成新匿名 ID
  await supabase.auth.signOut();
}
```

**为什么**：确保 identify 在应用启动时最早执行，避免匿名事件与用户事件分裂。

## Super Properties

登录后注册全局属性，后续所有事件自动携带：

```typescript
registerSuperProperties({
  auth_provider: 'google' | 'apple' | 'email',
  is_company_verified: boolean,
  company_email: string | null,
  user_role: 'user' | 'admin',
});
```

## 标准 API（所有项目必须一致）

| 函数 | 用途 |
|------|------|
| `trackEvent(name, props?)` | 追踪事件 |
| `identifyUser(userId, props?)` | 识别用户（登录后调用） |
| `setUserProperties(props)` | 设置用户属性 |
| `setUserPropertiesOnce(props)` | 设置一次性用户属性 |
| `resetAnalytics()` | 重置用户（登出时调用） |
| `trackScreen(name, props?)` | 追踪页面访问 |
| `registerSuperProperties(props)` | 注册全局属性 |
| `isFeatureEnabled(flagKey)` | 检查 Feature Flag |
| `getFeatureFlag(flagKey)` | 获取 Feature Flag 变体 |
| `captureException(error, context?)` | 捕获异常/错误 |

## 事件追踪

```typescript
import { trackEvent } from '@/services/analytics';

// 格式：object_verb（snake_case）
trackEvent('video_uploaded', { duration: 30 });
trackEvent('transfer_completed', { amount_cents: 1000 });
```

## 异常捕获

```typescript
import { captureException } from '@/services/analytics';

try {
  await riskyOperation();
} catch (error) {
  captureException(error, { operation: 'risky_operation', user_id: userId });
}
```

## 开发环境日志

开发时通过 console.log 输出事件信息，方便调试：

```typescript
export function trackEvent(event: string, properties?: EventProperties) {
  try {
    if (__DEV__) console.log('[Analytics]', event, properties);
    posthog.capture(event, properties);
  } catch (error) {
    console.error('[Analytics] Track event error:', error);
  }
}
```

## 规则速查

| DO ✅ | DON'T ❌ |
|-------|----------|
| 所有环境都上报 | 禁用开发环境上报 |
| 通过 eas_channel Filter | 用 disabled 区分环境 |
| API_KEY 用 `\|\| ''` | API_KEY 用 `!` 断言 |
| 操作成功后追踪 | 操作前追踪 |
| 金额用分（cents） | 用浮点数 |
| 失败事件带 error 字段 | 漏掉错误信息 |
| 使用事件常量 | 硬编码事件名 |
| authStore 中 identify | UI 组件中 identify |
