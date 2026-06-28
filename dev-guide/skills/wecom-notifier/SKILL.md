---
name: wecom-notifier
description: 企业微信通知规范 - 通过Webhook实时推送开发进度和告警
---

# 企业微信通知器

通过企业微信机器人Webhook实时推送开发进度、Bug告警和里程碑通知。

---

## ⚙️ 配置

```javascript
const WEBHOOK_CONFIG = {
  url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send",
  key: "<YOUR_WEBHOOK_KEY>"
};
```

---

## 📤 推送策略

### 全量推送模式

| 事件类型 | 触发时机 | 推送内容 |
|---------|---------|---------|
| 🕐 **定时汇总** | 每 1 小时 | 整体进度 + 本小时完成任务 |
| 🎯 **里程碑** | 重要任务完成时 | 任务详情 + 耗时 |
| 🐛 **Bug 告警** | 遇到问题时 | 问题描述 + 影响范围 |
| ▶️ **任务开始** | 开始开发时 | 任务信息 |
| ✅ **任务完成** | 任务通过验证时 | 任务详情 + 代码审查结果 |
| ❌ **任务失败** | 验证不通过时 | 失败原因 + 重试策略 |

---

## 📋 消息模板

### 1. 定时汇总报告

```markdown
## 📊 开发进度报告

**时间**: 2026-01-26 15:00
**总体进度**: 35% (7/20 任务完成)

### ✅ 本小时完成 (2 个)
| 任务 | 耗时 |
|-----|------|
| 用户认证 API | 12min |
| 登录页面 UI | 8min |

### 🔄 进行中 (1 个)
- **视频上传服务** (已耗时 5min)

### 📈 统计
- 平均任务耗时: 10 分钟
- 预计剩余时间: 2.5 小时
- Bug 数量: 3 个 (已修复 2 个)

### ⚠️ 待关注
- TASK-012 已重试 2 次，可能需要人工介入
```

### 2. 任务开始通知

```markdown
## ▶️ 任务开始

**任务**: TASK-008 视频播放组件
**开始时间**: 15:30
**预计耗时**: 10-15 分钟

**任务描述**:
实现视频播放组件，支持播放、暂停、进度条、全屏等功能。

**涉及文件**:
- src/components/VideoPlayer.tsx
- src/hooks/useVideoPlayer.ts
```

### 3. 任务完成通知

```markdown
## ✅ 任务完成

**任务**: TASK-008 视频播放组件
**耗时**: 12 分钟

### 验证结果
- ✅ 编译检查: 通过
- ✅ 单元测试: 通过 (8/8)
- ✅ 集成测试: 通过
- ✅ Code Review: 通过

### 产出文件
- src/components/VideoPlayer.tsx (+180 行)
- src/hooks/useVideoPlayer.ts (+65 行)

**当前进度**: 40% (8/20)
```

### 4. Bug 告警

```markdown
## 🐛 Bug 告警

**级别**: 🔴 高
**任务**: TASK-005 视频上传服务

### 问题描述
Error: Connection pool exhausted

### 影响范围
- 用户上传功能完全不可用
- 阻塞后续 3 个任务

### 当前处理
- 状态: 分析中
- 策略: 搜索类似问题 → 重试

### 需要关注
如果 15 分钟内未解决，将切换策略重试。
```

### 5. 任务失败通知

```markdown
## ❌ 任务失败

**任务**: TASK-010 评论功能 API
**失败原因**: 单元测试未通过

### 失败详情
测试用例不通过，返回值为 undefined

### 重试策略
- 错误类型: 逻辑错误
- 当前重试次数: 1/3
```

### 6. 里程碑通知

```markdown
## 🎉 里程碑达成

**里程碑**: MVP 核心功能完成
**达成时间**: 2026-01-26 18:30

### 统计数据
- 总耗时: 4.5 小时
- 完成任务: 15/20
- 遇到 Bug: 8 个 (全部已修复)
```

---

## 🔧 推送实现

### 发送消息到企业微信

```typescript
async function sendWechatMessage(content: string, msgType: 'markdown' | 'text' = 'markdown') {
  const webhookUrl = `${WEBHOOK_CONFIG.url}?key=${WEBHOOK_CONFIG.key}`;
  
  const payload = {
    msgtype: msgType,
    [msgType]: { content }
  };
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    if (result.errcode !== 0) {
      console.error('企微推送失败:', result.errmsg);
      return false;
    }
    return true;
  } catch (error) {
    console.error('企微推送异常:', error);
    return false;
  }
}
```

---

## 📊 推送过滤

避免消息轰炸：

```typescript
function shouldPushEvent(event: NotifyEvent): boolean {
  switch (event.type) {
    case 'hourly_report': return true;
    case 'task_start':    return event.task.priority === 'P0';
    case 'task_complete': return true;
    case 'task_failed':   return event.task.attempts >= 2;
    case 'bug_alert':     return event.bug.severity === 'high';
    case 'milestone':     return true;
    default:              return false;
  }
}
```

---

## ⚙️ 配置选项

```typescript
const NOTIFY_CONFIG = {
  webhook: {
    url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send",
    key: "<YOUR_WEBHOOK_KEY>"
  },
  rules: {
    hourlyReport: true,
    taskStart: 'P0',
    taskComplete: 'all',
    taskFailed: 2,
    bugAlert: 'high',
    milestone: true
  },
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00'
  },
  batch: {
    enabled: true,
    interval: 60,
    maxMessages: 5
  }
};
```
