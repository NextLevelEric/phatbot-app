# PHATBOT App

PHATBOT is a strength-performance tracking application focused on progressive overload, workout scoring, personal records, and clear workout report cards.

## MVP stack

- Next.js + React + TypeScript
- Tailwind CSS
- Supabase Postgres + Auth + Row Level Security
- Vercel hosting and preview deployments
- Git/GitHub source control

## Environments

### Local development
Copy `.env.example` to `.env.local` and fill in a development Supabase project's values.

```bash
npm install
npm run dev
```

### Preview
Feature branches / pull requests deploy to Vercel Preview and must use non-production Supabase credentials.

### Production
The `main` branch deploys to production and uses the production Supabase project. Production secrets must exist only in Vercel/Supabase configuration, never in Git.

## Initial project structure

- `src/app` — routes and application shell
- `src/components` — reusable UI components
- `src/lib` — infrastructure helpers such as environment and Supabase clients
- `src/features/scoring` — deterministic PHATBOT scoring domain
- `src/types` — shared application types

## Security baseline

- Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code.
- Enable Row Level Security on every table containing user-owned data.
- Keep development/preview data separate from production data.
- Do not commit `.env*` files containing secrets.
