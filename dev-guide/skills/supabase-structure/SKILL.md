---
name: supabase-structure
description: Supabase 目录结构规范
---

# Supabase 目录结构规范

## 强制目录结构（不可违反）

每个项目的 Supabase 配置**必须**严格遵循以下结构：

```
supabase/[project]/
├── config.toml              # Supabase 项目配置
├── seed.sql                 # 种子数据（可选）
└── supabase/                # CLI 工作目录（必须）
    ├── .temp/               # CLI 自动生成，无需管理
    ├── functions/           # Edge Functions
    │   ├── _shared/         # 共享代码
    │   │   ├── auth.ts
    │   │   ├── config.ts
    │   │   ├── deps.ts
    │   │   ├── errors.ts
    │   │   └── response.ts
    │   ├── [function-name]/
    │   │   └── index.ts
    │   └── deno.json        # Deno 配置
    └── migrations/          # 数据库迁移文件
        └── YYYYMMDDHHMMSS_name.sql
```

## 关键规则

### 1. 迁移文件位置（最重要）

```bash
# ✅ 正确位置
supabase/[project]/supabase/migrations/

# ❌ 错误位置（CLI 找不到）
supabase/[project]/migrations/
```

### 2. Edge Functions 位置

```bash
# ✅ 正确位置
supabase/[project]/supabase/functions/

# ❌ 错误位置
supabase/[project]/functions/
```

### 3. 迁移文件命名格式

**必须使用时间戳格式**：`YYYYMMDDHHMMSS_name.sql`

```bash
# ✅ 正确
20260106181900_initial_schema.sql
20260107120000_add_videos_storage.sql

# ❌ 错误
00001_initial_schema.sql
initial_schema.sql
001_init.sql
```

### 4. 禁止嵌套 supabase 目录

```bash
# ❌ 错误 - 不允许存在
supabase/[project]/supabase/supabase/
```

## CLI 命令工作目录

所有 Supabase CLI 命令必须在 `supabase/[project]/` 目录下执行：

```bash
# 进入项目目录
cd supabase/flivo

# 迁移命令
supabase migration list --linked
supabase db push

# Functions 命令
supabase functions deploy --no-verify-jwt
supabase functions serve
```

## 当前项目对照

| 项目 | 目录 | 状态 |
|-----|------|------|
| flivo | `supabase/flivo/supabase/` | ✅ |
| greenlife | `supabase/greenlife/supabase/` | ✅ |
| greensoul | `supabase/greensoul/supabase/` | ✅ |
| labx | `supabase/labx/supabase/` | ✅ |

## 新建项目检查清单

创建新的 Supabase 项目时，必须确认：

- [ ] `config.toml` 在 `supabase/[project]/` 下
- [ ] `supabase/` 子目录存在
- [ ] `supabase/functions/` 存在
- [ ] `supabase/migrations/` 存在
- [ ] 无重复/嵌套目录
- [ ] 迁移文件使用时间戳命名

## 常见错误修复

### 迁移文件在错误位置

```bash
# 移动到正确位置
mkdir -p supabase/[project]/supabase/migrations
mv supabase/[project]/migrations/* supabase/[project]/supabase/migrations/
rmdir supabase/[project]/migrations
```

### 存在重复的旧目录

```bash
# 合并后删除
cp supabase/[project]/migrations/* supabase/[project]/supabase/migrations/
cp -r supabase/[project]/functions/* supabase/[project]/supabase/functions/
rm -rf supabase/[project]/migrations supabase/[project]/functions
```

### 存在嵌套的 supabase 目录

```bash
# 删除多余嵌套
rm -rf supabase/[project]/supabase/supabase
```

## 为什么必须遵循这个结构

1. **Supabase CLI 要求**：CLI 期望在 `supabase/` 子目录下找到 `migrations/` 和 `functions/`
2. **迁移一致性**：`supabase migration list` 和 `supabase db push` 依赖正确的目录结构
3. **团队协作**：统一结构减少混淆和错误
4. **CI/CD 兼容**：自动化脚本依赖固定路径

## AI 执行规则

**当涉及 Supabase 操作时，AI 必须：**

1. **检查目录结构** - 在创建迁移或函数前，先验证目录结构正确
2. **创建文件时使用正确路径** - 迁移文件放在 `supabase/[project]/supabase/migrations/`
3. **发现问题时主动修复** - 如果发现目录结构不符合规范，先修复再继续
4. **使用时间戳命名** - 迁移文件必须使用 `YYYYMMDDHHMMSS_name.sql` 格式
