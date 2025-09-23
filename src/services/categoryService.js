import ExpenseCategory from "../models/expense_category.js";
import UserExpenseCategory from "../models/user_expense_category.js";

// System categories
const listSystem = async () => {
    const items = await ExpenseCategory.find({ isSystem: true }).sort({ name: 1 });
    return { success: true, statusCode: 200, items };
};

// My categories = system mapped + user custom
const listMine = async (userId) => {
    // Return user mappings (customName) and also system categories as base
    const mappings = await UserExpenseCategory.find({ user: userId, isActive: true })
        .populate("category")
        .lean();
    return { success: true, statusCode: 200, items: mappings };
};

const createMine = async (userId, payload) => {
    const { categoryId, customName } = payload;
    if (!categoryId && !customName) {
        return { success: false, statusCode: 400, message: "Cần categoryId hoặc customName" };
    }
    // If categoryId provided, ensure it exists
    if (categoryId) {
        const base = await ExpenseCategory.findById(categoryId);
        if (!base) return { success: false, statusCode: 404, message: "Danh mục hệ thống không tồn tại" };
    }
    try {
        const doc = await UserExpenseCategory.create({ user: userId, category: categoryId || null, customName: customName?.trim() });
        const created = await UserExpenseCategory.findById(doc._id).populate("category");
        return { success: true, statusCode: 201, item: created };
    } catch (e) {
        if (e.code === 11000) {
            return { success: false, statusCode: 409, message: "Danh mục đã tồn tại trong bộ sưu tập của bạn" };
        }
        throw e;
    }
};

const updateMine = async (userId, id, payload) => {
    const updates = {};
    if (typeof payload.customName !== "undefined") updates.customName = payload.customName?.trim();
    const item = await UserExpenseCategory.findOneAndUpdate(
        { _id: id, user: userId, isActive: true },
        { $set: updates },
        { new: true }
    ).populate("category");
    if (!item) return { success: false, statusCode: 404, message: "Không tìm thấy danh mục của bạn" };
    return { success: true, statusCode: 200, item };
};

const deleteMine = async (userId, id) => {
    const item = await UserExpenseCategory.findOneAndUpdate(
        { _id: id, user: userId, isActive: true },
        { $set: { isActive: false } },
        { new: true }
    );
    if (!item) return { success: false, statusCode: 404, message: "Không tìm thấy danh mục của bạn" };
    return { success: true, statusCode: 200, message: "Đã xóa danh mục", item };
};

export default { listSystem, listMine, createMine, updateMine, deleteMine };


