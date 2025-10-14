# Admin API Postman Snippets

Tài liệu này cung cấp nhanh các request mẫu để bạn copy vào Postman và thử nghiệm những API admin vừa bổ sung. Nhớ đảm bảo tài khoản đăng nhập có `role=admin`.

## Cấu hình chung

- **Base URL**: `{{base_url}}` (vd. `http://localhost:8080`)
- **Header bắt buộc**:
  - `Authorization: Bearer {{admin_access_token}}`
  - `Content-Type: application/json` (cho các request có body)

Bạn có thể tạo Environment trong Postman với 2 biến:

```json
{
  "base_url": "http://localhost:8080",
  "admin_access_token": "<JWT-admin>"
}
```

---

## 1. Dashboard Metrics

- **Method**: `GET`
- **URL**: `{{base_url}}/api/v1/admin/metrics/overview`
- **Body**: _none_

### Ví dụ response mong đợi

```json
{
  "success": true,
  "data": {
    "generatedAt": "2025-10-08T02:35:40.214Z",
    "totals": {
      "users": 1520,
      "activeUsers": 1375,
      "adminUsers": 4,
      "newUsersLast30": 210,
      "wallets": 980,
      "activeBudgets": 415,
      "activeSavingGoals": 312
    },
    "subscriptions": {
      "active": 420,
      "expired": 55,
      "cancelled": 18,
      "pending": 12,
      "total": 505
    },
    "plans": {
      "active": 3,
      "inactive": 1,
      "total": 4
    },
    "transactions": {
      "last30Days": {
        "expense": { "count": 18250, "volume": 3250000000 },
        "income": { "count": 7400, "volume": 4120000000 },
        "transfer": { "count": 890, "volume": 560000000 },
        "totalCount": 26540,
        "totalVolume": 7930000000
      }
    },
    "sync": {
      "last24Hours": {
        "success": 38,
        "partial": 5,
        "failed": 2,
        "total": 45
      }
    }
  }
}
```

---

## 2. Tạo Subscription Plan

- **Method**: `POST`
- **URL**: `{{base_url}}/api/v1/admin/plans`
- **Body (raw / JSON)**:

```json
{
  "planName": "Premium Plus",
  "planType": "premium",
  "price": 199000,
  "currency": "VND",
  "billingPeriod": "monthly",
  "features": [
    "Không giới hạn ví",
    "Gợi ý AI ưu tiên",
    "Cảnh báo chi tiêu real-time"
  ],
  "maxWallets": 10,
  "maxMonthlyTransactions": 5000,
  "aiRecommendationsLimit": 500,
  "maxBudgets": 50,
  "maxSavingGoals": 30,
  "isActive": true
}
```

### Response mẫu

```json
{
  "success": true,
  "statusCode": 201,
  "item": {
    "_id": "652fbd935a0bfa00127b3c12",
    "planName": "Premium Plus",
    "planType": "premium",
    "price": "199000",
    "currency": "VND",
    "billingPeriod": "monthly",
    "features": [
      "Không giới hạn ví",
      "Gợi ý AI ưu tiên",
      "Cảnh báo chi tiêu real-time"
    ],
    "maxWallets": 10,
    "maxMonthlyTransactions": 5000,
    "aiRecommendationsLimit": 500,
    "maxBudgets": 50,
    "maxSavingGoals": 30,
    "isActive": true,
    "createdAt": "2025-10-08T02:38:40.214Z",
    "updatedAt": "2025-10-08T02:38:40.214Z",
    "__v": 0
  }
}
```

---

## 3. Cập nhật Subscription Plan

- **Method**: `PUT`
- **URL**: `{{base_url}}/api/v1/admin/plans/{{planId}}`
  - Thay `{{planId}}` bằng `_id` thực tế (vd. `652fbd935a0bfa00127b3c12`)
- **Body (raw / JSON)**:

```json
{
  "price": 249000,
  "billingPeriod": "monthly",
  "features": [
    "Không giới hạn ví",
    "Gợi ý AI ưu tiên",
    "Cảnh báo chi tiêu real-time",
    "Xuất báo cáo chi tiết"
  ],
  "isActive": true
}
```

### Response mẫu

```json
{
  "success": true,
  "statusCode": 200,
  "item": {
    "_id": "652fbd935a0bfa00127b3c12",
    "planName": "Premium Plus",
    "planType": "premium",
    "price": "249000",
    "currency": "VND",
    "billingPeriod": "monthly",
    "features": [
      "Không giới hạn ví",
      "Gợi ý AI ưu tiên",
      "Cảnh báo chi tiêu real-time",
      "Xuất báo cáo chi tiết"
    ],
    "maxWallets": 10,
    "maxMonthlyTransactions": 5000,
    "aiRecommendationsLimit": 500,
    "maxBudgets": 50,
    "maxSavingGoals": 30,
    "isActive": true,
    "createdAt": "2025-10-08T02:38:40.214Z",
    "updatedAt": "2025-10-08T02:45:02.918Z",
    "__v": 0
  }
}
```

---

## 4. Theo dõi Sync Logs

- **Method**: `GET`
- **URL**: `{{base_url}}/api/v1/admin/sync-logs`
- **Query Params** (có thể dùng params tab trong Postman):
  - `startDate`: `2025-10-01T00:00:00.000Z`
  - `endDate`: `2025-10-07T23:59:59.999Z`
  - `status`: `success,failed`
  - `syncType`: `manual,scheduled`
  - `page`: `1`
  - `limit`: `20`

### Response mẫu

```json
{
  "success": true,
  "statusCode": 200,
  "items": [
    {
      "_id": "652fbf5a5a0bfa00127b3d20",
      "user": {
        "_id": "64ab0c39fb55a100121dea01",
        "email": "quang.tran@example.com",
        "fullName": "Quang Trần"
      },
      "wallet": {
        "_id": "64ab0d02fb55a100121dea25",
        "walletName": "MB Bank",
        "walletType": "bank",
        "provider": "mbbank"
      },
      "syncType": "manual",
      "status": "success",
      "recordsProcessed": 42,
      "recordsAdded": 30,
      "recordsUpdated": 12,
      "startedAt": "2025-10-07T14:22:10.112Z",
      "completedAt": "2025-10-07T14:22:45.029Z",
      "createdAt": "2025-10-07T14:22:45.035Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 11,
    "pages": 1
  }
}
```

Nếu muốn xem nhiều trạng thái hơn, chỉ cần chỉnh `status`, `syncType`, hoặc loại bỏ để lấy full data.

---

## Ghi chú thêm

- Mỗi lần tạo/cập nhật subscription plan, hệ thống sẽ tự hủy cache dashboard (`admin:metrics:overview`). Vì vậy request metrics tiếp theo sẽ lấy dữ liệu mới nhất.
- Nếu chưa cấu hình Redis, cache sẽ tự fallback sang bộ nhớ tạm trong ứng dụng. Điều này không ảnh hưởng tới việc test API nhưng nên cấu hình Redis trước khi triển khai thật.
