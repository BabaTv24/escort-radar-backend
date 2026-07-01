# Escort Radar

Privacy-first, mobile-first classified / nightlife marketplace MVP for adults 18+. The project is structured for legal review, moderation, reporting, age gating, content removal workflows, Supabase RLS, and GDPR-minded data handling from day one.

> Legal note: this repository contains implementation placeholders for Terms, Privacy, Impressum, Content Policy, and Report Abuse. They must be reviewed by a qualified lawyer before production launch.

## Project Structure

```txt
.
├── Back/                  # Node.js + Express REST API
├── Front/                 # React + Vite + TypeScript PWA frontend
├── supabase/migrations/   # PostgreSQL schema, RLS, helper triggers
├── .env.example
└── package.json           # npm workspaces
```

## Local Commands

```bash
npm install
npm run dev:backend
npm run dev:frontend
npm run build
npm start
```

Frontend defaults to `http://localhost:5173`. Backend defaults to `http://localhost:4000`.

## Render Deploy

### Backend Web Service

1. Create a Render Web Service from this repository.
2. Root directory: `Back`
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Add environment variables:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
JWT_SECRET
APP_URL
FRONTEND_URL
NODE_ENV=production
ADMIN_EMAILS
SUPABASE_STORAGE_BUCKET=profile-images
```

### Frontend Static Site

1. Create a Render Static Site.
2. Root directory: `Front`
3. Build command: `npm install && npm run build`
4. Publish directory: `dist`
5. Add:

```txt
VITE_API_URL=https://your-backend.onrender.com
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase/migrations/001_initial_schema.sql`.
3. Create a public storage bucket named `profile-images`.
4. Copy `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into Render/local env vars.
5. In Authentication settings, configure allowed redirect URLs:
   - `http://localhost:5173`
   - `https://escort-radar.fun`
6. Add admin users by either:
   - setting `ADMIN_EMAILS` on the backend, or
   - adding `role: "admin"` to Supabase user app metadata.

## Test Account Seed

Use only for MVP QA/test environments. The script deactivates old test profiles (`+test` emails or `is_test_account=true`) and creates 3 fresh fixture accounts from `qa+test1@example.test` to `qa+test3@example.test` with the local test password configured in the script.

```bash
cd Back
npm run seed:test-accounts
```

In production-like environments set `ALLOW_TEST_SEED=true` explicitly:

```bash
cd Back
ALLOW_TEST_SEED=true npm run seed:test-accounts
```

## MVP Scope

- Public city discovery pages for Berlin, Hamburg, Hannover, Koeln, Muenchen, and Warszawa.
- Public profile pages with gallery, safety notice, hidden contact placeholder, and report form.
- User dashboard with Supabase auth, profile creation/editing, image upload, and face blur placeholder.
- Admin dashboard with profile moderation, report list, and basic stats.
- Backend REST API with Supabase token verification, input validation, upload processing, and payments placeholder.

## Safety Baseline

The product must not support illegal content, trafficking, minors, violence, coercion, or publication of personal data without consent. Keep all production copy, moderation workflows, and support processes aligned with that baseline before launch.
