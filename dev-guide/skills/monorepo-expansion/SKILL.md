---
name: monorepo-expansion
description: Monorepo 扩展指南 - 添加新项目的最佳实践
---

# Monorepo 扩展指南

## 📊 当前项目状态

```
greensoul/
├── apps/
│   ├── greensoul/        # ✅ 已上线：GreenSoul AI 植物伴侣
│   ├── greenlife/        # 🔄 开发中：GreenLife P2P 支付钱包
│   ├── flivo/            # 🔄 开发中：Flivo 极简短视频
│   └── labx/             # 🔄 开发中：LabX AI 创意实验室
│
├── supabase/
│   ├── greensoul/        # ✅ 已完成：GreenSoul 数据库 + Functions
│   ├── greenlife/        # ✅ 已完成：GreenLife 数据库 + Functions
│   ├── flivo/            # ✅ 已完成：Flivo 数据库 + Functions
│   └── labx/             # ✅ 已完成：LabX 数据库 + Functions
│
├── packages/
│   ├── shared/           # ✅ 已完成：前后端共享类型
│   └── edge-runtime/     # ✅ 已完成：Edge Functions 共享库
│
└── docs/
    ├── architecture/     # ✅ 架构文档
    ├── deployment/       # ✅ 部署文档
    ├── development/      # ✅ 开发文档
    ├── greenlife/        # ✅ GreenLife 产品文档
    ├── flivo/            # ✅ Flivo 产品文档
    └── labx/             # ✅ LabX 产品文档
```

## 🔧 添加新 Expo 应用

如果需要添加新应用：

```bash
# 创建应用目录
cd apps
pnpm create expo-app [new-app-name] --template default

# 重要：移除子目录的 pnpm-workspace.yaml
rm [new-app-name]/pnpm-workspace.yaml

# 配置 package.json
# 将 name 改为 "@[app-name]/app"

# 配置 app.json
# 添加 bundleIdentifier: "com.yilin.[new-app-name]"

# 配置 EAS
cd [new-app-name]
eas build:configure
```

## 🗄️ 添加新 Supabase 项目

```bash
# 创建 Supabase 配置目录
mkdir -p supabase/[new-project]

# 初始化 Supabase 项目
cd supabase/[new-project]
supabase init

# 创建独立的 .env.local
# 配置不同的 Supabase 项目 URL 和 Key
```

## 📦 添加新共享包

```bash
# 创建共享包目录
mkdir -p packages/[new-package]/src

# 创建 package.json
cat > packages/[new-package]/package.json << 'PKGEOF'
{
  "name": "@greensoul/[new-package]",
  "version": "1.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
PKGEOF

# 在其他项目中引用
# package.json 中添加:
# "@greensoul/[new-package]": "workspace:*"
```

## 🔗 更新根目录脚本

添加新项目后，更新 `package.json` 的脚本：

```json
{
  "scripts": {
    "dev:[new-app]": "cd apps/[new-app] && pnpm start",
    "ios:[new-app]": "cd apps/[new-app] && pnpm ios",
    "android:[new-app]": "cd apps/[new-app] && pnpm android",
    "build:[new-app]": "cd apps/[new-app] && eas build",
    "supabase:start:[new-project]": "cd supabase/[new-project] && supabase start",
    "supabase:stop:[new-project]": "cd supabase/[new-project] && supabase stop"
  }
}
```

## ⚡ 重要原则

1. **渐进式添加**: 一次添加一个项目，确保每次都能正常运行
2. **保持简单**: 只添加确实需要的项目
3. **先验证后扩展**: 确认当前项目稳定后再添加新项目
4. **独立配置**: 每个应用有独立的 `app.json`、`eas.json`
5. **独立后端**: 每个应用有独立的 Supabase 项目

## 📚 参考

- 项目结构：`README.md`
- 文档索引：`docs/README.md`
- LabX 创意开发：`.cursor/rules/labx-experiment.mdc`

### 各应用文档

| 应用 | 产品文档 | 开发规范 |
|------|----------|----------|
| GreenSoul | `apps/greensoul/README.md` | - |
| GreenLife | `docs/greenlife/` | `tanstack-query.mdc`, `loading-states.mdc` |
| Flivo | `docs/flivo/` | `video-camera.mdc` |
| LabX | `docs/labx/` | `labx-experiment.mdc` |
