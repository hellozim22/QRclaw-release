---
name: labx-experiment
description: LabX 创意实验开发规范 - 快速创建标准化创意入口
---

# LabX 创意实验开发规范

> 本规范用于指导在 LabX 平台中快速创建标准化的创意实验入口

## 🎯 LabX 产品定位

LabX 是一个「AI 创意产品展示平台」：
- **目的**: 让组织内所有人的 vibe coding 创意有统一展示入口
- **用户**: 管理层快速体验和评估 AI 产品创意
- **特点**: 每个创意交互形态不同，但入口展示标准化
- **创作者展示**: 每个创意都会展示创作者名字，给予认可

---

## 📁 创意目录结构（标准化）

每个新创意必须遵循以下目录结构：

```
apps/labx/
├── app/(labs)/[experiment-name]/    # 创意路由（必须）
│   ├── _layout.tsx                  # 布局文件（必须）
│   ├── index.tsx                    # 入口页面（必须）
│   └── [其他页面].tsx               # 创意内部页面（按需）
│
├── constants/labs.ts                # 添加创意配置（必须）
│
├── stores/[name]Store.ts            # 状态管理（如需要）
│
├── services/[name]Service.ts        # API 服务（如需要）
│
└── components/[experiment-name]/    # 专用组件（如需要）

supabase/labx/supabase/functions/
└── [function-name]/                 # Edge Function（如需要）
    └── index.ts
```

---

## 🏷️ 创意配置（标准化）

在 `constants/labs.ts` 中添加创意配置：

```typescript
// constants/labs.ts
export interface Lab {
  id: string;                              // 唯一标识（kebab-case）
  name: string;                            // 显示名称（2-6个字）
  description: string;                     // 一句话描述（15字以内）
  icon: keyof typeof Ionicons.glyphMap;    // Ionicons 图标名
  color: string;                           // 主题色（十六进制）
  route: string;                           // 路由路径
  status: 'active' | 'beta' | 'coming-soon'; // 状态
  creator: string;                         // 创作者邮箱用户名（必须）
  createdAt?: string;                      // 创建日期（可选，格式：YYYY-MM）
}

// 添加新创意
export const LABS: Lab[] = [
  // ... 现有创意
  {
    id: 'my-experiment',           // 唯一ID
    name: '创意名称',               // 卡片标题
    description: '一句话说明功能',   // 卡片描述
    icon: 'flask-outline',         // 图标
    color: '#07C160',              // 主题色
    route: '/(labs)/my-experiment', // 路由
    status: 'beta',                // 状态
    creator: 'yourname',           // 邮箱用户名（必须填写）
    createdAt: '2026-01',          // 创建月份
  },
];
```

### 字段说明

| 字段 | 必须 | 说明 |
|------|------|------|
| `id` | ✅ | 唯一标识，kebab-case 格式 |
| `name` | ✅ | 卡片标题，2-6 个字 |
| `description` | ✅ | 功能描述，15 字以内 |
| `icon` | ✅ | Ionicons 图标名 |
| `color` | ✅ | 主题色，十六进制 |
| `route` | ✅ | 路由路径 |
| `status` | ✅ | active / beta / coming-soon |
| `creator` | ✅ | **创作者邮箱用户名（@tencent.com 前缀，必须填写）** |
| `createdAt` | ❌ | 创建月份，格式 YYYY-MM |

### 状态说明
| 状态 | 显示 | 说明 |
|------|------|------|
| `active` | 无标签 | 已上线，正常使用 |
| `beta` | BETA 标签 | 测试中，可能有问题 |
| `coming-soon` | 即将上线 | 卡片置灰，不可点击 |

---

## 📄 入口页面模板（标准化）

创意的 `index.tsx` 入口页面必须遵循以下模板：

```tsx
/**
 * [创意名称] - 入口页面
 * 
 * 功能说明：[一句话描述]
 * 创作者：[你的邮箱用户名]
 */

import { View, StyleSheet, ScrollView, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '@/constants/theme';
import { Header } from '@/components';  // ⚠️ 必须复用 Header 组件

export default function MyExperimentScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* 标准导航栏 - 复用 Header 组件 */}
        <Header title="创意名称" onBack={() => router.back()} />

        {/* 创意内容区域 - 自由发挥 */}
        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* 在这里实现创意的具体功能 */}
        </ScrollView>

        {/* 底部操作区域（可选） */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>主要操作</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// 标准样式 - 可在此基础上扩展
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  safeArea: {
    flex: 1,
  },

  // 内容区域
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.lg,
  },

  // 底部操作区域
  footer: {
    backgroundColor: Colors.backgroundWhite,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: Colors.buttonPrimary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.medium,
    color: Colors.backgroundWhite,
  },
});
```

---

## 📐 布局文件模板（标准化）

创意的 `_layout.tsx` 必须遵循：

```tsx
// app/(labs)/[experiment-name]/_layout.tsx
import { Stack } from 'expo-router';

export default function MyExperimentLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* 添加其他页面 */}
    </Stack>
  );
}
```

---

## 🎨 设计规范（必须遵循）

### 导航栏设计原则

**重要**：创意实验的导航栏必须融入页面背景，与 TabHeader 风格保持一致：

```
┌─────────────────────────────┐
│      状态栏 (灰色背景)        │  ← SafeAreaView edges={['top']}
├─────────────────────────────┤
│  ← 返回    标题     [操作]   │  ← header: backgroundColor: Colors.background
├─────────────────────────────┤
│                             │
│      内容区域 (白色卡片)      │  ← content: backgroundColor: Colors.card
│                             │
└─────────────────────────────┘
```

- **导航栏背景**：使用 `Colors.background` (#EDEDED)，融入状态栏
- **导航栏无边框**：不需要 `borderBottomWidth`
- **内容区域**：使用 `Colors.card` (#FFFFFF) 作为卡片背景

### Header 组件（必须复用）

**重要**：所有创意页面必须使用 `<Header>` 组件，禁止重复定义 header 样式。

```tsx
import { Header } from '@/components';

// 基础用法 - 带返回按钮
<Header title="页面标题" onBack={() => router.back()} />

// Modal 页面 - 带关闭按钮
<Header title="弹窗标题" onClose={() => router.back()} showBackButton={false} />

// 带右侧操作按钮
<Header 
  title="页面标题" 
  onBack={() => router.back()} 
  rightElement={
    <TouchableOpacity onPress={handleAction}>
      <Text style={{ color: Colors.link }}>操作</Text>
    </TouchableOpacity>
  }
/>
```

| 属性 | 类型 | 说明 |
|------|------|------|
| `title` | string | 标题文字 |
| `onBack` | () => void | 返回按钮回调 |
| `onClose` | () => void | 关闭按钮回调（用于 Modal） |
| `showBackButton` | boolean | 是否显示返回按钮（默认 true） |
| `rightElement` | ReactNode | 右侧自定义内容 |

### 颜色（从 theme.ts 导入）
```typescript
import { Colors } from '@/constants/theme';

Colors.primary      // #07C160 主色
Colors.background   // #EDEDED 页面背景 + 导航栏背景
Colors.card         // #FFFFFF 卡片/内容区背景
Colors.text         // #000000 主文字
Colors.textSecondary // #888888 次要文字
Colors.link         // #576B95 链接
Colors.error        // #FA5151 错误/金额
```

### 间距
```typescript
import { Spacing } from '@/constants/theme';

Spacing.xs   // 4pt
Spacing.sm   // 8pt
Spacing.md   // 12pt
Spacing.lg   // 16pt  ← 常用
Spacing.xl   // 20pt
Spacing.xxl  // 24pt
Spacing.xxxl // 32pt  ← 底部安全区
```

### 字号
```typescript
import { FontSize } from '@/constants/theme';

FontSize.xs    // 11pt 标签
FontSize.sm    // 13pt 辅助文字
FontSize.md    // 15pt 正文
FontSize.lg    // 17pt 列表标题、按钮
FontSize.xl    // 20pt 小标题
FontSize.xxl   // 22pt 区块标题
FontSize.xxxl  // 28pt 页面大标题
```

---

## 🗄️ 状态管理模板（按需）

如果创意需要状态管理，创建 `stores/[name]Store.ts`：

```typescript
// stores/myExperimentStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage, mmkvStorage } from './storage';

interface MyExperimentState {
  // 状态
  data: any[];
  isLoading: boolean;
  
  // Actions
  setData: (data: any[]) => void;
  reset: () => void;
}

export const useMyExperimentStore = create<MyExperimentState>()(
  persist(
    (set) => ({
      data: [],
      isLoading: false,
      
      setData: (data) => set({ data }),
      reset: () => set({ data: [], isLoading: false }),
    }),
    {
      name: 'my-experiment-storage',
      storage: createJSONStorage(() => mmkvStorage),
    }
  )
);
```

---

## 🌐 服务层模板（按需）

如果创意需要调用 API，创建 `services/[name]Service.ts`：

```typescript
// services/myExperimentService.ts
import { supabase } from './supabase';

export const myExperimentService = {
  async fetchData(): Promise<any[]> {
    const { data, error } = await supabase.functions.invoke('my-function', {
      body: { /* 参数 */ },
    });
    
    if (error) throw new Error(error.message);
    return data;
  },
};
```

---

## ⚡ Edge Function 模板（按需）

如果创意需要后端函数，创建 `supabase/labx/supabase/functions/[name]/index.ts`：

```typescript
// supabase/labx/supabase/functions/my-function/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/response.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // 实现业务逻辑
    const result = { success: true };
    
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error.message, 500);
  }
});
```

---

## ✅ 创意上线检查清单

### 必须项
- [ ] 已在 `constants/labs.ts` 添加配置
- [ ] **已填写 `creator` 字段（你的名字）**
- [ ] 已创建 `app/(labs)/[name]/_layout.tsx`
- [ ] 已创建 `app/(labs)/[name]/index.tsx`
- [ ] 入口页面使用标准导航栏
- [ ] 使用 `@/constants/theme` 中的样式常量
- [ ] 核心功能可正常运行
- [ ] 无明显崩溃

### 可选项
- [ ] 填写 `createdAt` 字段
- [ ] 创建专用 Store（如需状态持久化）
- [ ] 创建专用 Service（如需 API 调用）
- [ ] 创建 Edge Function（如需后端逻辑）
- [ ] 添加加载状态
- [ ] 添加错误处理
- [ ] 添加空状态

---

## 🚀 快速创建流程

### 方式一：告诉 Cursor

直接对 Cursor 说：

> "按照 labx-experiment 规范，帮我创建一个「[创意名称]」的实验，创作者是 [你的邮箱用户名]"

Cursor 会自动：
1. 在 `constants/labs.ts` 添加配置（含 creator）
2. 创建 `app/(labs)/[name]/_layout.tsx`
3. 创建 `app/(labs)/[name]/index.tsx`

### 方式二：手动创建

```bash
# 1. 创建目录
mkdir -p apps/labx/app/\(labs\)/my-experiment

# 2. 创建文件
touch apps/labx/app/\(labs\)/my-experiment/_layout.tsx
touch apps/labx/app/\(labs\)/my-experiment/index.tsx

# 3. 在 labs.ts 中添加配置
```

---

## 📚 参考文档

- 产品规格：`docs/labx/MVP_PRODUCT_SPEC.md`
- 设计系统：`docs/labx/DESIGN_SYSTEM.md`
- 技术架构：`docs/labx/TECHNICAL_ARCHITECTURE.md`

---

## 🎨 常用图标速查表

从 Ionicons 选择图标，以下是推荐列表：

| 类别 | 图标名 | 用途 |
|------|--------|------|
| **工具** | `calculator-outline` | 计算、财务 |
| | `scan-outline` | 扫描、识别 |
| | `camera-outline` | 拍照、相机 |
| | `qr-code-outline` | 二维码 |
| | `search-outline` | 搜索 |
| **创意** | `flask-outline` | 实验、测试 |
| | `bulb-outline` | 创意、想法 |
| | `sparkles-outline` | AI、魔法 |
| | `color-palette-outline` | 设计、艺术 |
| | `brush-outline` | 绘画、创作 |
| **效率** | `time-outline` | 时间、效率 |
| | `calendar-outline` | 日程、计划 |
| | `list-outline` | 清单、任务 |
| | `clipboard-outline` | 记录、笔记 |
| | `folder-outline` | 文件、整理 |
| **通讯** | `chatbubble-outline` | 聊天、对话 |
| | `mail-outline` | 邮件、消息 |
| | `share-outline` | 分享 |
| | `send-outline` | 发送 |
| **数据** | `analytics-outline` | 分析、图表 |
| | `bar-chart-outline` | 统计 |
| | `pie-chart-outline` | 占比 |
| | `trending-up-outline` | 增长、趋势 |
| **媒体** | `image-outline` | 图片 |
| | `videocam-outline` | 视频 |
| | `musical-notes-outline` | 音乐 |
| | `mic-outline` | 录音、语音 |
| **其他** | `globe-outline` | 全球、网络 |
| | `location-outline` | 位置、地图 |
| | `cart-outline` | 购物 |
| | `wallet-outline` | 钱包、支付 |
| | `heart-outline` | 喜欢、收藏 |
| | `star-outline` | 评分、精选 |

**完整图标列表**: https://ionic.io/ionicons

---

## 🧩 常用 UI 组件代码

### 列表项组件

```tsx
// 可点击的列表项
<TouchableOpacity style={styles.cell} onPress={onPress}>
  <Text style={styles.cellLabel}>标签</Text>
  <View style={styles.cellValueRow}>
    <Text style={styles.cellValue}>值</Text>
    <Ionicons name="chevron-forward" size={18} color={Colors.textPlaceholder} />
  </View>
</TouchableOpacity>

// 样式
cell: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: Colors.card,
  paddingHorizontal: Spacing.lg,
  paddingVertical: Spacing.lg,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: Colors.border,
},
```

### 输入框组件

```tsx
<View style={styles.inputContainer}>
  <Text style={styles.inputLabel}>标签</Text>
  <TextInput
    style={styles.input}
    placeholder="请输入..."
    placeholderTextColor={Colors.textPlaceholder}
    value={value}
    onChangeText={setValue}
  />
</View>

// 样式
inputContainer: {
  backgroundColor: Colors.card,
  paddingHorizontal: Spacing.lg,
  paddingVertical: Spacing.md,
},
inputLabel: {
  fontSize: FontSize.sm,
  color: Colors.textSecondary,
  marginBottom: Spacing.xs,
},
input: {
  fontSize: FontSize.lg,
  color: Colors.text,
  paddingVertical: Spacing.sm,
},
```

### 加载状态

```tsx
import { ActivityIndicator } from 'react-native';

// 全屏加载
{isLoading && (
  <View style={styles.loadingContainer}>
    <ActivityIndicator size="large" color={Colors.primary} />
    <Text style={styles.loadingText}>加载中...</Text>
  </View>
)}

// 样式
loadingContainer: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
},
loadingText: {
  fontSize: FontSize.md,
  color: Colors.textSecondary,
  marginTop: Spacing.md,
},
```

### 空状态

```tsx
<View style={styles.emptyState}>
  <Ionicons name="document-outline" size={48} color={Colors.textPlaceholder} />
  <Text style={styles.emptyTitle}>暂无数据</Text>
  <Text style={styles.emptyDescription}>点击下方按钮添加</Text>
</View>

// 样式
emptyState: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: Spacing.xxl,
},
emptyTitle: {
  fontSize: FontSize.lg,
  fontWeight: FontWeight.medium,
  color: Colors.text,
  marginTop: Spacing.lg,
},
emptyDescription: {
  fontSize: FontSize.md,
  color: Colors.textSecondary,
  marginTop: Spacing.sm,
  textAlign: 'center',
},
```

### 错误提示

```tsx
import { Alert } from 'react-native';

// 简单错误弹窗
Alert.alert('操作失败', '请检查网络后重试');

// 带重试的错误弹窗
Alert.alert(
  '加载失败',
  '无法获取数据，请重试',
  [
    { text: '取消', style: 'cancel' },
    { text: '重试', onPress: () => refetch() },
  ]
);
```

---

## 💬 Cursor Prompt 模板（非技术人员专用）

### 🌟 创建新创意（最常用）

复制以下 Prompt，替换【】中的内容：

```
按照 labx-experiment 规范，帮我创建一个「【创意名称】」的实验。

创意说明：【用一两句话描述这个创意要做什么】

创作者：【你的邮箱用户名，如 zhangsan】

希望用的图标：【从图标列表选一个，如 calculator-outline】

主题色：【选择一个颜色，如 #07C160 绿色、#10AEFF 蓝色、#FA5151 红色、#FFC300 黄色】
```

**示例**：
```
按照 labx-experiment 规范，帮我创建一个「图片压缩」的实验。

创意说明：上传图片后自动压缩，显示压缩前后的大小对比，可以下载压缩后的图片。

创作者：张三

希望用的图标：image-outline

主题色：#10AEFF
```

---

### 🔧 添加新功能

```
在【创意名称】实验中，添加【功能描述】的功能。

具体需求：
1. 【需求点1】
2. 【需求点2】
3. 【需求点3】
```

**示例**：
```
在「图片压缩」实验中，添加批量压缩的功能。

具体需求：
1. 可以一次选择多张图片
2. 显示每张图片的压缩进度
3. 全部完成后可以打包下载
```

---

### 🎨 修改样式

```
修改【创意名称】实验的【页面/组件】样式：
- 【样式修改1】
- 【样式修改2】
```

**示例**：
```
修改「图片压缩」实验的结果页面样式：
- 压缩后的图片放大显示
- 文件大小用更醒目的颜色
- 下载按钮放在底部固定
```

---

### 🐛 修复问题

```
【创意名称】实验出现问题：
- 问题描述：【描述你遇到的问题】
- 复现步骤：【怎么操作会出现这个问题】
- 期望行为：【正确的情况应该是怎样】
```

---

### 🤖 添加 AI 能力

```
在【创意名称】实验中，添加 AI 功能：
- 功能：【AI 要做什么】
- 输入：【用户提供什么】
- 输出：【AI 返回什么】

请创建对应的 Edge Function。
```

**示例**：
```
在「AA 分账」实验中，添加 AI 功能：
- 功能：识别账单图片中的金额
- 输入：用户上传的账单图片（base64）
- 输出：识别出的商品名称和金额列表

请创建对应的 Edge Function。
```

---

## 📖 参考案例

### AA 分账实验（完整参考）

这是一个完整的创意实验示例，可以参考其代码结构：

| 文件 | 路径 | 说明 |
|------|------|------|
| 配置 | `apps/labx/constants/labs.ts` | Lab 配置示例 |
| 布局 | `apps/labx/app/(labs)/aa-split/_layout.tsx` | 布局文件 |
| 主页 | `apps/labx/app/(labs)/aa-split/index.tsx` | 入口页面 |
| 扫描页 | `apps/labx/app/(labs)/aa-split/scan.tsx` | 子页面示例 |
| 状态 | `apps/labx/stores/billStore.ts` | Zustand Store |
| 后端 | `supabase/labx/supabase/functions/scan-bill/` | Edge Function |

---

## ❓ 常见问题

### Q: 我不会写代码，可以用 LabX 吗？

**A**: 完全可以！使用上面的「Cursor Prompt 模板」，把你的想法告诉 Cursor，它会帮你生成代码。

### Q: 怎么选图标？

**A**: 
1. 看上面的「常用图标速查表」
2. 或访问 https://ionic.io/ionicons 搜索

### Q: 怎么选颜色？

**A**: 推荐使用这些颜色：
- `#07C160` 绿色（默认）
- `#10AEFF` 蓝色
- `#FA5151` 红色
- `#FFC300` 黄色
- `#576B95` 灰蓝色

### Q: 创意做完后怎么上线？

**A**: 告诉 Cursor：「帮我检查【创意名称】是否满足上线检查清单」

### Q: 我的创意需要后端吗？

**A**: 
- 如果只是前端展示、计算 → 不需要
- 如果需要调用 AI、存储数据 → 需要，让 Cursor 帮你创建 Edge Function

---

## 🔐 认证系统

LabX 采用企业级认证，所有用户必须验证公司邮箱才能使用。

### 认证流程

```
用户打开 App
    ↓
选择登录方式（Apple ID / Google / 邮箱）
    ↓
邮箱登录 → 发送 Magic Link → 点击链接完成登录
OAuth 登录 → 登录成功 → 检查公司邮箱验证
    ↓
未验证 → 输入 @tencent.com 邮箱 → 发送验证码 → 验证成功
    ↓
进入应用首页
```

### 认证相关文件

| 文件 | 说明 |
|------|------|
| `stores/authStore.ts` | 认证状态管理（用户、会话、验证状态） |
| `services/authService.ts` | 认证服务（登录、验证码、绑定） |
| `app/(auth)/login.tsx` | 登录页面 |
| `app/(auth)/magic-link-sent.tsx` | Magic Link 已发送页 |
| `app/(auth)/bind-email.tsx` | 绑定公司邮箱页 |

### 公司邮箱限制

```typescript
// 公司邮箱域名
const COMPANY_EMAIL_DOMAIN = '@tencent.com';

// 验证邮箱是否为公司邮箱
function isCompanyEmail(email: string): boolean {
  return email.toLowerCase().endsWith(COMPANY_EMAIL_DOMAIN);
}
```

### 路由守卫

根布局 `_layout.tsx` 自动检查认证状态：

1. **未登录** → 跳转 `/(auth)/login`
2. **已登录未验证** → 跳转 `/(auth)/bind-email`
3. **已登录已验证** → 正常访问

### 使用 authStore

```typescript
import { useAuthStore } from '@/stores/authStore';

function MyComponent() {
  const { 
    user,                    // 当前用户
    isAuthenticated,         // 是否已登录
    isCompanyVerified,       // 是否已验证公司邮箱
    companyEmail,            // 已绑定的公司邮箱
    signOut,                 // 登出
  } = useAuthStore();
  
  // ...
}
```

### 后端 Edge Functions

| 函数 | 说明 |
|------|------|
| `send-verification-code` | 发送 6 位验证码到公司邮箱 |
| `verify-email-binding` | 验证验证码并绑定公司邮箱 |

### 数据库表

| 表名 | 说明 |
|------|------|
| `user_company_bindings` | 用户公司邮箱绑定 |
| `email_verification_codes` | 验证码临时存储 |
