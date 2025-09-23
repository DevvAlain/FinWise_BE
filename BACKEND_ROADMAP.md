## Backend Roadmap – Personal Finance Management (AI-assisted)

### Scope

- REST API for: Auth, Users, Wallets, Transactions, Categories, Budgets, Saving Goals, AI Assistant, Subscriptions, Payments, Notifications, Sync Logs, Reports.
- Security, observability, and CI/CD ready. All secrets via environment variables.

### Architecture (high level)

- Node.js (Express/NestJS-style structure on Express), MongoDB (OLTP), Redis (cache/queue later), Webhooks for payments/sync.
- Services: `auth`, `user`, `wallet`, `transaction`, `category`, `budget-goal`, `subscription`, `payment`, `notification`, `sync`, `ai-orchestrator`, `report`.
- Tokens: JWT access/refresh; RBAC-ready (optional field `role`).

---

### Phase 1 – Core MVP (6–8 weeks)

Deliver core CRUD, budgeting, and basic insights.

- Auth & Users
  - Email/password auth, refresh token, change/forgot/reset password, email verification.
  - Model fields: email, passwordHash, fullName, phone, avatarUrl, timezone, language, isActive, lastLoginAt.
- Wallets & Transactions
  - Wallet CRUD (bank/e-wallet/cash/credit); currency per wallet.
  - Manual transaction CRUD (expense/income/transfer), balance recomputation, pagination.
- Categories
  - System categories + user-defined; attach to transactions.
- Budgets & Saving Goals
  - Budget per category per period (month baseline). Basic alerts when approaching/exceeding.
  - Saving goals CRUD (target amount, deadline) with progress.
- AI (basic)
  - Endpoint to parse free-text expense from chat → create transaction.
  - Q&A over user’s own data (simple summaries), grounded on DB.
- Notifications (basic)
  - Email via provider; events: budget exceed, password reset, verification.
- Admin
  - Basic user listing, category templates, health endpoints.
- Reporting (basic)
  - Monthly spend by category, trend lines.

Deliverables

- Stable REST endpoints, OpenAPI spec (YAML/JSON), seed data for categories, Postman collection.
- Unit tests for critical paths (auth, transactions), integration for budgets.

---

### Phase 2 – Subscription, Sync, Payments (8–10 weeks)

Monetization and semi-automation.

- Subscription & Plans
  - Plans: Free, Premium with limits (wallets, transactions/month, AI calls/day).
  - Quotas enforcement middleware, usage counters.
- Payments
  - Integrate MoMo, ZaloPay, VNPay, cards (via provider). Webhooks: verify signatures, idempotency keys.
  - Payment intents, statuses: pending, completed, failed, refunded. Store raw gateway payloads.
- Data Sync
  - CSV import, partner webhook ingestion, scheduled sync jobs.
  - Sync logs: mode (manual/scheduled/webhook), status (success/partial/failed), error details.
- Notifications (multi-channel)
  - In-app notifications, email improvements; reminders for subscription renewal, sync failures.
- Admin & Reporting
  - Users by plan, MRR/Revenue, gateway error dashboards, transaction volume trends.

Deliverables

- Webhook endpoints + verification, reconciliation jobs, quota middleware, expanded tests.

---

### Phase 3 – AI Advanced & Personalization (8–12 weeks)

Smarter insights and automation.

- AI Insights
  - Anomaly detection on spending, month-ahead forecast, category auto-classification (rule + ML).
  - Personalized budget/goal recommendations, saving tips based on habits.
- AI Ops & Guardrails
  - RAG over user transactions; answers include citations, safe prompts, feedback loop.
- Performance & Scale
  - Read replicas or caching for heavy reports; materialized aggregates.

Deliverables

- AI orchestrator service, feature flags for gradual rollout, evaluation harness for AI outputs.

---

### Recommended Tech Stack

- Runtime: Node.js LTS, TypeScript (gradual adoption), Express.
- DB: MongoDB; indexing on userId/date/category/amount; transactions collection time-series friendly.
- Messaging/Cache: Redis (later Kafka/RabbitMQ if needed).
- Email: Nodemailer/SMTP; provider swappable via env.
- Payments: MoMo, ZaloPay, VNPay; card processor if needed.
- Auth: JWT (HS256), bcrypt; rate limiting, CORS, helmet.
- Observability: Winston/Pino logs, OpenTelemetry traces, Prometheus metrics; ELK/OpenSearch.
- CI/CD: GitHub Actions, Docker; secrets via env files or Vault; IaC optional.

---

### API Surface (high-level checklist)

- Auth: register, login, refresh, verify email, forgot/reset, change password.
- Users: me/get/update; admin list/detail/disable.
- Wallets: CRUD, balances, list by user.
- Transactions: CRUD, list with filters (date range, category, wallet), import CSV.
- Categories: system list, user CRUD, attach to transactions.
- Budgets: CRUD per period/category, status query, alerts.
- Saving Goals: CRUD, progress.
- AI: parse expense from chat, Q&A, suggestions.
- Subscriptions: plans, subscribe, usage, limits.
- Payments: create intent, callback/webhook, status, refunds.
- Notifications: list, mark read; admin templates.
- Sync: create job, webhook receive, status/logs.
- Reports: spend by category/month, trends.

---

### Data Model (indicative)

- user, wallet, transaction, expense_category, budget, user_expense_category, subscription_plan, subscription, payment, notification, sync_log, recommendation.

Indexes

- `transaction`: userId, date, categoryId, walletId, amount.
- `budget`: userId, period (year-month), categoryId.
- `wallet`: userId, type.

---

### Security & Compliance

- All secrets via environment variables; never hardcode keys/URLs.
- JWT rotation, refresh token TTL, revoke on password change.
- Input validation (Joi/Zod), centralized error handling.
- Idempotency for webhooks and payment/transaction writes.

---

### Risks & Mitigations

- Payment/webhook flakiness → retries, backoff, idempotency keys, reconciliation.
- AI hallucinations → RAG, citations, allow user corrections, eval set.
- Cost growth (AI) → caching, quotas by plan, tiered models.
- Performance on analytics → pre-aggregations, dedicated reporting queries, caching.
- Data sensitivity → TLS, field-level encryption where needed, audit trails, RBAC (optional `role`).

---

### Milestones & Definition of Done

- Phase 1 DoD: Auth stable, manual transactions, budgets, basic reports, email notifications, 80% unit test coverage for core services.
- Phase 2 DoD: Payments live with webhooks + reconciliation, quotas enforced, sync jobs/logs, admin dashboards.
- Phase 3 DoD: AI insights GA with guardrails, auto-categorization ≥90% precision on top categories, scalable reporting.

---

### Environment Variables (sample)

- JWT_SECRET, JWT_REFRESH_SECRET, EMAIL_SERVICE, EMAIL_USER, EMAIL_PASSWORD
- MONGODB*URI, REDIS_URL (later), PAYMENT*\* (MoMo/ZaloPay/VNPay keys), APP_BASE_URL
