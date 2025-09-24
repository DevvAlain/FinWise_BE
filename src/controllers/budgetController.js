import * as budgetService from '../services/budgetService.js';

export const create = async (req, res) => {
    try {
        const userId = req.user.id;
        const budget = await budgetService.create(userId, req.body);

        res.status(201).json({
            success: true,
            message: 'Tạo ngân sách thành công',
            data: budget,
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
