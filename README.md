# Bankoto Console

Bankoto’s shared admin, employee and consultant workspace lives at `/console/login`.

The existing homepage is retained. Legacy `/clients` links redirect to the Accounting workspace. Accounting includes MTT Innovations’ existing August and September 2026 dashboard and six protected exports. Company Formation supports incorporation jobs, categorized document uploads, working folders and downloadable Output documents. Tax, Payroll and Legal are planned modules; administrators can save assignments for them now.

## Access

- Better Auth manages email/password authentication, password hashing, HttpOnly cookies, eight-hour sessions and persisted sign-in rate limits. Public account registration is disabled.
- The seeded administrator is `bankotofinance@gmail.com`. Its generated temporary password must be changed on first sign-in. Passwords and runtime secrets are not checked into source control.
- Administrators create employees or consultants and apply one of four labels: Tax consultant, Accountant, Payroll Expert or Legal Expert. Labels do not grant permissions.
- Each assignment pairs one client with one module. Every API request checks the active account and current assignments. Assignment changes and password resets revoke existing sessions.
- New members receive a generated temporary password which the admin shares directly. No automatic account email is sent. Administrators can reset member passwords; users can change their own password in Settings.
- Financial dashboards and downloads require a matching Accounting assignment. The existing encrypted client files are bundled into the server function, excluded from public build output, and decrypted only after authorization. The legacy report key is encrypted in the database using the authentication secret. Preserve `BETTER_AUTH_SECRET` across deployments; rotating it requires reconnecting the report.

## Runtime

Node 24, Vercel Functions, Better Auth 1.7, PostgreSQL on Neon’s free plan in London. The Console database is separate from Bankoto Office.

Required server variables: `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` (`https://www.bankoto.biz` in production). Local `.env.local` uses `http://localhost:3100`.

Company Formation uses a connected private Vercel Blob store with `BLOB_READ_WRITE_TOKEN`. Files upload directly to private storage through five-minute, single-path upload tokens after checking the current employee/consultant account and Formation client assignment. Each file is limited to 20 MB. A server-side metadata check confirms the reserved path, size and content type before making the document available. Downloads stream through an authenticated endpoint; private storage URLs and paths are never returned in document listings. Working and Output folders belong to one client job, and files cannot be moved across client workspaces. Categories can use the suggested labels or custom text. Status updates use optimistic version checks to protect concurrent editing and retain an activity history. A Completed status does not automatically move source documents; the team uploads or moves final deliverables into Output documents.

```sh
npm ci
npm run db:setup
npm run dev
```

`db:setup` applies Better Auth migrations plus `server/schema.sql` and creates the initial administrator only if absent. It never resets an existing administrator password. `scripts/connect-report.mjs` accepts the existing MTT admin report password through hidden stdin; it does not save that password.

## Verification and release

```sh
npm test
node --env-file=.env.local scripts/verify.mjs
node --env-file=.env.local scripts/verify-formation.mjs
npm run build
```

The integration verifiers create disposable accounts and clients, exercise real authentication, assignments, private upload, folder/category edits, status changes, and downloads, and remove their fixtures in `finally`. The Formation verifier also checks a file larger than the server upload limit and verifies direct private storage access is blocked. For a staged deployment, set `VERIFY_BASE_URL` to its URL and `VERIFY_ORIGIN=https://www.bankoto.biz` while using the same database and secret. The Vercel deployment must permit account-authenticated requests. `db:setup` also applies the additive Company Formation schema and expands the assignment module constraint.

Deploy to the existing `bankoto/console` Vercel project, stage production with `--prod --skip-domain`, verify it, then promote the tested deployment. The existing project-level `/office` rewrite remains managed separately in Vercel.
