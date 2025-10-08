import * as savingGoalService from '../services/savingGoalService.js';

export const create = async (req, res) => {
  try {
    const userId = req.user.id;
    const goal = await savingGoalService.create(userId, req.body);

    res.status(201).json({
      success: true,
      message: 'Tạo mục tiêu tiết kiệm thành công',
      data: goal,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// 🆕 NEW: Add contribution to saving goal
export const addContribution = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    // Normalize incoming payloads: accept multiple date field names and nested shapes
    let { amount, note, walletId, occurredAt } = req.body;
    // common variants
    occurredAt = occurredAt || req.body.occurred_at || req.body.contributedAt || req.body.contributed_at || (req.body.contribution && (req.body.contribution.occurredAt || req.body.contribution.occurred_at || req.body.contribution.contributedAt));

    const contributionPayload = {
      amount,
      note,
      walletId,
      occurredAt,
    };

    const result = await savingGoalService.addContribution(userId, id, contributionPayload);

    res.status(201).json({
      success: true,
      message: 'Đóng góp thành công',
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// 📊 NEW: Get saving goals analytics
export const getAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { includeProjections } = req.query;

    const analytics = await savingGoalService.getGoalAnalytics(userId, {
      includeProjections: includeProjections === 'true'
    });

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const list = async (req, res) => {
  try {
    const userId = req.user.id;
    const filters = req.query;
    const result = await savingGoalService.list(userId, filters);

    res.json({
      success: true,
      data: result.goals,
      pagination: result.pagination,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const detail = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const goal = await savingGoalService.detail(userId, id);

    res.json({
      success: true,
      data: goal,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const update = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const goal = await savingGoalService.update(userId, id, req.body);

    res.json({
      success: true,
      message: 'Cập nhật mục tiêu tiết kiệm thành công',
      data: goal,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const remove = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await savingGoalService.remove(userId, id);

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { additionalAmount } = req.body;

    if (!additionalAmount || additionalAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Số tiền bổ sung phải lớn hơn 0',
      });
    }

    const goal = await savingGoalService.updateProgress(
      userId,
      id,
      additionalAmount,
    );

    res.json({
      success: true,
      message: 'Cập nhật tiến độ thành công',
      data: goal,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const dashboard = await savingGoalService.getDashboard(userId);

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Default export for backward compatibility
export default {
  create,
  addContribution,
  getAnalytics,
  list,
  detail,
  update,
  remove,
  updateProgress,
  getDashboard,
};
