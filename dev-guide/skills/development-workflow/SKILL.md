---
name: development-workflow
description: 开发工作流和常用命令
---

# 开发工作流规范

## 🚀 启动命令

### 在根目录运行（推荐）

```bash
# GreenSoul 开发
pnpm dev:greensoul        # 启动开发服务器
pnpm ios:greensoul        # iOS 模拟器
pnpm android:greensoul    # Android 模拟器
pnpm build:greensoul      # EAS Build

# GreenLife 开发
pnpm dev:greenlife        # 启动开发服务器
pnpm ios:greenlife        # iOS 模拟器
pnpm android:greenlife    # Android 模拟器
pnpm build:greenlife      # EAS Build

# Flivo 开发
pnpm dev:flivo            # 启动开发服务器
pnpm ios:flivo            # iOS 模拟器
pnpm android:flivo        # Android 模拟器
pnpm build:flivo          # EAS Build

# LabX 开发
pnpm dev:labx             # 启动开发服务器
pnpm ios:labx             # iOS 模拟器
pnpm android:labx         # Android 模拟器
pnpm build:labx           # EAS Build

# 默认命令（启动 GreenSoul）
pnpm dev                  # = pnpm dev:greensoul
pnpm ios                  # = pnpm ios:greensoul
pnpm android              # = pnpm android:greensoul
```

### 在应用目录运行

```bash
# GreenSoul
cd apps/greensoul
pnpm start        # 启动 Expo 开发服务器
pnpm ios          # iOS 模拟器
pnpm android      # Android 模拟器

# GreenLife
cd apps/greenlife
pnpm start        # 启动 Expo 开发服务器
pnpm ios          # iOS 模拟器
pnpm android      # Android 模拟器
pnpm web          # Web 浏览器

# Flivo
cd apps/flivo
pnpm start        # 启动 Expo 开发服务器
pnpm ios          # iOS 模拟器
pnpm android      # Android 模拟器

# LabX
cd apps/labx
pnpm start        # 启动 Expo 开发服务器
pnpm ios          # iOS 模拟器
pnpm android      # Android 模拟器
```

## 🗄️ Supabase 命令

```bash
# GreenSoul Supabase
pnpm supabase:start:greensoul     # 启动本地 Supabase
pnpm supabase:stop:greensoul      # 停止本地 Supabase
pnpm supabase:reset:greensoul     # 重置数据库
pnpm functions:serve:greensoul    # 本地运行 Edge Functions
pnpm functions:deploy:greensoul   # 部署 Edge Functions

# GreenLife Supabase
pnpm supabase:start:greenlife     # 启动本地 Supabase
pnpm supabase:stop:greenlife      # 停止本地 Supabase
pnpm supabase:reset:greenlife     # 重置数据库
pnpm functions:serve:greenlife    # 本地运行 Edge Functions
pnpm functions:deploy:greenlife   # 部署 Edge Functions

# Flivo Supabase
pnpm supabase:start:flivo         # 启动本地 Supabase
pnpm supabase:stop:flivo          # 停止本地 Supabase
pnpm supabase:reset:flivo         # 重置数据库
pnpm functions:serve:flivo        # 本地运行 Edge Functions
pnpm functions:deploy:flivo       # 部署 Edge Functions

# LabX Supabase
pnpm supabase:start:labx          # 启动本地 Supabase
pnpm supabase:stop:labx           # 停止本地 Supabase
pnpm supabase:reset:labx          # 重置数据库
pnpm functions:serve:labx         # 本地运行 Edge Functions
pnpm functions:deploy:labx        # 部署 Edge Functions
```

## 🔐 Edge Functions 部署（重要）

### JWT 验证模式

Supabase Edge Functions 有两种 JWT 验证模式：

1. **Gateway 验证（默认）**：Supabase Gateway 自动验证 JWT，无效 token 直接返回 401
2. **自定义验证**：使用 `--no-verify-jwt` 部署，由函数内部代码验证 JWT

### 何时使用 `--no-verify-jwt`

当你的 Edge Function **内部有自定义认证逻辑** 时必须使用：

```typescript
// 示例：_shared/auth.ts 中的自定义认证
export async function authenticateUser(req: Request): Promise<User> {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  
  // 使用 Service Role Key 验证用户 token
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) throw new AuthenticationError();
  return user;
}
```

**原因**：
- 默认模式下，Gateway 会用 `anon` key 验证，而你的代码需要用 `service_role` key
- 两层验证会冲突，导致 401 错误

### 标准部署命令

```bash
# 进入项目的 supabase 目录
cd supabase/[project]  # 如 supabase/labx

# ✅ 推荐：自定义认证的函数
supabase functions deploy [function-name] --no-verify-jwt

# 部署所有函数（自定义认证）
supabase functions deploy --no-verify-jwt

# ❌ 仅用于无需认证或使用 Gateway 默认验证的函数
supabase functions deploy [function-name]
```

### 项目部署示例

```bash
# LabX 项目 - 所有函数使用自定义认证
cd supabase/labx
supabase functions deploy send-verification-code --no-verify-jwt
supabase functions deploy verify-email-binding --no-verify-jwt
supabase functions deploy scan-bill --no-verify-jwt

# 或一次性部署所有
supabase functions deploy --no-verify-jwt
```

### 环境变量配置

Edge Functions 需要的 Secrets（在 Supabase Dashboard 或 CLI 设置）：

```bash
# 查看已设置的 secrets
supabase secrets list

# 设置 secrets
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
supabase secrets set RESEND_API_KEY=your-resend-api-key

# 注意：SUPABASE_URL 和 SUPABASE_ANON_KEY 由 Supabase 自动注入，无需手动设置
```

### ⚠️ 常见 401 错误排查

**症状**：Edge Function 返回 401，但客户端已正确传递 Authorization header

**排查步骤**：

1. **检查部署方式**：函数是否用 `--no-verify-jwt` 部署？
2. **检查 Secrets**：`SUPABASE_SERVICE_ROLE_KEY` 是否正确设置？
3. **查看日志**：Dashboard → Edge Functions → [函数名] → Logs

```bash
# 重新部署并检查
supabase functions deploy [function-name] --no-verify-jwt

# 确认 secrets
supabase secrets list
```

## 🚀 Supabase 远程数据库迁移（重要）

> **目录结构详见**: `.cursor/rules/supabase-structure.mdc`

### 标准迁移流程

```bash
# 1. 进入项目的 supabase 目录
cd supabase/[project]  # 如 supabase/flivo

# 2. 链接远程项目（首次需要）
supabase link --project-ref [project-ref]

# 3. 检查迁移状态
supabase migration list --linked

# 4. 推送迁移到远程
supabase db push

# 如果失败需要重试
supabase migration repair --linked --status reverted [version]
supabase db push
```

### 迁移 SQL 注意事项

1. **不要使用 `uuid_generate_v4()`**，使用 Postgres 内置的 `gen_random_uuid()`
2. **不需要** `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`

```sql
-- 错误 ❌
id UUID PRIMARY KEY DEFAULT uuid_generate_v4()

-- 正确 ✅
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

### 常用迁移命令

```bash
# 查看迁移状态
supabase migration list --linked

# 推送迁移（会提示确认）
supabase db push

# 自动确认推送
echo "y" | supabase db push

# 修复迁移状态（失败后重试用）
supabase migration repair --linked --status reverted [version]

# 创建新迁移文件
supabase migration new [name]
```

## 📱 Expo Prebuild（原生项目生成）

Prebuild 用于生成原生项目文件（`ios/` 和 `android/` 目录）。**不是日常操作**，仅在特定场景需要。

### 何时需要 Prebuild

- 添加需要原生代码的依赖（如 `expo-camera`、`expo-contacts`）
- 修改 `app.json` 中的原生配置（如 `bundleIdentifier`、权限）
- 添加或修改 Config Plugin
- 从 Expo Go 迁移到 Development Build

### 标准命令

```bash
# 在应用目录运行（如 apps/labx）
cd apps/[app-name]

# 生成原生项目（ios/ 和 android/）
npx expo prebuild

# 只生成 iOS
npx expo prebuild --platform ios

# 只生成 Android
npx expo prebuild --platform android

# 清理后重新生成（⚠️ 谨慎使用）
npx expo prebuild --clean
```

### ⚠️ 注意事项

1. **`--clean` 会删除原生目录** - 所有 Xcode/Android Studio 中的手动配置会丢失
2. **优先使用 Config Plugin** - 将原生配置写在 `app.json` 或自定义插件中，避免手动修改原生代码
3. **不要频繁 prebuild** - 只在必要时执行，日常开发使用 `expo start` 或 `expo run:ios/android`

### 最佳实践

```bash
# ✅ 推荐：增量 prebuild（保留配置）
npx expo prebuild

# ⚠️ 谨慎：完全重建（丢失手动配置）
npx expo prebuild --clean

# ✅ 推荐：通过 Config Plugin 管理原生配置
# 在 app.json 的 plugins 数组中添加插件
```

## 🔑 环境变量配置

### 文件结构

每个应用使用两个环境变量文件：

```
apps/[app-name]/
├── .env.example    # 模板文件（提交到 Git）
└── .env.local      # 实际配置（不提交到 Git）
```

### 配置规范

**.env.example** - 模板文件，包含所有需要的变量名和占位符：

```bash
# Supabase Project
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# PostHog Analytics (可选)
EXPO_PUBLIC_POSTHOG_API_KEY=your-posthog-key
```

**.env.local** - 实际配置，包含真实值：

```bash
# ⚠️ 此文件包含敏感信息，不要提交到 Git
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### 代码中的最佳实践

```typescript
// services/supabase.ts

// ✅ 推荐：只从环境变量读取，使用 ! 断言（编译期内联）
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// ❌ 避免：任何形式的默认值
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xxx.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGci...';
```

### 新项目配置步骤

```bash
# 1. 创建 .env.example（提交到 Git）
cp apps/greenlife/.env.example apps/[new-app]/.env.example
# 编辑模板，调整变量

# 2. 创建 .env.local（不提交）
cp apps/[new-app]/.env.example apps/[new-app]/.env.local
# 填入实际值

# 3. 确认 .gitignore 包含 .env.local
```

### ⚠️ EAS Build vs EAS Update 环境变量来源（重要）

`eas build` 和 `eas update` 使用**不同的环境变量来源**：

| 命令 | 执行位置 | 环境变量来源 | 用途 |
|------|---------|-------------|------|
| `eas build` | ☁️ 云端（EAS 服务器） | Expo Dashboard 环境变量 | 构建原生二进制包 |
| `eas update` | 💻 本地（你的电脑） | 本地 `.env.local` 文件 | OTA 更新 JS bundle |

**原因**：
- `eas build` 在云端编译原生代码，无法访问本地文件系统，必须从 Expo Dashboard 读取环境变量
- `eas update` 在本地执行 Metro bundler 打包 JS，自然使用本地 `.env.local`

**环境变量注入时机**：
```
编译时（Metro bundler）
process.env.EXPO_PUBLIC_XXX → 实际值（内联替换）

运行时
环境变量已经被"烧"进代码，无法动态修改
```

### 最佳实践：保持配置同步

为避免本地和云端配置不一致导致的问题，**必须保持两边配置同步**：

```bash
# 1. 本地 .env.local（用于本地开发 + eas update）
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
EXPO_PUBLIC_POSTHOG_API_KEY=phc_xxx...

# 2. Expo Dashboard（用于 eas build）
# Settings → Environment variables
# 配置相同的变量名和值
```

### 常见问题：Invalid API Key

**症状**：App 运行时报 "invalid api key" 错误

**排查步骤**：

1. **检查 Expo Dashboard 变量名**：
   - 必须使用 `EXPO_PUBLIC_` 前缀
   - 变量名必须与代码中一致（如 `EXPO_PUBLIC_SUPABASE_ANON_KEY`，不是 `GREENSOUL_SUPABASE_ANON_KEY`）

2. **检查本地 `.env.local`**：
   - 确保变量名和值都正确
   - 确保没有多余的空格或换行

3. **确定问题来源**：
   - 如果是 `eas build` 的包有问题 → 修复 Expo Dashboard 配置后重新 `eas build`
   - 如果是 `eas update` 的包有问题 → 修复本地 `.env.local` 后重新 `eas update`

### OTA 更新可以修复环境变量吗？

**可以**，但有条件：

```
场景 1：eas build 时配置错误
└── 本地 .env.local 正确
    └── ✅ 可以用 eas update 推送修复

场景 2：runtime version 变化
└── 原生代码有改动
    └── ❌ 必须重新 eas build
```

**修复命令**：
```bash
# 确保本地 .env.local 配置正确后
cd apps/[app-name]
eas update --channel production --platform ios --message "Fix environment variables"
```

## 📦 依赖管理

```bash
# 安装所有依赖（在根目录）
pnpm install

# 为特定应用添加依赖
cd apps/greensoul
pnpm add [package-name]

cd apps/greenlife
pnpm add [package-name]

# 添加开发依赖
pnpm add -D [package-name]
```

## 🔧 项目初始化

### 创建新的 Expo 应用

```bash
# 使用 pnpm 创建 Expo 应用
cd apps
pnpm create expo-app [app-name] --template default

# 重要：移除子目录的 pnpm-workspace.yaml
rm [app-name]/pnpm-workspace.yaml
```

### 必须的配置步骤

1. **配置 Bundle Identifier** - 在 `app.json` 中添加 iOS 和 Android 的包标识符
2. **配置 TypeScript** - 在 `tsconfig.json` 中添加 `"jsx": "react-native"`
3. **配置 EAS** - 运行 `eas build:configure`

## ⚡ 最佳实践

1. **包名规范**: 使用 `@greensoul/[项目名]`、`@greenlife/[项目名]`、`@flivo/[项目名]` 或 `@labx/[项目名]` 格式
2. **依赖安装**: 始终在根目录运行 `pnpm install`
3. **代码质量**: 提交前检查类型和代码规范
4. **环境配置**: 使用 `.env.local` 管理敏感配置（不提交到 git）

## 🐛 常见问题解决

### iOS 启动失败：Bundle Identifier 错误
**解决**: 在 `app.json` 的 `ios` 配置中添加 `bundleIdentifier`

### TypeScript JSX 错误
**解决**: 在 `tsconfig.json` 的 `compilerOptions` 中添加 `"jsx": "react-native"`

### 依赖安装问题
**解决**: 
1. 删除所有 `node_modules` 目录
2. 在根目录运行 `pnpm install`

### Supabase 本地启动失败
**解决**:
1. 确保 Docker 已启动
2. 检查端口是否被占用
3. 运行 `supabase stop` 后重新启动

### Supabase 迁移不被识别
**症状**: `supabase migration list` 显示空列表
**解决**:
1. 确认迁移文件在 `supabase/[project]/supabase/migrations/` 目录下
2. 确认文件名格式为 `YYYYMMDDHHMMSS_name.sql`

### Supabase 迁移 uuid_generate_v4() 错误
**症状**: `ERROR: function uuid_generate_v4() does not exist`
**解决**: 将所有 `uuid_generate_v4()` 替换为 `gen_random_uuid()`

### Supabase 迁移失败后重试
**解决**:
```bash
cd supabase/[project]
supabase migration repair --linked --status reverted [version]
supabase db push
```

### Supabase IPv6 连接失败
**症状**: `IPv6 is not supported on your current network`
**解决**: 重新运行 `supabase link --project-ref [ref]`，CLI 会自动切换到 IPv4

### 原生依赖不生效
**症状**: 添加 `expo-camera` 等原生依赖后功能不可用
**解决**:
1. 运行 `npx expo prebuild` 生成原生代码
2. 重新运行 `npx expo run:ios` 或 `npx expo run:android`
3. 如果仍有问题，尝试 `npx expo prebuild --clean`

### Prebuild 后 Xcode 配置丢失
**症状**: `prebuild --clean` 后手动配置的签名、证书等消失
**解决**:
1. **预防**: 使用 Config Plugin 管理原生配置，避免手动修改
2. **恢复**: 重新在 Xcode 中配置，或从 Git 历史恢复 `ios/` 目录

### Edge Function 401 错误
**症状**: 客户端调用 Edge Function 返回 401，但已正确传递 Authorization header
**原因**: 函数内部有自定义 JWT 验证逻辑，与 Supabase Gateway 默认验证冲突
**解决**:
```bash
cd supabase/[project]
supabase functions deploy [function-name] --no-verify-jwt
```
**注意**: 所有使用 `authenticateUser()` 或类似自定义认证的函数都需要此参数

### Invalid API Key 错误（Supabase/PostHog）
**症状**: App 运行时报 "invalid api key" 错误
**原因**: 环境变量名不匹配或未正确配置
**排查**:
1. 检查 Expo Dashboard 环境变量名是否使用 `EXPO_PUBLIC_` 前缀
2. 确认变量名与代码中完全一致（如 `EXPO_PUBLIC_SUPABASE_ANON_KEY`）
3. 检查本地 `.env.local` 是否正确
**解决**:
- 如果是云端构建问题：修复 Expo Dashboard 配置 → 重新 `eas build`
- 如果本地配置正确：可以用 `eas update` 推送修复（无需重新 build）

### App Store 提交版本重复错误
**症状**: `You've already submitted this version of the app`
**原因**: `app.json` 中的 `version` 未更新
**解决**:
```json
// app.json - 升级版本号
{
  "expo": {
    "version": "1.0.2",  // 从 1.0.1 升级
    "ios": {
      "runtimeVersion": "1.0.2"  // 同步更新
    }
  }
}
```
然后重新运行 `eas build --platform ios --profile production --auto-submit`
