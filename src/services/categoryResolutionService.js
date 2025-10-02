const ExpenseCategory = require('../models/expense_category.js');
const UserExpenseCategory = require('../models/user_expense_category.js');
const AuditLog = require('../models/audit_log.js');
import { mapToCanonicalCategory } from './ai/categoryDictionary.js';
import { classifyExpenseCategory } from './ai/openRouterClient.js';
import { publishDomainEvents } from '../events/domainEvents.js';
import { findSystemCategoryEnhanced } from './starterCategoryService.js';

const normalize = (value) =>
  value
    ? value
      .toString()
      .trim()
      .toLowerCase()
    : '';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Enhanced system category finder với starter categories và confidence scoring
const findSystemCategory = async (normalizedName) => {
  if (!normalizedName) return null;

  // Sử dụng enhanced finder từ starter categories
  const enhancedResult = await findSystemCategoryEnhanced(normalizedName);
  if (enhancedResult) {
    return {
      category: enhancedResult.category,
      confidence: enhancedResult.confidence,
      matchType: enhancedResult.matchType
    };
  }

  // Fallback 1: OpenRouter AI classification  
  try {
    const aiResult = await classifyExpenseCategory(normalizedName);
    if (aiResult && aiResult.category && aiResult.confidence > 0) {
      const category = await ExpenseCategory.findOne({
        $or: [
          { name: new RegExp(`^${escapeRegex(aiResult.category)}$`, 'i') },
          { nameEn: new RegExp(`^${escapeRegex(aiResult.category)}$`, 'i') }
        ]
      });

      if (category) {
        return {
          category,
          confidence: aiResult.confidence,
          matchType: 'openrouter_ai'
        };
      }
    }
  } catch (error) {
    console.warn('[CategoryResolution] OpenRouter AI classification failed:', error.message);
  }

  // Fallback 2: AI dictionary mapping
  const mapped = mapToCanonicalCategory(normalizedName);
  const nameToSearch = mapped || normalizedName;
  const regex = new RegExp(`^${escapeRegex(nameToSearch)}$`, 'i');

  const category = await ExpenseCategory.findOne({
    $or: [{ name: regex }, { nameEn: regex }],
  });

  if (category) {
    return {
      category,
      confidence: mapped ? 0.8 : 0.6, // Higher confidence nếu AI mapped
      matchType: 'ai_mapped'
    };
  }

  return null;
};

const findUserCategory = async (userId, normalizedName) => {
  if (!normalizedName) return null;
  return UserExpenseCategory.findOne({
    user: userId,
    normalizedName,
    isActive: true,
    needsConfirmation: false,
  }).populate('category');
};

// Enhanced auto-assignment với confidence thresholds
const shouldAutoAssign = (confidence, matchType) => {
  // Auto-assign rules:
  // 1. Exact match với starter categories → Always auto-assign
  // 2. OpenRouter AI với high confidence (>= 0.8) → Auto-assign
  // 3. High confidence (>= 0.8) → Auto-assign
  // 4. Medium confidence (0.6-0.8) và exact/fuzzy match → Auto-assign
  // 5. Low confidence (< 0.6) → Require confirmation

  if (matchType === 'exact' && confidence >= 0.8) return true;
  if (matchType === 'fuzzy' && confidence >= 0.7) return true;
  if (matchType === 'openrouter_ai' && confidence >= 0.8) return true;
  if (matchType === 'ai_mapped' && confidence >= 0.8) return true;

  return false;
};

// Auto-create user category mapping
const autoCreateUserCategory = async (userId, systemCategory, categoryName, confidence, matchType) => {
  try {
    const normalizedName = normalize(categoryName);

    const userCategory = await UserExpenseCategory.create({
      user: userId,
      category: systemCategory._id,
      customName: categoryName,
      normalizedName,
      needsConfirmation: false,  // 🎯 AUTO-ASSIGNED
      isActive: true,
      createdBy: 'auto_ai',
      metadata: {
        confidence,
        matchType,
        autoAssigned: true,
        originalInput: categoryName
      }
    });

    // Log auto-assignment
    await AuditLog.create({
      user: userId,
      action: 'category_auto_assigned',
      metadata: {
        categoryId: systemCategory._id,
        categoryName,
        confidence,
        matchType,
        autoAssigned: true
      }
    });

    // Publish event
    await publishDomainEvents([
      {
        name: 'category.auto_assigned',
        payload: {
          userId,
          categoryId: systemCategory._id,
          categoryName,
          confidence,
          matchType,
          timestamp: new Date()
        }
      }
    ]);

    return userCategory;
  } catch (error) {
    console.error('Auto-create user category failed:', error);
    throw error;
  }
};

// Enhanced suggestion creation for low-confidence cases
const upsertCategorySuggestion = async (userId, categoryName) => {
  const normalizedName = categoryName.trim().toLowerCase();

  // First, check if suggestion already exists
  let suggestion = await UserExpenseCategory.findOne({
    user: userId,
    normalizedName,
    needsConfirmation: true,
    category: null
  });

  if (suggestion) {
    return suggestion;
  }

  // If not exists, create new suggestion
  try {
    suggestion = await UserExpenseCategory.create({
      user: userId,
      customName: categoryName,
      normalizedName,
      needsConfirmation: true,
      isActive: false,
      createdBy: 'ai',
      category: null
    });

    return suggestion;
  } catch (error) {
    // If still duplicate key error, try to find existing one more time
    if (error.code === 11000) {
      suggestion = await UserExpenseCategory.findOne({
        user: userId,
        normalizedName,
        needsConfirmation: true,
        category: null
      });
      if (suggestion) return suggestion;
    }
    throw error;
  }
};

export const recordCategoryUsageEvent = async (
  userId,
  categoryId,
  metadata = {},
) => {
  if (!categoryId) return;
  await publishDomainEvents([
    {
      name: 'analytics.category_usage',
      payload: {
        userId,
        categoryId,
        ...metadata,
      },
    },
  ]);
};

// 🚀 ENHANCED CATEGORY RESOLUTION với Smart Auto-assignment
export const resolveCategory = async (
  userId,
  { categoryId, categoryName },
) => {
  // Step 1: Explicit categoryId - highest priority
  if (categoryId) {
    const category = await ExpenseCategory.findById(categoryId);
    if (!category) {
      return {
        categoryId: null,
        needsConfirmation: false,
        matchedSource: null,
      };
    }
    return {
      categoryId: category._id,
      needsConfirmation: false,
      matchedSource: 'explicit',
      confidence: 1.0
    };
  }

  const normalizedName = normalize(categoryName);
  if (!normalizedName) {
    return {
      categoryId: null,
      needsConfirmation: false,
      confidence: 0
    };
  }

  // Step 2: Check existing user mapping
  const userCategory = await findUserCategory(userId, normalizedName);
  if (userCategory?.category?._id) {
    return {
      categoryId: userCategory.category._id,
      needsConfirmation: false,
      matchedSource: 'user',
      confidence: 0.95
    };
  }

  // Step 3: 🎯 SMART SYSTEM CATEGORY MATCHING
  const systemResult = await findSystemCategory(normalizedName);
  if (systemResult?.category) {
    const { category, confidence, matchType } = systemResult;

    // 🚀 SMART AUTO-ASSIGNMENT LOGIC
    if (shouldAutoAssign(confidence, matchType)) {
      console.log(`🎯 Auto-assigning category "${categoryName}" → "${category.name}" (confidence: ${confidence})`);

      // Tự động tạo user mapping
      await autoCreateUserCategory(userId, category, categoryName, confidence, matchType);

      return {
        categoryId: category._id,
        needsConfirmation: false,  // ✅ NO CONFIRMATION NEEDED
        matchedSource: 'system_auto',
        confidence,
        matchType,
        autoAssigned: true
      };
    } else {
      // Medium confidence - tạo suggestion với recommended category
      const suggestion = await upsertCategorySuggestion(userId, categoryName, normalizedName);

      return {
        categoryId: null,
        needsConfirmation: true,
        matchedSource: null,
        confidence,
        suggestion: {
          id: suggestion._id,
          name: categoryName,
          normalizedName,
          recommendedCategory: {
            id: category._id,
            name: category.name,
            confidence
          }
        }
      };
    }
  }

  // Step 4: No match found - create suggestion for manual handling
  const suggestion = await upsertCategorySuggestion(userId, categoryName, normalizedName);

  return {
    categoryId: null,
    needsConfirmation: true,
    matchedSource: null,
    confidence: 0,
    suggestion: suggestion ? {
      id: suggestion._id,
      name: categoryName,
      normalizedName,
    } : null,
  };
};

export const confirmCategorySuggestion = async (
  userId,
  { suggestionId, categoryName, systemCategoryId },
) => {
  let suggestionDoc = null;
  if (suggestionId) {
    suggestionDoc = await UserExpenseCategory.findOne({
      _id: suggestionId,
      user: userId,
    });
    if (!suggestionDoc) {
      throw new Error('Suggestion not found');
    }
  }

  let userCategory;

  if (systemCategoryId) {
    const systemCategory = await ExpenseCategory.findById(systemCategoryId);
    if (!systemCategory) {
      throw new Error('System category not found');
    }
    const normalized = normalize(categoryName || systemCategory.name);
    userCategory = await UserExpenseCategory.findOneAndUpdate(
      { user: userId, category: systemCategoryId },
      {
        $set: {
          customName: categoryName || systemCategory.name,
          normalizedName: normalized,
          needsConfirmation: false,
          isActive: true,
        },
        $setOnInsert: {
          createdBy: suggestionDoc?.createdBy || 'ai',
          user: userId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).populate('category');
  } else {
    const name = categoryName?.trim();
    if (!name) {
      throw new Error('Category name is required');
    }
    const normalizedName = normalize(name);

    const existingSystem = await findSystemCategory(normalizedName);
    if (existingSystem) {
      return confirmCategorySuggestion(userId, {
        suggestionId,
        categoryName: name,
        systemCategoryId: existingSystem._id,
      });
    }

    const newCategory = await ExpenseCategory.create({
      name,
      isSystem: false,
    });

    userCategory = await UserExpenseCategory.findOneAndUpdate(
      { user: userId, normalizedName },
      {
        $set: {
          category: newCategory._id,
          customName: name,
          needsConfirmation: false,
          isActive: true,
        },
        $setOnInsert: {
          createdBy: suggestionDoc?.createdBy || 'ai',
          user: userId,
          normalizedName,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).populate('category');
  }

  if (suggestionDoc) {
    await UserExpenseCategory.findByIdAndUpdate(suggestionDoc._id, {
      $set: {
        category: userCategory?.category,
        customName: userCategory?.customName,
        normalizedName: userCategory?.normalizedName,
        needsConfirmation: false,
        isActive: true,
      },
    });
  }

  await AuditLog.create({
    user: userId,
    action: 'category_confirmed',
    metadata: {
      suggestionId,
      categoryId: userCategory?.category,
      categoryName: categoryName || userCategory?.customName,
      systemCategoryId,
    },
  });

  // 🆕 ADD MISSING EVENT: category.confirmed
  await publishDomainEvents([
    {
      name: 'category.confirmed',
      payload: {
        userId,
        suggestionId,
        categoryId: userCategory?.category,
        categoryName: categoryName || userCategory?.customName,
        action: systemCategoryId ? 'accept_system' : 'create_new',
        timestamp: new Date(),
      },
    },
  ]);

  await recordCategoryUsageEvent(userId, userCategory?.category, {
    source: 'confirmation',
  });

  return userCategory;
};

export const listPendingSuggestions = async (userId) => {
  const items = await UserExpenseCategory.find({
    user: userId,
    needsConfirmation: true,
    isActive: false,
  })
    .populate('category')
    .sort({ createdAt: -1 })
    .lean();
  return items;
};

export default {
  resolveCategory,
  confirmCategorySuggestion,
  recordCategoryUsageEvent,
  listPendingSuggestions,
};
