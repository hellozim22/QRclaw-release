# QRClaw 部署指南（测试阶段）

> 本文档面向非专业运维人员，用大白话讲清楚每一步操作。
> 适用于：腾讯云服务器 + Vercel + Supabase 的组合。

---

## 架构总览

```
用户浏览器
    │
    ▼
┌────────────────────────────────┐
│  Vercel（前端托管，免费）        │  ← 只有你知道这个网址
└──────────────┬─────────────────┘
               │ WebSocket 连接
               ▼
┌──────────────────────────────────────────────────┐
│  腾讯云服务器                                      │
│                                                    │
│  ┌──────────┐    ┌───────────┐    ┌──────────┐   │
│  │  Nginx   │───▶│  Gateway  │───▶│  Redis   │   │
│  │ (门卫)   │    │ (Docker)  │    │ (Docker) │   │
│  └──────────┘    └───────────┘    └──────────┘   │
│   ▲                                               │
│   │ 只有 80/443 端口对外                            │
│   │ Gateway(3001) 和 Redis(6379) 完全不暴露         │
└──────────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────┐
│  Supabase（数据库，云端已有）    │
└────────────────────────────────┘
```

| 组件 | 部署到哪 | 费用 |
|------|---------|------|
| 前端 (Next.js) | Vercel | 免费 (Hobby 计划) |
| 后端 (Gateway + Redis) | 腾讯云轻量应用服务器 | ~¥45/月 |
| 数据库 (Supabase) | 云端（已有） | 免费 (Free 计划) |

---

## 安全设计说明

**为什么不直接把 Gateway 端口开放到公网？**

直接开放 3001 端口 = 任何人都可以连你的 Gateway，非常危险。
我们的方案是在前面放一个 Nginx 当"门卫"：

- 外网只能通过 80/443 端口访问 Nginx
- Nginx 检查请求合法后，转发给 Gateway
- Gateway 和 Redis 绑定 `127.0.0.1`（只允许本机访问），外网完全连不上

---

## 第 1 步：轮换 Supabase 密钥

### 为什么要做

之前有一个管理员级别的密钥（service_role key）不小心提交到了代码里。
虽然代码已经修改，但密钥还留在 git 历史记录中。
必须作废旧的，换一个新的。

### 操作步骤

1. 打开 https://supabase.com/dashboard
2. 点击你的项目
3. 左侧菜单 → **Project Settings** → **API**
4. 找到 **service_role** 那一行（标着 `secret`），点 **Regenerate**
5. 确认后，**复制新密钥保存到安全的地方**（备忘录 app、密码管理器等）

### 同时记下这 4 个值

后面每个值都要用到，全部复制保存好：

| 值 | 在页面什么位置 | 长什么样 |
|----|--------------|---------|
| Project URL | 页面顶部 | `https://xxx.supabase.co` |
| anon public key | API Keys 区域 | `eyJhbGci...` 很长一串 |
| service_role key | API Keys 区域 (secret) | `eyJhbGci...` 很长一串 |
| JWT Secret | 页面最底部 | 一串随机字符 |

---

## 第 2 步：准备腾讯云服务器

### 2.1 购买服务器（如果还没有）

1. 打开 https://cloud.tencent.com/product/lighthouse
2. 选 **轻量应用服务器**（最简单最便宜，适合测试）
3. 配置：
   - **系统镜像**：Ubuntu 22.04
   - **套餐**：2 核 2G 就够（约 ¥45/月）
   - **地区**：离你近的（广州 / 上海 / 北京）
4. 购买后等 1 分钟自动创建完成

### 2.2 配置防火墙

> 原则：**只开必要的端口，越少越安全。**

1. 腾讯云控制台 → 轻量应用服务器 → 选你的服务器 → **防火墙**
2. **删掉所有默认规则**，只添加这 3 条：

| 协议 | 端口 | 来源 | 用途 |
|------|------|------|------|
| TCP | 22 | **你的 IP 地址/32** | SSH 远程登录（只允许你自己连） |
| TCP | 80 | 0.0.0.0/0 | Nginx HTTP |
| TCP | 443 | 0.0.0.0/0 | Nginx HTTPS（后续加证书用） |

**怎么查你的 IP**：浏览器打开 https://whatismyipaddress.com/

> **千万不要开放** 3001（Gateway）和 6379（Redis）端口到公网！

### 2.3 SSH 登录服务器

打开 Mac 的"终端"app，输入：

```bash
ssh root@你的服务器IP
```

- 第一次会问 `Are you sure you want to continue connecting?`，输入 `yes` 回车
- 然后输入密码（可在腾讯云控制台重置密码）
- 看到 `root@VM-xxx:~#` 就表示登录成功了

---

## 第 3 步：在服务器上安装软件

> 以下所有命令都在服务器上执行（SSH 登录后的窗口）。

### 3.1 更新系统

```bash
apt update && apt upgrade -y
```

可能要 1-2 分钟，中间问 `Do you want to continue?` 输入 `Y` 回车。

### 3.2 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
```

验证安装成功：

```bash
docker --version
docker compose version
```

看到版本号就说明装好了。

### 3.3 安装 Nginx

```bash
apt install -y nginx
```

### 3.4 安装 Git 并拉代码

```bash
apt install -y git
cd /opt
git clone https://github.com/你的GitHub用户名/qrclaw.git
```

> 如果仓库是 private 的，会提示输入用户名密码。
> 这时需要用 GitHub Personal Access Token 替代密码。
> 生成方式：GitHub → Settings → Developer settings → Personal access tokens → Generate new token

---

## 第 4 步：启动 Gateway

### 4.1 生成随机密钥

在服务器上运行这两条命令，**复制保存输出的值**：

```bash
# 生成 WS_TICKET_SECRET
echo "WS_TICKET_SECRET: $(openssl rand -base64 32)"

# 生成 ENCRYPTION_KEK（64 个十六进制字符）
echo "ENCRYPTION_KEK: $(openssl rand -hex 32)"
```

### 4.2 创建 Gateway 配置文件

```bash
cd /opt/qrclaw/gateway
nano .env.production
```

粘贴以下内容，**把所有 `<...>` 部分替换成真实值**：

```env
# ─── 服务器 ─────────────────────────────────
PORT=3001
HOST=0.0.0.0
NODE_ENV=production

# ─── CORS（第 6 步部署完 Vercel 后回来填）────
CORS_ORIGIN=https://先空着-第6步再改.vercel.app

# ─── Redis（Docker 内部通信，不要改）─────────
REDIS_URL=redis://redis:6379

# ─── 密钥（第 4.1 步生成的）─────────────────
WS_TICKET_SECRET=<粘贴第 4.1 步生成的第一个值>
ENCRYPTION_KEK=<粘贴第 4.1 步生成的第二个值>

# ─── Supabase（第 1 步记下的值）──────────────
SUPABASE_URL=https://zyxqadubhwrnsoujiyir.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<粘贴第 1 步轮换后的新 service_role key>
SUPABASE_JWT_SECRET=<粘贴第 1 步记下的 JWT Secret>

# ─── 公开地址 ───────────────────────────────
GATEWAY_BASE_URL=http://你的服务器IP
```

保存：按 `Ctrl+O` → `回车`，退出：按 `Ctrl+X`。

### 4.3 安全加固：让 Gateway 和 Redis 只允许本机访问

编辑 docker-compose.yml：

```bash
nano docker-compose.yml
```

找到 Gateway 的 `ports` 部分，改成：

```yaml
    ports:
      - "127.0.0.1:3001:3001"
```

找到 Redis 的 `ports` 部分，改成：

```yaml
    ports:
      - "127.0.0.1:6379:6379"
```

> 改完后，外网就无法直接连接这两个服务了。只有同一台机器上的 Nginx 能访问。

保存退出。

### 4.4 启动 Gateway

```bash
docker compose up -d
```

等 1-2 分钟（第一次要下载镜像），然后检查：

```bash
# 看容器状态（应该都是 Up）
docker compose ps

# 测试 Gateway 是否正常运行
curl http://127.0.0.1:3001/health
```

看到 `{"status":"ok"}` 就成功了。

### 4.5 常用维护命令

```bash
# 查看实时日志
docker compose logs -f gateway

# 重启 Gateway（改了配置后要执行）
docker compose restart gateway

# 停止所有服务
docker compose down

# 重新启动所有服务
docker compose up -d
```

---

## 第 5 步：配置 Nginx

### 5.1 创建配置文件

```bash
nano /etc/nginx/sites-available/qrclaw-gateway
```

粘贴以下内容（**替换 `你的服务器IP`**）：

```nginx
server {
    listen 80;
    server_name 你的服务器IP;

    # ─── 普通 HTTP 请求 → 转发给 Gateway ───
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ─── WebSocket 请求 → 转发给 Gateway ───
    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
    }
}
```

保存退出。

### 5.2 启用配置

```bash
# 启用新配置
ln -sf /etc/nginx/sites-available/qrclaw-gateway /etc/nginx/sites-enabled/

# 关掉 Nginx 默认的欢迎页
rm -f /etc/nginx/sites-enabled/default

# 检查配置是否有语法错误
nginx -t
```

如果显示 `syntax is ok` 和 `test is successful`，说明没问题。

```bash
# 重启 Nginx
systemctl restart nginx
```

### 5.3 验证 Nginx 是否正常工作

```bash
curl http://你的服务器IP/health
```

看到 `{"status":"ok"}` 说明整条链路通了：

```
你的请求 → Nginx(80端口) → Gateway(3001端口) → 返回 OK
```

---

## 第 6 步：部署前端到 Vercel

### 6.1 推代码到 GitHub

回到你的 **Mac 终端**（不是服务器窗口）：

```bash
cd /Users/zeze/qrclaw
git push origin main
```

> 如果还没关联远程仓库：
> ```bash
> git remote add origin https://github.com/你的用户名/qrclaw.git
> git push -u origin main
> ```

### 6.2 在 Vercel 导入项目

1. 打开 https://vercel.com/dashboard
2. 点 **Add New** → **Project**
3. 找到 `qrclaw` 仓库，点 **Import**
4. **关键设置** — 展开 **Root Directory**，填入 `web`
   - 因为前端代码在 `web/` 子目录下，不填的话 Vercel 找不到 Next.js
5. Framework Preset 会自动识别为 Next.js，不用改

### 6.3 配置环境变量

在部署页面展开 **Environment Variables**，逐个添加：

| Name | Value | 说明 |
|------|-------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zyxqadubhwrnsoujiyir.supabase.co` | 第 1 步记的 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` | 第 1 步记的 anon key |
| `NEXT_PUBLIC_GATEWAY_WS_URL` | `ws://你的服务器IP` | 注意是 ws 不是 wss |
| `NEXT_PUBLIC_APP_URL` | 先填 `https://example.com` | 部署后再改 |

> 测试阶段 Gateway 用 `ws://`（不加密）。正式上线配域名+证书后改成 `wss://`。

6. 点 **Deploy**，等 2-3 分钟

### 6.4 部署成功后

Vercel 会给你一个地址，类似：`https://qrclaw-xxxx.vercel.app`

**做两件收尾的事：**

**第一件**：更新 Vercel 环境变量

1. Vercel Dashboard → 你的项目 → **Settings** → **Environment Variables**
2. 把 `NEXT_PUBLIC_APP_URL` 改成你的 Vercel 地址
3. 点项目页面顶部的 **Deployments** → 最新一条 → 右边三个点 → **Redeploy**

**第二件**：更新服务器 CORS 配置

```bash
ssh root@你的服务器IP
cd /opt/qrclaw/gateway
nano .env.production
```

把 `CORS_ORIGIN=` 改成你的 Vercel 地址：

```
CORS_ORIGIN=https://qrclaw-xxxx.vercel.app
```

保存退出，重启 Gateway：

```bash
docker compose restart gateway
```

---

## 第 7 步：验证一切正常

在浏览器输入你的 Vercel 地址，逐个页面检查：

| 页面 | 地址 | 看什么 |
|------|------|--------|
| 首页 | `/` | Landing Page 正常渲染，有渐变背景、CTA 按钮 |
| 登录 | `/login` | 登录表单正常显示 |
| 注册 | `/signup` | 注册表单正常，可以输入邮箱 |
| 定价 | `/pricing` | 三张价格卡片正常排列 |
| 文档 | `/docs` | 左侧边栏 + 右侧内容 |
| 验证邮箱 | `/verify` | 显示邮箱验证提示 |

**如果要测试 WebSocket 通信**：

1. 浏览器按 `F12` 打开开发者工具
2. 切到 **Network** 标签
3. 筛选 **WS**
4. 访问聊天页面，看有没有 WebSocket 连接建立

---

## 安全检查清单

部署完成后，对照检查：

| 检查项 | 怎么验证 | 预期结果 |
|--------|---------|---------|
| Gateway 端口不暴露 | 浏览器访问 `http://你的IP:3001/health` | **无法访问**（超时或拒绝连接） |
| Redis 端口不暴露 | 本地运行 `redis-cli -h 你的IP ping` | **无法连接** |
| Nginx 正常转发 | 浏览器访问 `http://你的IP/health` | 返回 `{"status":"ok"}` |
| Supabase 旧密钥失效 | 用旧 key 调 Supabase API | **401 Unauthorized** |
| Vercel URL 不泄露 | 搜索引擎搜 `site:xxx.vercel.app` | **无结果** |

---

## 常见问题排查

### SSH 连不上

- 检查防火墙有没有开放 22 端口
- 检查来源 IP 是否填对了（IP 会变，换网络后要更新）
- 试试重置密码：腾讯云控制台 → 服务器 → 重置密码

### Docker 安装失败

先确认操作系统：

```bash
cat /etc/os-release
```

如果不是 Ubuntu/Debian，把输出发给开发者排查。

### Vercel 部署失败

1. 检查 Root Directory 是否填了 `web`
2. 点 **Deployments** → 失败的那条 → 看 **Build Logs**
3. 截图 Build Logs 发给开发者

### 页面打开白屏

1. 浏览器按 `F12` → **Console** 标签
2. 看红色报错信息，截图发给开发者

### Gateway 容器启动失败

```bash
cd /opt/qrclaw/gateway
docker compose logs gateway
```

常见原因：
- `.env.production` 里有值没填 → 补齐
- Redis 没启动 → `docker compose up -d redis` 先启动 Redis
- 端口冲突 → `lsof -i :3001` 看谁占了端口

### WebSocket 连不上

- 检查 Nginx 的 `/ws` location 配置是否正确
- 检查 `NEXT_PUBLIC_GATEWAY_WS_URL` 是否填对
- 浏览器 F12 → Network → WS，看错误信息

---

## 后续：正式上线时要做的事

测试通过后，正式上线还需要：

1. **绑定域名**：在域名注册商配 DNS 指向服务器 IP
2. **加 HTTPS 证书**：用 Let's Encrypt 免费证书（`certbot` 工具一键搞定）
3. **WebSocket 升级**：`ws://` → `wss://`（加密传输）
4. **Vercel 绑定域名**：Settings → Domains 添加你的域名
5. **更新环境变量**：所有 URL 从 IP 换成域名

这些内容在正式上线时再详细展开。

---

## 快速参考：所有环境变量

### 前端 (Vercel)

| 变量 | 值 |
|------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zyxqadubhwrnsoujiyir.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → API → anon key |
| `NEXT_PUBLIC_GATEWAY_WS_URL` | `ws://服务器IP`（正式上线后改 `wss://域名`） |
| `NEXT_PUBLIC_APP_URL` | Vercel 分配的 URL |

### 后端 (服务器 `.env.production`)

| 变量 | 值 | 来源 |
|------|-----|------|
| `PORT` | `3001` | 固定 |
| `HOST` | `0.0.0.0` | 固定 |
| `NODE_ENV` | `production` | 固定 |
| `CORS_ORIGIN` | Vercel 分配的 URL | 第 6 步获取 |
| `REDIS_URL` | `redis://redis:6379` | 固定（Docker 内部） |
| `WS_TICKET_SECRET` | 随机生成 | `openssl rand -base64 32` |
| `ENCRYPTION_KEK` | 随机生成（64 位 hex） | `openssl rand -hex 32` |
| `SUPABASE_URL` | `https://zyxqadubhwrnsoujiyir.supabase.co` | Supabase Dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | 轮换后的新 key | 第 1 步获取 |
| `SUPABASE_JWT_SECRET` | JWT Secret | Supabase Dashboard → API 最底部 |
| `GATEWAY_BASE_URL` | `http://服务器IP` | 你的服务器 |
