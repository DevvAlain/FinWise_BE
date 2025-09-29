import { geminiGenerateJSON } from './ai/geminiClient.js';
import { grokChat } from './ai/openrouterClient.js';
import ExpenseCategory from '../models/expense_category.js';
import UserExpenseCategory from '../models/user_expense_category.js';
import Wallet from '../models/wallet.js';
import transactionService from './transactionService.js';
import { mapToCanonicalCategory } from './ai/categoryDictionary.js';
import AuditLog from '../models/audit_log.js';

const parseSystemPrompt = `You are a finance parser. Extract structured fields from Vietnamese user text about expenses or incomes.
Return JSON with fields: type ('expense'|'income'|'transfer'), amount(number), currency(string, default 'VND'),
categoryName(string), occurredAt(ISO string), description(string), confidence(number 0..1).
If date missing, use now. Do not include extra keys.`;

const normalize = (value) =>
  value
    ? value
        .toString()
        .trim()
        .toLowerCase()
    : '';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const logAiAudit = async (userId, action, metadata) => {
  await AuditLog.create({
    user: userId,
    action,
    metadata,
  });
};

const findSystemCategory = async (normalizedName) => {
  if (!normalizedName) return null;

  const mapped = mapToCanonicalCategory(normalizedName);
  const nameToSearch = mapped || normalizedName;

  const regex = new RegExp(`^${escapeRegex(nameToSearch)}$`, 'i');
  return ExpenseCategory.findOne({
    $or: [{ name: regex }, { nameEn: regex }],
  });
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

const upsertCategorySuggestion = async (userId, categoryName, normalizedName) => {
  if (!normalizedName) return null;

  const suggestion = await UserExpenseCategory.findOneAndUpdate(
    { user: userId, normalizedName },
    {
      $setOnInsert: {
        customName: categoryName,
        createdBy: 'ai',
        needsConfirmation: true,
        isActive: false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return suggestion;
};

const resolveExpenseCategory = async (userId, categoryName) => {
  const normalizedName = normalize(categoryName);
  if (!normalizedName) {
    return { categoryId: null, needsConfirmation: false };
  }

  const userCategory = await findUserCategory(userId, normalizedName);
  if (userCategory?.category?._id) {
    return {
      categoryId: userCategory.category._id,
      needsConfirmation: false,
      matchedSource: 'user',
    };
  }

  const systemCategory = await findSystemCategory(normalizedName);
  if (systemCategory?._id) {
    return {
      categoryId: systemCategory._id,
      needsConfirmation: false,
      matchedSource: 'system',
    };
  }

  const suggestion = await upsertCategorySuggestion(
    userId,
    categoryName,
    normalizedName,
  );

  return {
    categoryId: null,
    needsConfirmation: true,
    suggestion: {
      id: suggestion?._id,
      name: categoryName,
      normalizedName,
    },
  };
};

const parseExpense = async (userId, userText) => {
  const response = await geminiGenerateJSON(parseSystemPrompt, userText);

  await logAiAudit(userId, 'ai_parse_transaction', {
    prompt: parseSystemPrompt,
    userText,
    response,
  });

  return response;
};

const qa = async (userId, question, contextSummary) => {
  const messages = [
    {
      role: 'system',
      content: 'Ban la tro ly tai chinh, tra loi ngan gon, than thien.',
    },
    {
      role: 'user',
      content: `${question}\n\nContext:\n${contextSummary || ''}`,
    },
  ];
  const answer = await grokChat(messages);

  await logAiAudit(userId, 'ai_qa', {
    question,
    contextSummary,
    answer,
  });

  return answer;
};

const applyCategoryToPayload = (payload, resolution) => {
  if (resolution.categoryId) {
    payload.category = resolution.categoryId;
  }
  return payload;
};

export async function createTransactionFromText(userId, { text, walletId }) {
  const parsed = await parseExpense(userId, text);
  const minConfidence = Number(process.env.AI_MIN_CONFIDENCE || 0.6);

  const baseDraft = {
    type: parsed.type || 'expense',
    amount: parsed.amount,
    currency: parsed.currency || 'VND',
    categoryName: parsed.categoryName || null,
    occurredAt: parsed.occurredAt || new Date().toISOString(),
    description: parsed.description || text,
  };

  if (
    typeof parsed.confidence === 'number' &&
    parsed.confidence < minConfidence
  ) {
    return {
      success: true,
      statusCode: 200,
      draft: baseDraft,
      needsConfirmation: true,
      message: 'Do tin cay thap, can xac nhan truoc khi tao giao dich',
    };
  }

  // Resolve wallet
  let wallet = walletId || parsed.wallet;
  if (!wallet) {
    const firstWallet = await Wallet.findOne({
      user: userId,
      isActive: true,
    }).sort({
      createdAt: 1,
    });
    if (!firstWallet) {
      return {
        success: false,
        statusCode: 400,
        message: 'Ban chua co vi de ghi nhan giao dich',
      };
    }
    wallet = firstWallet._id;
  }

  const categoryResolution = await resolveExpenseCategory(
    userId,
    parsed.categoryName,
  );

  if (categoryResolution.needsConfirmation) {
    return {
      success: true,
      statusCode: 200,
      draft: {
        ...baseDraft,
        wallet,
        suggestedCategory: categoryResolution.suggestion,
      },
      needsConfirmation: true,
      message: 'Can xac nhan danh muc truoc khi tao giao dich',
    };
  }

  const payload = applyCategoryToPayload(
    {
      wallet,
      type: baseDraft.type,
      amount: baseDraft.amount,
      currency: baseDraft.currency,
      occurredAt: baseDraft.occurredAt,
      description: baseDraft.description,
      inputMethod: 'manual',
    },
    categoryResolution,
  );

  const result = await transactionService.create(userId, payload);

  await logAiAudit(userId, 'ai_transaction_created', {
    source: 'text_parse',
    payload,
    transactionId: result?.transaction?._id,
  });

  return result;
}

export async function createTransactionFromDraft(userId, draft) {
  const {
    walletId,
    type,
    amount,
    currency = 'VND',
    categoryId,
    categoryName,
    occurredAt,
    description,
  } = draft;

  let wallet = walletId;
  if (!wallet) {
    const firstWallet = await Wallet.findOne({ user: userId, isActive: true }).sort({ createdAt: 1 });
    if (!firstWallet) {
      return { success: false, statusCode: 400, message: 'Ban chua co vi de ghi nhan giao dich' };
    }
    wallet = firstWallet._id;
  }

  let categoryResolution = { categoryId: categoryId || null, needsConfirmation: false };
  if (!categoryId && categoryName) {
    categoryResolution = await resolveExpenseCategory(userId, categoryName);
  }

  if (categoryResolution.needsConfirmation) {
    return {
      success: true,
      statusCode: 200,
      draft: {
        walletId: wallet,
        type: type || 'expense',
        amount,
        currency,
        categoryName,
        occurredAt: occurredAt || new Date().toISOString(),
        description: description || '',
        suggestedCategory: categoryResolution.suggestion,
      },
      needsConfirmation: true,
      message: 'Can xac nhan danh muc truoc khi tao giao dich',
    };
  }

  const payload = applyCategoryToPayload(
    {
      wallet,
      type: type || 'expense',
      amount,
      currency,
      occurredAt: occurredAt || new Date().toISOString(),
      description: description || '',
      inputMethod: 'manual',
    },
    categoryResolution,
  );

  const result = await transactionService.create(userId, payload);
  await logAiAudit(userId, 'ai_transaction_created_draft', {
    payload,
    transactionId: result?.transaction?._id,
  });
  return result;
}

export async function confirmCategorySuggestion(
  userId,
  { suggestionId, categoryName, systemCategoryId },
) {
  let userCategory;

  if (systemCategoryId) {
    const systemCategory = await ExpenseCategory.findById(systemCategoryId);
    if (!systemCategory) {
      throw new Error('System category not found');
    }
    userCategory = await UserExpenseCategory.findOneAndUpdate(
      { user: userId, category: systemCategoryId },
      {
        $set: {
          customName: categoryName || systemCategory.name,
          normalizedName: normalize(categoryName || systemCategory.name),
          needsConfirmation: false,
          isActive: true,
          createdBy: 'ai',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } else {
    const name = categoryName?.trim();
    if (!name) throw new Error('Category name is required');

    const normalizedName = normalize(name);
    const existing = await findSystemCategory(normalizedName);
    if (existing) {
      return confirmCategorySuggestion(userId, {
        suggestionId,
        categoryName: name,
        systemCategoryId: existing._id,
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
          createdBy: 'ai',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  if (suggestionId) {
    await UserExpenseCategory.findByIdAndUpdate(suggestionId, {
      $set: {
        category: userCategory.category,
        needsConfirmation: false,
        isActive: true,
      },
    });
  }

  await logAiAudit(userId, 'ai_category_confirmed', {
    suggestionId,
    categoryId: userCategory?.category,
  });

  return userCategory;
}

export default { parseExpense, qa };