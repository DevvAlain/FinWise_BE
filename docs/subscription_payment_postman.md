# Subscription Billing Postman Snippets

Các request mẫu dưới đây giúp kiểm thử nhanh flow thanh toán subscription (PayOS). Hãy tạo environment trong Postman với các biến:

```json
{
  "base_url": "http://localhost:8080",
  "user_access_token": "<JWT-user>",
  "plan_id": "<ObjectId của SubscriptionPlan>",
  "payos_webhook_secret": "<dùng để mô phỏng signature nếu cần>"
}
```

## 1. Checkout Subscription

- **Method**: `POST`
- **URL**: `{{base_url}}/api/v1/subscriptions/checkout`
- **Headers**:
  - `Authorization: Bearer {{user_access_token}}`
  - `Content-Type: application/json`
- **Body**:

```json
{
  "planId": "{{plan_id}}",
  "returnUrl": "https://finwase.netlify.app/payment/success",
  "cancelUrl": "https://finwase.netlify.app/payment/cancel"
}
```

### Response mẫu (202)

```json
{
  "success": true,
  "statusCode": 202,
  "message": "Payment intent created",
  "data": {
    "requestId": "0f3c2e6bd7b74cf0bc6717b91d5ef420",
    "paymentUrl": "https://pay.payos.vn/payment-link/123456789",
    "expiresAt": "2025-10-08T03:15:24.821Z",
    "expiresIn": 900,
    "provider": "payos",
    "risk": {
      "score": 5,
      "flags": [],
      "allow": true
    }
  }
}
```

Nếu đã có intent đang chờ, response sẽ là `200` với `message: "Existing payment intent found"` và giữ nguyên link cũ.

---

## 2. PayOS Webhook (dev/test)

- **Method**: `POST`
- **URL**: `{{base_url}}/api/v1/payments/webhook/payos`
- **Headers**:
  - `Content-Type: application/json`
  - `X-PayOS-Signature: {{calculated_signature}}` (nếu cần verify thủ công)
  - `X-PayOS-Timestamp: {{timestamp_millis}}`
- **Body**:

```json
{
  "code": "00",
  "desc": "Webhook simulation",
  "data": {
    "orderCode": "0f3c2e6bd7b74cf0bc6717b91d5ef420",
    "transactionId": "PAYOS-TXN-987654321",
    "status": "PAID",
    "amount": 199000,
    "paidAt": "2025-10-08T03:02:11.000Z",
    "currency": "VND"
  }
}
```

> Ghi chú: Trong môi trường thật, PayOS sẽ ký payload bằng `PAYOS_CHECKSUM_KEY`. Để mô phỏng, có thể tự tính chữ ký:

```javascript
const crypto = require('crypto');
const payload = JSON.stringify(body);
const signature = crypto.createHmac('sha256', process.env.PAYOS_CHECKSUM_KEY).update(payload).digest('hex');
```

### Response mẫu

```json
{
  "success": true,
  "duplicate": false
}
```

Webhook sẽ được enqueue và xử lý bất đồng bộ bởi worker `payment-webhook-secure-processor`.

---

## 3. Hủy checkout thủ công (frontend gọi)

- **Method**: `POST`
- **URL**: `{{base_url}}/api/v1/subscriptions/checkout/cancel`
- **Headers**:
  - `Authorization: Bearer {{user_access_token}}`
  - `Content-Type: application/json`
- **Body**:

```json
{
  "requestId": "1760343027231940"
}
```

Sau khi người dùng hủy thanh toán trên PayOS và quay về app, gọi API này với `requestId` (nhận từ checkout) để cập nhật DB ngay: intent = `cancelled`, payment = `failed`.

---

## 4. Reconciliation (manual trigger gợi ý)

Không có endpoint HTTP, nhưng bạn có thể chạy script nhỏ để gọi worker thủ công khi test:

```javascript
import { reconciliationWorker } from '../src/jobs/paymentJobs.js';

reconciliationWorker().then(console.log).catch(console.error);
```

Hoặc dùng MongoDB để kiểm tra:

```mongodb
db.paymentintents.find({ status: "pending", expiresAt: { $lt: ISODate() } })
```

---

## 5. Auto-Renewal Test

- Tạo subscription với `autoRenew = true` và `endDate` trong vòng 2-3 ngày tới.
- Dùng endpoint checkout để tạo thanh toán thử, sau đó chỉnh `endDate` bằng MongoDB nếu cần.
- Worker `subscription-auto-renewal` (03:00 Asia/Ho_Chi_Minh) sẽ tạo intent mới. Bạn có thể gọi tay:

```javascript
import { autoRenewalWorker } from '../src/jobs/paymentJobs.js';

autoRenewalWorker().then(console.log).catch(console.error);
```

---

## Tips

- Đặt `PAYOS_IP_WHITELIST` (CSV) khi deploy để hạn chế nguồn webhook.
- `PAYMENT_METADATA_SECRET` có thể khai báo riêng để mã hóa metadata thay vì dùng `PAYOS_CHECKSUM_KEY`.
- Kiểm tra collection `paymentwebhookevents` để đảm bảo không có event kẹt ở trạng thái `processing` (job recon sẽ tự reset sau 5 phút).
