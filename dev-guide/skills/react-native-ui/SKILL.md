---
name: react-native-ui
description: React Native UI 开发规范
---

# React Native UI 开发规范

适用于所有 React Native UI 开发，重点关注 Android 兼容性。

## 📱 Android 布局陷阱

### 圆角裁剪问题

Android 上 `overflow: 'hidden'` + `borderRadius` 可能导致子元素消失。

```typescript
// ❌ 避免
container: { borderRadius: 8, overflow: 'hidden' }
image: { flex: 1 }

// ✅ 推荐：子元素自管理圆角
container: { borderRadius: 8 }
image: { width: 100, height: 100, borderRadius: 8 }
```

### 绝对定位

- 父容器必须显式设置 `position: 'relative'`
- 子元素需明确 `top/left/right/bottom` 或宽高

## ⌨️ TextInput 样式（重要）

### 禁止在 TextInput 中使用 lineHeight

**问题**：`lineHeight` 在 TextInput 中会导致 Android 上文字垂直偏移，这是 React Native 的已知问题。

```typescript
// ❌ 错误 - Typography 包含 lineHeight
emailInput: {
  ...Typography.body,  // 展开后包含 lineHeight: 24
  color: Colors.textPrimary,
}

// ✅ 正确 - 只提取需要的属性
emailInput: {
  fontSize: Typography.body.fontSize,
  fontWeight: Typography.body.fontWeight,
  // 不使用 lineHeight
  color: Colors.textPrimary,
  textAlignVertical: 'center',  // Android 垂直居中
}
```

### TextInput 垂直居中最佳实践

```typescript
// 容器样式
inputContainer: {
  height: ComponentSize.buttonMedium,
  backgroundColor: Colors.secondary,
  borderRadius: Radius.full,
  justifyContent: 'center',  // 帮助布局
},

// 输入框样式
input: {
  height: '100%',  // 或固定高度
  paddingHorizontal: Spacing.xl,
  fontSize: Typography.body.fontSize,
  fontWeight: Typography.body.fontWeight,
  color: Colors.textPrimary,
  textAlignVertical: 'center',  // Android 专用，必须添加
  // iOS 默认垂直居中，不需要额外处理
}
```

### 关键点速查

| 属性 | 说明 | 平台 |
|------|------|------|
| `textAlignVertical: 'center'` | 文字垂直居中 | Android 必须 |
| `justifyContent: 'center'`（容器） | 辅助布局 | 通用 |
| **不使用** `lineHeight` | 避免垂直偏移 | Android |
| `textAlign: 'center'` | 文字水平居中（如验证码输入） | 通用 |

## 🖼️ 图片组件

优先使用 `expo-image` 替代原生 `Image`：

```typescript
import { Image } from 'expo-image';

<Image source={uri} contentFit="cover" transition={200} />
```

## 🔄 繁重任务

图片选择后执行耗时操作，需延迟执行避免阻塞 UI：

```typescript
setImage(uri);
setTimeout(() => heavyComputation(uri), 300);
```

## 🎨 颜色值管理

**规则**：禁止硬编码颜色值，必须从 `@/constants/theme` 导入 `Colors`。

```typescript
import { Colors } from '@/constants/theme';

// ✅ 正确
<ActivityIndicator color={Colors.backgroundWhite} />
<Text style={{ color: Colors.textSecondary }} />
<View style={{ backgroundColor: Colors.overlay }} />

// ❌ 禁止
<ActivityIndicator color="#FFFFFF" />
<View style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />
```

### 新增颜色

优先复用已有颜色。如需新增，在 `constants/theme.ts` 的 `Colors` 中添加并注释用途：

```typescript
export const Colors = {
  // ... 已有颜色
  newColor: '#XXXXXX',  // 说明用途
} as const;
```
