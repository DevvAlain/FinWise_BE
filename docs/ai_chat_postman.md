# AI Chat Postman Snippets

Environment gợi ý:

```json
{
  "base_url": "http://localhost:8080",
  "user_access_token": "<JWT-user>",
  "conversation_id": ""
}
```

## 1. Gửi câu hỏi

- **Method**: `POST`
- **URL**: `{{base_url}}/api/v1/ai/chat`
- **Headers**:
  - `Authorization: Bearer {{user_access_token}}`
  - `Content-Type: application/json`
- **Body**:

```json
{
  "conversationId": "{{conversation_id}}",
  "question": "Tình hình chi tiêu tháng này thế nào? Tôi có vượt ngân sách ăn uống không?"
}
```

Nếu muốn khởi tạo hội thoại mới, để trống `conversationId` hoặc bỏ khỏi payload. Response sẽ trả `conversationId` mới, dùng cho lần gọi tiếp theo.

### Response mẫu

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "conversationId": "4f8c12e0d6554fb2a3dd6d6e0ad42c91",
    "answer": "Trong 30 ngày qua bạn đã chi 5.200.000đ ...",
    "confidence": 0.78,
    "recommendations": [
      "Xem lại ngân sách Ăn uống, hiện đã dùng 85% limit.",
      "Cắt giảm 10% chi tiêu giải trí tuần tới."
    ],
    "visualizations": [
      "Biểu đồ cột: Chi tiêu theo danh mục 30 ngày"
    ],
    "followUpQuestions": [
      "Tôi nên giảm chi ở khoản nào để vẫn đạt mục tiêu tiết kiệm?",
      "So sánh chi tiêu ăn uống tháng này với tháng trước?"
    ],
    "relatedFeatures": [
      "budgets.list",
      "reports.spendByCategory"
    ],
    "disclaimers": [
      "Thông tin chỉ mang tính tham khảo, không phải là tư vấn tài chính chuyên nghiệp."
    ],
    "intent": "budgeting",
    "model": "openai/gpt-4o-mini",
    "usage": {
      "monthlyLimit": 50,
      "used": 12,
      "warnings": [
        "Bạn sắp đạt giới hạn lượt AI cho chu kỳ hiện tại. Hãy cân nhắc sử dụng hợp lý."
      ]
    },
    "metadata": {
      "intentConfidence": 0.75,
      "complexity": "medium",
      "latencyMs": 2150
    }
  }
}
```

## 2. Kiểm tra quota (tham khảo)

Response ở trên trả về `usage.used`, `usage.monthlyLimit`, `warnings`. Nếu `warnings` không rỗng, hiển thị cảnh báo cho người dùng.

## 3. Lưu ý

- Nếu request trả 429 kèm thông điệp “Đã vượt giới hạn lượt AI”, người dùng đã hết quota tháng hiện tại.
- Trường `conversationId` giúp hệ thống nhớ lịch sử. Có thể reset bằng cách bỏ trường này hoặc dùng ID mới.
- Hãy log `intent`, `model`, `confidence` ở frontend nếu cần phân tích hành vi người dùng.***
