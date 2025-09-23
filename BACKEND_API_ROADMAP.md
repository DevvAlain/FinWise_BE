## Backend API Roadmap

This document outlines planned REST endpoints by phase. Auth uses JWT access/refresh; all secrets via environment variables.

### Conventions

- Base URL: `/api`
- Auth: Bearer access token unless marked Public
- Idempotency: required for payment/webhook writes via header `Idempotency-Key`

---

### Phase 1 – Core MVP

#### Auth

- POST `/auth/register` (Public) – Register user and send verification email
- POST `/auth/login` (Public) – Login with email/password
- POST `/auth/refresh-token` (Public) – Exchange refresh token
- GET `/auth/verify-email/:token` (Public) – Verify email
- POST `/auth/forgot-password` (Public) – Send reset link
- POST `/auth/reset-password/:token` (Public) – Reset password
- POST `/auth/change-password` – Change password (requires `protect`)

#### Users

- GET `/users/me` – Get my profile
- PATCH `/users/me` – Update my profile (name, phone, avatarUrl, timezone, language)

#### Wallets

- POST `/wallets` – Create wallet (type, name, currency)
- GET `/wallets` – List my wallets
- GET `/wallets/:walletId` – Wallet detail & balance
- PATCH `/wallets/:walletId` – Update wallet
- DELETE `/wallets/:walletId` – Archive/delete wallet (soft delete recommended)

#### Categories

- GET `/categories/system` (Public) – List system categories
- GET `/categories` – List my categories
- POST `/categories` – Create my category
- PATCH `/categories/:categoryId` – Update my category
- DELETE `/categories/:categoryId` – Delete my category

#### Transactions

- POST `/transactions` – Create transaction (expense/income/transfer)
- GET `/transactions` – List/filter by date range, category, wallet, type; pagination
- GET `/transactions/:id` – Detail
- PATCH `/transactions/:id` – Update
- DELETE `/transactions/:id` – Delete

#### Budgets

- POST `/budgets` – Create budget (period, category, amount)
- GET `/budgets` – List/filter budgets (period)
- GET `/budgets/:id` – Detail
- PATCH `/budgets/:id` – Update
- DELETE `/budgets/:id` – Delete
- GET `/budgets/status` – Aggregated status (spent vs budget per category)

#### Saving Goals

- POST `/goals` – Create saving goal (targetAmount, deadline)
- GET `/goals` – List
- GET `/goals/:id` – Detail
- PATCH `/goals/:id` – Update
- DELETE `/goals/:id` – Delete

#### AI (basic)

- POST `/ai/parse-expense` – Parse natural language to transaction draft
- POST `/ai/qa` – Q&A over user data (grounded summaries)

#### Notifications (basic)

- GET `/notifications` – List my notifications
- PATCH `/notifications/:id/read` – Mark as read

#### Reports (basic)

- GET `/reports/spend-by-category` – Aggregated spend for a period
- GET `/reports/monthly-trend` – Spend trend by month

---

### Phase 2 – Subscription, Sync, Payments

#### Subscriptions & Plans

- GET `/plans` (Public) – List plans (Free/Premium, limits)
- POST `/subscriptions` – Subscribe/start trial (creates pending until payment confirmed)
- GET `/subscriptions/me` – My subscription status & usage

#### Payments

- POST `/payments/intents` – Create payment intent (plan, amount) [Idempotent]
- GET `/payments/:id` – Payment status
- POST `/payments/webhooks/:provider` (Public) – Webhook receiver (MoMo/ZaloPay/VNPay) [Verify signature]
- POST `/payments/:id/refund` – Request refund (Admin/Support)

#### Data Sync

- POST `/sync/jobs` – Create manual sync job (source, params)
- GET `/sync/jobs` – List my sync jobs
- GET `/sync/jobs/:id` – Job status/detail
- POST `/sync/webhooks/:source` (Public) – Ingest webhook payload [Verify signature]
- POST `/sync/import/csv` – Upload/import CSV (multipart)

#### Notifications (multi-channel)

- GET `/notifications/preferences` – Get my preferences
- PATCH `/notifications/preferences` – Update preferences

#### Admin & Reporting

- GET `/admin/users` (Admin) – List users, filters
- GET `/admin/users/:id` (Admin) – Detail
- PATCH `/admin/users/:id` (Admin) – Update status (enable/disable)
- GET `/admin/metrics/subscriptions` (Admin) – Users by plan, MRR
- GET `/admin/metrics/transactions` (Admin) – Transaction volume, sync errors

---

### Phase 3 – AI Advanced & Personalization

#### AI Insights

- GET `/ai/insights/anomalies` – Anomalous spend detection
- GET `/ai/insights/forecast` – Next-month forecast
- POST `/ai/insights/recommendations/budget` – Personalized budget suggestions
- POST `/ai/insights/recommendations/goals` – Personalized saving goals
- POST `/ai/auto-categorize` – Batch auto-categorization for uncategorized transactions

#### AI Ops & Guardrails

- POST `/ai/feedback` – User feedback on AI outputs (improves models)
- GET `/ai/explanations/:id` – Retrieve explanation/citations for an AI response

#### Performance & Scale

- GET `/reports/spend-realtime` – Cached/streamed aggregates for dashboards

---

### Cross-cutting

- Rate limiting: `/auth/*`, `/ai/*`, `/payments/*` with stricter limits
- Quotas: middleware checks for plan limits (wallet count, transactions/month, AI calls/day)
- Audit logs: write entries for auth, payments, sync, admin actions
- Pagination: standard `page`, `limit`, `cursor` for large lists
- Sorting/filtering: allow `sort`, `order`, and filter params on list endpoints

---

### OpenAPI/Docs

- Maintain `/docs/openapi.json` and `/docs` (Swagger UI) per phase
- Provide Postman collection exports per phase
