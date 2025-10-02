# 🧹 PROJECT CLEANUP ANALYSIS

## 🔍 FILES TO DELETE

### 1. Temporary Test Files (Development Only)

- [x] `validate_logic.js` - Temporary validation script
- [x] `validate_openrouter.js` - Temporary OpenRouter test
- [x] `test_onboarding.js` - Temporary onboarding test

### 2. Unused Models

- [x] `src/models/conversation.js` - No imports found in codebase
- [x] `src/models/messages.js` - No imports found in codebase

### 3. Documentation Markdown Files (Keep for Reference)

- [ ] `ONBOARDING_FLOW_SUMMARY.md` - Keep (useful documentation)
- [ ] `IMPLEMENTATION_CHECKLIST.md` - Keep (useful documentation)
- [ ] `GEMINI_TO_OPENROUTER_MIGRATION.md` - Keep (useful documentation)

## ✅ FILES TO KEEP (All Used)

### Core Models (All Referenced)

- `src/models/expense_category.js` ✅ Used in categoryResolution, starterCategory
- `src/models/user_expense_category.js` ✅ Used in categoryResolution, starterCategory
- `src/models/user.js` ✅ Used in authService, multiple controllers
- `src/models/wallet.js` ✅ Used in walletService, transactionService
- `src/models/transaction.js` ✅ Used in transactionService, reportService
- `src/models/budget.js` ✅ Used in budgetService, budgetController
- `src/models/saving_goal.js` ✅ Used in savingGoalService
- `src/models/saving_goal_contribution.js` ✅ Used in savingGoalService
- `src/models/notification.js` ✅ Used in notificationService, routes
- `src/models/audit_log.js` ✅ Used in categoryResolution, aiService
- `src/models/quota_usage.js` ✅ Used in quotaMiddleware
- `src/models/subscription.js` ✅ Used in subscriptionService
- `src/models/subscription_plan.js` ✅ Used in subscriptionService
- `src/models/payment.js` ✅ Used in payment flows
- `src/models/payment_intent.js` ✅ Used in payment flows
- `src/models/recommendation.js` ✅ Used in AI/recommendation features
- `src/models/token.js` ✅ Used in authService
- `src/models/integration_connection.js` ✅ Used in walletService, walletSyncService
- `src/models/sync_log.js` ✅ Used in walletSyncService

### All Services (All Referenced)

- All services in `src/services/` are imported and used ✅

### All Controllers (All Referenced)

- All controllers in `src/controllers/` are imported in routes ✅

### All Middleware (All Referenced)

- All middleware in `src/middleware/` are used in routes ✅

### Configuration Files (All Used)

- All files in `src/config/` are required ✅

## 📊 CLEANUP SUMMARY

**Safe to Delete**: 5 files (3 temp tests + 2 unused models)
**Keep**: 60+ essential files

**Storage Savings**: ~50KB (minimal but cleaner codebase)
**Benefits**: Cleaner project structure, no confusion about unused files
