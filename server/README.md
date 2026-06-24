# Even Bank — backend

Multi-user Express + Plaid backend for the Even Bank G2 app. Per-user encrypted
Plaid tokens, device-token auth for the glasses, magic-link onboarding on the phone.

## Local dev

```bash
cp .env.example .env          # fill DATABASE_URL; KEK_BASE64 + SESSION_SECRET via `openssl rand -base64 32`
npm install
npm run db:migrate            # apply schema to Postgres
npm run dev                   # http://localhost:8787  (mock mode until Plaid keys are set)
npm test                      # crypto + auth/IDOR (needs Postgres from .env)
```

Leave `PLAID_CLIENT_ID`/`PLAID_SECRET` blank for **mock mode** (demo data). Fill them
(and `PLAID_ENV`) for **live mode**.

## Auth model

- **Glasses → backend:** device token (`Authorization: Bearer dt_...`), issued via the
  RFC 8628 pairing flow (`/api/device/code` + `/api/device/token`). Stored only as a SHA-256
  hash; revocable per device or per user (`users.token_version`).
- **Phone onboarding:** email magic-link → `iron-session` cookie → enter the glasses' user
  code (`/api/device/approve`) → link bank via Plaid Link (`/api/link/*`, session-protected).
- Plaid access tokens are **AES-256-GCM encrypted at rest** (KEK from `KEK_BASE64`, AAD bound
  to `user_id|item_id`).

## Deploy (managed platform)

1. Provision managed Postgres; set `DATABASE_URL`.
2. Set secrets: `KEK_BASE64`, `SESSION_SECRET`, `PLAID_*`, `RESEND_API_KEY`, `EMAIL_FROM`,
   `PUBLIC_BASE_URL` (your HTTPS origin), `ALLOWED_ORIGINS`.
3. Release step: `npm run db:migrate`.
4. Start: `node dist/index.js` (or the provided `Dockerfile`). Health: `/health`, `/ready`.
5. Register the Plaid webhook at `<PUBLIC_BASE_URL>/api/plaid/webhook` (HTTPS) — it's
   registered automatically on link-token create when `PUBLIC_BASE_URL` is HTTPS.

## Notes / follow-ups

- Rate limits are in-memory; use a shared store (Redis) for multi-instance.
- KEK rotation: add `KEK_BASE64_V2`, re-encrypt rows lazily, retire the old key.
- The token store / device tokens are production-shaped, but run a security review before
  handling real user data at scale.
