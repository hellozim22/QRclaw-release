---
name: expo-config
description: Expo 配置规范
---

# Expo 配置规范

## 🎯 关键配置项

### GreenSoul 配置 (`apps/greensoul/app.json`)

```json
{
  "expo": {
    "name": "GreenSoul",
    "slug": "greensoul",
    "scheme": "greensoul",
    "ios": {
      "bundleIdentifier": "com.yilin.greensoul"
    },
    "android": {
      "package": "com.yilin.greensoul"
    }
  }
}
```

### GreenLife 配置 (`apps/greenlife/app.json`)

```json
{
  "expo": {
    "name": "GreenLife",
    "slug": "greenlife",
    "scheme": "greenlife",
    "ios": {
      "bundleIdentifier": "com.yilin.greenlife"
    },
    "android": {
      "package": "com.yilin.greenlife"
    }
  }
}
```

### Flivo 配置 (`apps/flivo/app.json`)

```json
{
  "expo": {
    "name": "Flivo",
    "slug": "flivo",
    "scheme": "flivo",
    "ios": {
      "bundleIdentifier": "com.yilin.flivo"
    },
    "android": {
      "package": "com.yilin.flivo"
    }
  }
}
```

### LabX 配置 (`apps/labx/app.json`)

```json
{
  "expo": {
    "name": "LabX",
    "slug": "labx",
    "scheme": "labx",
    "ios": {
      "bundleIdentifier": "com.yilin.labx"
    },
    "android": {
      "package": "com.yilin.labx"
    }
  }
}
```

## ⚠️ 重要提醒

1. **Bundle Identifier**: iOS 和 Android 的包标识符必须配置，否则无法运行
   - iOS: `bundleIdentifier`
   - Android: `package`
   - 格式: `com.公司名.应用名`

2. **保持一致**: iOS 和 Android 的标识符应该使用相同的值

3. **不可更改**: 发布后 Bundle Identifier 不能更改

4. **Scheme 配置**: 用于 Deep Linking，每个应用使用独立的 scheme

## 🔒 项目配置汇总

| 应用 | Bundle Identifier | Scheme | 状态 |
|------|-------------------|--------|------|
| GreenSoul | `com.yilin.greensoul` | `greensoul` | ✅ 已上线 |
| GreenLife | `com.yilin.greenlife` | `greenlife` | 🔄 开发中 |
| Flivo | `com.yilin.flivo` | `flivo` | 🔄 开发中 |
| LabX | `com.yilin.labx` | `labx` | 🔄 开发中 |

## 📱 常用配置项

### Splash Screen

```json
{
  "expo": {
    "splash": {
      "image": "./assets/images/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#B5E0CA"
    }
  }
}
```

### 权限配置 (iOS)

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSCameraUsageDescription": "需要访问相机...",
        "NSPhotoLibraryUsageDescription": "需要访问相册..."
      }
    }
  }
}
```

### Plugins

```json
{
  "expo": {
    "plugins": [
      "expo-router",
      "expo-sqlite",
      ["@sentry/react-native/expo", {
        "organization": "your-org",
        "project": "your-project"
      }]
    ]
  }
}
```
