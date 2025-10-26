import ExpenseCategory from '../models/expense_category.js';
import UserExpenseCategory from '../models/user_expense_category.js';
import AuditLog from '../models/audit_log.js'; // 🆕 ADD MISSING IMPORT
import {
  confirmCategorySuggestion as coreConfirmCategorySuggestion,
  listPendingSuggestions,
} from './categoryResolutionService.js';

// System categories
const listSystem = async () => {
  const items = await ExpenseCategory.find({ isSystem: true }).sort({
    name: 1,
  });
  return { success: true, statusCode: 200, items };
};

// My categories = system mapped + user custom
const listMine = async (userId) => {
  const mappings = await UserExpenseCategory.find({
    user: userId,
    isActive: true,
  })
    .populate('category')
    .lean();
  return { success: true, statusCode: 200, items: mappings };
};

const createMine = async (userId, payload) => {
  const { categoryId, customName } = payload;
  if (!categoryId && !customName) {
    return {
      success: false,
      statusCode: 400,
      message: 'Can categoryId hoac customName',
    };
  }

  if (categoryId) {
    const base = await ExpenseCategory.findById(categoryId);
    if (!base) {
      return {
        success: false,
        statusCode: 404,
        message: 'Danh muc he thong khong ton tai',
      };
    }
  }

  try {
    // Use upsert to avoid duplicate-key insertion under concurrency
    const normalizedName = customName?.trim()?.toLowerCase();
    const filter = normalizedName
      ? { user: userId, normalizedName }
      : { user: userId, category: categoryId || null };

    const update = {
      $set: {
        user: userId,
        category: categoryId || null,
        customName: customName?.trim(),
        normalizedName: normalizedName || undefined,
      },
      $setOnInsert: { createdAt: new Date() },
    };

    const doc = await UserExpenseCategory.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    const created = await UserExpenseCategory.findById(doc._id).populate('category');
    return { success: true, statusCode: 201, item: created };
  } catch (error) {
    if (error.code === 11000) {
      return {
        success: false,
        statusCode: 409,
        message: 'Danh muc da ton tai trong bo suu tap cua ban',
      };
    }
    throw error;
  }
};

const updateMine = async (userId, id, payload) => {
  const updates = {};
  if (typeof payload.customName !== 'undefined') {
    updates.customName = payload.customName?.trim();
  }
  const item = await UserExpenseCategory.findOneAndUpdate(
    { _id: id, user: userId, isActive: true },
    { $set: updates },
    { new: true },
  ).populate('category');
  if (!item) {
    return {
      success: false,
      statusCode: 404,
      message: 'Khong tim thay danh muc cua ban',
    };
  }
  return { success: true, statusCode: 200, item };
};

const deleteMine = async (userId, id) => {
  const item = await UserExpenseCategory.findOneAndUpdate(
    { _id: id, user: userId, isActive: true },
    { $set: { isActive: false } },
    { new: true },
  );
  if (!item) {
    return {
      success: false,
      statusCode: 404,
      message: 'Khong tim thay danh muc cua ban',
    };
  }
  return { success: true, statusCode: 200, message: 'Da xoa danh muc', item };
};

const listSuggestions = async (userId) => {
  const items = await listPendingSuggestions(userId);
  return { success: true, statusCode: 200, items };
};

const confirmSuggestion = async (userId, id, payload) => {
  try {
    const categoryName = payload?.categoryName;
    const systemCategoryId = payload?.systemCategoryId;
    const userCategory = await coreConfirmCategorySuggestion(userId, {
      suggestionId: id,
      categoryName,
      systemCategoryId,
    });
    return { success: true, statusCode: 200, item: userCategory };
  } catch (error) {
    const message = error?.message || 'Failed to confirm suggestion';
    if (message === 'Suggestion not found') {
      return { success: false, statusCode: 404, message };
    }
    if (message === 'System category not found') {
      return { success: false, statusCode: 404, message };
    }
    if (message === 'Category name is required') {
      return { success: false, statusCode: 400, message };
    }
    throw error;
  }
};

// 🆕 ADD MISSING: Reject suggestion function
const rejectSuggestion = async (userId, id, feedback = null) => {
  try {
    const suggestion = await UserExpenseCategory.findOne({
      _id: id,
      user: userId,
      needsConfirmation: true,
    });

    if (!suggestion) {
      return { success: false, statusCode: 404, message: 'Suggestion not found' };
    }

    // Soft delete suggestion
    await UserExpenseCategory.findByIdAndUpdate(id, {
      $set: { isActive: false, needsConfirmation: false },
    });

    // Log audit
    await AuditLog.create({
      user: userId,
      action: 'category_suggestion_rejected',
      metadata: {
        suggestionId: id,
        categoryName: suggestion.customName,
        feedback,
      },
    });

    return { success: true, statusCode: 200, message: 'Suggestion rejected' };
  } catch (error) {
    throw error;
  }
};

export default {
  listSystem,
  listMine,
  createMine,
  updateMine,
  deleteMine,
  listSuggestions,
  confirmSuggestion,
  rejectSuggestion, // 🆕 ADD MISSING EXPORT
};
