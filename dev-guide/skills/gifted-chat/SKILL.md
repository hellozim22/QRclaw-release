---
name: gifted-chat
description: GiftedChat v3 键盘处理最佳实践
---

# GiftedChat v3 键盘处理最佳实践

> **版本**: react-native-gifted-chat v3.x + react-native-keyboard-controller

## 1. 根布局添加 KeyboardProvider

```typescript
// app/_layout.tsx
import { KeyboardProvider } from 'react-native-keyboard-controller';

<GestureHandlerRootView style={{ flex: 1 }}>
  <KeyboardProvider>
    <Stack />
  </KeyboardProvider>
</GestureHandlerRootView>
```

> **注意**: 不需要在 `app.json` plugins 中添加 `react-native-keyboard-controller`

## 2. 提取 InputToolbar 为独立组件（关键）

**问题**: 在父组件监听键盘事件并 setState → 整个 GiftedChat re-render → TextInput 失焦 → 键盘闪退

**解决**: 将动态样式逻辑封装到独立组件内部：

```typescript
const CustomInputToolbar = ({ insets, ...props }: InputToolbarProps<IMessage> & { insets: { bottom: number } }) => {
  // 键盘隐藏: 安全区域 padding | 键盘显示: 小 padding
  const [paddingBottom, setPaddingBottom] = useState(Math.max(Spacing.md, insets.bottom));

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setPaddingBottom(Spacing.sm));
    const hideSub = Keyboard.addListener(hideEvent, () => setPaddingBottom(Math.max(Spacing.md, insets.bottom)));

    return () => { showSub.remove(); hideSub.remove(); };
  }, [insets.bottom]);

  return <InputToolbar {...props} containerStyle={[styles.inputToolbar, { paddingBottom }]} />;
};
```

## 3. GiftedChat 配置

```typescript
const insets = useSafeAreaInsets();
const headerHeight = 56;

const renderInputToolbar = useCallback(
  (props: InputToolbarProps<IMessage>) => <CustomInputToolbar {...props} insets={insets} />,
  [insets]
);

<GiftedChat
  renderInputToolbar={renderInputToolbar}
  keyboardAvoidingViewProps={{
    keyboardVerticalOffset: insets.top + headerHeight,
  }}
  isSendButtonAlwaysVisible
  isUserAvatarVisible={false}
  isAvatarOnTop
/>
```

## 4. 平台差异处理

### 键盘事件

| 平台 | 事件 | 原因 |
|------|------|------|
| iOS | `keyboardWillShow/Hide` | 动画开始前触发，padding 变化与键盘同步，无闪动 |
| Android | `keyboardDidShow/Hide` | `keyboardWill*` 在 Android 上不可靠 |

```typescript
const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
```

> **注意**: 如果 iOS 统一使用 `keyboardDidShow`，会导致 toolbar 闪动（padding 在动画结束后才变化）

### placeholder 传递

v3 中 `placeholder` 属性需要通过 `textInputProps` 传递：

```typescript
// ❌ v2 方式（v3 不生效，显示默认 "Type a message..."）
<GiftedChat placeholder={t('chat.placeholder')} />

// ✅ v3 方式
<GiftedChat
  textInputProps={{
    placeholder: t('chat.placeholder'),
    placeholderTextColor: Colors.textPlaceholder,
  }}
/>
```

## 5. v2 → v3 Props 迁移

| v2 | v3 |
|----|----|
| `alwaysShowSend` | `isSendButtonAlwaysVisible` |
| `showUserAvatar` | `isUserAvatarVisible` |
| `renderAvatarOnTop` | `isAvatarOnTop` |
| `placeholder` | `textInputProps.placeholder` |

## 6. 常见问题

| 问题 | 解决方案 |
|------|---------|
| 键盘闪退 | 提取 InputToolbar 为独立组件 |
| 输入框被键盘遮挡 | 设置 `keyboardVerticalOffset: insets.top + headerHeight` |
| Home Indicator 遮挡 | 键盘隐藏时 `paddingBottom: insets.bottom` |
| 键盘上方间距过大 | 键盘显示时 `paddingBottom: Spacing.sm` |
| iOS toolbar 闪动 | 使用 `keyboardWillShow` 而非 `keyboardDidShow` |
| placeholder 不生效 | 使用 `textInputProps.placeholder` |
| 发送后键盘收起 | 移除 `key={messages.length}`，可选加 `blurOnSubmit: false` |

## 7. Push 模式 vs Modal 模式（重要）

聊天页面的导航模式不同，`keyboardVerticalOffset` 的计算方式也完全不同。

### 两种模式的区别

| 特性 | Push 模式 | Modal 模式 (fullScreenModal) |
|------|----------|------------------------------|
| 导航方式 | Stack 正常 push | 从底部滑入覆盖 |
| Header 处理 | 通常绝对定位 | 通常绝对定位 |
| 内容起点 | 屏幕顶部 | 屏幕顶部 |
| messagesContainer | 需要 paddingTop 避开 header | 需要 paddingTop 避开 header |
| keyboardVerticalOffset | **不需要加 header 高度** | **需要加 header 高度** |

### Push 模式（如 GreenSoul）

Header 绝对定位，`messagesContainerStyle.paddingTop` 已处理 header 避让。

**关键**：`keyboardVerticalOffset` 不要加 header 高度，否则会重复计算！

```typescript
// ✅ Push 模式 - 绝对定位 Header
const keyboardVerticalOffset = useMemo(() => {
  if (Platform.OS === 'ios') {
    // iOS: 不需要 offset，messagesContainerStyle.paddingTop 已处理
    return 0;
  }
  // Android: 只需要系统补偿
  const INPUT_TOOLBAR_HEIGHT = 60;
  const ANDROID_SYSTEM_UI_COMPENSATION = 74;
  return INPUT_TOOLBAR_HEIGHT + ANDROID_SYSTEM_UI_COMPENSATION;
}, []);

// messagesContainerStyle 处理 header 避让
messagesContainerStyle={{
  paddingTop: insets.top + HEADER_HEIGHT,
}}
```

### Modal 模式（如 LabX）

同样是绝对定位 Header，但 Modal 的键盘计算行为不同。

**关键**：`keyboardVerticalOffset` 需要加上 safe area + header 高度。

```typescript
// ✅ Modal 模式 - 绝对定位 Header
const keyboardVerticalOffset = useMemo(() => {
  const HEADER_HEIGHT = 44;
  
  if (Platform.OS === 'ios') {
    const baseOffset = insets.top + HEADER_HEIGHT;
    // 有额外组件时加上其高度
    return showExtraComponent ? baseOffset + extraComponentHeight : baseOffset;
  }
  
  // Android 需要额外补偿
  const INPUT_TOOLBAR_HEIGHT = 56;
  const ANDROID_SYSTEM_UI_COMPENSATION = 74;
  return insets.top + HEADER_HEIGHT + INPUT_TOOLBAR_HEIGHT + ANDROID_SYSTEM_UI_COMPENSATION;
}, [insets.top, showExtraComponent, extraComponentHeight]);
```

### 为什么会有这个差异？

1. **Push 模式**：GiftedChat 的 KeyboardAvoidingView 知道整个页面的布局，`paddingTop` 已经为 header 预留了空间，offset 再加 header 高度会导致**重复计算**

2. **Modal 模式**：Modal 覆盖整个屏幕，KeyboardAvoidingView 的计算参考点不同，需要手动告诉它 header 占用的空间

### 诊断方法

如果键盘弹起时 toolbar 与键盘之间有很大空白：
1. 检查是否在 Push 模式下错误地加了 header 高度
2. 检查 `messagesContainerStyle.paddingTop` 是否已经处理了 header

如果键盘弹起时 toolbar 被遮挡：
1. 检查是否在 Modal 模式下漏加了 header 高度
2. 检查是否有额外组件（如快捷问题）需要补偿

## 8. Modal 模式额外组件处理

当 Modal 模式下消息列表上方有额外组件（如快捷问题）时，需要动态获取其高度。

```typescript
// 1. 动态获取额外组件高度
const [quickQuestionsHeight, setQuickQuestionsHeight] = useState(0);

// 2. 在 offset 计算中使用
const keyboardVerticalOffset = useMemo(() => {
  if (Platform.OS === 'ios') {
    const baseOffset = insets.top + HEADER_HEIGHT;
    return showQuickQuestions ? baseOffset + quickQuestionsHeight : baseOffset;
  }
  // ...
}, [insets.top, showQuickQuestions, quickQuestionsHeight]);

// 3. 使用 onLayout 获取真实高度
<QuickQuestions onLayout={(e) => setQuickQuestionsHeight(e.nativeEvent.layout.height)} />
```

## 9. InputToolbar 垂直居中

InputToolbar 中的 input 和发送按钮需要垂直居中，但由于 borderTop、按钮高度差等因素，需要视觉补偿。

```typescript
const CustomInputToolbar = (props: InputToolbarProps<IMessage> & { insets: { bottom: number } }) => {
  const defaultPaddingBottom = Math.max(Spacing.md, insets.bottom);
  const defaultPaddingTop = Spacing.md;
  
  const [paddingTop, setPaddingTop] = useState(defaultPaddingTop);
  const [paddingBottom, setPaddingBottom] = useState(defaultPaddingBottom);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => {
      // 视觉居中：上边距多 Spacing.xs 补偿 borderTop + 按钮高度差
      const VISUAL_CENTER_COMPENSATION = Spacing.xs;
      setPaddingTop(Spacing.md + VISUAL_CENTER_COMPENSATION);
      setPaddingBottom(Spacing.md);
    });
    
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setPaddingTop(defaultPaddingTop);
      setPaddingBottom(defaultPaddingBottom);
    });

    return () => { showSub.remove(); hideSub.remove(); };
  }, [defaultPaddingBottom]);

  return (
    <InputToolbar
      {...props}
      containerStyle={[styles.inputToolbar, { paddingTop, paddingBottom }]}
    />
  );
};
```

## 10. TextInput 文字垂直居中

TextInput 的文字可能偏下，需要设置合适的样式：

```typescript
textInput: {
  flex: 1,
  fontSize: FontSize.md,
  lineHeight: 20,              // 固定行高，防止文字被截断
  minHeight: 40,               // 最小高度确保单行文字居中
  maxHeight: 100,
  paddingTop: 9,               // 微调上下 padding 实现视觉居中
  paddingBottom: 11,
  paddingHorizontal: Spacing.md,
  textAlignVertical: 'center', // Android
}
```

## 11. 连续对话：保持键盘打开

发送消息后默认键盘会收起，要实现连续对话体验：

### 关键：不要用 `key` 强制重新渲染

```typescript
// ❌ 错误 - 每次消息变化都重新挂载组件，导致 TextInput 失焦
<GiftedChat
  key={`chat-${messages.length}`}
  messages={giftedMessages}
  ...
/>

// ✅ 正确 - 让 GiftedChat 正常更新
<GiftedChat
  messages={giftedMessages}
  ...
/>
```

**原因**：`key` 变化 → React 卸载旧组件 → 创建新组件 → TextInput 失焦 → 键盘收起

### 可选：`blurOnSubmit: false`

```typescript
textInputProps={{
  blurOnSubmit: false, // 可选：确保按发送键不会收起键盘
}}
```

## 12. 不要做的事

- ❌ 在聊天页面组件内监听键盘事件并 setState
- ❌ 使用外部 `KeyboardAvoidingView` 包裹 `GiftedChat`
- ❌ 在 `app.json` plugins 中添加 `react-native-keyboard-controller`
- ❌ iOS/Android 统一使用 `keyboardDidShow`（iOS 会闪动）
- ❌ 使用固定的 offset 值，不考虑动态组件的高度
- ❌ 在 Push 模式下给 `keyboardVerticalOffset` 加 header 高度（会重复计算）
- ❌ 在 Modal 模式下忘记给 `keyboardVerticalOffset` 加 header 高度（会被遮挡）
- ❌ 不区分 Push/Modal 模式直接复制粘贴代码
- ❌ 使用 `key={messages.length}` 强制重新渲染（会导致键盘收起）

## 核心原则

> **状态隔离**: 将动态 UI 逻辑封装到最小的组件中，避免触发大范围 re-render。

> **动态计算**: 键盘 offset 应根据实际显示的组件动态计算，使用 `onLayout` 获取真实高度。

> **平台差异**: iOS 和 Android 的键盘处理行为不同，需要分别处理。

> **导航模式**: Push 和 Modal 的键盘计算逻辑不同，不能直接复制代码，必须理解原理后针对性处理。
