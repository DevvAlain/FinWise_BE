# 🧪 Test Flow 3.6 - Category Resolution & Confirmation

## Test Cases cho Flow 3.6 Hoàn chỉnh

### 1. **Test Transaction Creation với Category Resolution**

```javascript
// Test Case 1: Transaction với categoryId explicit
POST /api/v1/transactions
{
  "walletId": "67890...",
  "type": "expense",
  "amount": 50000,
  "categoryId": "12345...", // Explicit category
  "occurredAt": "2025-10-01T10:00:00Z",
  "description": "Lunch at restaurant"
}

// Expected Response:
{
  "success": true,
  "statusCode": 201,
  "transaction": {...},
  "balances": [...],
  "categoryId": "12345...",
  "needsCategoryConfirmation": false,
  "categorySuggestion": null,
  "matchedSource": "explicit"
}
```

```javascript
// Test Case 2: Transaction với categoryName cần AI suggestion
POST /api/v1/transactions
{
  "walletId": "67890...",
  "type": "expense",
  "amount": 25000,
  "categoryName": "cafe sua da", // AI sẽ suggest
  "occurredAt": "2025-10-01T11:00:00Z",
  "description": "Coffee with friends"
}

// Expected Response:
{
  "success": true,
  "statusCode": 201,
  "transaction": {...},
  "balances": [...],
  "categoryId": null,
  "needsCategoryConfirmation": true,
  "categorySuggestion": {
    "id": "suggestion123...",
    "name": "cafe sua da",
    "normalizedName": "cafe sua da"
  },
  "matchedSource": null
}

// Expected Events:
// - analytics.category_usage (if matched)
// - category.suggestion_created (if AI suggestion)
```

### 2. **Test Category Suggestions API**

```javascript
// List pending suggestions
GET /api/categories/suggestions

// Expected Response:
{
  "success": true,
  "statusCode": 200,
  "items": [
    {
      "_id": "suggestion123...",
      "customName": "cafe sua da",
      "normalizedName": "cafe sua da",
      "needsConfirmation": true,
      "isActive": false,
      "createdBy": "ai",
      "createdAt": "2025-10-01T11:00:00Z"
    }
  ]
}
```

### 3. **Test Confirmation Flow**

```javascript
// Accept system category
POST /api/v1/categories/suggestions/suggestion123.../confirm
{
  "systemCategoryId": "food_drinks_category_id",
  "categoryName": "Food & Drinks"
}

// Expected Response:
{
  "success": true,
  "statusCode": 200,
  "item": {
    "category": {
      "_id": "food_drinks_category_id",
      "name": "Food & Drinks"
    },
    "customName": "Food & Drinks",
    "needsConfirmation": false,
    "isActive": true
  }
}

// Expected Events:
// - category.confirmed
// - analytics.category_usage
```

```javascript
// Create new custom category
POST /api/v1/categories/suggestions/suggestion123.../confirm
{
  "categoryName": "Cafe & Coffee Shops"
}

// Expected Response:
{
  "success": true,
  "statusCode": 200,
  "item": {
    "category": {
      "_id": "new_category_id",
      "name": "Cafe & Coffee Shops",
      "isSystem": false
    },
    "customName": "Cafe & Coffee Shops",
    "needsConfirmation": false,
    "isActive": true
  }
}
```

### 4. **Test Rejection Flow**

```javascript
// Reject suggestion
POST /api/v1/categories/suggestions/suggestion123.../reject
{
  "feedback": "Not relevant for my spending"
}

// Expected Response:
{
  "success": true,
  "statusCode": 200,
  "message": "Suggestion rejected"
}

// Expected Audit Log:
// action: "category_suggestion_rejected"
```

### 5. **Test Events Integration**

```javascript
// Verify events are emitted correctly
// Monitor domain events:

// 1. category.suggestion_created
{
  "name": "category.suggestion_created",
  "payload": {
    "userId": "user123...",
    "suggestionId": "suggestion123...",
    "categoryName": "cafe sua da",
    "normalizedName": "cafe sua da",
    "createdBy": "ai",
    "timestamp": "2025-10-01T11:00:00Z"
  }
}

// 2. category.confirmed
{
  "name": "category.confirmed",
  "payload": {
    "userId": "user123...",
    "suggestionId": "suggestion123...",
    "categoryId": "food_drinks_category_id",
    "categoryName": "Food & Drinks",
    "action": "accept_system",
    "timestamp": "2025-10-01T11:30:00Z"
  }
}

// 3. analytics.category_usage
{
  "name": "analytics.category_usage",
  "payload": {
    "userId": "user123...",
    "categoryId": "food_drinks_category_id",
    "source": "confirmation",
    "timestamp": "2025-10-01T11:30:00Z"
  }
}
```

### 6. **Test Background Jobs**

```javascript
// Test Category Cleanup Job (manual trigger for testing)
// Should remove suggestions older than 30 days

// Before cleanup:
db.userexpensecategories
  .find({
    needsConfirmation: true,
    isActive: false,
    createdAt: { $lt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
  })
  .count();
// Expected: > 0

// After cleanup job runs:
// Expected: 0

// Test Category Learning Job
// Should analyze user confirmation patterns
// Expected console logs:
// "🤖 Starting category learning job..."
// "📊 Processing X active users for learning..."
// "✅ Category learning completed: Processed X users, learned Y patterns"
```

---

## 🎯 **VERIFICATION CHECKLIST**

### ✅ **API Endpoints hoàn chỉnh:**

- [x] `POST /api/v1/transactions` - with category resolution
- [x] `GET /api/categories/suggestions` - list pending
- [x] `POST /api/v1/categories/suggestions/{id}/confirm` - accept suggestion
- [x] `POST /api/v1/categories/suggestions/{id}/reject` - reject suggestion

### ✅ **Response Format đúng Flow:**

- [x] Transaction response có `categoryId`, `needsCategoryConfirmation`, `categorySuggestion`, `matchedSource`
- [x] Suggestion response có đầy đủ metadata

### ✅ **Events hoàn chỉnh:**

- [x] `analytics.category_usage` - ✅ đã có
- [x] `category.suggestion_created` - 🆕 đã thêm
- [x] `category.confirmed` - 🆕 đã thêm

### ✅ **Background Jobs:**

- [x] Category Cleanup Job - 🆕 đã tạo
- [x] Category Learning Job - 🆕 đã tạo
- [x] Category Statistics Job - 🆕 đã tạo
- [x] Job Scheduler Integration - 🆕 đã tích hợp vào server

### ✅ **Enhanced Features:**

- [x] Reject suggestion API - 🆕 đã thêm
- [x] Audit logging cho all actions
- [x] Error handling improvements

---

## 🚀 **FLOW 3.6 STATUS: 100% COMPLETE!**

Tất cả các yêu cầu trong Flow 3.6 đã được implement:

1. ✅ **Category Resolution Logic** - hoạt động đúng thứ tự
2. ✅ **Transaction Response** - đúng format
3. ✅ **Confirmation API** - support cả accept và reject
4. ✅ **Events & Analytics** - đầy đủ 3 events
5. ✅ **Background Jobs** - cleanup, learning, stats

**API đã sẵn sàng production và đầy đủ tính năng theo flow thiết kế!** 🎉
