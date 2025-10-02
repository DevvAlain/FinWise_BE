import { openRouterChat, classifyExpenseCategory } from './ai/openRouterClient.js';
import Wallet from '../models/wallet.js';
import transactionService from './transactionService.js';
import AuditLog from '../models/audit_log.js';
import {
  resolveCategory,
  confirmCategorySuggestion as coreConfirmCategorySuggestion,
} from './categoryResolutionService.js';

const parseSystemPrompt = `You are a finance parser. Extract structured fields from Vietnamese user text about expenses or incomes.
Return JSON with fields: type ('expense'|'income'|'transfer'), amount(number), currency(string, default 'VND'),
categoryName(string), occurredAt(ISO string), description(string), confidence(number 0..1).
If date missing, use now. Do not include extra keys.`;

const logAiAudit = async (userId, action, metadata) => {
  await AuditLog.create({
    user: userId,
    action,
    metadata,
  });
};

const parseExpense = async (userId, userText) => {
  try {
    const messages = [
      { role: 'system', content: parseSystemPrompt },
      { role: 'user', content: userText }
    ];

    const response = await openRouterChat(messages);
    const parsedData = JSON.parse(response);

    await logAiAudit(userId, 'ai_parse_transaction', {
      prompt: parseSystemPrompt,
      userText,
      response: parsedData,
    });

    return parsedData;
  } catch (error) {
    console.error('[AI] Parse expense error:', error);
    await logAiAudit(userId, 'ai_parse_transaction_error', {
      error: error.message,
      userText,
    });
    throw error;
  }
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
  const answer = await openRouterChat(messages);

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

export async function generateTransactionDraftFromText(userId, { text, walletId }) {
  const parsed = await parseExpense(userId, text);
  const confidence =
    typeof parsed.confidence === 'number' ? parsed.confidence : null;
  const minConfidence = Number(process.env.AI_MIN_CONFIDENCE || 0.6);

  let wallet = walletId || parsed.wallet;
  let walletDoc = null;

  if (wallet) {
    walletDoc = await Wallet.findOne({
      _id: wallet,
      user: userId,
      isActive: true,
    });
    if (!walletDoc) {
      return {
        success: false,
        statusCode: 404,
        message: 'Khong tim thay vi',
      };
    }
  } else {
    walletDoc = await Wallet.findOne({
      user: userId,
      isActive: true,
    }).sort({ createdAt: 1 });
    if (!walletDoc) {
      return {
        success: false,
        statusCode: 400,
        message: 'Ban chua co vi de ghi nhan giao dich',
      };
    }
    wallet = walletDoc._id;
  }

  const draft = {
    walletId: walletDoc._id,
    type: parsed.type || 'expense',
    amount: parsed.amount,
    currency: parsed.currency || 'VND',
    categoryName: parsed.categoryName || null,
    occurredAt: parsed.occurredAt || new Date().toISOString(),
    description: parsed.description || text,
  };

  let needsConfirmation = false;
  let message = null;

  const numericAmount = Number(draft.amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    needsConfirmation = true;
    message = 'Can xac nhan so tien truoc khi tao giao dich';
  } else {
    draft.amount = numericAmount;
  }

  const categoryResolution = await resolveCategory(userId, {
    categoryName: parsed.categoryName,
  });

  if (categoryResolution.categoryId) {
    draft.categoryId = categoryResolution.categoryId;
  }

  if (categoryResolution.needsConfirmation) {
    needsConfirmation = true;
    draft.suggestedCategory = categoryResolution.suggestion;
    message = message || 'Can xac nhan danh muc truoc khi tao giao dich';
  }

  if (confidence !== null && confidence < minConfidence) {
    needsConfirmation = true;
    message =
      message || 'Do tin cay thap, can xac nhan truoc khi tao giao dich';
  }

  await logAiAudit(userId, 'ai_transaction_draft_generated', {
    text,
    parsed,
    draft,
    confidence,
  });

  return {
    success: true,
    statusCode: 200,
    draft,
    confidence,
    needsConfirmation,
    message,
  };
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
    categoryResolution = await resolveCategory(userId, {
      categoryName,
    });
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
      walletId: wallet,
      wallet,
      type: type || 'expense',
      amount,
      currency,
      occurredAt: occurredAt || new Date().toISOString(),
      description: description || '',
      inputMethod: 'ai_assisted',
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
  const userCategory = await coreConfirmCategorySuggestion(userId, {
    suggestionId,
    categoryName,
    systemCategoryId,
  });

  await logAiAudit(userId, 'ai_category_confirmed', {
    suggestionId,
    categoryId: userCategory?.category,
  });

  return userCategory;
}

export default {
  parseExpense,
  qa,
  generateTransactionDraftFromText,
  createTransactionFromDraft,
  confirmCategorySuggestion,
};
