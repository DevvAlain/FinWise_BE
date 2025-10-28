import adminReportingService from '../services/adminReportingService.js';
import adminPlanService from '../services/adminPlanService.js';
import adminSyncLogService from '../services/adminSyncLogService.js';
import adminPaymentAnalyticsService from '../services/adminPaymentAnalyticsService.js';
import Payment from '../models/payment.js';

const getMetricsOverview = async (_req, res) => {
  try {
    const data = await adminReportingService.getMetricsOverview();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[AdminController] getMetricsOverview error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load metrics overview',
    });
  }
};

const getPlans = async (_req, res) => {
  try {
    const result = await adminPlanService.getPlans();
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('[AdminController] getPlans error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plans',
    });
  }
};

const getPlanDetail = async (req, res) => {
  try {
    const result = await adminPlanService.getPlanDetail(req.params.planId);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('[AdminController] getPlanDetail error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription plan detail',
    });
  }
};

const deletePlan = async (req, res) => {
  try {
    const result = await adminPlanService.deletePlan(req.params.planId);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('[AdminController] deletePlan error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete subscription plan',
    });
  }
};

const updatePlan = async (req, res) => {
  try {
    const result = await adminPlanService.updatePlan(
      req.params.planId,
      req.body,
    );
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('[AdminController] updatePlan error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update subscription plan',
    });
  }
};

const listSyncLogs = async (req, res) => {
  try {
    const result = await adminSyncLogService.listSyncLogs(req.query);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('[AdminController] listSyncLogs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load sync logs',
    });
  }
};

const getTransferSummary = async (req, res) => {
  try {
    const data = await adminPaymentAnalyticsService.getTransferSummary({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[AdminController] getTransferSummary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load transfer summary',
    });
  }
};

const getTransferHistory = async (req, res) => {
  try {
    const data = await adminPaymentAnalyticsService.getTransferHistory({
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupBy: req.query.groupBy,
      timezone: req.query.timezone,
    });
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('[AdminController] getTransferHistory error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load transfer history',
    });
  }
};

const createPlan = async (req, res) => {
  try {
    const result = await adminPlanService.createPlan(req.body);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('[AdminController] createPlan error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create subscription plan',
    });
  }
};

// --- Review management for admin dashboard ---
const listReviews = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const filter = { review: { $ne: null } };
    if (req.query.rating) {
      const rating = parseInt(req.query.rating, 10);
      if (!isNaN(rating)) filter['review.rating'] = rating;
    }
    if (req.query.provider) {
      filter.provider = req.query.provider;
    }

    const [total, payments] = await Promise.all([
      Payment.countDocuments(filter),
      Payment.find(filter)
        .select('user provider transactionId providerTransactionId providerRequestId review paidAt amount currency')
        .sort({ 'review.createdAt': -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        page,
        limit,
        items: payments.map((p) => ({
          paymentId: p._id,
          user: p.user,
          provider: p.provider,
          transactionId: p.transactionId || p.providerTransactionId || p.providerRequestId,
          amount: p.amount,
          currency: p.currency,
          paidAt: p.paidAt,
          review: p.review,
        })),
      },
    });
  } catch (error) {
    console.error('[AdminController] listReviews error:', error);
    return res.status(500).json({ success: false, message: 'Failed to list reviews' });
  }
};

const _findPaymentByIdOrProvider = async (id) => {
  if (!id) return null;
  if (Payment.db && Payment.db.constructor && id && id.match && id.length === 24) {
    // best-effort: if looks like objectId
    try {
      const byId = await Payment.findById(id);
      if (byId) return byId;
    } catch (e) {
      // ignore
    }
  }
  const orClauses = [
    { _id: id },
    { transactionId: id },
    { providerRequestId: id },
    { providerTransactionId: id },
  ];
  const p = await Payment.findOne({ $or: orClauses });
  return p;
};

const getReview = async (req, res) => {
  try {
    const id = req.params.paymentId;
    const payment = await _findPaymentByIdOrProvider(id);
    if (!payment || !payment.review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    return res.status(200).json({ success: true, data: { paymentId: payment._id, review: payment.review } });
  } catch (error) {
    console.error('[AdminController] getReview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to get review' });
  }
};

const deleteReview = async (req, res) => {
  try {
    const id = req.params.paymentId;
    const payment = await _findPaymentByIdOrProvider(id);
    if (!payment || !payment.review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    payment.review = null;
    await payment.save();
    return res.status(200).json({ success: true, message: 'Review deleted' });
  } catch (error) {
    console.error('[AdminController] deleteReview error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete review' });
  }
};

export default {
  getMetricsOverview,
  createPlan,
  updatePlan,
  getPlans,
  getPlanDetail,
  deletePlan,
  listSyncLogs,
  getTransferSummary,
  getTransferHistory,
  // review management
  listReviews,
  getReview,
  deleteReview,
};
