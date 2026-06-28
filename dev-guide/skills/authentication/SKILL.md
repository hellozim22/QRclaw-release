---
name: authentication
description: 认证架构最佳实践
---

# 认证架构规范

## 核心原则

**事件驱动 + Supabase 为 Source of Truth**

```
┌─────────────────────────────────────────────────┐
│                  authStore.ts                    │
│  ┌───────────────┐    ┌──────────────────────┐  │
│  │  initialize() │───▶│ supabase.getSession()│  │
│  └───────────────┘    └──────────────────────┘  │
│         │                                        │
│         ▼                                        │
│  ┌───────────────────────────────────────────┐  │
│  │   onAuthStateChange (SIGNED_IN/OUT)       │  │
│  │   → 自动同步 user/session/isAuthenticated │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## 架构

```
services/supabase.ts      # Supabase 客户端 + SecureStore
services/authService.ts   # 登录方法（Apple/Google）
stores/authStore.ts       # 状态管理（事件驱动）
hooks/useAuth.ts          # UI 层 Hook（可选封装）
```

## Supabase 客户端配置

```typescript
// services/supabase.ts
import * as SecureStore from 'expo-secure-store';

const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: SecureStoreAdapter,  // 安全存储 token
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

## AuthStore 实现

```typescript
// stores/authStore.ts
interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;  // 关键：初始化完成标志
}

export const useAuthStore = create<AuthState>((set, get) => ({
  // 初始状态
  isInitialized: false,
  isLoading: false,
  
  // 初始化：获取现有 session + 监听变化
  initialize: async () => {
    if (get().isInitialized) return;
    set({ isLoading: true });
    
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      set({ user: mapUser(session.user), isAuthenticated: true });
    }
    
    // 监听认证状态变化
    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        set({ user: mapUser(session.user), isAuthenticated: true });
      } else {
        set({ user: null, isAuthenticated: false });
      }
    });
    
    set({ isLoading: false, isInitialized: true });
  },
}));
```

## Root Layout 集成

```typescript
// app/_layout.tsx
function RootLayout() {
  const { initialize, isInitialized } = useAuthStore();

  useEffect(() => { initialize(); }, []);

  useEffect(() => {
    if (isInitialized) SplashScreen.hideAsync();
  }, [isInitialized]);

  if (!isInitialized) return null;
  
  return <Stack />;
}
```

## 关键点

| 要点 | 说明 |
|------|------|
| **不用 Zustand persist** | Session 由 Supabase 自动持久化到 SecureStore |
| **不手动管理 token** | Supabase SDK 自动刷新 |
| **isInitialized 控制 Splash** | 避免闪烁，确保 session 恢复后再显示 UI |
| **onAuthStateChange** | 单一监听点，避免多处订阅 |

## 登录方式

### Apple Sign In

```typescript
// services/authService.ts
export async function signInWithApple() {
  const rawNonce = Crypto.getRandomBytes(32).toString();
  const hashedNonce = await Crypto.digestStringAsync(SHA256, rawNonce);
  
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthenticationScope.EMAIL],
    nonce: hashedNonce,
  });
  
  await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken!,
    nonce: rawNonce,  // 原始 nonce，非 hash
  });
}
```

### Email OTP 登录（Flivo 使用）

```typescript
// 1. 发送验证码（调用 Edge Function）
export async function sendLoginOtp(email: string) {
  const { error } = await supabase.functions.invoke('send-login-otp', {
    body: { email },
  });
  if (error) throw error;
}

// 2. 验证码验证
export async function verifyLoginOtp(email: string, code: string) {
  const { data, error } = await supabase.functions.invoke('verify-login-otp', {
    body: { email, code },
  });
  if (error) throw error;
  
  // 使用返回的 session 登录
  await supabase.auth.setSession(data.session);
}
```

**Edge Function 实现要点**：
- 使用 Resend 发送邮件
- OTP 存储在数据库，5分钟过期
- 验证成功后用 `supabase.auth.admin.createUser()` 或获取现有用户
- 返回 session 给客户端
