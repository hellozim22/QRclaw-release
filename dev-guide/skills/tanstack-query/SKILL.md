---
name: tanstack-query
description: TanStack Query 最佳实践规范 - 数据获取层架构
---

# TanStack Query 最佳实践规范

## 🏗️ 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        UI 组件                               │
│  (使用 hooks，不直接调用 services)                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     TanStack Query Hooks                     │
│  hooks/useBalance.ts, useTransactions.ts, useCards.ts ...   │
│  - useQuery: 数据读取                                        │
│  - useMutation: 数据修改                                     │
│  - useInfiniteQuery: 分页/无限滚动                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Services 层                             │
│  services/balance.ts, transactions.ts, card.ts ...          │
│  - 封装 Supabase 调用                                        │
│  - 返回 { data, error } 格式                                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   Supabase / 外部 API                        │
└─────────────────────────────────────────────────────────────┘
```

## 📁 文件组织

```
apps/greenlife/
├── hooks/
│   ├── useBalance.ts          # 余额查询
│   ├── useTransactions.ts     # 交易列表 + 详情
│   ├── useUserProfile.ts      # 用户资料
│   ├── useRecentContacts.ts   # 最近联系人
│   ├── useBankAccounts.ts     # 银行账户
│   ├── useCards.ts            # 卡片相关
│   ├── useNotificationSettings.ts  # 通知设置
│   └── useMutations.ts        # 通用 mutation 工具
├── services/
│   ├── queryClient.ts         # QueryClient 配置 + QueryKeys
│   └── ...                    # 各业务 service
└── components/
    └── providers/
        └── QueryProvider.tsx  # TanStack Query Provider
```

## 🔑 QueryKeys 管理

所有查询键集中定义在 `services/queryClient.ts`：

```typescript
export const QueryKeys = {
  // 账户
  balance: ['balance'] as const,
  
  // 交易
  transactions: ['transactions'] as const,
  transactionDetail: (id: string) => ['transaction', id] as const,
  
  // 用户
  userProfile: ['userProfile'] as const,
  
  // 联系人
  recentContacts: (limit?: number) => ['recentContacts', { limit }] as const,
  
  // 卡片
  cards: ['cards'] as const,
  cardDetail: (cardId: string) => ['card', cardId] as const,
  cardLimits: (cardId: string) => ['cardLimits', cardId] as const,
  cardTransactions: (cardId: string) => ['cardTransactions', cardId] as const,
  
  // 银行账户
  bankAccounts: ['bankAccounts'] as const,
} as const;
```

## ⏱️ 缓存策略

| 数据类型 | staleTime | 说明 |
|----------|-----------|------|
| 余额 | 30秒 | 金融数据需要较新 |
| 交易列表 | 2分钟 | 适中刷新频率 |
| 用户资料 | 5分钟 | 变化不频繁 |
| 卡片列表 | 5分钟 | 变化不频繁 |
| 卡片限额 | 2分钟 | 需要较新 |
| 卡片交易 | 1分钟 | 需要及时更新 |

## 📝 Hook 编写规范

### 基础 Query Hook

```typescript
export function useBalance(): UseBalanceResult {
  const {
    data: balance,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: QueryKeys.balance,
    queryFn: fetchBalance,
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData,
  });

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    balance: balance ?? null,
    loading: isLoading,
    isFetching,
    error: error as Error | null,
    refresh,
  };
}
```

### 分页/无限滚动 Hook

```typescript
export function useCardTransactions(cardId: string | undefined) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
  } = useInfiniteQuery({
    queryKey: QueryKeys.cardTransactions(cardId || ''),
    queryFn: ({ pageParam = 0 }) => fetchCardTransactions(cardId!, pageParam),
    enabled: !!cardId,
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.reduce((sum, p) => sum + p.transactions.length, 0);
    },
  });

  const transactions = data?.pages.flatMap(page => page.transactions) || [];
  // ...
}
```

## 🔄 Mutation 最佳实践

### 基础 Mutation（带乐观更新）

```typescript
const mutation = useMutation({
  mutationFn: ({ cardId, action }) => cardService.cardAction(cardId, action),
  
  // 乐观更新
  onMutate: async ({ cardId, action }) => {
    await queryClient.cancelQueries({ queryKey: QueryKeys.cards });
    const previousCards = queryClient.getQueryData<Card[]>(QueryKeys.cards);
    
    queryClient.setQueryData<Card[]>(QueryKeys.cards, (old) => 
      old?.map(c => c.id === cardId ? { ...c, status: newStatus } : c) || []
    );
    
    return { previousCards };
  },
  
  // 错误回滚
  onError: (err, variables, context) => {
    if (context?.previousCards) {
      queryClient.setQueryData(QueryKeys.cards, context.previousCards);
    }
  },
});
```

### Switch/开关 瞬时响应模式

**问题**：直接使用 Query 缓存作为 Switch 的 value 会有 1 帧延迟。

**解决方案**：使用本地 state + 后台同步

```typescript
// ✅ 最佳实践：本地 state 立即响应
const [localValue, setLocalValue] = useState<boolean | null>(null);

// 从服务器初始化（仅首次）
useEffect(() => {
  if (settings && localValue === null) {
    setLocalValue(settings.someValue);
  }
}, [settings, localValue]);

// 处理切换
const handleToggle = (value: boolean) => {
  setLocalValue(value);           // ← 立即更新 UI（0ms）
  updateSetting('key', value);    // ← 后台同步（fire-and-forget）
};

// Switch 使用本地 state
<Switch value={localValue ?? defaultValue} onValueChange={handleToggle} />
```

## 🔄 数据刷新策略

### 交易完成后刷新

```typescript
export function useTransactionMutations() {
  const queryClient = useQueryClient();
  
  const invalidateAfterTransaction = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: QueryKeys.balance }),
      queryClient.invalidateQueries({ queryKey: QueryKeys.transactions }),
      queryClient.invalidateQueries({ queryKey: QueryKeys.recentContacts() }),
    ]);
  }, [queryClient]);
  
  return { invalidateAfterTransaction };
}
```

### 登出时清理

```typescript
// stores/authStore.ts
signOut: async () => {
  // ... 登出逻辑
  queryClient.clear();  // 清除所有缓存
}
```

## ❌ 避免的模式

```typescript
// ❌ 不要在组件中直接调用 supabase
const { data } = await supabase.from('users').select('*');

// ✅ 使用 hook
const { user } = useUserProfile();

// ❌ 不要在 useEffect 中手动获取数据
useEffect(() => {
  fetchData().then(setData);
}, []);

// ✅ 使用 useQuery
const { data } = useQuery({ queryKey: ['data'], queryFn: fetchData });

// ❌ 不要用 Query 缓存直接驱动 Switch
<Switch value={settings?.value} />

// ✅ 使用本地 state
<Switch value={localValue} />
```

## 📋 检查清单

添加新的数据获取功能时：

- [ ] 在 `QueryKeys` 中定义查询键
- [ ] 创建独立的 hook 文件
- [ ] 设置合适的 `staleTime`
- [ ] 实现乐观更新（如适用）
- [ ] 处理错误回滚（如适用）
- [ ] 开关类 UI 使用本地 state 模式
- [ ] 数据变更后调用 `invalidateQueries`
