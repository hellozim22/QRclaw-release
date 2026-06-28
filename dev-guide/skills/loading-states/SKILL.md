---
name: loading-states
description: Loading 状态规范 - 全屏 LoadingOverlay 使用
---

# Loading 状态规范

## 核心规则

异步操作（API 调用、表单提交）使用 **LoadingOverlay** 而非仅禁用按钮。

## 基本实现

```tsx
import { LoadingOverlay } from '@/components/common';

const [loading, setLoading] = useState(false);

const mutation = useMutation({
  mutationFn: someApiCall,
  onSuccess: () => {
    setLoading(false);  // ⚠️ 必须在 Alert 之前
    Alert.alert('成功');
  },
  onError: (error) => {
    setLoading(false);  // ⚠️ 必须在 Alert 之前
    Alert.alert('失败', error.message);
  },
});

const handleSubmit = () => {
  setLoading(true);
  mutation.mutate(data);
};

return (
  <SafeAreaView>
    {/* 页面内容 */}
    <TouchableOpacity onPress={handleSubmit} disabled={loading}>
      <Text>提交</Text>
    </TouchableOpacity>
    
    <LoadingOverlay
      visible={loading}
      message="处理中..."
      subMessage="订单详情"  {/* 可选：显示上下文 */}
    />
  </SafeAreaView>
);
```

## 配合 PaymentAuthModal

**关键顺序**：先显示 LoadingOverlay，再关闭 Modal。

```tsx
const handleAuthSuccess = (authResult) => {
  setLoading(true);        // 1. 先显示
  setShowAuthModal(false); // 2. 再关闭
  mutation.mutate(data);
};
```

## 适用场景

| 场景 | 方案 |
|------|------|
| 表单提交、支付、转账 | ✅ LoadingOverlay |
| 页面初始加载 | ActivityIndicator |
| 下拉刷新 | RefreshControl |

## 注意事项

1. 使用独立 `loading` 状态，不依赖 `mutation.isPending`
2. 按钮文字保持不变（不需要 "提交中..."）
3. LoadingOverlay 放在 SafeAreaView 内部最后
