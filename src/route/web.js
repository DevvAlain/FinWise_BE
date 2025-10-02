import express from 'express';
// import userController from "../controllers/userController";
import authController from '../controllers/authController';
import { protect, authorize } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';
import userProfileController from '../controllers/userProfileController.js';
import walletController from '../controllers/walletController.js';
import categoryController from '../controllers/categoryController.js';
import categoryAdminController from '../controllers/categoryAdminController.js';
import {
  enforceWalletQuota,
  enforceTransactionQuota,
  enforceBudgetQuota,
  enforceSavingGoalQuota,
} from '../middleware/quotaMiddleware.js';
import transactionController from '../controllers/transactionController.js';
import budgetController from '../controllers/budgetController.js';
import savingGoalController from '../controllers/savingGoalController.js';
import aiController from '../controllers/aiController.js';
import { rateLimit } from '../middleware/rateLimitMiddleware.js';
import notificationController from '../controllers/notificationController.js';
import reportController from '../controllers/reportController.js';

let router = express.Router();

let initWebRoutes = (app) => {
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

  // Budgets
  router.post(
    '/api/budgets',
    protect,
    enforceBudgetQuota,
    budgetController.create,
  );
  router.get('/api/budgets', protect, budgetController.list);
  router.get('/api/budgets/:id', protect, budgetController.detail);
  router.patch('/api/budgets/:id', protect, budgetController.update);
  router.delete('/api/budgets/:id', protect, budgetController.remove);
  router.get('/api/budgets/status', protect, budgetController.getStatus);

  // Saving Goals
  router.post(
    '/api/goals',
    protect,
    enforceSavingGoalQuota,
    savingGoalController.create,
  );
  router.get('/api/goals', protect, savingGoalController.list);
  router.get('/api/goals/:id', protect, savingGoalController.detail);
  router.patch('/api/goals/:id', protect, savingGoalController.update);
  router.delete('/api/goals/:id', protect, savingGoalController.remove);
  router.patch(
    '/api/goals/:id/progress',
    protect,
    savingGoalController.updateProgress,
  );
  router.get(
    '/api/goals/dashboard',
    protect,
    savingGoalController.getDashboard,
  );

  // AI
  router.post(
    '/api/ai/parse-expense',
    protect,
    rateLimit({ windowMs: 60_000, max: 30 }),
    aiController.parseExpense,
  );
  router.post(
    '/api/ai/qa',
    protect,
    rateLimit({ windowMs: 60_000, max: 30 }),
    aiController.qa,
  );
  router.post(
    '/api/v1/ai/transactions/parse',
    protect,
    rateLimit({ windowMs: 60_000, max: 20 }),
    aiController.parseTransactionDraft,
  );

  // Notifications (basic)
  router.get('/api/notifications', protect, notificationController.list);
  router.patch(
    '/api/notifications/:id/read',
    protect,
    notificationController.markRead,
  );

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

  return app.use('/', router);
};

export default initWebRoutes;
