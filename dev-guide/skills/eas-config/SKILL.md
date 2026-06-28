---
name: eas-config
description: EAS Build 配置规范 - Monorepo 最佳实践
---

# EAS Build 配置规范

## 📍 配置文件位置（重要！）

### ✅ 正确位置：`apps/greensoul/eas.json`

在 **Monorepo** 架构中，`eas.json` 必须放置在 **Expo 应用的根目录**，而不是 workspace 根目录。

```
greensoul/                          # ❌ 不要在这里放 eas.json
├── apps/
│   ├── greensoul/                  # ✅ GreenSoul 应用
│   │   ├── eas.json               # ✅ 正确位置
│   │   ├── app.json               # Expo 配置文件
│   │   └── eas-hooks/             # EAS Build hooks
│   └── greenlife/                  # 📌 未来：GreenLife Wallet 应用
│       └── eas.json               # 每个应用独立配置
└── package.json
```

### 🎯 原因

1. **执行目录一致性**：所有 EAS 命令都从 `apps/greensoul` 执行
2. **相对路径正确性**：hooks 和其他资源的相对路径基于此目录
3. **Expo 约定**：EAS CLI 在执行命令的目录中查找配置文件
4. **避免混淆**：多个应用时每个应用有自己的独立配置

## 🚀 使用方法

### 构建命令

所有 EAS 命令必须从 `apps/greensoul` 目录执行：

```bash
cd apps/greensoul

# iOS 构建（主要使用以下两种）
eas build --platform ios --profile preview        # 预览/内部测试
eas build --platform ios --profile production     # 生产版本

# Android 构建
eas build --platform android --profile preview    # 生成 APK
eas build --platform android --profile production # 生成 AAB

# 提交到 App Store / TestFlight
eas submit --platform ios
```

### 初始化配置

```bash
cd apps/greensoul
eas build:configure
```

## 📦 构建 Profile 说明

### iOS 构建（主要使用 2 种）

| Profile | 用途 | 分发方式 | 使用场景 |
|---------|------|----------|----------|
| **preview** | 内部测试 | Ad Hoc / TestFlight | 团队内部测试、Beta 版本 |
| **production** | 生产发布 | App Store | 正式发布到 App Store |

### Android 构建

| Profile | 用途 | 构建类型 | 使用场景 |
|---------|------|----------|----------|
| **preview** | 内部测试 | APK | 快速测试、直接安装 |
| **production** | 生产发布 | APK/AAB | 发布到 Google Play |

### 标准配置文件结构

```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": {
        "resourceClass": "m-medium"
      },
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "ios": {
        "resourceClass": "m-medium"
      },
      "android": {
        "buildType": "apk"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

## 🔧 关键配置项

### 1. Channel 配置（EAS Update）

```json
{
  "build": {
    "preview": {
      "channel": "preview"  // 测试版本的 OTA 更新通道
    },
    "production": {
      "channel": "production"  // 生产版本的 OTA 更新通道
    }
  }
}
```

**说明**：
- `preview` channel：用于内部测试版本的热更新
- `production` channel：用于生产版本的热更新
- 不同 channel 的更新互不影响

### 2. 自动版本号递增

```json
{
  "build": {
    "production": {
      "autoIncrement": true  // 自动递增 iOS buildNumber 和 Android versionCode
    }
  }
}
```

### 3. iOS 资源配置

```json
{
  "build": {
    "production": {
      "ios": {
        "resourceClass": "m-medium"  // 使用更大的构建资源
      }
    }
  }
}
```

### 4. Android 构建类型

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"  // 生成 APK 而不是 AAB
      }
    },
    "production": {
      "android": {
        "buildType": "aab"  // 生成 AAB（App Bundle）
      }
    }
  }
}
```

### 5. 环境变量和 Secrets

```json
{
  "build": {
    "production": {
      "env": {
        "SENTRY_AUTH_TOKEN": "@SENTRY_AUTH_TOKEN"  // @ 前缀表示从 EAS Secrets 读取
      }
    }
  }
}
```

### 6. Build Hooks

```json
{
  "build": {
    "production": {
      "hooks": {
        "preInstall": "./eas-hooks/eas-build-pre-install.sh"
      }
    }
  }
}
```

## 🖥️ 本地构建配置（Local Build）

### 本地构建命令

本地构建不使用 EAS 云端服务器，而是在你的本机执行构建。

```bash
cd apps/greensoul

# iOS 本地构建
eas build --local --platform ios --profile preview

# Android 本地构建
eas build --local --platform android --profile preview
```

### 环境变量配置

**重要**：在 `eas.json` 中使用 `@` 前缀的环境变量（如 `@SENTRY_AUTH_TOKEN`）在本地构建时的行为：

- ✅ **云端构建**：从 EAS Secrets 读取（通过 `eas secret:create` 创建）
- ⚠️ **本地构建**：EAS Secrets 不可用，需要从本地环境变量读取

### 配置方式

#### 方式 1：使用 Shell 环境变量（推荐）

```bash
cd apps/greensoul

# 设置环境变量
export SENTRY_AUTH_TOKEN="your-token-here"
export SENTRY_ORG="yilin-fc"
export SENTRY_PROJECT="greensoul"
export SENTRY_URL="https://sentry.io/"

# 执行本地构建
eas build --local --platform ios --profile preview
```

#### 方式 2：创建 `.env.local` 文件（持久化配置）

创建 `apps/greensoul/.env.local` 文件：

```bash
# apps/greensoul/.env.local
SENTRY_AUTH_TOKEN=sntryu_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENTRY_ORG=yilin-fc
SENTRY_PROJECT=greensoul
SENTRY_URL=https://sentry.io/
SENTRY_LOG_LEVEL=debug
```

**确保添加到 `.gitignore`**：

```
# .gitignore
.env.local
```

#### 方式 3：从 sentry.properties 读取（仅限 Android）

`apps/greensoul/sentry.properties` 文件：

```properties
defaults.url=https://sentry.io/
defaults.org=yilin-fc
defaults.project=greensoul
auth.token=sntryu_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**注意**：
- ✅ 这个文件主要用于 Android Gradle 构建
- ✅ 已在 `.gitignore` 中，不会提交到 git
- ⚠️ iOS 构建需要使用环境变量

### 环境变量优先级

1. **Shell 环境变量**（最高优先级）
2. **`.env.local` 文件**
3. **`.env` 文件**（如果存在）

### 验证配置

```bash
# 检查环境变量是否设置
echo $SENTRY_AUTH_TOKEN

# 如果为空，设置它
export SENTRY_AUTH_TOKEN="your-token-here"
```

### 完整本地构建流程示例

```bash
# 1. 进入项目目录
cd apps/greensoul

# 2. 设置环境变量（从 sentry.properties 文件中获取实际值）
export SENTRY_AUTH_TOKEN="your-actual-sentry-token"
export SENTRY_ORG="yilin-fc"
export SENTRY_PROJECT="greensoul"
export SENTRY_URL="https://sentry.io/"

# 3. 执行 iOS 本地构建
eas build --local --platform ios --profile preview

# 4. 构建产物位置
# iOS: apps/greensoul/build-xxxxx.ipa
```

**获取 token 的方式**：
- 从 `apps/greensoul/sentry.properties` 文件中的 `auth.token` 字段复制
- 或访问 https://sentry.io/settings/account/api/auth-tokens/ 创建新 token

### 本地构建 vs 云端构建对比

| 特性 | 本地构建 | 云端构建 |
|------|---------|---------|
| **执行位置** | 你的电脑 | EAS 服务器 |
| **速度** | 取决于你的电脑性能 | 稳定，资源可配置 |
| **环境变量** | 需要本地配置 | 使用 EAS Secrets |
| **依赖** | 需要 Xcode（iOS）或 Android Studio | 完全托管 |
| **费用** | 免费 | 消耗构建配额 |
| **适用场景** | 开发调试、快速测试 | 正式发布、CI/CD |

### ⚠️ 本地构建注意事项

1. **环境变量安全**：
   - ❌ 不要在 `eas.json` 中硬编码敏感信息
   - ✅ 使用环境变量或 `.env.local`
   - ✅ 确保 `.env.local` 和 `sentry.properties` 在 `.gitignore` 中

2. **系统要求**：
   - **iOS 本地构建**：需要 macOS + Xcode
   - **Android 本地构建**：需要 Android SDK

3. **构建产物**：
   - 本地构建的文件会保存在 `apps/greensoul/` 目录
   - 文件名格式：`build-<timestamp>.ipa` 或 `.apk`

## 🍎 iOS 构建最佳实践

### 推荐的 iOS 构建流程

#### 1. 内部测试（preview）
```bash
cd apps/greensoul
eas build --platform ios --profile preview
```

**用于**：
- 团队内部测试
- Beta 测试人员
- TestFlight 内部分发
- 功能验证

**特点**：
- ✅ 快速迭代
- ✅ 支持 Ad Hoc 或 TestFlight
- ✅ 独立的 `preview` 更新通道

#### 2. 生产发布（production）
```bash
cd apps/greensoul
eas build --platform ios --profile production --auto-submit
```

**用于**：
- App Store 正式发布
- 公开 TestFlight
- 生产环境

**特点**：
- ✅ 自动递增版本号（`autoIncrement: true`）
- ✅ 可直接提交到 App Store
- ✅ 独立的 `production` 更新通道

### 为什么 iOS 主要使用这两种？

1. **清晰的环境隔离**
   - `preview` = 测试环境
   - `production` = 生产环境

2. **简化管理**
   - 减少配置复杂度
   - 明确的发布流程

3. **独立的更新通道**
   - 测试版本和生产版本的 OTA 更新互不影响
   - 避免测试更新推送到生产用户

## ⚠️ 常见错误

### ❌ 错误：在根目录放置 eas.json

```
greensoul/
├── eas.json          # ❌ 错误位置
└── apps/
    ├── greensoul/    # ✅ GreenSoul 应用目录
    └── greenlife/    # ✅ GreenLife 应用目录
```

**问题**：
- Hook 路径错误
- 相对路径解析失败
- 与文档不一致

### ❌ 错误：从根目录执行构建命令

```bash
# ❌ 错误
cd /Users/linyi/future/greensoul
eas build --platform ios

# ✅ 正确
cd /Users/linyi/future/greensoul/apps/greensoul
eas build --platform ios
```

## 📚 相关文件

- `apps/greensoul/eas.json` - GreenSoul EAS Build 配置
- `apps/greensoul/app.json` - GreenSoul Expo 应用配置
- `apps/greensoul/eas-hooks/` - GreenSoul EAS Build 钩子脚本
- `apps/greenlife/eas.json` - GreenLife EAS Build 配置（未来）

## 🔗 参考资源

- [EAS Build 文档](https://docs.expo.dev/build/introduction/)
- [eas.json 配置参考](https://docs.expo.dev/build-reference/eas-json/)
- [EAS Update Channels](https://docs.expo.dev/eas-update/how-it-works/)
- [Monorepo 配置](https://docs.expo.dev/build-reference/build-configuration/)
