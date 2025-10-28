
import express from 'express';
// import userController from "../controllers/userController";
import authController from '../controllers/authController';
import { protect, authorize } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';
import userProfileController from '../controllers/userProfileController.js';
import walletController from '../controllers/walletController.js';
import categoryController from '../controllers/categoryController.js';
import categoryAdminController from '../controllers/categoryAdminController.js';
import subscriptionBillingController from '../controllers/subscriptionBillingController.js';
import subscriptionController from '../controllers/subscriptionController.js';
import adminController from '../controllers/adminController.js';
import {
  enforceWalletQuota,
  enforceTransactionQuota,
  enforceBudgetQuota,
  enforceSavingGoalQuota,
} from '../middleware/quotaMiddleware.js';
import transactionController from '../controllers/transactionController.js';
import * as budgetController from '../controllers/budgetController.js';
import savingGoalController from '../controllers/savingGoalController.js';
import aiController from '../controllers/aiController.js';
import { rateLimit } from '../middleware/rateLimitMiddleware.js';
import notificationController from '../controllers/notificationController.js';
import reportController from '../controllers/reportController.js';
import adminUserController from '../controllers/adminUserController.js';


let router = express.Router();

let initWebRoutes = (app) => {
  // Admin user management
  router.get('/api/v1/admin/users', protect, authorize('admin'), adminUserController.listUsers);
  router.get('/api/v1/admin/users/:id', protect, authorize('admin'), adminUserController.getUserDetail);
  router.patch('/api/v1/admin/users/:id', protect, authorize('admin'), adminUserController.updateUser);
  router.patch('/api/v1/admin/users/:id/lock', protect, authorize('admin'), adminUserController.lockUser);
  router.patch('/api/v1/admin/users/:id/unlock', protect, authorize('admin'), adminUserController.unlockUser);
  router.delete('/api/v1/admin/users/:id', protect, authorize('admin'), adminUserController.deleteUser);
  router.post('/api/auth/register', authController.register);
  router.post('/api/auth/login', authController.login);
  router.post('/api/auth/google-login', authController.googleLogin);
  router.post('/api/auth/refresh-token', authController.refreshToken);
  router.get('/api/auth/verify-email/:token', authController.verifyEmail);
  router.post(
    '/api/auth/resend-verification',
    authController.resendVerificationEmail,
  );
  router.post('/api/auth/forgot-password', authController.forgotPassword);
  router.post('/api/auth/reset-password/:token', authController.resetPassword);
  router.post(
    '/api/auth/change-password',
    protect,
    authController.changePassword,
  );

  // v1 equivalents for auth
  router.post('/api/v1/auth/register', authController.register);
  router.post('/api/v1/auth/login', authController.login);
  router.post('/api/v1/auth/google-login', authController.googleLogin);
  router.post('/api/v1/auth/refresh-token', authController.refreshToken);
  router.get('/api/v1/auth/verify-email/:token', authController.verifyEmail);
  router.post('/api/v1/auth/resend-verification', authController.resendVerificationEmail);
  router.post('/api/v1/auth/forgot-password', authController.forgotPassword);
  router.post('/api/v1/auth/reset-password/:token', authController.resetPassword);
  router.post('/api/v1/auth/change-password', protect, authController.changePassword);

  // User profile
  router.get('/api/users/me', protect, userProfileController.getMe);
  router.patch(
    '/api/users/me',
    protect,
    upload.fields([
      { name: 'avatar', maxCount: 1 },
      { name: 'image', maxCount: 1 },
    ]),
    userProfileController.updateMe,
  );

  // v1 user profile
  router.get('/api/v1/users/me', protect, userProfileController.getMe);
  router.patch('/api/v1/users/me', protect, upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ]), userProfileController.updateMe);

  // Wallets (no bank integrations)
  router.post(
    '/api/wallets',
    protect,
    enforceWalletQuota,
    walletController.create,
  );
  router.get('/api/wallets', protect, walletController.list);
  router.get('/api/wallets/:walletId', protect, walletController.detail);
  router.patch('/api/wallets/:walletId', protect, walletController.update);
  router.delete('/api/wallets/:walletId', protect, walletController.remove);
  router.post('/api/v1/wallets/:walletId/sync', protect, walletController.sync);
  router.post('/api/wallets/:walletId/sync', protect, walletController.sync);

  // v1 wallets
  router.post('/api/v1/wallets', protect, enforceWalletQuota, walletController.create);
  router.get('/api/v1/wallets', protect, walletController.list);
  router.get('/api/v1/wallets/:walletId', protect, walletController.detail);
  router.patch('/api/v1/wallets/:walletId', protect, walletController.update);
  router.delete('/api/v1/wallets/:walletId', protect, walletController.remove);

  // Categories
  router.get('/api/categories/system', categoryController.listSystem);
  router.get('/api/categories', protect, categoryController.listMine);
  router.post('/api/categories', protect, categoryController.createMine);
  router.patch(
    '/api/categories/:categoryId',
    protect,
    categoryController.updateMine,
  );
  router.delete(
    '/api/categories/:categoryId',
    protect,
    categoryController.deleteMine,
  );
  router.get('/api/categories/suggestions', protect, categoryController.listSuggestions);
  router.post('/api/v1/categories/suggestions/:suggestionId/confirm', protect, categoryController.confirmSuggestion);
  router.post('/api/categories/suggestions/:suggestionId/confirm', protect, categoryController.confirmSuggestion);
  // 🆕 ADD MISSING: Reject suggestion routes
  router.post('/api/v1/categories/suggestions/:suggestionId/reject', protect, categoryController.rejectSuggestion);
  router.post('/api/categories/suggestions/:suggestionId/reject', protect, categoryController.rejectSuggestion);

  // v1 categories
  router.get('/api/v1/categories/system', categoryController.listSystem);
  router.get('/api/v1/categories', protect, categoryController.listMine);
  router.post('/api/v1/categories', protect, categoryController.createMine);
  router.patch('/api/v1/categories/:categoryId', protect, categoryController.updateMine);
  router.delete('/api/v1/categories/:categoryId', protect, categoryController.deleteMine);
  router.get('/api/v1/categories/suggestions', protect, categoryController.listSuggestions);

  // Admin: System categories
  router.post(
    '/api/admin/categories/system',
    protect,
    authorize('admin'),
    categoryAdminController.create,
  );
  router.patch(
    '/api/admin/categories/system/:categoryId',
    protect,
    authorize('admin'),
    categoryAdminController.update,
  );
  router.delete(
    '/api/admin/categories/system/:categoryId',
    protect,
    authorize('admin'),
    categoryAdminController.remove,
  );

  // v1 admin system categories
  router.post('/api/v1/admin/categories/system', protect, authorize('admin'), categoryAdminController.create);
  router.patch('/api/v1/admin/categories/system/:categoryId', protect, authorize('admin'), categoryAdminController.update);
  router.delete('/api/v1/admin/categories/system/:categoryId', protect, authorize('admin'), categoryAdminController.remove);

  // Admin: Metrics dashboard
  router.get(
    '/api/v1/admin/metrics/overview',
    protect,
    authorize('admin'),
    adminController.getMetricsOverview,
  );
  // Review payment (feedback)
  router.post(
    '/api/v1/payments/:paymentId/review',
    require('../controllers/paymentController.js').default.reviewPayment,
  );

  router.get(
    '/api/v1/admin/payments/transfer-summary',
    protect,
    authorize('admin'),
    adminController.getTransferSummary,
  );

  router.get(
    '/api/v1/admin/payments/transfer-history',
    protect,
    authorize('admin'),
    adminController.getTransferHistory,
  );

  // Admin: Reviews dashboard (list / detail / delete)
  router.get(
    '/api/v1/admin/reviews',
    protect,
    authorize('admin'),
    adminController.listReviews,
  );

  router.get(
    '/api/v1/admin/reviews/:paymentId',
    protect,
    authorize('admin'),
    adminController.getReview,
  );

  router.delete(
    '/api/v1/admin/reviews/:paymentId',
    protect,
    authorize('admin'),
    adminController.deleteReview,
  );

  // Admin: Subscription plans
  router.post(
    '/api/v1/admin/plans',
    protect,
    authorize('admin'),
    adminController.createPlan,
  );
  router.put(
    '/api/v1/admin/plans/:planId',
    protect,
    authorize('admin'),
    adminController.updatePlan,
  );
  // Thêm các route GET và DELETE cho quản lý subscription plans
  router.get(
    '/api/v1/admin/plans',
    protect,
    authorize('admin'),
    adminController.getPlans,
  );
  router.get(
    '/api/v1/admin/plans/:planId',
    protect,
    authorize('admin'),
    adminController.getPlanDetail,
  );
  router.delete(
    '/api/v1/admin/plans/:planId',
    protect,
    authorize('admin'),
    adminController.deletePlan,
  );

  // Admin: Sync logs monitoring
  router.get(
    '/api/v1/admin/sync-logs',
    protect,
    authorize('admin'),
    adminController.listSyncLogs,
  );

  // Subscription billing
  router.post(
    '/api/v1/subscriptions/checkout',
    protect,
    subscriptionBillingController.checkout,
  );
  router.post(
    '/api/v1/subscriptions/checkout/complete',
    protect,
    subscriptionBillingController.complete,
  );
  router.post(
    '/api/v1/subscriptions/checkout/cancel',
    protect,
    subscriptionBillingController.cancel,
  );

  // Mobile helper: get current active subscription
  router.get('/api/v1/subscriptions/active', protect, subscriptionController.active);

  // Transactions
  router.post(
    '/api/v1/transactions',
    protect,
    enforceTransactionQuota,
    transactionController.create,
  );

  router.post(
    '/api/transactions',
    protect,
    enforceTransactionQuota,
    transactionController.create,
  );
  router.get('/api/transactions', protect, transactionController.list);
  router.get('/api/transactions/:id', protect, transactionController.detail);
  router.patch('/api/transactions/:id', protect, transactionController.update);
  router.delete('/api/transactions/:id', protect, transactionController.remove);

  // v1 transactions (list/detail/update/delete)
  router.get('/api/v1/transactions', protect, transactionController.list);
  router.get('/api/v1/transactions/:id', protect, transactionController.detail);
  router.patch('/api/v1/transactions/:id', protect, transactionController.update);
  router.delete('/api/v1/transactions/:id', protect, transactionController.remove);

  // Budgets - Enhanced API v1
  router.post(
    '/api/v1/budgets',
    protect,
    enforceBudgetQuota,
    budgetController.create,
  );
  router.get('/api/v1/budgets', protect, budgetController.list);
  router.patch('/api/v1/budgets/:id', protect, budgetController.update);
  router.delete('/api/v1/budgets/:id', protect, budgetController.remove);
  router.get('/api/v1/budgets/analytics', protect, budgetController.getAnalytics);
  router.get('/api/v1/budgets/recommendations', protect, budgetController.getRecommendations);
  // Docs/schema for mobile integration
  router.get('/api/v1/budgets/recommendations/schema', protect, budgetController.recommendationsSchema);
  router.get('/api/v1/budgets/:id', protect, budgetController.detail);

  // Legacy support
  router.post('/api/budgets', protect, enforceBudgetQuota, budgetController.create);
  router.get('/api/budgets', protect, budgetController.list);
  router.get('/api/budgets/:id', protect, budgetController.detail);
  router.patch('/api/budgets/:id', protect, budgetController.update);
  router.delete('/api/budgets/:id', protect, budgetController.remove);
  router.get('/api/budgets/status', protect, budgetController.getStatus);

  // v1 budgets/status if needed
  router.get('/api/v1/budgets/status', protect, budgetController.getStatus);

  // Saving Goals - Enhanced API v1
  router.post(
    '/api/v1/saving-goals',
    protect,
    enforceSavingGoalQuota,
    savingGoalController.create,
  );
  router.get('/api/v1/saving-goals', protect, savingGoalController.list);
  // Register static/specific routes before the generic /:id to avoid conflicts
  router.get('/api/v1/saving-goals/analytics', protect, savingGoalController.getAnalytics);
  router.post('/api/v1/saving-goals/:id/contributions', protect, savingGoalController.addContribution);
  router.get('/api/v1/saving-goals/:id', protect, savingGoalController.detail);
  router.patch('/api/v1/saving-goals/:id', protect, savingGoalController.update);
  router.delete('/api/v1/saving-goals/:id', protect, savingGoalController.remove);

  // Legacy support
  router.post('/api/goals', protect, enforceSavingGoalQuota, savingGoalController.create);
  router.get('/api/goals', protect, savingGoalController.list);
  router.get('/api/goals/:id', protect, savingGoalController.detail);
  router.patch('/api/goals/:id', protect, savingGoalController.update);
  router.delete('/api/goals/:id', protect, savingGoalController.remove);
  router.patch('/api/goals/:id/progress', protect, savingGoalController.updateProgress);
  router.get('/api/goals/dashboard', protect, savingGoalController.getDashboard);

  // AI
  router.post(
    '/api/ai/parse-expense',
    protect,
    rateLimit({ windowMs: 60_000, max: 30 }),
    aiController.parseExpense,
  );
  router.post(
    '/api/v1/ai/chat',
    protect,
    rateLimit({ windowMs: 60 * 60 * 1000, max: 20 }),
    aiController.chat,
  );
  router.post(
    '/api/ai/qa',
    protect,
    rateLimit({ windowMs: 60_000, max: 30 }),
    aiController.qa,
  );

  // v1 AI parse/qa
  router.post('/api/v1/ai/parse-expense', protect, rateLimit({ windowMs: 60_000, max: 30 }), aiController.parseExpense);
  router.post('/api/v1/ai/qa', protect, rateLimit({ windowMs: 60_000, max: 30 }), aiController.qa);
  router.post(
    '/api/v1/ai/transactions/parse',
    protect,
    rateLimit({ windowMs: 60_000, max: 20 }),
    aiController.parseTransactionDraft,
  );
  // 🆕 NEW: Create transaction with wallet selection
  router.post(
    '/api/v1/ai/transactions/create-with-wallet',
    protect,
    rateLimit({ windowMs: 60_000, max: 15 }),
    aiController.createTransactionWithWallet,
  );

  // Notifications (basic)
  router.get('/api/notifications', protect, notificationController.list);
  router.patch(
    '/api/notifications/:id/read',
    protect,
    notificationController.markRead,
  );

  // v1 notifications
  router.get('/api/v1/notifications', protect, notificationController.list);
  router.patch('/api/v1/notifications/:id/read', protect, notificationController.markRead);

  // Reports (basic)
  router.get(
    '/api/reports/spend-by-category',
    protect,
    reportController.spendByCategory,
  );
  router.get(
    '/api/reports/monthly-trend',
    protect,
    reportController.monthlyTrend,
  );

  // v1 reports
  router.get('/api/v1/reports/spend-by-category', protect, reportController.spendByCategory);
  router.get('/api/v1/reports/monthly-trend', protect, reportController.monthlyTrend);

  return app.use('/', router);
};

export default initWebRoutes;
