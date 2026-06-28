# QRClaw Visual · 场景示例

每个示例给出「错误做法 → 正确做法 → 理由」三段。Agent 遇到类似问题应按正确做法执行。

---

## 例 1：新建登录页主按钮

**用户**："Mobile/Login 页加一个 Sign In 按钮"

❌ 错误做法
```tsx
<button style={{ height: 50, background: '#E24A3F', color: '#fff', borderRadius: 12 }}>
  Sign In
</button>
```

✅ 正确做法
```tsx
// 1. 先查 reference.md §2.1 → 组件是 `Button`，已在 web/src/components/ui/Button.tsx、通过 variant 切换
// 2. 直接复用（Button 有 variant: 'primary' | 'secondary' | 'ghost'）
import { Button } from '@/components/ui';
<Button variant="primary" onClick={handleSignIn}>Sign In</Button>
```

**理由**：硬编码 hex 违反红线 §1；重新写按钮违反"组件复用优先"。Token 迁移时只改一处就能全量更新。

---

## 例 2：改消息气泡底色

**用户**："用户气泡的粉色太淡了，加深一点"

❌ 错误做法
```css
.visitor-bubble { background: #FCD3CE; }
```

✅ 正确做法
1. 打开 `design/design-tokens.css` 和 `web/src/app/globals.css`
2. 同步更新：
   ```css
   --color-visitor-bubble: #FCD3CE;  /* 原 #FDECEA */
   ```
3. `grep -rE "var\(--color-visitor-bubble\)" web/src/` 确认消费方都走 Token，无硬编码漏网

**理由**：SSOT 改一处、全站生效。直接改组件 CSS 会让 design-tokens.css 和实际用色漂移。

---

## 例 3：实现 Mobile Chat 页

**用户**："照 `design/layer/Mobile-Chat.png` 实现聊天页"

✅ 正确工作流
1. `Read("design/layer/Mobile-Chat.png")` 拿视觉基准
2. 查 `reference.md` §3.1 → 布局 = TopBar + 可滚动内容 + 输入栏
3. 查 §4 消息气泡规格、§5.1 Mobile 聊天输入栏
4. 组件组装（不写新组件、均走 `@/components/ui` 统一 barrel）：
   ```tsx
   import { TopBar, MessageList, MessageBubble, ChatInputBar } from '@/components/ui';

   <div style={{ width: 'var(--mobile-width)', height: 'var(--mobile-height)',
                  display: 'flex', flexDirection: 'column' }}>
     <TopBar title="Agent Name" />
     <MessageList>
       <MessageBubble variant="received" content="Hi, how can I help?" timestamp={...} />
       <MessageBubble variant="sent" content="Need a QR code..." timestamp={...} />
     </MessageList>
     <ChatInputBar onSend={handleSend} />
   </div>
   ```
   > `MessageBubble` 用 `variant: 'sent' | 'received'` 区分方向（以 `web/src/components/ui/MessageBubble.tsx` 为准）。
5. 构建验证：`cd web && npm run build`

❌ 常见失误：
- 自己写 `<div className="bg-red-500">`（违反红线 §1 + Tailwind v4 无 config）
- 用 `@media (max-width: 640px)` 做响应式（MVP 固定视口）
- 把气泡圆角设成 10（Token 没 10，走 `--radius-lg` 12 或 `--radius-xl` 16）

---

## 例 4：Dashboard 侧栏激活态

**用户**："Dashboard Messages Tab 点击后没视觉反馈"

✅ 正确做法
```tsx
// 1. 查 reference.md §3.3 → Dashboard 三栏 Tab 激活态规格
// 2. 规格：激活底 var(--color-red-bg)，icon/text var(--color-red)；非激活 var(--color-gray-500)
<div
  style={{
    width: 64, height: 56, borderRadius: 'var(--radius-lg)',
    background: isActive ? 'var(--color-red-bg)' : 'transparent',
    color: isActive ? 'var(--color-red)' : 'var(--color-gray-500)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  }}
>
  <MessageCircle size={20} />
  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>
    Messages
  </span>
</div>
```

❌ 错误：
- `background: '#FEF5F4'`（硬编码，应用 `--color-red-bg`）
- 用 `hover:bg-red-50` Tailwind class（项目是 CSS 变量架构，不走 utility class）

---

## 例 5：设计稿里没见过的新组件

**用户**："加个 Toast 通知组件"

✅ 正确响应
> 我查了 reference.md §2 的 8 个可复用组件里没有 Toast，`design/layer/` 也没有 Toast 截图。
>
> 在自由发挥之前停下确认：
>   1. 设计师是否已经出稿？请发我 Pencil nodeId 或截图。
>   2. 如果没有稿，你希望的视觉风格是？（尺寸 / 颜色 / 位置 / 时长）
>   3. Token 够用吗？`--color-success` / `--color-warning` / `--color-delete-red` 分别对应成功/警告/错误 Toast，如果需要新色要加进 `design-tokens.css`。

❌ 错误响应：看着没稿就自己画一个紫色圆角 Toast。视觉不统一是 QRClaw 最怕的状况。

---

## 例 6：响应式需求

**用户**："让 Landing Page 在手机上也能看"

✅ 正确响应
> QRClaw 当前 MVP 阶段视口固定（Mobile 390×844 / Web 1440×900），没有响应式设计稿。
>
> 要做响应式改动前请先确认：
>   1. Pencil 设计稿是否出了响应式版本？nodeId 给我一份。
>   2. 若没有，是否先只在 Landing Page 做，其他页面保持固定？
>   3. 断点策略：哪些尺寸要支持？（一般 mobile ≤ 640 / tablet 641-1024 / desktop > 1024）
>
> 回答后我再动手，避免跟后续设计稿对不上要重写。

❌ 错误响应：直接全局加 `@media` 查询。

---

## 例 7：有人想用 Tailwind utility class

**用户**："这里直接写 `className='bg-white text-gray-800 p-4'` 行吗？"

✅ 正确响应
> QRClaw 是 Tailwind v4 无 config 架构，utility class 的颜色/间距跟我们 Token 体系是两套。
> 直接用 Tailwind utility：
>   - 颜色会脱钩（`bg-white` ≠ `var(--color-white)` 在值上一致，但 Token 更新时不会同步）
>   - 字号/间距用 Tailwind 默认 scale 不等于 `--text-*` / `--space-*`
>
> 正确写法是 `style={{ background: 'var(--color-white)', color: 'var(--color-gray-800)', padding: 'var(--space-4)' }}`，或在 `globals.css` 写命名 class 绑定 Token。

---

## 例 8：涉及 Claim / Pricing / Payment UI

**用户**："加个按钮直接跳到付费页"

✅ 正确响应流程
1. Claim / Pricing / 付费页是业务核心链路，所有 UI 文案和按钮目的**必须产品确认**
2. 在 `design/layer/` 里查 `Web-Pricing.png`（已有设计）或 `_annotation-ClaimAgent.png`
3. 按钮复用 Button Primary（主）或 Button Outline（次），不自创样式
4. 提交前列出涉及的：
   - 页面跳转 route
   - 埋点（如果项目已有）
   - 视觉还原对照（截图 + 实现截图）
5. 等产品/设计两边 review 再 merge

❌ 错误：自己加个醒目的大红按钮"UPGRADE NOW" 就 push。业务关键路径的视觉改动不是前端一个人能拍板的。

---

## 附：Checkpoint 自检 Shell 命令

视觉类改动提交前跑一遍：

```bash
#!/usr/bin/env bash
# 需 bash/zsh（使用 process substitution）
cd "$(git rev-parse --show-toplevel)"

# 1. 禁新增硬编码 hex（已 Token 化的历史残留 #fdecea / #000000 也不放行，遇到即改走 var）
{ git diff HEAD web/src/; git diff --cached web/src/; } \
  | grep -E '^\+.*#[0-9A-Fa-f]{6}' && echo "✗ new hex added" || echo "✓ no new hex"

# 2. 禁引用不存在的 v2 token
{ git diff HEAD web/src/; git diff --cached web/src/; } \
  | grep -E 'surface-canvas|accent-brand|text-primary|font-sans|font-serif' \
  && echo "✗ removed v2 tokens reappear, reject" || echo "✓ no v2 tokens"

# 3. tokens.css / globals.css 仅允许已知差异 (--web-nav-height + 4 个 --code-*)
diff \
  <(grep -oE '^\s*--[a-z0-9-]+' design/design-tokens.css | sort -u) \
  <(grep -oE '^\s*--[a-z0-9-]+' web/src/app/globals.css | sort -u) \
  | grep -E '^[<>]' \
  | grep -vE -- '--web-nav-height|--code-comment|--code-keyword|--code-function|--code-string' \
  && echo "✗ unknown token drift, sync first" || echo "✓ only known diffs"

# 4. Build
cd web && npm run build
```
