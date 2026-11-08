# EasyBill (Vercel + Turso)

    apps/user    shop website   -> Vercel project 1
    apps/admin   admin website  -> Vercel project 2 (separate site, never linked from the shop site)
    apps/api     the ONE shared server (Vercel functions) -> Vercel project 3, connected to your Turso database

## 1. Create the Turso database (once)
    turso auth login
    turso db create easybill
    turso db show easybill --url          # -> TURSO_DATABASE_URL  (libsql://...)
    turso db tokens create easybill       # -> TURSO_AUTH_TOKEN

## 2. Create the tables
    cd apps/api
    npm install
    cp .env.example .env                  # fill in TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
    npm run migrate                       # creates all tables (safe to run again any time)

## 2b. (Optional) Try everything on your own computer first
    cd apps/api
    npm run dev
Then open http://localhost:3000/ (shop website) and http://localhost:3000/admin (admin website).
Default test admin login is admin / admin123 (only used when you have not set ADMIN_USER / ADMIN_PASS in .env).
If TURSO_DATABASE_URL is not filled in, it uses a local file (local.db) so nothing touches your real data.

## 3. Put the code on GitHub
    git init && git add . && git commit -m "EasyBill v1"
    git branch -M main && git remote add origin https://github.com/<you>/easybill.git && git push -u origin main
(.env files are never uploaded.)

## 4. Publish on Vercel (three projects, same GitHub repo; set "Root Directory" for each, Framework: Other)
- **apps/api**   -> add Environment Variables: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN,
  JWT_SECRET (long random text), ADMIN_USER, ADMIN_PASS (your admin login), ALLOWED_ORIGINS (set after step 5).
  After deploy you get an address like https://easybill-api.vercel.app
- **apps/user**  -> Environment Variables: EB_API=<the API address>, EB_OWNER_PHONE=<919876543210>, EB_OWNER_WHATSAPP=<919876543210>
- **apps/admin** -> Environment Variables: EB_API=<the API address>
Build settings are already in each vercel.json. To change a number later, edit the variable and press Redeploy.

## 5. Lock the API to your websites
In the API project set ALLOWED_ORIGINS=https://yourshop.com,https://admin.yourshop.com and redeploy.
Never put passwords or secrets in the user/admin variables (they are visible in the browser).

## Updating later WITHOUT losing customer data
Customer data lives in Turso, not in the code. Redeploying never touches it.
- Website or API changes: edit, `git push` -> Vercel redeploys.
- Database changes: add a NEW file `apps/api/migrations/0004_<name>.sql` (ALTER TABLE ... ADD COLUMN / CREATE TABLE), then run `npm run migrate`.
  Never edit or delete old migration files and never DROP tables.
- Backup before big updates: `turso db shell easybill .dump > backup.sql`

## How billing access works
Admin gives each shop Retail only, Wholesale only, or both, and can switch each ON/OFF any time. A locked mode shows
"Contact Administrator to open this". The server enforces it. Shop login is username + password only.

## Known limits
- Product and account lists are saved as whole lists: if two phones edit products in the same second, the last save wins.
  Each product image is stored inside the list (about 10 KB each), so keep to roughly 400 products with images.
- The chat assistant is rule-based (not a language model). History PDFs show "Rs." instead of the rupee sign.
- Admin activity logs, backups page and security settings pages are not built yet.
- Vercel's free Hobby plan is for non-commercial use; a real shop business needs a paid plan or another host.
