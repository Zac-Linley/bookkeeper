# 记账本 — Bookkeeper

PWA 移动端记账应用，基于 Cloudflare 免费额度全栈部署，支持多币种、GPS 定位、图片附件、定存管理、二次验证。

## 功能

| 模块 | 功能 |
|------|------|
| 认证 | 注册/登录（可控开关）、JWT、邮箱 2FA（Resend）、受信任设备免验证 |
| 记账 | 收支 CRUD、类别网格选择、GPS 自动定位 + 反向地理编码、图片附件（R2 存储、拍照/相册、灯箱预览）、报销标记 |
| 首页 | 月份切换、多币种汇总（统一换算）、可折叠汇率条、支出/收入环形图 + 图例、定存概览 |
| 账单 | 日期范围筛选、关键字搜索、排序、CSV 导出、分类图标 |
| 定存 | 多币种、4 种结息方式（到期/月结/季结/预付）、360 天计息、到期提现自动记账、统一货币统计 |
| 类别管理 | 网格布局、系统预设 + 自定义、60+ Tabler 图标可选 |
| 设置 | 二级菜单、账户信息编辑、数据共享（家人互看记账）、默认货币切换、注销账户 |
| 管理后台 | 注册开关、2FA 开关（开启需邮箱验证）、邮件配置（Resend API Key）、用户角色/禁用/删除 |

## 技术栈

- **前端**：React 18 + TypeScript + Tailwind CSS + Vite + PWA（vite-plugin-pwa）
- **后端**：Cloudflare Workers + Hono 4 + jose（JWT）
- **存储**：Cloudflare D1（SQLite）+ R2（对象存储）
- **图标**：@tabler/icons-react（outline 风格，60+ 图标映射）
- **图表**：recharts（环形图）
- **邮件**：Resend（优先）/ MailChannels（回退）
- **包管理**：pnpm workspaces（monorepo）

## 项目结构

```
bookkeeper/
├── packages/
│   ├── shared/          # 共享 TypeScript 类型
│   │   └── src/index.ts
│   ├── frontend/        # React PWA 前端
│   │   └── src/
│   │       ├── pages/       # 11 个页面组件
│   │       ├── components/  # BottomNav, SwipeableCard
│   │       ├── hooks/       # useAuth
│   │       └── lib/         # api.ts, icons.tsx
│   └── worker/          # Cloudflare Worker API
│       ├── src/index.ts          # 全部路由（8 组）
│       └── migrations/           # D1 数据库迁移（6 个）
├── pnpm-workspace.yaml
└── package.json
```

## 部署教程

### 前置条件

- [Cloudflare 账号](https://dash.cloudflare.com/)
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) `npm i -g pnpm`

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd bookkeeper
pnpm install
```

### 2. 创建 D1 数据库

```bash
cd packages/worker
npx wrangler d1 create bookkeeper-db
```

将输出的 `database_id` 填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "bookkeeper-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # ← 替换这里
```

### 3. 创建 R2 存储桶

```bash
npx wrangler r2 bucket create bookkeeper-attachments
```

### 4. 执行数据库迁移

```bash
npx wrangler d1 execute bookkeeper-db --file=./migrations/0001_init.sql --remote
npx wrangler d1 execute bookkeeper-db --file=./migrations/0002_tabler_icons.sql --remote
npx wrangler d1 execute bookkeeper-db --file=./migrations/0003_fixed_deposits.sql --remote
npx wrangler d1 execute bookkeeper-db --file=./migrations/0004_two_factor.sql --remote
npx wrangler d1 execute bookkeeper-db --file=./migrations/0005_resend.sql --remote
npx wrangler d1 execute bookkeeper-db --file=./migrations/0006_device_trust.sql --remote
```

### 5. 设置 JWT 密钥

```bash
npx wrangler secret put JWT_SECRET
# 输入一个随机字符串（如：openssl rand -hex 32 的输出）
```

### 6. 部署 Worker API

```bash
npx wrangler deploy
```

### 7. 部署前端

```bash
cd ../frontend
pnpm build
npx wrangler pages deploy dist --project-name bookkeeper
```

部署完成后访问 Pages 提供的域名（如 `https://bookkeeper-xxx.pages.dev`）。

### 8. 可选：配置 2FA 邮件

1. 注册 [Resend](https://resend.com)（免费 100 封/天）
2. 获取 API Key
3. 登录记账本 → 设置 → 管理后台 → 邮件配置
4. 填入 Resend API Key 和发件邮箱
5. 开启 2FA 并完成邮箱验证

### 9. 手机端使用

用手机浏览器打开部署域名 → Safari/Chrome 菜单 → **添加到主屏幕** → 之后像原生 App 一样使用。

## 本地开发

```bash
# 启动 Worker（localhost:8787）
pnpm -F worker dev

# 启动前端（localhost:5173，自动代理 API 到 8787）
pnpm -F frontend dev
```

## 免费额度

全部运行在 Cloudflare 免费额度内：

| 服务 | 免费额度 | 项目消耗 |
|------|---------|---------|
| Workers | 10 万请求/天 | < 5000/天 |
| D1 | 5 GB / 50 亿行读取 | < 10 MB |
| R2 | 10 GB 存储 | < 1 GB |
| Pages | 无限带宽 | 少量 |
| Cron | 免费 | 1 次/天（汇率） |

## License

MIT
