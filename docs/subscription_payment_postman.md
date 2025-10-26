# Subscription Billing Postman Snippets

Use the requests below to exercise the subscription checkout flow with PayOS in Postman. Suggested environment variables:

```json
{
  "base_url": "http://localhost:8080",
  "user_access_token": "<JWT-user>",
  "plan_id": "<SubscriptionPlan ObjectId>"
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

### Sample response (202)

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

If an active intent already exists the API returns `200` with the existing checkout link.

---

## 2. Complete Payment via API (no webhook)

- **Method**: `POST`  
- **URL**: `{{base_url}}/api/v1/subscriptions/checkout/complete`  
- **Headers**:
  - `Authorization: Bearer {{user_access_token}}`
  - `Content-Type: application/json`
- **Body**:

```json
{
  "requestId": "0f3c2e6bd7b74cf0bc6717b91d5ef420",
  "status": "success",
  "provider": "payos",
  "providerData": {
    "code": "00",
    "status": "PAID",
    "orderCode": "0f3c2e6bd7b74cf0bc6717b91d5ef420",
    "transactionId": "PAYOS-TXN-987654321",
    "amount": 199000,
    "paidAt": "2025-10-08T03:02:11.000Z"
  }
}
```

- Send `status: "failed"` when PayOS reports an unsuccessful payment.
- Optionally include `signature` if the PayOS return payload contains one; the backend will verify it.

### Sample success response

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Payment status updated",
  "data": {
    "requestId": "0f3c2e6bd7b74cf0bc6717b91d5ef420",
    "paymentStatus": "completed",
    "intentStatus": "succeeded",
    "subscriptionId": "652c1c0d9a0f5e4b7d8c1234"
  }
}
```

### Sample failed response

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Payment status updated",
  "data": {
    "requestId": "0f3c2e6bd7b74cf0bc6717b91d5ef420",
    "paymentStatus": "failed",
    "intentStatus": "failed"
  }
}
```

---

## 3. Cancel Checkout (frontend triggered)

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

Call this when the user cancels the payment on PayOS and returns to the app. The backend marks the intent as `cancelled` and the payment as `failed` immediately.

---

## 4. Reconciliation (manual trigger for tests)

```javascript
import { reconciliationWorker } from '../src/jobs/paymentJobs.js';

reconciliationWorker().then(console.log).catch(console.error);
```

This worker expires stale payment intents and marks related payments as failed when they time out.

---

## 5. Auto-Renewal Test

1. Create a subscription with `autoRenew = true` and an `endDate` within the next few days.  
2. Trigger checkout to create an initial payment intent.  
3. Optionally adjust `endDate` in MongoDB for quicker testing.  
4. Run the worker manually:

```javascript
import { autoRenewalWorker } from '../src/jobs/paymentJobs.js';

autoRenewalWorker().then(console.log).catch(console.error);
```

The worker is also scheduled to run daily at 03:00 (Asia/Ho_Chi_Minh).

---

## Tips

- Keep `PAYMENT_METADATA_SECRET` (or `PAYOS_CHECKSUM_KEY`) safe so metadata encryption and signature verification remain consistent.
- In non-production environments you can skip the signature field, but enabling it is recommended before going live.
- Check the `paymentintents` and `payments` collections to confirm statuses after completing or cancelling a checkout.
