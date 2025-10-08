import { openRouterChat, classifyExpenseCategory } from './ai/openRouterClient.js';
import Wallet from '../models/wallet.js';
import transactionService from './transactionService.js';
import AuditLog from '../models/audit_log.js';
import {
  resolveCategory,
  confirmCategorySuggestion as coreConfirmCategorySuggestion,
} from './categoryResolutionService.js';

const parseSystemPrompt = `You are a Vietnamese finance parser. Extract structured fields from Vietnamese user text about expenses or incomes.

IMPORTANT CURRENCY RULES:
- "k" or "K" means thousand (nghìn): 50k = 50,000 VND
- "tr" means million (triệu): 2tr = 2,000,000 VND  
- "đ" means VND (đồng)
- Numbers without unit default to VND
- Always return amount as full number (50k → 50000, not 50)

EXAMPLES:
- "ăn sáng 50k" → amount: 50000
- "mua cà phê 25k" → amount: 25000
- "lương 15tr" → amount: 15000000
- "đi xe bus 7 nghìn" → amount: 7000

Return only valid JSON with fields: type ('expense'|'income'|'transfer'), amount(number), currency(string, default 'VND'),
categoryName(string), occurredAt(ISO string), description(string), confidence(number 0..1).
If date missing, use now. Do not include extra keys. Return only the JSON object, no markdown formatting.`;

// Helper function to clean AI response and extract JSON
const cleanJsonResponse = (response) => {
  if (!response || typeof response !== 'string') {
    throw new Error('Invalid response format');
  }

  // Remove markdown code blocks if present
  let cleaned = response.trim();

  // Remove ```json and ``` markers
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '');
  }
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\s*```$/, '');
  }

  // Remove any leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
};

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

    // Clean the response to remove markdown formatting
    const cleanedResponse = cleanJsonResponse(response);
    const parsedData = JSON.parse(cleanedResponse);

    await logAiAudit(userId, 'ai_parse_transaction', {
      prompt: parseSystemPrompt,
      userText,
      rawResponse: response,
      cleanedResponse,
      parsedData,
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
    // 🎯 NEW: Check if user has multiple wallets
    const userWallets = await Wallet.find({
      user: userId,
      isActive: true,
    }).sort({ createdAt: 1 });

    if (!userWallets || userWallets.length === 0) {
      return {
        success: false,
        statusCode: 400,
        message: 'Ban chua co vi de ghi nhan giao dich',
      };
    }

    // 🚀 NEW: If multiple wallets, let user choose
    if (userWallets.length > 1) {
      return {
        success: false,
        statusCode: 422, // Unprocessable Entity - needs wallet selection
        message: 'Vui long chon vi de ghi nhan giao dich',
        requiresWalletSelection: true,
        availableWallets: userWallets.map(w => ({
          id: w._id,
          name: w.walletName,
          balance: w.balance,
          currency: w.currency || 'VND',
          type: w.walletType,
        })),
        parsedTransaction: {
          type: parsed.type || 'expense',
          amount: parsed.amount,
          currency: parsed.currency || 'VND',
          categoryName: parsed.categoryName,
          description: parsed.description,
          occurredAt: parsed.occurredAt,
          confidence,
        }
      };
    }

    // Only one wallet, use it
    walletDoc = userWallets[0];
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

// 🆕 NEW: Create transaction from pre-parsed data (after wallet selection)
export async function createTransactionFromParsedData(userId, transactionData) {
  try {
    const {
      walletId,
      type,
      amount,
      currency,
      categoryName,
      description,
      occurredAt,
    } = transactionData;

    // Validate wallet
    const walletDoc = await Wallet.findOne({
      _id: walletId,
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

    // Resolve category
    const categoryResolution = await resolveCategory(userId, { categoryName });

    // Handle category confirmation if needed
    if (categoryResolution.needsConfirmation) {
      return {
        success: false,
        statusCode: 422,
        data: {
          type,
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

    // Create transaction
    const payload = applyCategoryToPayload(
      {
        walletId,
        wallet: walletId,
        type: type || 'expense',
        amount,
        currency: currency || 'VND',
        occurredAt: occurredAt || new Date().toISOString(),
        description: description || '',
        inputMethod: 'ai_assisted',
      },
      categoryResolution,
    );

    const result = await transactionService.create(userId, payload);
    await logAiAudit(userId, 'ai_transaction_created_with_wallet_selection', {
      payload,
      categoryResolution,
      selectedWalletId: walletId,
    });

    return result;
  } catch (error) {
    console.error('[AI] Create transaction from parsed data error:', error);
    await logAiAudit(userId, 'ai_transaction_creation_error', {
      error: error.message,
      transactionData,
    });
    throw error;
  }
}

export default {
  parseExpense,
  qa,
  generateTransactionDraftFromText,
  createTransactionFromDraft,
  createTransactionFromParsedData,
  confirmCategorySuggestion,
};
