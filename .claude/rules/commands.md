# Common Commands

## Frontend

```bash
cd web && npm run dev            # 启动开发服务器 (localhost:3000)
cd web && npm run build          # 生产构建（18 pages）
cd web && npm run lint           # ESLint 检查
```

## Backend Gateway

```bash
cd gateway && npm run dev        # tsx watch 热重载
cd gateway && npm run build      # TypeScript 编译
cd gateway && npm run typecheck  # 类型检查
```

## Testing

```bash
cd tests && npx vitest           # 单元/集成测试
cd tests && npx playwright test  # E2E 测试（测试工程）
playwright-cli                   # 前端页面测试（Playwright CLI，推荐）
```

## Database

```bash
npx supabase gen types typescript --project-id zyxqadubhwrnsoujiyir > src/types/database.types.ts
```

## Deployment

```bash
# Gateway (腾讯云 Docker)
cd gateway && npm run docker:build && npm run docker:up
cd gateway && npm run pm2:start   # PM2 进程管理
```
