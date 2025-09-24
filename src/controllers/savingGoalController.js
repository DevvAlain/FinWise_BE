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

        const goal = await savingGoalService.updateProgress(userId, id, additionalAmount);

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
