---
name: project-structure
description: GreenSoul Monorepo 项目结构和组织规范
---

# GreenSoul Monorepo 项目结构规范

## 📦 Monorepo 架构

本项目采用 **pnpm workspace** 的 monorepo 架构，包含四个产品：

```
greensoul/                          # 根目录
├── apps/                           # 应用目录
│   ├── greensoul/                  # 🌱 GreenSoul - AI 植物情感伴侣
│   │   ├── app/                    # Expo Router 路由目录
│   │   ├── components/             # 可复用组件
│   │   ├── hooks/                  # 自定义 Hooks
│   │   ├── services/               # 服务层
│   │   ├── stores/                 # Zustand 状态管理
│   │   ├── assets/                 # 静态资源
│   │   ├── docs/                   # 应用专用文档
│   │   ├── app.json                # Expo 配置
│   │   ├── eas.json                # EAS Build 配置
│   │   └── package.json            # 包配置
│   ├── greenlife/                  # 💚 GreenLife - P2P 支付钱包
│   │   ├── app/                    # Expo Router 路由目录
│   │   ├── components/             # 可复用组件
│   │   ├── hooks/                  # 自定义 Hooks
│   │   ├── services/               # 服务层
│   │   ├── stores/                 # Zustand 状态管理
│   │   ├── app.json                # Expo 配置
│   │   ├── eas.json                # EAS Build 配置
│   │   └── package.json            # 包配置
│   ├── flivo/                      # 📹 Flivo - 极简短视频
│   │   ├── app/                    # Expo Router 路由目录
│   │   ├── components/             # 可复用组件
│   │   ├── hooks/                  # 自定义 Hooks
│   │   ├── services/               # 服务层
│   │   ├── stores/                 # Zustand 状态管理
│   │   ├── app.json                # Expo 配置
│   │   ├── eas.json                # EAS Build 配置
│   │   └── package.json            # 包配置
│   └── labx/                       # 🧪 LabX - AI 创意实验室
│       ├── app/                    # Expo Router 路由目录
│       │   └── (labs)/             # 创意实验组
│       │       └── [experiment]/   # 各个创意实验
│       ├── components/             # 可复用组件
│       ├── constants/              # 常量配置（含 labs.ts）
│       ├── hooks/                  # 自定义 Hooks
│       ├── services/               # 服务层
│       ├── stores/                 # Zustand 状态管理
│       ├── app.json                # Expo 配置
│       └── package.json            # 包配置
├── packages/                       # 共享包
│   ├── shared/                     # 前后端共享类型和工具
│   └── edge-runtime/               # Edge Functions 共享库
├── supabase/                       # Supabase 后端（详见 supabase-structure.mdc）
│   ├── greensoul/                  # GreenSoul 数据库 + Functions
│   ├── greenlife/                  # GreenLife 数据库 + Functions
│   ├── flivo/                      # Flivo 数据库 + Functions
│   └── labx/                       # LabX 数据库 + Functions
│   # 每个项目结构：config.toml + supabase/(functions/ + migrations/)
├── docs/                           # 共享文档
│   ├── architecture/               # 架构文档
│   ├── deployment/                 # 部署指南
│   ├── development/                # 开发规范
│   ├── design/                     # 设计规范
│   ├── guides/                     # 功能指南
│   ├── greenlife/                  # GreenLife 产品文档
│   ├── flivo/                      # Flivo 产品文档
│   └── labx/                       # LabX 产品文档
├── package.json                    # 根包配置
├── pnpm-workspace.yaml             # pnpm workspace 配置
├── turbo.json                      # Turborepo 配置
└── README.md                       # Monorepo 概览文档
```

## 🎯 产品配置

### GreenSoul 应用 🌱
- **Bundle Identifier**: `com.yilin.greensoul`
- **定位**: AI 植物情感伴侣
- **状态**: ✅ 已上线
- **Supabase 项目**: `supabase/greensoul/`

### GreenLife 应用 💚
- **Bundle Identifier**: `com.yilin.greenlife`
- **定位**: 美国 P2P 支付钱包
- **状态**: 🔄 开发中
- **Supabase 项目**: `supabase/greenlife/`

### Flivo 应用 📹
- **Bundle Identifier**: `com.yilin.flivo`
- **定位**: 极简短视频 - Unplanned, everyday moments
- **状态**: 🔄 开发中
- **Supabase 项目**: `supabase/flivo/`
- **视频存储**: Cloudflare Stream

### LabX 应用 🧪
- **Bundle Identifier**: `com.yilin.labx`
- **定位**: AI 创意实验室 - Vibe Coding 创意展示平台
- **状态**: 🔄 开发中
- **Supabase 项目**: `supabase/labx/`
- **特点**: 创意入口标准化，创意内部自由发挥
- **开发规范**: 参考 `.cursor/rules/labx-experiment.mdc`

### 通用配置
- **包管理器**: pnpm >= 8.0.0
- **Node 版本**: >= 18.0.0

## 📁 文件组织原则

### 应用开发
1. **路由**: 使用 Expo Router，所有路由文件放在 `apps/[app]/app/` 目录
2. **组件**: 可复用组件放在 `apps/[app]/components/`
3. **Hooks**: 自定义 Hooks 放在 `apps/[app]/hooks/`
4. **服务**: API 调用放在 `apps/[app]/services/`
5. **状态**: Zustand stores 放在 `apps/[app]/stores/`

### 多产品管理
1. **独立配置**: 每个应用有独立的 `app.json`、`eas.json`、`package.json`
2. **独立 Supabase**: 每个应用有独立的 Supabase 项目配置
3. **共享代码**: 跨应用共享代码放在 `packages/shared/`
4. **脚本命名**: 根目录脚本使用产品后缀（如 `dev:greensoul`, `dev:labx`）

### 文档组织
1. **根目录 README**: Monorepo 概览
2. **应用 README**: 各应用详细文档在 `apps/[app]/README.md`
3. **共享文档**: 技术文档在 `docs/` 目录
4. **产品文档**: 
   - GreenLife 产品规格在 `docs/greenlife/`
   - Flivo 产品规格在 `docs/flivo/`
   - LabX 产品规格在 `docs/labx/`

### LabX 特殊规则
1. **创意开发**: 遵循 `labx-experiment.mdc` 规范
2. **创意配置**: 在 `apps/labx/constants/labs.ts` 注册
3. **创意路由**: 放在 `apps/labx/app/(labs)/[experiment-name]/`
4. **入口标准化**: 使用统一的导航栏和页面模板
