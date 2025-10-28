# Mobile API Integration Spec — FinWise Backend

Mục tiêu: tệp này tập hợp tất cả API cần thiết cho mobile devs để tích hợp tính năng đăng ký, thanh toán, hiển thị subscription, giao dịch, ví, AI và cảnh báo ngân sách. Bao gồm: endpoint, method, authentication, ví dụ request/response, và lưu ý về khác biệt Free vs Paid.

## Authentication

- POST /api/v1/auth/login
  - Body: { "email": "user@example.com", "password": "secret" }
  - Response: { "success": true, "token": "<JWT>", "refreshToken": "<token>" }
  - Notes: Use Authorization: Bearer <JWT> for protected endpoints.

- POST /api/v1/auth/register
  - Body: { "email", "password", "username" }
  - Response: { "success": true, "user": { ... } }

- POST /api/v1/auth/refresh-token
  - Body: { "refreshToken": "..." }
  - Response: { "token": "<new JWT>", "refreshToken": "<new>" }

- Email verification / password reset endpoints exist as: `/api/v1/auth/verify-email/:token`, `/api/v1/auth/forgot-password`, `/api/v1/auth/reset-password/:token`.

## User profile

- GET /api/v1/users/me
  - Auth required
  - Response: { success: true, user: { \_id, email, fullName, plan?, ... } }

- PATCH /api/v1/users/me
  - Auth required; multipart/form-data allowed (avatar/image)
  - Use to update display name, avatar, preferences.

## Wallets

- POST /api/v1/wallets (create)
  - Auth, obey plan `maxWallets` quota
  - Body: { name, currency, initialBalance? }
  - Response: 201 { wallet }

- GET /api/v1/wallets (list)
  - Auth
  - Response: { wallets: [...] }

- GET /api/v1/wallets/:walletId
  - Auth

- PATCH /api/v1/wallets/:walletId
  - Auth

- DELETE /api/v1/wallets/:walletId
  - Auth

- POST /api/v1/wallets/:walletId/sync (manual sync)
  - Auth

## Categories

- GET /api/v1/categories/system (public list)
- GET /api/v1/categories (user's categories)
- POST /api/v1/categories (create user category)
- PATCH /api/v1/categories/:categoryId
- DELETE /api/v1/categories/:categoryId
- GET /api/v1/categories/suggestions (AI suggestions)
- POST /api/v1/categories/suggestions/:suggestionId/confirm
- POST /api/v1/categories/suggestions/:suggestionId/reject

Notes: server uses upsert / safe-create for user category mappings to avoid duplicate-key races (no extra client handling required).

## Transactions

- POST /api/v1/transactions
  - Auth, enforces `maxMonthlyTransactions` quota via middleware
  - Body example: { amount: 50000, currency: "VND", walletId: "...", categoryId: "...", note: "Taxi", date: "2025-10-26" }
  - Special: if created via AI flows, use field `inputMethod: 'ai_assisted'` to trigger email notifications and event handling.

- GET /api/v1/transactions (list, with filters)
- GET /api/v1/transactions/:id
- PATCH /api/v1/transactions/:id
- DELETE /api/v1/transactions/:id

## AI endpoints

- POST /api/v1/ai/chat
  - Auth; rate limited; returns AI chat response and may publish `recommendation.generated` events.

- POST /api/v1/ai/parse-expense
  - Auth; parse natural-language expense to a draft transaction.

- POST /api/v1/ai/transactions/parse
  - Auth; parse into transaction draft specifically for transactions flows.

- POST /api/v1/ai/transactions/create-with-wallet
  - Auth; creates transaction with explicit wallet selection (useful for mobile UX flows where user picks wallet after parsing)

Notes: AI usage is subject to plan quota (`aiRecommendationsLimit`). Mobile should surface warnings or disabled AI features when quota exhausted (backend returns usage info in AI responses).

## Budgets

- POST /api/v1/budgets (create) — enforces `maxBudgets` quota
- GET /api/v1/budgets
- GET /api/v1/budgets/:id
- PATCH /api/v1/budgets/:id
- DELETE /api/v1/budgets/:id
- GET /api/v1/budgets/analytics (aggregated data for mobile)
- GET /api/v1/budgets/recommendations (AI powered recommendations)
- GET /api/v1/budgets/recommendations/schema (returns docs for mobile payload)

## Saving Goals

- POST /api/v1/saving-goals (enforces `maxSavingGoals`)
- GET /api/v1/saving-goals
- POST /api/v1/saving-goals/:id/contributions
- GET /api/v1/saving-goals/:id

## Notifications (in-app list)

- GET /api/v1/notifications
- PATCH /api/v1/notifications/:id/read

Note: in-app notifications are separate from emails. The backend now sends important events (subscription activation, AI recommendations, AI-created transactions, budget alerts) by email as well.

## Subscription & Billing (mobile checkout flow)

- POST /api/v1/subscriptions/checkout
  - Auth. Start a checkout session; backend returns provider URL or client token depending on integration.
  - Body: { planId, billingPeriod: 'monthly'|'yearly', paymentMethod?: ... }

- POST /api/v1/subscriptions/checkout/complete
  - Auth. Called by mobile after completing the external checkout to confirm details. Backend finalizes subscription, creates `Subscription` (status 'active'), resets quota, publishes `subscription.activated`.

- POST /api/v1/subscriptions/checkout/cancel
  - Auth. Optionally cancel an in-progress checkout.

- GET /api/v1/subscriptions/active
  - Auth. Returns the user's currently active subscription (populated plan) or null.
  - This endpoint is provided for mobile to poll after a payment flow completes.

### Recommended mobile checkout sequence

1. Mobile requests `POST /api/v1/subscriptions/checkout` with desired plan. Backend returns checkout URL / client token.
2. Mobile opens webview or external payment UI for provider (PayOS).
3. Provider redirects back to mobile (deep link) OR mobile calls `POST /api/v1/subscriptions/checkout/complete` to inform backend it finished (depending on integration).
4. Mobile polls `GET /api/v1/subscriptions/active` every 2–5s up to ~60s (or until a success response) to detect `status: 'active'`.
5. Backend also publishes `subscription.activated` domain event which triggers an email to the user. If you have push notification support, you can implement an event-to-push bridge server-side.

Notes about webhooks: backend also supports webhook processing (server-to-server); webhook processing will create the Subscription and publish the same `subscription.activated` event as the checkout.complete flow.

## Payments / Webhooks (server side only)

- PayOS integration handled by server. Mobile does not need to call webhooks directly. After payment provider notifies backend and backend verifies payment, subscription is activated.

## Events that cause emails to be sent (so mobile UX can inform users)

- `subscription.activated` — email: "Gói dịch vụ đã được kích hoạt" (sent when subscription active).
- `recommendation.generated` — email: "Gợi ý tiết kiệm mới từ AI" (sent when AI generates recommendations).
- `transaction.created` with `inputMethod === 'ai_assisted'` — email: transaction created by AI.
- `budget.threshold_reached` — budget alert email.
- `payment.verified` / `payment.failed` / `payment.refunded` — payment emails.

Mobile UX tip: after checkout, show a friendly "Checking subscription activation..." screen while polling `GET /api/v1/subscriptions/active` and fall back to informing user to check email if not active.

## Error handling & status codes (general guidance)

- 401 Unauthorized: missing/invalid JWT
- 403 Forbidden: action not permitted (e.g., admin only)
- 429 Too Many Requests: rate limiting on AI endpoints
- 422 Validation error: invalid input payload
- 500 Internal Server Error: server-side error

When plan quota is reached, AI endpoints will return data with `usage` object (monthlyLimit, used) and warnings — mobile should show quota-exhausted UI and optionally show an upgrade CTA.

## Free vs Paid (concrete differences)

Based on `src/models/subscription_plan.js`, main differentiators are:

- aiRecommendationsLimit: number of AI recommendations allowed (per month)
  - Free: low default (e.g., 50)
  - Paid: higher limit or unlimited

- maxWallets
  - Free: default 3
  - Paid: higher (example 10)

- maxMonthlyTransactions
  - Free: default 1000
  - Paid: larger or unlimited

- maxBudgets
  - Free: default 10
  - Paid: higher

- maxSavingGoals
  - Free: default 5
  - Paid: higher

- features (array of strings)
  - Paid may include flags like: 'ai', 'priority-support', 'export-csv', 'multi-currency', etc. (Check admin Plan records for exact flags.)

Mobile should implement feature gating client-side based on the plan object returned by `/api/v1/subscriptions/active` and `GET /api/v1/users/me` (user may have `plan` or subscription info). Do not rely on client-side enforcement only — backend enforces quotas.

## UX recommendations for mobile devs

- After checkout success, poll `GET /api/v1/subscriptions/active` for up to 60s (2–5s interval). Show a progress UI.
- For AI features, display remaining quota from AI responses and offer an "Upgrade" CTA when approaching limit.
- If transaction created by AI, notify user that it was auto-created and provide an "Undo" or edit action.
- Show clear errors when rate-limited (429) and allow the user to retry after a short backoff.

## Sample requests

Authorization header example:

```
Authorization: Bearer <JWT>
```

Sample poll for active subscription:

```
GET /api/v1/subscriptions/active
Authorization: Bearer <JWT>

200 OK
{
  "success": true,
  "subscription": {
    "_id": "64f...",
    "status": "active",
    "plan": {
      "planName": "Plus",
      "planType": "premium",
      "price": "199000",
      "billingPeriod": "monthly",
      "aiRecommendationsLimit": 500,
      "maxWallets": 10,
      "maxMonthlyTransactions": 50000
    },
    "startedAt": "2025-10-20T08:22:13.000Z",
    "expiresAt": "2025-11-20T08:22:13.000Z"
  }
}
```

## Next steps / checklist for mobile dev

- [ ] Implement auth flows and token refresh
- [ ] Integrate checkout using `POST /api/v1/subscriptions/checkout` + open provider UI
- [ ] Implement poll `GET /api/v1/subscriptions/active` after checkout
- [ ] Hook AI chat UIs to `POST /api/v1/ai/chat` and surface quota info
- [ ] Implement transactions create/edit flows and show undo for AI-assisted auto-create
- [ ] Handle notification list (`/api/v1/notifications`) and provide a link to email content when appropriate (emails are sent server-side)

---

If you want, mình có thể:

- Gửi 1 PR đơn giản thêm file này vào repo (đã làm: file `MOBILE_API_SPEC.md` đã được tạo tại project root).
- Thêm ví dụ response/fields chính xác hơn bằng cách dump một vài record sample nếu bạn cho phép (hoặc cấp test account/token).

Bạn muốn mình tinh chỉnh thêm phần nào trong file (VD: sample payloads chi tiết cho transactions, hoặc flow OAuth/payment provider deep-link mẫu)?
