# 📱 FRONTEND API ROADMAP - FinWise Financial Management

> **Comprehensive API Integration Guide for Frontend Development**
> **Backend**: Node.js/Express + MongoDB | **AI**: OpenRouter (Grok-4) | **Version**: v1.0

---

## 🎯 TABLE OF CONTENTS

1. [Authentication & User Management](#authentication--user-management)
2. [User Onboarding Flow](#user-onboarding-flow)
3. [Wallet Management](#wallet-management)
4. [Category Management](#category-management)
5. [Transaction Management](#transaction-management)
6. [Budget Management](#budget-management)
7. [Saving Goals](#saving-goals)
8. [AI Features](#ai-features)
9. [Reports & Analytics](#reports--analytics)
10. [Notifications](#notifications)
11. [Error Handling](#error-handling)
12. [Implementation Examples](#implementation-examples)

---

## 🔐 AUTHENTICATION & USER MANAGEMENT

### 1.1 Registration & Login

```typescript
// User Registration
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "securePassword123",
  "fullName": "Nguyễn Văn A",
  "phone": "0123456789"
}

Response: {
  "success": true,
  "message": "Đăng ký thành công. Vui lòng kiểm tra email để xác thực.",
  "user": {
    "id": "userId",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "isEmailVerified": false
  }
}

// ✨ NEW: Auto-creates default wallet + 9 starter categories
```

```typescript
// Login
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "securePassword123"
}

Response: {
  "success": true,
  "message": "Đăng nhập thành công",
  "accessToken": "jwt_token_here",
  "refreshToken": "refresh_token_here",
  "user": {
    "id": "userId",
    "email": "user@example.com",
    "fullName": "Nguyễn Văn A",
    "role": "user"
  }
}
```

### 1.2 OAuth & Social Login

```typescript
// Google OAuth Login
POST /api/auth/google-login
{
  "googleToken": "google_oauth_token"
}
```

### 1.3 Password Management

```typescript
// Forgot Password
POST /api/auth/forgot-password
{
  "email": "user@example.com"
}

// Reset Password
POST /api/auth/reset-password/:token
{
  "newPassword": "newSecurePassword123"
}

// Change Password (authenticated)
POST /api/auth/change-password
Headers: { "Authorization": "Bearer jwt_token" }
{
  "currentPassword": "oldPassword",
  "newPassword": "newPassword"
}
```

### 1.4 Profile Management

```typescript
// Get Current User Profile
GET /api/users/me
Headers: { "Authorization": "Bearer jwt_token" }

// Update Profile (with file upload)
PATCH /api/users/me
Headers: {
  "Authorization": "Bearer jwt_token",
  "Content-Type": "multipart/form-data"
}
FormData: {
  "fullName": "Tên mới",
  "phone": "0987654321",
  "avatar": File
}
```

---

## 🎯 USER ONBOARDING FLOW

### 2.1 New User Journey

```typescript
// Frontend Implementation Example
const handleRegistration = async (userData) => {
  try {
    // 1. Register user
    const registerResponse = await api.post('/api/auth/register', userData);

    if (registerResponse.success) {
      // 2. Show verification message
      showVerificationModal();

      // 3. After email verification, user gets:
      //    - Default wallet "Ví tiền mặt"
      //    - 9 starter categories automatically

      // 4. Redirect to onboarding tour
      router.push('/onboarding-tour');
    }
  } catch (error) {
    handleApiError(error);
  }
};
```

### 2.2 First Login Experience

```typescript
// Check if user has starter data
const checkOnboardingStatus = async () => {
  const [wallets, categories] = await Promise.all([
    api.get('/api/wallets'),
    api.get('/api/categories'),
  ]);

  if (wallets.data.length === 0 || categories.data.length === 0) {
    // Trigger onboarding setup
    showOnboardingWizard();
  }
};
```

---

## 💰 WALLET MANAGEMENT

### 3.1 Wallet Operations

```typescript
// Create Wallet
POST /api/wallets
Headers: { "Authorization": "Bearer jwt_token" }
{
  "walletName": "Ví Vietcombank",
  "walletType": "bank", // "bank" | "e-wallet" | "cash" | "credit_card"
  "currency": "VND",
  "provider": "vietcombank", // optional
  "accountNumber": "1234567890", // optional
  "alias": "VCB Chính" // optional
}

Response: {
  "success": true,
  "wallet": {
    "id": "walletId",
    "walletName": "Ví Vietcombank",
    "walletType": "bank",
    "currency": "VND",
    "balance": 0,
    "isDefault": false
  }
}
```

```typescript
// Get All Wallets
GET /api/wallets
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "wallets": [
    {
      "id": "wallet1",
      "walletName": "Ví tiền mặt",
      "walletType": "cash",
      "currency": "VND",
      "balance": 1500000,
      "isDefault": true,
      "createdAt": "2025-10-01T10:00:00Z"
    }
  ]
}
```

### 3.2 Wallet Sync (Provider Integration)

```typescript
// Sync Wallet with Bank/Provider
POST /api/wallets/:walletId/sync
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "syncJob": {
    "jobId": "syncJobId",
    "status": "queued", // "queued" | "running" | "completed" | "failed"
    "message": "Wallet sync queued"
  }
}
```

---

## 📂 CATEGORY MANAGEMENT

### 4.1 Category System Overview

```typescript
// ✨ NEW: Enhanced Category Flow with Smart Auto-assignment

// Get System Categories (Available for all users)
GET /api/categories/system

Response: {
  "success": true,
  "categories": [
    {
      "id": "cat1",
      "name": "Ăn uống",
      "nameEn": "Food & Dining",
      "icon": "🍽️",
      "color": "#FF6B6B",
      "isSystem": true
    },
    {
      "id": "cat2",
      "name": "Mua sắm",
      "nameEn": "Shopping",
      "icon": "🛍️",
      "color": "#4ECDC4",
      "isSystem": true
    }
    // ... 7 more starter categories
  ]
}
```

### 4.2 User Categories

```typescript
// Get User's Categories (includes starter + custom)
GET /api/categories
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "categories": [
    {
      "id": "userCat1",
      "categoryId": "cat1", // Reference to system category
      "customName": null, // Uses system name
      "createdBy": "system", // "system" | "user" | "ai"
      "needsConfirmation": false,
      "isActive": true
    }
  ]
}
```

### 4.3 Smart Category Suggestions

```typescript
// ✨ NEW: AI-Powered Category Suggestions
// Get Pending Suggestions
GET /api/categories/suggestions
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "suggestions": [
    {
      "id": "suggestion1",
      "transactionDescription": "Mua cà phê Highlands",
      "suggestedCategory": {
        "id": "cat1",
        "name": "Ăn uống"
      },
      "confidence": 0.92, // 0-1 confidence score
      "needsConfirmation": true,
      "createdAt": "2025-10-01T14:30:00Z"
    }
  ]
}
```

```typescript
// Confirm Category Suggestion
POST /api/categories/suggestions/:suggestionId/confirm
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "message": "Category suggestion confirmed",
  "userCategory": {
    "id": "newUserCategoryId",
    "categoryId": "cat1",
    "createdBy": "ai"
  }
}
```

```typescript
// Reject Category Suggestion
POST /api/categories/suggestions/:suggestionId/reject
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "message": "Suggestion rejected"
}
```

### 4.4 Custom Categories

```typescript
// Create Custom Category
POST /api/categories
Headers: { "Authorization": "Bearer jwt_token" }
{
  "categoryId": "cat1", // optional: base on system category
  "customName": "Cà phê văn phòng" // optional: custom name
}
```

---

## 💸 TRANSACTION MANAGEMENT

### 5.1 Smart Transaction Creation

```typescript
// ✨ NEW: Enhanced Transaction with AI Category Resolution
POST /api/transactions
Headers: { "Authorization": "Bearer jwt_token" }
{
  "type": "expense", // "expense" | "income" | "transfer"
  "amount": 45000,
  "currency": "VND",
  "description": "Mua cà phê Highlands Coffee",
  "walletId": "wallet1",
  "occurredAt": "2025-10-01T09:30:00Z"
}

Response: {
  "success": true,
  "transaction": {
    "id": "trans1",
    "type": "expense",
    "amount": 45000,
    "description": "Mua cà phê Highlands Coffee",
    "category": {
      "id": "cat1",
      "name": "Ăn uống",
      "autoAssigned": true, // ✨ NEW: Auto-assigned by AI
      "confidence": 0.92
    },
    "wallet": {
      "id": "wallet1",
      "name": "Ví tiền mặt"
    },
    "occurredAt": "2025-10-01T09:30:00Z"
  }
}

// ✨ Smart Category Resolution:
// - High confidence (>0.8) → Auto-assigned ✅
// - Medium confidence (0.6-0.8) → Suggestion created 💡
// - Low confidence (<0.6) → Manual selection ❓
```

### 5.2 Transaction List & Filtering

```typescript
// Get Transactions with Advanced Filters
GET /api/transactions?page=1&limit=20&type=expense&categoryId=cat1&walletId=wallet1&fromDate=2025-10-01&toDate=2025-10-31
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "transactions": [
    {
      "id": "trans1",
      "type": "expense",
      "amount": 45000,
      "description": "Mua cà phê Highlands Coffee",
      "category": { "id": "cat1", "name": "Ăn uống" },
      "wallet": { "id": "wallet1", "name": "Ví tiền mặt" },
      "occurredAt": "2025-10-01T09:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### 5.3 Transfer Transactions

```typescript
// Transfer between wallets
POST /api/transactions
Headers: { "Authorization": "Bearer jwt_token" }
{
  "type": "transfer",
  "amount": 500000,
  "description": "Chuyển tiền từ VCB sang ví tiền mặt",
  "fromWalletId": "wallet2",
  "toWalletId": "wallet1"
}
```

---

## 📊 AI FEATURES

### 6.1 AI Transaction Parsing

```typescript
// ✨ NEW: AI-Powered Expense Parsing
POST /api/ai/parse-expense
Headers: { "Authorization": "Bearer jwt_token" }
{
  "userText": "Hôm nay tôi ăn trưa ở KFC hết 120k"
}

Response: {
  "success": true,
  "parsedData": {
    "type": "expense",
    "amount": 120000,
    "currency": "VND",
    "categoryName": "Ăn uống",
    "description": "Ăn trưa KFC",
    "occurredAt": "2025-10-01T12:00:00Z",
    "confidence": 0.89
  }
}
```

### 6.2 AI Financial Q&A

```typescript
// Financial Assistant Chat
POST /api/ai/qa
Headers: { "Authorization": "Bearer jwt_token" }
{
  "question": "Tôi chi tiêu bao nhiều cho ăn uống tháng này?",
  "contextSummary": "User có 150 giao dịch tháng 10" // optional
}

Response: {
  "success": true,
  "answer": "Bạn đã chi 2,450,000 VND cho ăn uống trong tháng 10. Điều này chiếm 35% tổng chi tiêu của bạn."
}
```

### 6.3 Advanced Transaction Draft

```typescript
// ✨ NEW: Smart Transaction Draft Creation
POST /api/v1/ai/transactions/parse
Headers: { "Authorization": "Bearer jwt_token" }
{
  "userText": "Mua xăng 200k ở Petrolimex chiều nay"
}

Response: {
  "success": true,
  "draft": {
    "type": "expense",
    "amount": 200000,
    "description": "Mua xăng Petrolimex",
    "suggestedCategory": {
      "id": "cat3",
      "name": "Di chuyển",
      "confidence": 0.95
    },
    "occurredAt": "2025-10-01T17:00:00Z"
  }
}
```

---

## 💰 BUDGET MANAGEMENT

### 7.1 Budget Operations

```typescript
// Create Budget
POST /api/budgets
Headers: { "Authorization": "Bearer jwt_token" }
{
  "name": "Budget ăn uống tháng 10",
  "categoryId": "cat1",
  "amount": 3000000,
  "period": "monthly", // "monthly" | "weekly" | "yearly"
  "startDate": "2025-10-01",
  "endDate": "2025-10-31"
}

Response: {
  "success": true,
  "budget": {
    "id": "budget1",
    "name": "Budget ăn uống tháng 10",
    "category": { "id": "cat1", "name": "Ăn uống" },
    "amount": 3000000,
    "spent": 0,
    "remaining": 3000000,
    "progress": 0,
    "status": "active" // "active" | "exceeded" | "completed"
  }
}
```

### 7.2 Budget Monitoring

```typescript
// Get Budget Status
GET /api/budgets/status
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "budgets": [
    {
      "id": "budget1",
      "name": "Budget ăn uống tháng 10",
      "amount": 3000000,
      "spent": 1250000,
      "remaining": 1750000,
      "progress": 0.42, // 42%
      "status": "active",
      "daysLeft": 15,
      "alertLevel": "normal" // "normal" | "warning" | "critical"
    }
  ]
}
```

---

## 🎯 SAVING GOALS

### 8.1 Goal Management

```typescript
// Create Saving Goal
POST /api/goals
Headers: { "Authorization": "Bearer jwt_token" }
{
  "name": "Mua iPhone 16",
  "targetAmount": 25000000,
  "currentAmount": 5000000,
  "targetDate": "2025-12-31",
  "description": "Tiết kiệm mua iPhone 16 Pro"
}

Response: {
  "success": true,
  "goal": {
    "id": "goal1",
    "name": "Mua iPhone 16",
    "targetAmount": 25000000,
    "currentAmount": 5000000,
    "progress": 0.20, // 20%
    "targetDate": "2025-12-31",
    "status": "active", // "active" | "completed" | "paused"
    "daysLeft": 91
  }
}
```

### 8.2 Goal Progress

```typescript
// Update Goal Progress
PATCH /api/goals/:id/progress
Headers: { "Authorization": "Bearer jwt_token" }
{
  "amount": 1000000, // Add to current amount
  "note": "Tiết kiệm từ lương tháng 10"
}

// Get Goals Dashboard
GET /api/goals/dashboard
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "dashboard": {
    "totalGoals": 3,
    "activeGoals": 2,
    "completedGoals": 1,
    "totalTargetAmount": 50000000,
    "totalCurrentAmount": 15000000,
    "overallProgress": 0.30
  }
}
```

---

## 📈 REPORTS & ANALYTICS

### 9.1 Spending Analysis

```typescript
// Spending by Category
GET /api/reports/spend-by-category?period=monthly&month=10&year=2025
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "data": [
    {
      "categoryId": "cat1",
      "categoryName": "Ăn uống",
      "totalSpent": 2450000,
      "transactionCount": 45,
      "percentage": 35.2,
      "trend": "up" // "up" | "down" | "stable"
    }
  ],
  "summary": {
    "totalSpent": 6960000,
    "totalTransactions": 156,
    "period": "2025-10"
  }
}
```

### 9.2 Monthly Trends

```typescript
// Monthly Spending Trends
GET /api/reports/monthly-trend?months=6
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "data": [
    {
      "month": "2025-10",
      "totalIncome": 15000000,
      "totalExpense": 6960000,
      "netFlow": 8040000,
      "categoryBreakdown": [
        { "category": "Ăn uống", "amount": 2450000 }
      ]
    }
  ]
}
```

---

## 🔔 NOTIFICATIONS

### 10.1 Notification Management

```typescript
// Get Notifications
GET /api/notifications?page=1&limit=20&unread=true
Headers: { "Authorization": "Bearer jwt_token" }

Response: {
  "success": true,
  "notifications": [
    {
      "id": "notif1",
      "title": "Budget Alert",
      "message": "Bạn đã chi 80% budget ăn uống tháng này",
      "type": "budget_warning", // "budget_warning" | "goal_reminder" | "transaction_sync"
      "isRead": false,
      "createdAt": "2025-10-01T15:30:00Z"
    }
  ]
}
```

```typescript
// Mark as Read
PATCH /api/notifications/:id/read
Headers: { "Authorization": "Bearer jwt_token" }
```

---

## ⚠️ ERROR HANDLING

### 11.1 Standard Error Responses

```typescript
// Standard Error Format
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    {
      "field": "amount",
      "message": "Amount must be greater than 0"
    }
  ]
}

// Common Status Codes:
// 400 - Bad Request (validation errors)
// 401 - Unauthorized (invalid/expired token)
// 403 - Forbidden (insufficient permissions)
// 404 - Not Found (resource doesn't exist)
// 409 - Conflict (duplicate data)
// 429 - Too Many Requests (rate limit exceeded)
// 500 - Internal Server Error
```

### 11.2 Rate Limiting

```typescript
// AI Endpoints Rate Limits:
// - /api/ai/parse-expense: 30 requests/minute
// - /api/ai/qa: 30 requests/minute
// - /api/v1/ai/transactions/parse: 20 requests/minute

// Rate Limit Response:
{
  "success": false,
  "statusCode": 429,
  "message": "Too many requests, please try again later"
}
```

---

## 💻 IMPLEMENTATION EXAMPLES

### 12.1 React Hook Example

```typescript
// useTransactions.ts
import { useState, useEffect } from 'react';
import { api } from '../services/api';

export const useTransactions = (filters = {}) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createTransaction = async (transactionData) => {
    setLoading(true);
    try {
      const response = await api.post('/api/transactions', transactionData);

      if (response.data.success) {
        // Check if category was auto-assigned
        if (response.data.transaction.category?.autoAssigned) {
          // Show success with auto-assignment info
          showNotification(
            `Giao dịch đã được tự động phân loại: ${response.data.transaction.category.name}`,
            'success',
          );
        }

        // Refresh transactions list
        fetchTransactions();
        return response.data.transaction;
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Lỗi tạo giao dịch');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    transactions,
    loading,
    error,
    createTransaction,
    // ... other methods
  };
};
```

### 12.2 Category Suggestions Component

```typescript
// CategorySuggestions.tsx
import React from 'react';
import { useCategorySuggestions } from '../hooks/useCategorySuggestions';

const CategorySuggestions = () => {
  const { suggestions, confirmSuggestion, rejectSuggestion } = useCategorySuggestions();

  return (
    <div className="suggestions-list">
      {suggestions.map(suggestion => (
        <div key={suggestion.id} className="suggestion-card">
          <div className="suggestion-content">
            <p className="transaction-desc">{suggestion.transactionDescription}</p>
            <div className="suggested-category">
              <span>Gợi ý: {suggestion.suggestedCategory.name}</span>
              <span className="confidence">
                {Math.round(suggestion.confidence * 100)}% tin cậy
              </span>
            </div>
          </div>

          <div className="suggestion-actions">
            <button
              onClick={() => confirmSuggestion(suggestion.id)}
              className="btn-confirm"
            >
              ✅ Đồng ý
            </button>
            <button
              onClick={() => rejectSuggestion(suggestion.id)}
              className="btn-reject"
            >
              ❌ Từ chối
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
```

### 12.3 Smart Transaction Form

```typescript
// TransactionForm.tsx
import React, { useState } from 'react';
import { useAI } from '../hooks/useAI';

const TransactionForm = () => {
  const [description, setDescription] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const { parseExpense } = useAI();

  const handleDescriptionChange = async (value) => {
    setDescription(value);

    // Auto-parse when user types enough
    if (value.length > 10) {
      try {
        const suggestion = await parseExpense(value);
        setAiSuggestion(suggestion);
      } catch (error) {
        console.error('AI parsing failed:', error);
      }
    }
  };

  return (
    <form className="transaction-form">
      <input
        type="text"
        placeholder="Mô tả giao dịch (VD: Mua cà phê 45k)"
        value={description}
        onChange={(e) => handleDescriptionChange(e.target.value)}
      />

      {aiSuggestion && (
        <div className="ai-suggestion">
          <h4>🤖 AI gợi ý:</h4>
          <p>Số tiền: {aiSuggestion.amount?.toLocaleString()} VND</p>
          <p>Danh mục: {aiSuggestion.categoryName}</p>
          <p>Độ tin cậy: {Math.round(aiSuggestion.confidence * 100)}%</p>

          <button type="button" onClick={() => applyAISuggestion(aiSuggestion)}>
            Áp dụng gợi ý
          </button>
        </div>
      )}

      {/* Rest of form fields */}
    </form>
  );
};
```

---

## 🚀 FRONTEND ROADMAP PRIORITIES

### Phase 1: Core Features (MVP)

1. ✅ Authentication & Registration with onboarding
2. ✅ Wallet management (basic CRUD)
3. ✅ Transaction creation with smart categories
4. ✅ Basic category management
5. ✅ Simple reports

### Phase 2: Smart Features

1. ✅ AI-powered transaction parsing
2. ✅ Category suggestions with confidence UI
3. ✅ Advanced filtering & search
4. ✅ Budget tracking with alerts
5. ✅ Saving goals dashboard

### Phase 3: Advanced Features

1. 🔄 Real-time notifications
2. 🔄 Advanced analytics & charts
3. 🔄 Export/import functionality
4. 🔄 Multi-currency support
5. 🔄 Subscription management

### Phase 4: Premium Features

1. 🔄 Bank integration & auto-sync
2. 🔄 AI financial advisor
3. 🔄 Investment tracking
4. 🔄 Tax reporting
5. 🔄 Family/shared budgets

---

## 📋 NOTES FOR FRONTEND DEVELOPERS

### Key Implementation Points:

1. **Smart Category Resolution**: Always handle the 3 confidence levels (auto-assign, suggest, manual)

2. **Error Handling**: Implement comprehensive error handling for all API calls

3. **Loading States**: Show appropriate loading indicators for AI operations

4. **Onboarding UX**: Guide users through the enhanced onboarding flow

5. **Real-time Updates**: Consider implementing WebSocket for real-time notifications

6. **Offline Support**: Cache essential data for offline functionality

7. **Performance**: Implement pagination and lazy loading for large datasets

### Security Considerations:

- Always include JWT token in protected route headers
- Implement token refresh mechanism
- Sanitize user inputs before API calls
- Handle sensitive data (financial info) with care

---

**🎯 This roadmap covers all essential API endpoints for building a comprehensive financial management frontend application with AI-powered features and smart user experience.**
