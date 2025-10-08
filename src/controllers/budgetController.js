import * as budgetService from '../services/budgetService.js';

// ✨ Enhanced Budget Creation with AI recommendations
export const create = async (req, res) => {
  try {
    const userId = req.user.id;

    // 🚀 Get AI recommendations if requested
    if (req.body.includeRecommendations) {
      const recommendations = await budgetService.getAIRecommendations(userId, req.body);
      req.body.aiRecommendations = recommendations;
    }

    const budget = await budgetService.create(userId, req.body);

    res.status(201).json({
      success: true,
      message: 'Tạo ngân sách thành công',
      data: budget,
      recommendations: req.body.aiRecommendations || null,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// 📊 New: Get AI-powered budget recommendations
export const getRecommendations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, period, includeSeasonality } = req.query;

    const recommendations = await budgetService.getAIRecommendations(userId, {
      category,
      period,
      includeSeasonality: includeSeasonality === 'true'
    });

    res.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Small docs endpoint: describe recommendation payload for mobile clients
export const recommendationsSchema = (req, res) => {
  res.json({
    success: true,
    schema: {
      recommendedAmount: 'number (VND)',
      baseAmount: 'number (VND) - optional',
      confidence: "'high'|'medium'|'low'",
      dataPoints: 'number - how many months of data used',
      insufficientData: 'boolean - true if using fallback default',
      reasoning: 'string - human readable explanation',
      ui: {
        amountFormatted: 'string - localized formatted amount',
        shortMessage: 'string - one-line hint for UI',
        confidenceBadge: 'string - short label to show on badge',
      },
    },
  });
};

// 📈 New: Get budget analytics and insights
export const getAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = 'monthly', includeForecasting } = req.query;

    const analytics = await budgetService.getBudgetAnalytics(userId, {
      period,
      includeForecasting: includeForecasting === 'true'
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
    const result = await budgetService.list(userId, filters);

    res.json({
      success: true,
      data: result.budgets,
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
    const budget = await budgetService.detail(userId, id);

    res.json({
      success: true,
      data: budget,
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
    const budget = await budgetService.update(userId, id, req.body);

    res.json({
      success: true,
      message: 'Cập nhật ngân sách thành công',
      data: budget,
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
    const result = await budgetService.remove(userId, id);

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

export const getStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const filters = req.query;
    const statusData = await budgetService.getStatus(userId, filters);

    res.json({
      success: true,
      data: statusData,
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
  getRecommendations,
  getAnalytics,
  list,
  detail,
  update,
  remove,
  getStatus,
};
