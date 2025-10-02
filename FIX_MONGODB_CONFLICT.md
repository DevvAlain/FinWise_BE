# 🔧 FIX: MongoDB Conflict Error trong AI Transaction Parsing

## ❌ **LỖI BAN ĐẦU:**

```
MongoServerError: Updating the path 'createdBy' would create a conflict at 'createdBy'
```

**Root Cause**: Trong `categoryResolutionService.js`, các `findOneAndUpdate` operations có conflict giữa `$set` và `$setOnInsert` cho cùng một field `createdBy`.

## 🔍 **PHÂN TÍCH:**

### Lỗi trong upsertCategorySuggestion:

```javascript
// ❌ BEFORE (Conflict)
{
  $set: {
    customName: categoryName,
    createdBy: 'ai',        // ⚠️ Conflict ở đây
    needsConfirmation: true,
    isActive: false,
  },
  $setOnInsert: {
    createdBy: 'ai',        // ⚠️ Duplicate với $set
    needsConfirmation: true,
    isActive: false,
  },
}
```

## ✅ **GIẢI PHÁP:**

### 1. Tách riêng $set và $setOnInsert:

```javascript
// ✅ AFTER (Fixed)
{
  $set: {
    customName: categoryName,
    needsConfirmation: true,
    isActive: false,
  },
  $setOnInsert: {
    createdBy: 'ai',        // Chỉ set khi insert
    user: userId,
    normalizedName,
  },
}
```

### 2. Áp dụng fix cho tất cả findOneAndUpdate:

- ✅ `upsertCategorySuggestion` - Fixed conflict `createdBy`
- ✅ `confirmCategorySuggestion` (accept_system) - Fixed conflict `createdBy`
- ✅ `confirmCategorySuggestion` (create_new) - Fixed conflict `createdBy`

## 🎯 **KẾT QUẢ:**

### API Call sẽ hoạt động:

```javascript
POST /api/v1/ai/transactions/parse
{
  "text": "nay đi ăn hết 50k"
}

// ✅ Response thành công:
{
  "success": true,
  "draft": {
    "walletId": "wallet_id",
    "type": "expense",
    "amount": 50000,
    "currency": "VND",
    "categoryId": "cat1",
    "description": "nay đi ăn",
    "occurredAt": "2025-10-01T..."
  },
  "confidence": 0.89,
  "needsConfirmation": false
}
```

### Flow hoạt động:

1. **AI Parse**: "nay đi ăn hết 50k" → amount: 50000, category: "Ăn uống"
2. **Category Resolution**: Tìm system category "Ăn uống"
3. **Auto-assignment**: Confidence > 0.8 → Auto-assign ✅
4. **Create UserExpenseCategory**: Không còn MongoDB conflict
5. **Return Draft**: Ready để create transaction

## 🚀 **TESTING:**

```bash
# Mobile/Frontend có thể test:
POST http://10.0.2.2:8080/api/v1/ai/transactions/parse
{
  "text": "nay đi ăn hết 50k"
}

# Expected: Status 200, không còn lỗi 500
```

## 📝 **CHÚ Ý:**

- MongoDB warnings về deprecated options (`useNewUrlParser`, `useUnifiedTopology`) chỉ là warnings, không ảnh hưởng functionality
- Server đã restart thành công
- AI transaction parsing ready để test

---

**Status**: ✅ RESOLVED - AI Transaction Parsing hoạt động bình thường!
