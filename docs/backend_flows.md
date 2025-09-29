# Tai lieu kien truc backend - He thong quan ly chi tieu AI

## 1. Danh gia yeu cau nghiep vu
- Yeu cau hop ly, khong co xung dot lon; he thong co the van hanh thu cong neu chua co API lien ket vi.
- Chua ro ho tro nhieu tien te va ty gia khi dong bo tu cac nguon khac nhau -> can lam ro som.
- Thieu quy trinh KYC/xac minh email hoac sdt truoc khi cho phep lien ket vi ngoai; nen bo sung cho goi cao cap.
- Dieu kien canh bao ngan sach, muc tieu: can quy dinh lich tinh (cron) va cach cache du lieu thong ke de tranh query nang.
- Quota goi AI, so vi, so giao dich chua co mo ta reset dinh ky -> can them event thong bao sap het quota.

## 2. Kien truc tong the
- De xuat Modular Monolith voi cac layer ro rang (Controller -> Validation -> Service -> Repository -> Event) de de dang tach microservice sau nay.
- Danh sach module backend:
  - API Gateway / HTTP Layer: Express, middleware auth, logging, rate limit, error handler.
  - Auth & User Service: dang ky/dang nhap, refresh token, RBAC, quan ly ho so.
  - Wallet & Transaction Service: CRUD vi, quan ly so du, xu ly giao dich thu cong va dong bo.
  - Category & Classification Service: danh muc he thong + tu tao, mapping AI, quan ly goi y.
  - Budget & Goal Service: ngan sach, saving goal, tinh toan muc tieu, trigger canh bao.
  - Subscription & Billing Service: quan ly plan, subscription, quota, lifecycle.
  - Payment Service: tao payment intent, xu ly webhook MoMo/ZaloPay/VNPay/Stripe, doi soat.
  - AI Orchestrator Service: chat, phan tich, tao insight, ghi audit log.
  - Notification Service: queue gui email/push/in-app, scheduler, retry.
  - Integration Sync Service: ket noi bank/e-wallet, scheduler, webhook listener, normalizer.
  - Reporting & Analytics Service: tong hop du lieu OLAP, cung cap API bao cao cho admin.
  - Admin Service: REST cho quan tri user, plan, bao cao.
  - Shared: Audit log, Quota, Feature flag, Config, Outbox.
- Event-driven: su dung message queue (BullMQ/Redis hoac RabbitMQ) de xu ly cac cong viec can thiet bi dong bo nhu email, thong bao, dong bo provider.

## 3. Flow REST cho cac use case chinh

### 3.1 Dang ky user va tao vi mac dinh
1. **Request**: `POST /api/v1/auth/register` body: email, password, fullName, optional phone.
2. **Validation**: Joi/Zod check dinh dang, email chua ton tai, mat khau dat chuan.
3. **Service** `authService.register`:
   - Hash password, tao user voi trang thai `pending`.
   - Tao token xac minh (neu can) va ghi audit `user_register_requested`.
4. **Repository**: UserModel.create, TokenModel.create.
5. **Event/Job**: day job `user.send_welcome_email`; day job `wallet.create_default` tao vi mac dinh (walletType=cash, isLinked=false, balance=0).
6. **Response**: 201 + thong tin user, token truy cap hoac thong bao xac minh.
7. **Auth/RBAC**: user mac dinh role `user`; admin duoc set bang admin portal.

### 3.2 Dang nhap va refresh token
1. `POST /api/v1/auth/login` -> validate tai khoan.
2. Service kiem tra mat khau, trang thai `isActive`, subscription (neu het han -> thong bao).
3. Tra ve access token (JWT) + refresh token; luu refresh vao Redis voi TTL; log audit `user_login_success`.

### 3.3 Tao vi moi / lien ket provider
1. **Request**: `POST /api/v1/wallets` (body: walletName, walletType, provider?, alias?, currency?).
2. **Auth/RBAC**: middleware xac thuc user; kiem tra role (user/premium) va han muc theo subscription.
3. **Validation**: Joi/Zod kiem tra quota so vi, walletType hop le, alias/chung minh ten khong trung, currency thuoc danh sach ho tro, provider nam trong danh sach cho phep.
4. **Service** `walletService.create`:
   - Bat dau Mongo session de dam bao atom.
   - Set gia tri mac dinh (`isLinked=false`, `connectionStatus='disconnected'`, `balance=0`) neu khong co provider.
   - Neu `provider` duoc gui: tao/stub `IntegrationConnection` (status=`pending`, luu scope, metadata) de theo doi qua trinh lien ket.
   - Ghi `AuditLog` voi hanh dong `wallet_create_requested`.
5. **Repository**: insert Wallet (va IntegrationConnection neu co) trong session; cap nhat `QuotaUsage.walletsCount`.
6. **Event/Job**: day job `integration.init_connection` voi walletId + provider (async) -> worker lo OAuth/huong dan user; neu async fail -> cap nhat `connectionStatus='error'` + thong bao.
7. **Response**: 201 -> wallet detail (bao gom trang thai ket noi) + message huong dan (neu lien ket).
8. **Notification (optional)**: neu vuot muc 80% so vi -> day event `notification.quota_warning`.

### 3.4 Them giao dich thu cong + ho tro AI
1. `POST /api/v1/transactions` voi walletId, type, amount, occurredAt...
2. Validation: wallet thuoc user, amount >0, so du du (neu cash).
3. Service: TransactionService.create -> check quota, bat dau session Mongo -> cap nhat wallet balance.
4. Repository: Transaction.create, Wallet.updateOne (session).
5. Event: push `budget.recalculate`, `goal.recalculate`, `report.transaction_aggregated`.
6. Response: transaction + balance moi.
7. Chatbot flow: `POST /api/v1/ai/transactions/parse` -> AI parse (async synchronous HTTP) -> tra ve draft + confidence -> neu su dung -> goi endpoint tao giao dich nhu tren.

### 3.5 Dong bo giao dich tu bank/e-wallet (optional)
1. User bam `POST /api/v1/wallets/{id}/sync` hoac scheduler call -> tra 202 + jobId.
2. Worker `syncWalletJob` lay credential, goi API provider, chuyen doi schema.
3. Upsert transaction (su dung hash duplicate: providerId + amount + occurredAt) -> set `inputMethod=auto_sync`.
4. Cap nhat Wallet balance neu provider gui.
5. Ghi `sync_log` (status, recordsProcessed, errorMessage).
6. Day event `notification.sync_result` neu loi -> Notification Service gui canh bao.

### 3.6 Phan loai chi tieu va mapping danh muc
1. Khi transaction tao, CategoryService.resolve duoc goi:
   - Check mapping user (`UserExpenseCategory.normalizedName`).
   - Neu khong co -> AI goi y -> tao ban ghi `needsConfirmation=true`.
2. Tra ve transaction co flag `needsCategoryConfirmation` cho UI.
3. User xac nhan: `POST /api/v1/categories/suggestions/{id}/confirm` -> cap nhat mapping, audit log `category_confirmed`.
4. Event: `analytics.category_usage` cap nhat thong ke.

### 3.7 Tao ngan sach va canh bao
1. `POST /api/v1/budgets` -> validate period, khong trung lap.
2. BudgetService tao record, schedule job `budget.evaluate` (BullMQ cron hang ngay/1h).
3. Worker aggregate Transaction -> update `spentAmount`, `status` (normal/warning/exceeded).
4. Neu warning/exceeded -> emit `notification.budget_alert` -> Notification Service gui email/push/in-app.
5. Response: budget detail + status ban dau.

### 3.8 Saving goal va dong gop
1. `POST /api/v1/saving-goals` -> validate deadline, priority.
2. Dong gop: `POST /api/v1/saving-goals/{id}/contributions` -> luu `SavingGoalContribution`, cap nhat `currentAmount` (session) -> log event `goal.contribution_added`.
3. Worker `goal.evaluate` chay hang ngay -> check progress, phat canh bao neu cham.

### 3.9 Subscription billing va thanh toan gateway
1. User chon plan: `POST /api/v1/subscriptions/checkout` -> Service tao `PaymentIntent` (status=initialized), tao subscription `pending`.
2. Service goi provider -> nhan `payUrl` -> tra 202 + redirectUrl.
3. Provider goi webhook `POST /api/v1/payments/webhook/{provider}` -> verify signature -> queue job `payment.webhook`.
4. Worker:
   - Tim PaymentIntent/Payment by requestId.
   - Cap nhat trang thai Payment, ghi statusHistory + webhookLogs.
   - Neu thanh cong -> `subscriptionService.changeStatus` -> set active, set endDate, cap nhat quota (`QuotaUsage.resetMonthly`).
   - Emit `notification.subscription_active` va `audit.subscription_updated`.
5. Cron `payment.reconcile` (moi 15 phut) -> check payment pending qua han -> mark failed + thong bao user.
6. Auto renew: cron truoc 3 ngay -> tao PaymentIntent moi, gui thong bao.

### 3.10 AI chat va goi y insight
1. `POST /api/v1/ai/chat` (conversationId, question).
2. Validation: check quota AI, rate limit per user.
3. Service: AIOrchestrator -> gom context (aggregate chi tieu, budget, goal) -> call LLM (OpenAI/Grok) -> nhan ket qua.
4. Ghi AuditLog (prompt, response, latency) va push event `recommendation.upsert` neu co de xuat hanh dong.
5. Response: answer + id recommendation neu co.
6. Recommendation worker: tao record `Recommendation`, day thong bao, co the tao task follow-up.

### 3.11 Notification pipeline
1. Bat ky module phat event `notification.enqueue` voi: userId, templateKey, channel, data, priority.
2. Notification worker lay template, render noi dung, goi provider (SendGrid/SES, Firebase, in-app socket).
3. Cap nhat `Notification` doc -> them `deliveryAttempts`, dat `deliveryStatus`.
4. Neu that bai -> retry 3 lan, sau do set failed va thong bao admin qua Slack webhook.

### 3.12 Admin giam sat
1. Admin login `POST /api/v1/admin/auth/login` (yeu cau role=admin, nen co 2FA).
2. Dashboard `GET /api/v1/admin/metrics/overview` lay du lieu tu Reporting service (cache Redis 5 phut).
3. Quan ly subscription plan `POST/PUT /api/v1/admin/plans` -> thong qua service -> invalidate cache.
4. Theo doi log dong bo `GET /api/v1/admin/sync-logs` -> co filter thoi gian, status.

## 4. Quan he giua cac service
- Auth Service phat event cho Wallet Service tao vi mac dinh; cap token cho Notification Service gui email.
- Wallet/Transaction Service phat event cho Budget, Goal, Reporting de xu ly async -> giam coupling.
- Payment Service goi Subscription Service (sync) va Notification Service (async) moi khi co bien dong.
- AI Service chi doc du lieu tu cac service khac (read model) va ghi Audit, Recommendation -> dam bao an toan.
- Integration Service tro thanh producer chinh cua transaction tu dong, su dung Outbox de retry khi loi.
- Notification Service la consumer cho cac topic: budget_alert, subscription_active, sync_result, ai_recommendation.

## 5. Go i y cai tien
- Ap dung Outbox + Change Data Capture cho cac su kien quan trong (payment, sync) de tranh mat su kien.
- Su dung Redis cache cho thong ke muc do cao (chi tieu theo danh muc, tong so du) refresh 15 phut.
- Trien khai feature flag de bat/tat lien ket banking theo tung khu vuc.
- Bo sung rate limit va bot detection (reCAPTCHA/Turnstile) cho endpoint auth va payment.
- Lap ke hoach data retention: luu transaction chi tiet 36 thang, archive sang S3 + parquet sau do.
- Tich hop OpenTelemetry + Prometheus/Grafana de giam sat hieu nang, ty le loi.
- Khi luu luong lon, tach Payment, Notification, Integration, AI thanh microservice rieng co autoscale.

## 6. Bao mat va RBAC
- Su dung JWT + refresh token quay vong; luu refresh trong Redis, ho tro dang xuat tat ca thiet bi.
- BBAC (role-based) + ABAC don gian: role user, premium, admin; check plan khi truy cap chuc nang nang cao.
- Bat buoc 2FA cho admin; log day du IP + user-agent vao AuditLog.
- Ma hoa truong nhay cam (credentialsEncrypted, refreshTokenEncrypted) bang KMS/HashiCorp Vault.

## 7. Tach tac vu sync/async
- Sync: cac API CRUD (user, wallet, giao dich thu cong, budget) phan hoi ngay.
- Async: dong bo provider, gui email/push, xu ly webhook thanh toan, chay AI dang tran, tinh toan bao cao.
- Queue de xuat: BullMQ (Redis) cho job vua va nho, RabbitMQ/ Kafka neu can luong lon.
- Dead letter queue de xu ly job loi, kem alert Slack/Email cho devops.

## 8. De xuat cong nghe
- Redis Cluster cho cache, session, queue BullMQ.
- RabbitMQ hoac Kafka cho event streaming neu tich hop ben thu ba.
- ClickHouse hoac BigQuery lam kho du lieu phan tich.
- ElasticSearch ho tro tim kiem giao dich tu do.
- Keycloak hoac AWS Cognito neu muon tach auth thanh dich vu rieng.

@2025 Backend Architecture Notes