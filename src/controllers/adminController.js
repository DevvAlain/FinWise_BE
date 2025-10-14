import adminReportingService from '../services/adminReportingService.js';
import adminPlanService from '../services/adminPlanService.js';
import adminSyncLogService from '../services/adminSyncLogService.js';

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

export default {
  getMetricsOverview,
  createPlan,
  updatePlan,
  listSyncLogs,
};
