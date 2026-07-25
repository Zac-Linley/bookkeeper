# Bookkeeper — 便捷记账程序

PWA 移动端记账应用，Cloudflare 免费额度部署，多币种/GPS/图片附件/数据共享。

## Project

- **Stack**: React 18 + TS + Tailwind + Vite, Hono 4 + jose, D1 + R2
- **Monorepo**: pnpm workspaces (frontend, worker, shared)
- **Icons**: @tabler/icons-react (outline, 60+ mapped)
- **Chart**: recharts (PieChart)
- **部署**: Pages + Workers, 入口 `main.tsx` / `worker/src/index.ts`

## Commands

```bash
pnpm -F frontend dev          # Vite (5173), proxy → 8787
pnpm -F worker dev            # wrangler dev (8787)
pnpm -F frontend build        # tsc + vite build
npx wrangler pages deploy dist --project-name bookkeeper
pnpm -F worker run deploy
npx wrangler d1 execute bookkeeper-db --file=./migrations/0001_init.sql --remote
npx wrangler d1 execute bookkeeper-db --file=./migrations/0002_tabler_icons.sql --remote
```

## Architecture

```
lib/icons.tsx          # Tabler icon map (60+) + CatIcon component
lib/api.ts             # API client, auto-unwrap {success,data}
hooks/useAuth.tsx      # AuthContext
components/
  BottomNav.tsx        # 4-tab nav with Tabler icons
  SwipeableCard.tsx    # Touch swipe (left=delete, right=edit)
pages/
  DashboardPage        # 3-card summary + recharts donut pie
  TransactionFormPage  # Wireframe redesign: 4-col grid categories, pill row (time/loc/reimb), compact attachments
  TransactionListPage  # CatIcon per row, search, date range, swipe gestures
  CategoriesPage       # Grid layout, edit mode, add with icon picker (60+)
  SettingsPage         # Profile/currency/password/sharing
  AdminPage            # Registration toggle, user roles
```

## Conventions

- **API**: Worker wraps `{success, data}`; frontend `request()` unwraps `.data`
- **Icons**: DB stores icon name string (e.g. `car`); `lib/icons.tsx` CatIcon renders matching Tabler component, fallback to emoji
- **JWT**: `jose` SignJWT/jwtVerify, custom middleware from `c.env.JWT_SECRET`
- **DB bools**: D1 INTEGER 0/1 → frontend `? : null` (never `&&`)
- **Attachments**: local File state → save tx first → upload to R2
- **Sharing**: `account_members` JOIN in queries
- **UI**: `.btn-primary/.btn-outline/.btn-danger` (h-12), `.btn-*-sm` (h-10), `.input-field` (h-12), `.input-sm/.select-sm` (h-10), `.card`

## Notes

- `0002_tabler_icons.sql` updates existing category icons from emoji to Tabler names
- Custom categories show blue dot in grid; edit mode reveals delete button
- Date format: `HH:mm 周X d M月` / `HH:mm 周X YYYY-MM-DD`
