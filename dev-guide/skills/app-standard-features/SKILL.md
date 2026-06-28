---
name: app-standard-features
description: 应用标准功能规范 - 所有应用必须实现的通用功能
---

# 应用标准功能规范

## 概述

本规范定义了 Monorepo 中**所有应用**必须实现的标准功能，确保一致的用户体验和可维护性。

## 必须实现的功能

### 1. PostHog 分析

> 详细规范见 `analytics.mdc`

**必须配置**：
- 环境变量：`EXPO_PUBLIC_POSTHOG_API_KEY`、`EXPO_PUBLIC_POSTHOG_HOST`
- 所有环境都上报，通过 `eas_channel` 过滤

**必须实现**：
- `services/analytics.ts` - PostHog 服务封装
- 登录时 `identifyUser`
- 登出时 `resetAnalytics`
- 关键用户行为追踪

---

### 2. Sentry 错误监控

> 详细规范见 `sentry.mdc`

**必须配置**：
- 环境变量：`EXPO_PUBLIC_SENTRY_DSN`
- `app.json` plugins 中添加 `@sentry/react-native/expo`

**必须实现**：
- `services/sentry.ts` - Sentry 服务封装
- `_layout.tsx` 中 `Sentry.wrap(RootLayout)`
- 关键错误捕获

---

### 3. 认证系统

> 详细规范见 `authentication.mdc`

**必须实现**：
- `stores/authStore.ts` - Zustand 认证状态
- `services/authService.ts` - 认证服务
- 登录页面（至少支持一种登录方式）
- 退出登录功能
- **删除账户功能**（App Store 强制要求）

---

### 3.1 删除账户最佳实践（重要）

删除账户是 App Store 强制要求的功能，必须完整删除用户数据。

#### 后端实现：事务性 RPC + Edge Function

**1. 数据库 RPC 函数（事务性删除）**

```sql
-- migrations/YYYYMMDDHHMMSS_delete_user_function.sql
CREATE OR REPLACE FUNCTION public.delete_user_data(target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count JSON;
BEGIN
  -- 所有操作在一个事务中，保证原子性
  DELETE FROM likes WHERE user_id = target_user_id;
  DELETE FROM video_views WHERE user_id = target_user_id;
  DELETE FROM reports WHERE reporter_id = target_user_id;
  DELETE FROM videos WHERE user_id = target_user_id;
  DELETE FROM users WHERE id = target_user_id;
  
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  -- 事务自动回滚
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 授权
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_data(UUID) TO service_role;
```

**2. Edge Function 调用 RPC**

```typescript
// supabase/functions/delete-account/index.ts
Deno.serve(async (req: Request) => {
  const { user, supabase } = await authenticateUser(req);
  
  // 1. 调用 RPC（事务性删除数据库数据）
  const { data: result, error } = await supabase
    .rpc('delete_user_data', { target_user_id: user.id });
  
  if (error || !result?.success) {
    throw new Error(result?.error || 'Database deletion failed');
  }
  
  // 2. 删除第三方数据（best-effort，失败不阻塞）
  // 例如 Cloudflare Stream 视频
  await deleteExternalResources(result.resource_ids);
  
  // 3. 删除 auth.users
  const admin = createServiceClient();
  await admin.auth.admin.deleteUser(user.id);
  
  return success({ success: true });
});
```

**3. 外键约束最佳实践**

```sql
-- 用户拥有的数据：ON DELETE CASCADE
reporter_id UUID REFERENCES users(id) ON DELETE CASCADE

-- 用户关联但不拥有的数据：ON DELETE SET NULL  
reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL
```

#### 前端实现：二次确认 + 全屏 Loading

**1. LoadingOverlay 组件**

```typescript
// components/LoadingOverlay.tsx
export function LoadingOverlay({ visible, message, subMessage, hint }: Props) {
  // 禁用 Android 返回键
  useEffect(() => {
    if (!visible) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => handler.remove();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <ActivityIndicator size="large" />
        <Text>{message}</Text>
        {subMessage && <Text>{subMessage}</Text>}
        {hint && <Text>{hint}</Text>}
      </View>
    </Modal>
  );
}
```

**2. 删除流程（二次确认）**

```typescript
// app/settings.tsx
const handleDeleteAccount = () => {
  // 第一次确认
  Alert.alert(
    t('settings.deleteAccount.title'),
    t('settings.deleteAccount.warning'),
    [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteAccount.continue'),
        style: 'destructive',
        onPress: () => {
          // 第二次确认（最终）
          Alert.alert(
            t('settings.deleteAccount.finalConfirmTitle'),
            t('settings.deleteAccount.finalConfirmMessage'),
            [
              { text: t('common.cancel'), style: 'cancel' },
              {
                text: t('settings.deleteAccount.confirm'),
                style: 'destructive',
                onPress: async () => {
                  setIsDeletingAccount(true);
                  const result = await deleteAccount();
                  
                  // ⚠️ 关键：先关闭 Loading，再显示 Alert
                  setIsDeletingAccount(false);
                  
                  if (result.success) {
                    Alert.alert(/* 成功提示 */);
                    router.replace('/');
                  } else {
                    Alert.alert(/* 失败提示 */);
                  }
                },
              },
            ]
          );
        },
      },
    ]
  );
};

// UI
<LoadingOverlay
  visible={isDeletingAccount}
  message={t('settings.deleteAccount.deleting')}
  hint={t('settings.deleteAccount.doNotClose')}
/>
```

**3. authStore 实现**

```typescript
// stores/authStore.ts
deleteAccount: async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { success: false, error: 'Not authenticated' };

  const { data, error } = await supabase.functions.invoke('delete-account', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (error || !data?.success) {
    return { success: false, error: error?.message || data?.error };
  }

  // 清理本地状态
  resetAnalytics();
  await supabase.auth.signOut();
  set({ user: null, isAuthenticated: false });
  
  return { success: true };
}
```

#### 必须的翻译 Key

```typescript
settings.deleteAccount.title           // "删除账户"
settings.deleteAccount.warning         // "此操作将永久删除你的账户及所有数据..."
settings.deleteAccount.continue        // "继续"
settings.deleteAccount.finalConfirmTitle    // "确定要删除吗？"
settings.deleteAccount.finalConfirmMessage  // "这是最后确认..."
settings.deleteAccount.confirm         // "永久删除"
settings.deleteAccount.deleting        // "删除中..."
settings.deleteAccount.doNotClose      // "请勿关闭应用"
settings.deleteAccount.success         // "账户已删除"
settings.deleteAccount.successDesc     // "你的账户已成功删除"
settings.deleteAccount.failed          // "删除失败"
```

#### 删除账户检查清单

- [ ] **数据库**：创建事务性 `delete_user_data()` RPC 函数
- [ ] **数据库**：检查外键约束（CASCADE / SET NULL）
- [ ] **Edge Function**：`delete-account` 调用 RPC
- [ ] **Edge Function**：部署时使用 `--no-verify-jwt`
- [ ] **前端**：`LoadingOverlay` 组件
- [ ] **前端**：二次确认弹窗
- [ ] **前端**：authStore.deleteAccount 方法
- [ ] **前端**：设置页面删除按钮（红色）
- [ ] **翻译**：中英文 `settings.deleteAccount.*` key

#### 参考实现

| 项目 | Edge Function | RPC 函数 | 前端实现 |
|------|--------------|----------|----------|
| **Flivo** | `supabase/flivo/functions/delete-account/` | `delete_user_data()` | `settings.tsx` + `LoadingOverlay.tsx` |
| **LabX** | `supabase/labx/functions/delete-account/` | `delete_user_account()` | `profile.tsx` + `LoadingOverlay.tsx` |

---

### 4. App Store 合规

**隐私政策 & 服务条款**：
- 设置页面必须提供链接
- 建议托管在 GitHub Pages

```typescript
const handlePrivacyPolicy = () => {
  Linking.openURL('https://your-domain.github.io/app-name/privacy-policy.html');
};

const handleTermsOfService = () => {
  Linking.openURL('https://your-domain.github.io/app-name/terms-of-service.html');
};
```

**必须的功能**：
- [ ] 退出登录
- [ ] 删除账户（App Store 强制要求）
- [ ] 隐私政策链接
- [ ] 服务条款链接

---

### 5. 检查更新（OTA Updates）

**配置要求** (`app.json`)：

```json
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/[projectId]"
    },
    "ios": {
      "runtimeVersion": "x.x.x"
    },
    "android": {
      "runtimeVersion": {
        "policy": "appVersion"
      }
    }
  }
}
```

**代码实现**：

1. **设置页面**：必须提供手动检查更新按钮

```typescript
// app/settings.tsx
import * as Updates from 'expo-updates';
import * as Application from 'expo-application';

const handleCheckUpdate = async () => {
  // 开发模式检测
  if (__DEV__ || !Updates.isEnabled) {
    Alert.alert(t('settings.update.devMode'), t('settings.update.devModeDesc'));
    return;
  }

  try {
    setCheckingUpdate(true);
    const update = await Updates.checkForUpdateAsync();
    
    if (update.isAvailable) {
      Alert.alert(
        t('settings.update.available'),
        t('settings.update.availableDesc'),
        [
          { text: t('settings.update.later'), style: 'cancel' },
          {
            text: t('settings.update.now'),
            onPress: async () => {
              await Updates.fetchUpdateAsync();
              Alert.alert(
                t('settings.update.downloaded'),
                t('settings.update.downloadedDesc'),
                [{ text: t('settings.update.restart'), onPress: () => Updates.reloadAsync() }]
              );
            }
          }
        ]
      );
    } else {
      Alert.alert(t('settings.update.latest'), t('settings.update.latestDesc'));
    }
  } catch (error) {
    Alert.alert(t('settings.update.checkFailed'), String(error));
  } finally {
    setCheckingUpdate(false);
  }
};
```

2. **版本显示**：设置页面显示当前版本号

```typescript
<Text>App v{Application.nativeApplicationVersion || '1.0.0'}</Text>
```

**更新策略**（默认最佳实践）：
- `checkAutomatically`: `ON_LOAD`（默认，无需显式配置）
- `fallbackToCacheTimeout`: `0`（默认，不阻塞启动）
- 启动时后台静默检查，下次启动自动应用

---

### 6. 多语言支持（i18n）

**目录结构**：

```
apps/[app]/
├── i18n/
│   ├── index.ts              # i18n 配置和工具函数
│   └── locales/
│       ├── en.ts             # 英文（必须）
│       └── zh-Hans.ts        # 简体中文（必须）
```

**标准 i18n 配置** (`i18n/index.ts`)：

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en';
import zhHans from './locales/zh-Hans';

// 支持的语言列表
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)', nativeName: '简体中文' },
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]['code'];

const LANGUAGE_STORAGE_KEY = '@app_language';

// 获取初始语言
const getInitialLanguage = async (): Promise<SupportedLanguage> => {
  const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.some(l => l.code === stored)) {
    return stored as SupportedLanguage;
  }
  
  // 根据系统语言自动选择
  const systemLang = Localization.getLocales()[0]?.languageCode;
  if (systemLang?.startsWith('zh')) return 'zh-Hans';
  return 'en';
};

// 初始化 i18n
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'zh-Hans': { translation: zhHans } },
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// 异步设置初始语言
getInitialLanguage().then(lang => i18n.changeLanguage(lang));

// 切换语言
export const changeLanguage = async (lang: SupportedLanguage) => {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  await i18n.changeLanguage(lang);
};

// 获取当前语言
export const getCurrentLanguage = (): SupportedLanguage => {
  return (i18n.language as SupportedLanguage) || 'en';
};

export default i18n;
```

**设置页面语言切换**：

```typescript
// app/settings.tsx
import { SUPPORTED_LANGUAGES, changeLanguage, getCurrentLanguage, type SupportedLanguage } from '@/i18n';

const [currentLang, setCurrentLang] = useState<SupportedLanguage>(getCurrentLanguage());

const handleLanguageChange = async (lang: SupportedLanguage) => {
  await changeLanguage(lang);
  setCurrentLang(lang);
};

// UI: 列出所有支持的语言供用户选择
{SUPPORTED_LANGUAGES.map((lang) => (
  <Pressable
    key={lang.code}
    onPress={() => handleLanguageChange(lang.code)}
  >
    <Text>{lang.nativeName}</Text>
    {currentLang === lang.code && <Ionicons name="checkmark" />}
  </Pressable>
))}
```

**必须的翻译 Key**：

```typescript
// 检查更新相关
settings.update.check        // "检查更新"
settings.update.checking     // "检查中..."
settings.update.devMode      // "开发模式"
settings.update.devModeDesc  // "开发模式下不支持更新检查"
settings.update.available    // "发现新版本"
settings.update.availableDesc // "有新版本可用，是否立即更新？"
settings.update.later        // "稍后"
settings.update.now          // "立即更新"
settings.update.downloaded   // "更新已下载"
settings.update.downloadedDesc // "重启应用以应用更改"
settings.update.restart      // "立即重启"
settings.update.failed       // "更新失败"
settings.update.checkFailed  // "检查失败"
settings.update.latest       // "已是最新版本"
settings.update.latestDesc   // "你正在使用最新版本"

// 通用
common.cancel   // "取消"
common.confirm  // "确认"
common.ok       // "确定"
```

---

## 依赖要求

```json
{
  "dependencies": {
    "expo-updates": "~0.x.x",
    "expo-application": "~6.x.x",
    "expo-localization": "~15.x.x",
    "i18next": "^23.x.x",
    "react-i18next": "^14.x.x",
    "@react-native-async-storage/async-storage": "^1.x.x"
  }
}
```

---

## 检查清单

创建新应用时，确保完成以下事项：

### app.json
- [ ] 配置 `updates.url`
- [ ] 配置 `ios.runtimeVersion`
- [ ] 配置 `android.runtimeVersion`
- [ ] 添加 `@sentry/react-native/expo` plugin

### 环境变量 (.env.local)
- [ ] `EXPO_PUBLIC_SUPABASE_URL`
- [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `EXPO_PUBLIC_POSTHOG_API_KEY`
- [ ] `EXPO_PUBLIC_POSTHOG_HOST`
- [ ] `EXPO_PUBLIC_SENTRY_DSN`

### 服务层 (services/)
- [ ] `supabase.ts` - Supabase 客户端
- [ ] `authService.ts` - 认证服务
- [ ] `analytics.ts` - PostHog 分析
- [ ] `sentry.ts` - 错误监控

### 状态管理 (stores/)
- [ ] `authStore.ts` - 认证状态（含 deleteAccount）

### i18n
- [ ] 创建 `i18n/index.ts`
- [ ] 创建 `i18n/locales/en.ts`
- [ ] 创建 `i18n/locales/zh-Hans.ts`
- [ ] 在 `_layout.tsx` 中导入 `'@/i18n'`

### 根布局 (_layout.tsx)
- [ ] 初始化 Sentry (`initSentry()`)
- [ ] `Sentry.wrap(RootLayout)`
- [ ] 初始化认证 (`initialize()`)
- [ ] 导入 i18n

### 设置页面
- [ ] 语言切换
- [ ] 检查更新
- [ ] 显示版本号
- [ ] 退出登录
- [ ] **删除账户**（App Store 强制）
- [ ] 隐私政策链接
- [ ] 服务条款链接

### 翻译 (必须的 Key)
- [ ] 检查更新相关 (`settings.update.*`)
- [ ] 通用 (`common.cancel`, `common.confirm`, `common.ok`)
- [ ] 账户 (`auth.signOut`, `profile.deleteAccount*`)

---

## 设置页面标准结构

设置/个人中心页面应包含以下区块（顺序可调整）：

```
┌─────────────────────────────────────┐
│  用户信息（头像、邮箱/用户名）        │
├─────────────────────────────────────┤
│  功能设置                            │
│  ├─ 语言切换                         │
│  ├─ 通知设置（可选）                  │
│  └─ 检查更新                         │
├─────────────────────────────────────┤
│  法律信息                            │
│  ├─ 隐私政策                         │
│  └─ 服务条款                         │
├─────────────────────────────────────┤
│  账户操作                            │
│  ├─ 退出登录                         │
│  └─ 删除账户（危险操作，红色显示）    │
├─────────────────────────────────────┤
│  版本信息（底部居中）                 │
│  App v1.0.0 (build)                  │
└─────────────────────────────────────┘
```

---

## 参考实现

| 项目 | 设置页面 | i18n | 分析 | Sentry |
|------|---------|------|------|--------|
| **Flivo** | `apps/flivo/app/settings.tsx` | `apps/flivo/i18n/` | `services/analytics.ts` | `services/sentry.ts` |
| **LabX** | `apps/labx/app/(tabs)/profile.tsx` | `apps/labx/i18n/` | `services/analytics.ts` | `services/sentry.ts` |
| **GreenSoul** | `apps/greensoul/app/(tabs)/profile.tsx` | `apps/greensoul/i18n/` | `services/analytics.ts` | `services/sentry.ts` |
| **GreenLife** | `apps/greenlife/app/(tabs)/profile.tsx` | `apps/greenlife/i18n/` | `services/analytics.ts` | `services/sentry.ts` |
