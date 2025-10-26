import adminReportingService from '../services/adminReportingService.js';
import adminPlanService from '../services/adminPlanService.js';
import adminSyncLogService from '../services/adminSyncLogService.js';
import adminPaymentAnalyticsService from '../services/adminPaymentAnalyticsService.js';

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

export default {
  getMetricsOverview,
  createPlan,
  updatePlan,
  listSyncLogs,
  getTransferSummary,
  getTransferHistory,
};
