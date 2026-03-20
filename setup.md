# NEPSE Dashboard — Setup Guide

## Prerequisites
- Node.js 18+  (check: `node -v`)
- MySQL 8.0+   (already installed)
- Python 3.8+  (already installed, with your conda env)

---

## Step 1 — MySQL databases

Open MySQL Workbench (or terminal) and run:

```bash
mysql -u root -p < setup_databases.sql
```

This creates:
- `auth_db`  — users, sessions
- `nepse_db` — sectors, companies, price_data, watchlist, views

---

## Step 2 — Create the Next.js project

```bash
cd C:\Codes\DBMS
npx create-next-app@latest nepse-dashboard --typescript --tailwind --eslint --app --no-src-dir --no-import-alias
cd nepse-dashboard
```

---

## Step 3 — Install dependencies

```bash
npm install next-auth@beta mysql2 bcryptjs recharts
npm install -D @types/bcryptjs
```

---

## Step 4 — Copy project files

Copy ALL the files from the outputs folder into your `nepse-dashboard/` folder,
preserving the directory structure:

```
nepse-dashboard/
  middleware.ts
  tsconfig.json
  types/next-auth.d.ts
  lib/
    auth.ts
    db-auth.ts
    db-nepse.ts
  app/
    layout.tsx
    (auth)/login/page.tsx
    (dashboard)/
      layout.tsx
      dashboard/page.tsx
      dashboard/search/page.tsx
      dashboard/watchlist/page.tsx
      dashboard/stock/[symbol]/page.tsx
    api/
      auth/[...nextauth]/route.ts
      auth/register/route.ts
      fetch/route.ts
      stocks/search/route.ts
      stocks/[symbol]/route.ts
      watchlist/route.ts
  components/
    Sidebar.tsx
    TopBar.tsx
    FetchForm.tsx
    PriceChart.tsx
    WatchlistActions.tsx
    WatchlistRemoveButton.tsx
    AddToWatchlistButton.tsx
```

---

## Step 5 — Configure .env.local

Create `nepse-dashboard/.env.local` and fill in:

```env
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
AUTH_SECRET=<paste generated string here>

AUTH_DB_HOST=localhost
AUTH_DB_PORT=3306
AUTH_DB_USER=root
AUTH_DB_PASSWORD=<your MySQL password>
AUTH_DB_NAME=auth_db

NEPSE_DB_HOST=localhost
NEPSE_DB_PORT=3306
NEPSE_DB_USER=root
NEPSE_DB_PASSWORD=<your MySQL password>
NEPSE_DB_NAME=nepse_db

# Full path to your nepse_pipeline.py — use forward slashes
PIPELINE_PATH=C:/Codes/DBMS/Data fetched/final_data/nepse_pipeline.py
# Path to python in your conda env
PYTHON_PATH=C:/Users/ASUS/.conda/envs/adpy/python.exe

NEXTAUTH_URL=http://localhost:3000
```

---

## Step 6 — Seed your nepse_db companies

Run your pipeline to seed companies first:

```bash
cd "C:\Codes\DBMS\Data fetched\final_data"
conda activate adpy
python nepse_pipeline.py
# Choose S (seed), then F (fetch today's data)
```

Then load the companies.csv into nepse_db.
The pipeline currently saves CSV — once we connect the loader
this happens automatically. For now, to test the web app,
you can manually run the seed SQL:

```sql
USE nepse_db;
-- Companies are inserted via the pipeline loader
-- Run nepse_pipeline.py first to populate data
```

---

## Step 7 — Run the app

```bash
cd nepse-dashboard
npm run dev
```

Open: http://localhost:3000

1. You'll be redirected to `/login`
2. Click "Create account" tab → register
3. You're in the dashboard

---

## Folder structure overview

```
nepse-dashboard/
├── app/
│   ├── (auth)/login/        ← login + register page
│   ├── (dashboard)/         ← protected pages (middleware guards these)
│   │   ├── layout.tsx       ← sidebar + topbar wrapper
│   │   ├── dashboard/       ← home: stats + fetch form + price table
│   │   ├── dashboard/search ← search results
│   │   ├── dashboard/stock/ ← stock detail (like your screenshot)
│   │   └── dashboard/watchlist ← personal watchlist
│   └── api/                 ← all backend routes
│       ├── auth/            ← NextAuth + register
│       ├── fetch/           ← triggers nepse_pipeline.py
│       ├── stocks/          ← search + detail endpoints
│       └── watchlist/       ← add/remove/list watchlist
├── components/              ← reusable UI components
├── lib/                     ← DB pools + auth config
├── types/                   ← NextAuth type extensions
└── middleware.ts            ← route protection
```

---

## Common errors

| Error | Fix |
|-------|-----|
| `AUTH_SECRET not set` | Add AUTH_SECRET to .env.local |
| `ER_BAD_DB_ERROR` | Run setup_databases.sql first |
| `Cannot find module mysql2` | Run `npm install mysql2` |
| `Pipeline not found` | Check PIPELINE_PATH in .env.local |
| `Module not found: recharts` | Run `npm install recharts` |
| `Cannot find name 'Session'` | Copy types/next-auth.d.ts |
