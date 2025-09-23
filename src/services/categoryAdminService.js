import ExpenseCategory from "../models/expense_category.js";

const createSystemCategory = async (payload) => {
    const { name, nameEn, icon, color } = payload;
    if (!name) return { success: false, statusCode: 400, message: "Thiếu tên danh mục" };
    const cat = await ExpenseCategory.create({ name: String(name).trim(), nameEn, icon, color, isSystem: true });
    return { success: true, statusCode: 201, item: cat };
};

const updateSystemCategory = async (categoryId, payload) => {
    const updates = {};
    ["name", "nameEn", "icon", "color"].forEach((k) => {
        if (typeof payload[k] !== "undefined") updates[k] = payload[k];
    });
    const cat = await ExpenseCategory.findOneAndUpdate({ _id: categoryId, isSystem: true }, { $set: updates }, { new: true });
    if (!cat) return { success: false, statusCode: 404, message: "Không tìm thấy danh mục hệ thống" };
    return { success: true, statusCode: 200, item: cat };
};

const deleteSystemCategory = async (categoryId) => {
    const cat = await ExpenseCategory.findOneAndDelete({ _id: categoryId, isSystem: true });
    if (!cat) return { success: false, statusCode: 404, message: "Không tìm thấy danh mục hệ thống" };
    return { success: true, statusCode: 200, message: "Đã xóa danh mục hệ thống", item: cat };
};

export default { createSystemCategory, updateSystemCategory, deleteSystemCategory };


