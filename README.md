# EasyBill — single Vercel deployment + Turso

This repository deploys the existing EasyBill User and Admin portals together, with one shared API and one Turso database. The two original HTML files are copied unchanged by `build.js`.

## Final URLs

- User portal: `https://YOUR-DOMAIN.vercel.app/`
- Admin portal: `https://YOUR-DOMAIN.vercel.app/admin`
- API: `https://YOUR-DOMAIN.vercel.app/api/...`

## Services

- Vercel: hosts both portals and the Node.js serverless API.
- Turso: stores shop accounts, products, customers, bills, history and settings.
- Resend: not wired into this uploaded version. The existing HTML has username/password login and no email-OTP screen.
- Support contact: `EB_OWNER_PHONE` and `EB_OWNER_WHATSAPP` are public contact values injected into the User portal's generated `config.js`.

No Cloudflare D1, Cloudflare R2, or MongoDB is used.

## 1. Create or open your Turso database

If you already have the Turso database from the earlier EasyBill setup, reuse it; do not create another one.

You need:
- `TURSO_DATABASE_URL` — the database URL beginning with `libsql://`
- `TURSO_AUTH_TOKEN` — an authentication token for that database

If creating a new database, use the Turso dashboard or Turso CLI, then copy its URL and create a database token. Keep the token private.

## 2. Apply database migrations once

Install Node.js 20.6+ (Node 22 LTS recommended). In the project root:

1. Copy `.env.example` to `.env`.
2. Fill in `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
3. Run:

```bash
npm install
npm run migrate
```

The migration runner records completed migrations and skips them on later runs. It does not delete existing data. If reusing a populated database, take a backup first and ensure the migration history matches the schema before running it.

## 3. Push this project to GitHub

Extract the ZIP, open a terminal in the extracted project folder, then run:

```bash
git init
git add .
git commit -m "Prepare EasyBill for Vercel and Turso"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Do not upload `.env`, database tokens, JWT secrets, or admin passwords. `.gitignore` excludes `.env`.

## 4. Create ONE Vercel project

1. In Vercel, select **Add New → Project**.
2. Import the GitHub repository.
3. Set **Root Directory** to the repository root (leave it as `./`).
4. Framework Preset: **Other**.
5. Build Command: `npm run build`.
6. Output Directory: `dist`.
7. Install Command: `npm install`.
8. Add the environment variables below before deploying.
9. Deploy.

The included `vercel.json` configures the static output and the `/api` serverless function. `build.js` puts the User HTML at `/` and the Admin HTML at `/admin`; it does not edit either HTML file.

## 5. Vercel Environment Variables

Open Vercel → Project → Settings → Environment Variables. Add:

| Name | Value | Visibility / purpose |
|---|---|---|
| `TURSO_DATABASE_URL` | Your `libsql://...` URL | Server-side database connection |
| `TURSO_AUTH_TOKEN` | Your Turso token | Secret; server-side only |
| `JWT_SECRET` | Random secret of at least 32 characters | Secret; server-side only |
| `ADMIN_USER` | Your chosen admin username | Server-side only |
| `ADMIN_PASS` | A strong, unique admin password (12+ characters) | Secret; server-side only |
| `ALLOWED_ORIGINS` | Your exact Vercel site origin, e.g. `https://easybill-example.vercel.app` | API CORS allowlist |
| `EB_OWNER_PHONE` | Support phone, digits with country code, e.g. `919876543210` | Public contact shown to users |
| `EB_OWNER_WHATSAPP` | WhatsApp number, digits with country code, e.g. `919876543210` | Public contact shown to users |

For a custom domain, include its exact origin in `ALLOWED_ORIGINS`. If you use more than one domain, separate origins with commas and no path suffixes.

Generate a fresh JWT secret in your computer's terminal:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copy the output into `JWT_SECRET`. Never put database credentials, JWT secrets, or admin passwords in frontend variables, HTML, GitHub, or screenshots.

Set the variables for Production. Add Preview/Development values too only if you intend to use those environments. After changing build-time support number variables, redeploy so `config.js` is regenerated.

## 6. Verify deployment

After Vercel reports Ready:

1. Open `/` and check the User portal.
2. Open `/admin` and check the Admin login.
3. Open `/api/health`; it should return `{"ok":true,"service":"easybill-api","database":"connected"}`.
4. Log in with the admin credentials from `ADMIN_USER` and `ADMIN_PASS`.
5. Create a test shop, then log in to that shop.
6. Add a test product and bill; refresh and confirm the data remains.
7. Confirm a second shop cannot see the first shop's data.
8. Ask the chatbot for support contact and confirm the configured phone/WhatsApp values open correctly.

## Important behaviour and current scope

- Shop login remains username + password, exactly as in the supplied HTML. Email OTP is not implemented in this ZIP: there is no OTP UI in the current HTML, and this deployment does not silently change the UI.
- The chatbot in this version is rule-based, not a connected generative AI service.
- `EB_OWNER_PHONE` and `EB_OWNER_WHATSAPP` are public support contact numbers, not authentication secrets.
- Admin Activity Logs, Backup & Data pages, and Security Settings pages are listed as not implemented in the supplied version.
- Product and account lists are stored as whole JSON lists. Concurrent edits can overwrite one another; avoid simultaneous editing from multiple devices until that part is redesigned.
- Back up your Turso database before major schema or backend changes.

## Updating later

Push code changes to GitHub and Vercel will redeploy. Customer data remains in Turso; redeploying the website does not erase it.

For a schema change, add a new numbered SQL migration under `apps/api/migrations/` and run `npm run migrate`. Do not edit old migration files after they have been applied to a live database.

## Troubleshooting

- **Server configuration missing:** check that all required server variables are set in Vercel and redeploy.
- **Database connection error:** verify the Turso URL/token and that the database is active.
- **Admin login rejected:** check `ADMIN_USER` and `ADMIN_PASS`, then redeploy.
- **Support contact not appearing:** check `EB_OWNER_PHONE` / `EB_OWNER_WHATSAPP` and redeploy because they are embedded into generated `config.js`.
- **CORS issue:** make sure `ALLOWED_ORIGINS` exactly matches the browser's origin, including `https://`, and has no trailing slash.
