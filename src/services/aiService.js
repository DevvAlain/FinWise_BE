import crypto from 'crypto';
import mongoose from 'mongoose';
import { openRouterChat, classifyExpenseCategory } from './ai/openRouterClient.js';
import Wallet from '../models/wallet.js';
import transactionService from './transactionService.js';
import AuditLog from '../models/audit_log.js';
import AiConversation from '../models/ai_conversation.js';
import Transaction from '../models/transaction.js';
import Budget from '../models/budget.js';
import SavingGoal from '../models/saving_goal.js';
import Subscription from '../models/subscription.js';
import User from '../models/user.js';
import { ensureUsage } from '../middleware/quotaMiddleware.js';
import { publishDomainEvents } from '../events/domainEvents.js';
import {
  resolveCategory,
  confirmCategorySuggestion as coreConfirmCategorySuggestion,
} from './categoryResolutionService.js';

// Safe wrapper around resolveCategory to catch rare E11000 duplicate-key races
// that can occur when auto-creating user category mappings concurrently.
const safeResolveCategory = async (userId, opts) => {
  try {
    return await resolveCategory(userId, opts);
  } catch (err) {
    const msg = (err && err.message) ? err.message : '';
    const isDup = /E11000|duplicate key|normalizedName/i.test(msg);
    if (isDup) {
      console.warn('[AI] Duplicate-key race when resolving category; falling back to no-category for transaction', { userId, opts });
      return { categoryId: null, needsConfirmation: false };
    }
    throw err;
  }
};

const DEFAULT_AI_MONTHLY_LIMIT = Number(process.env.AI_DEFAULT_MONTHLY_LIMIT || 30);
const CONVERSATION_HISTORY_LIMIT = Number(
  process.env.AI_CONVERSATION_HISTORY_LIMIT || 10,
);
const MAX_CONTEXT_TRANSACTIONS = Number(
  process.env.AI_CONTEXT_TRANSACTIONS || 10,
);
const ADVANCED_MODEL =
  process.env.OPENROUTER_MODEL_ADVANCED || 'openai/gpt-4o-mini';
const FAST_MODEL =
  process.env.OPENROUTER_MODEL_FAST ||
  process.env.OPENROUTER_MODEL ||
  'z-ai/glm-4.5-air:free';

// Dynamic system prompt builder to support multi-language simple responses
const buildChatSystemPrompt = (lang = 'vi') => {
  if (lang === 'en') {
    return `You are a concise personal finance assistant.
- Always reply in clear, simple English.
- Use ONLY provided context & conversation history. Do not invent data.
- Keep answers max 2 short sentences.
- Return JSON:
{
  "answer": string,
  "confidence": number (0..1),
  "recommendations": string[],
  "followUpQuestions": string[],
  "disclaimers": string[]
}
- recommendations: max 2; followUpQuestions: max 2.
- If uncertain set confidence <= 0.6 and mention uncertainty.
- Avoid marketing fluff; be neutral.`;
  }
  // Vietnamese default
  return `Bạn là trợ lý tài chính cá nhân trả lời NGẮN GỌN.
- Luôn trả lời bằng tiếng Việt đơn giản, rõ ràng (tối đa 2 câu ngắn).
- Chỉ dùng dữ liệu trong context & lịch sử, không bịa.
- Trả về JSON:
{
  "answer": string,
  "confidence": number (0..1),
  "recommendations": string[],
  "followUpQuestions": string[],
  "disclaimers": string[]
}
- recommendations: tối đa 2; followUpQuestions: tối đa 2.
- Nếu không chắc chắn đặt confidence <= 0.6 và nói rõ.
- Tránh ngôn ngữ quảng cáo hoặc lan man.`;
};

const DEFAULT_DISCLAIMER =
  'Thông tin chỉ mang tính tham khảo, không phải là tư vấn tài chính chuyên nghiệp.';

const TOXIC_PATTERNS = [/suicide/i, /(kill|murder)/i, /(hack|scam)/i];
const FINANCIAL_RISK_PATTERNS = [/đánh bạc/i, /cờ bạc/i, /trốn thuế/i];

const estimateTokens = (text = '') => {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words * 1.3);
};

const sanitizeQuestion = (question = '') => question.trim();

const hasContentViolation = (text = '') => {
  return [...TOXIC_PATTERNS, ...FINANCIAL_RISK_PATTERNS].some((regex) =>
    regex.test(text),
  );
};

const classifyIntent = (question = '') => {
  const normalized = question.toLowerCase();
  const mapper = [
    { intent: 'budgeting', keywords: ['ngân sách', 'budget', 'chi tiêu'] },
    { intent: 'analysis', keywords: ['phân tích', 'thống kê', 'xu hướng'] },
    { intent: 'saving_goal', keywords: ['tiết kiệm', 'mục tiêu', 'saving'] },
    { intent: 'investment', keywords: ['đầu tư', 'lợi nhuận', 'risk'] },
    { intent: 'advice', keywords: ['nên làm gì', 'khuyên', 'gợi ý'] },
  ];

  let detected = 'general';
  mapper.forEach((item) => {
    if (item.keywords.some((kw) => normalized.includes(kw))) {
      detected = item.intent;
    }
  });

  const lengthScore = normalized.length;
  const complexity =
    lengthScore > 400
      ? 'high'
      : lengthScore > 180 || normalized.includes('phân tích')
        ? 'medium'
        : 'low';
  const recommendedModel = complexity === 'high' ? ADVANCED_MODEL : FAST_MODEL;
  const confidence =
    detected === 'general'
      ? 0.45
      : complexity === 'high'
        ? 0.75
        : 0.6;

  return {
    intent: detected,
    confidence,
    complexity,
    recommendedModel,
  };
};

const toNumber = (value) => {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value instanceof mongoose.Types.Decimal128) {
    return Number.parseFloat(value.toString());
  }
  if (typeof value === 'object' && value.$numberDecimal) {
    return Number.parseFloat(value.$numberDecimal);
  }
  return 0;
};

const createConversationId = () =>
  crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(16);

const trimMessages = (messages = []) => {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= CONVERSATION_HISTORY_LIMIT * 2) return messages;
  return messages.slice(-CONVERSATION_HISTORY_LIMIT * 2);
};

const formatCurrency = (value, currency = 'VND') =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);

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
const extractJsonBlock = (input) => {
  if (!input || typeof input !== 'string') return null;
  let start = input.indexOf('{');
  while (start !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < input.length; i += 1) {
      const ch = input[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === '\\') {
          escape = true;
        } else if (ch === '"') {
          inString = false;
        }
      } else if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth += 1;
      } else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          return input.slice(start, i + 1);
        }
      }
    }
    start = input.indexOf('{', start + 1);
  }
  return null;
};

const cleanJsonResponse = (response) => {
  if (!response || typeof response !== 'string') {
    throw new Error('Invalid response format');
  }

  let cleaned = response.trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '');
  }
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.replace(/\s*```$/, '');
  }

  cleaned = cleaned.trim();
  const jsonBlock = extractJsonBlock(cleaned);
  if (jsonBlock) return jsonBlock.trim();
  return cleaned;
};

const buildFollowUpQuestions = (intent) => {
  switch (intent) {
    case 'budgeting':
      return [
        'Tôi có nên điều chỉnh ngân sách danh mục nào không?',
        'Bạn có gợi ý cách tiết kiệm chi tiêu tuần này không?',
      ];
    case 'saving_goal':
      return [
        'Làm sao để đạt mục tiêu tiết kiệm nhanh hơn?',
        'Có nên tăng mức đóng góp hàng tháng không?',
      ];
    case 'analysis':
      return [
        'Bạn có thể so sánh với tháng trước không?',
        'Có dấu hiệu bất thường nào trong chi tiêu gần đây?',
      ];
    default:
      return [
        'Bạn cần thêm thông tin nào về tài chính của tôi?',
        'Có tính năng nào giúp tôi kiểm soát chi tiêu tốt hơn?',
      ];
  }
};

const relatedFeaturesByIntent = (intent) => {
  switch (intent) {
    case 'budgeting':
      return ['budgets.list', 'budgets.create', 'reports.spendByCategory'];
    case 'saving_goal':
      return ['savingGoals.list', 'savingGoals.create', 'savingGoals.analytics'];
    case 'analysis':
      return ['reports.monthlyTrend', 'reports.categoryBreakdown'];
    case 'investment':
      return ['education.investmentBasics', 'alerts.marketNews'];
    default:
      return ['dashboard.overview', 'notifications.settings'];
  }
};

const getOrCreateConversation = async (userId, conversationId) => {
  let conversation = null;
  if (conversationId) {
    conversation = await AiConversation.findOne({
      user: userId,
      conversationId,
    });
  }

  if (!conversation) {
    const newConversationId = conversationId || createConversationId();
    conversation = await AiConversation.create({
      user: userId,
      conversationId: newConversationId,
      messages: [],
      lastInteractionAt: new Date(),
    });
  }

  return conversation;
};

const updateConversationMessages = async (
  conversation,
  userMessage,
  assistantMessage,
) => {
  const messages = [...conversation.messages];
  if (userMessage) {
    messages.push({
      role: 'user',
      content: userMessage,
      tokens: estimateTokens(userMessage),
      createdAt: new Date(),
    });
  }
  if (assistantMessage) {
    messages.push({
      role: 'assistant',
      content: assistantMessage,
      tokens: estimateTokens(assistantMessage),
      createdAt: new Date(),
    });
  }

  conversation.messages = trimMessages(messages);
  conversation.totalTokens = conversation.messages.reduce(
    (sum, msg) => sum + (msg.tokens || 0),
    0,
  );
  conversation.lastInteractionAt = new Date();
  await conversation.save();
  return conversation;
};

const getActivePlanForUser = async (userId) => {
  const subscription = await Subscription.findOne({
    user: userId,
    status: 'active',
  }).populate('plan');
  return subscription?.plan || null;
};

const checkAndIncrementAiQuota = async (userId) => {
  const usage = await ensureUsage(userId);
  const plan = await getActivePlanForUser(userId);
  const limit =
    typeof plan?.aiRecommendationsLimit === 'number'
      ? plan.aiRecommendationsLimit
      : DEFAULT_AI_MONTHLY_LIMIT;
  const current = usage.aiCallsCount || 0;

  if (limit && current >= limit) {
    return {
      allowed: false,
      limit,
      usageCount: current,
      message: 'Bạn đã hết lượt sử dụng trợ lý AI trong kỳ này.',
      usageDoc: usage,
    };
  }

  const projected = current + 1;
  const warnings = [];
  if (limit && projected > limit) {
    return {
      allowed: false,
      limit,
      usageCount: current,
      message: 'Vượt quá giới hạn lượt AI.',
      usageDoc: usage,
    };
  }
  if (limit && projected / limit >= 0.8 && projected < limit) {
    warnings.push(
      'Bạn sắp đạt giới hạn lượt AI cho chu kỳ hiện tại. Hãy cân nhắc sử dụng hợp lý.',
    );
  }

  usage.aiCallsCount = projected;
  await usage.save();

  return {
    allowed: true,
    limit,
    usageCount: projected,
    warnings,
    plan,
    usageDoc: usage,
  };
};

const buildFinancialSnapshot = async (userId) => {
  const user = await User.findById(userId).lean();
  const profile = {
    fullName: user?.fullName,
    timezone: user?.timezone || 'Asia/Ho_Chi_Minh',
    language: user?.language || 'vi',
  };

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const recentTransactions = await Transaction.find({
    user: userId,
    isDeleted: false,
    occurredAt: { $gte: since },
  })
    .sort({ occurredAt: -1 })
    .limit(MAX_CONTEXT_TRANSACTIONS)
    .select('amount currency category description occurredAt type')
    .populate('category', 'name nameEn')
    .lean();

  const categoryBreakdown = await Transaction.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(String(userId)),
        isDeleted: false,
        occurredAt: { $gte: since },
        type: 'expense',
      },
    },
    {
      $group: {
        _id: '$category',
        total: { $sum: { $toDouble: '$amount' } },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'expense_categories',
        localField: '_id',
        foreignField: '_id',
        as: 'systemCategory',
      },
    },
    {
      $lookup: {
        from: 'user_expense_categories',
        localField: '_id',
        foreignField: '_id',
        as: 'userCategory',
      },
    },
    {
      $addFields: {
        categoryName: {
          $ifNull: [
            { $arrayElemAt: ['$userCategory.name', 0] },
            { $arrayElemAt: ['$systemCategory.name', 0] },
          ],
        },
      },
    },
    {
      $project: {
        _id: 1,
        total: 1,
        count: 1,
        categoryName: 1,
      },
    },
    { $sort: { total: -1 } },
    { $limit: 5 },
  ]);

  const monthlyTrend = await Transaction.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(String(userId)),
        isDeleted: false,
        type: 'expense',
        occurredAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: {
          y: { $year: '$occurredAt' },
          m: { $month: '$occurredAt' },
        },
        total: { $sum: { $toDouble: '$amount' } },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ]);

  const activeBudgets = await Budget.find({
    user: userId,
    isActive: true,
  })
    .sort({ updatedAt: -1 })
    .limit(5)
    .lean();

  const savingGoals = await SavingGoal.find({
    user: userId,
    isDeleted: { $ne: true },
    status: 'active',
  })
    .sort({ updatedAt: -1 })
    .limit(5)
    .lean();

  return {
    profile,
    recentTransactions,
    categoryBreakdown,
    monthlyTrend,
    budgets: activeBudgets,
    savingGoals,
  };
};

const formatFinancialContext = (snapshot) => {
  const lines = [];
  const { recentTransactions, categoryBreakdown, monthlyTrend, budgets, savingGoals } =
    snapshot;

  if (recentTransactions?.length) {
    const totalRecent = recentTransactions.reduce(
      (sum, tx) => sum + toNumber(tx.amount),
      0,
    );
    lines.push(
      `Past 30 days: ${recentTransactions.length} transactions, total spend ${formatCurrency(
        totalRecent,
      )}.`,
    );
  }

  if (categoryBreakdown?.length) {
    const top = categoryBreakdown.slice(0, 3).map((cat, idx) => {
      const name = cat.categoryName
        ? cat.categoryName
        : cat._id
          ? `Category ${cat._id}`
          : 'Unclassified';
      return `${idx + 1}. ${name} - ${formatCurrency(cat.total)}`;
    });
    lines.push(`Top spending categories: ${top.join('; ')}.`);
  }

  if (budgets?.length) {
    const budgetSummaries = budgets.map((budget) => {
      const spent = toNumber(budget.spentAmount);
      const total = toNumber(budget.amount);
      const percent = total > 0 ? Math.round((spent / total) * 100) : 0;
      return `${budget.period} - ${percent}% (${formatCurrency(spent)} / ${formatCurrency(total)})`;
    });
    lines.push(`Active budgets: ${budgetSummaries.join('; ')}.`);
  }

  if (savingGoals?.length) {
    const goalSummaries = savingGoals.map((goal) => {
      const progress =
        goal.targetAmount && toNumber(goal.targetAmount) > 0
          ? Math.round(
            (toNumber(goal.currentAmount) / toNumber(goal.targetAmount)) * 100,
          )
          : 0;
      return `${goal.title || 'Goal'}: ${progress}% complete`;
    });
    lines.push(`Saving goal progress: ${goalSummaries.join('; ')}.`);
  }

  if (monthlyTrend?.length) {
    const last = monthlyTrend[monthlyTrend.length - 1];
    const before =
      monthlyTrend.length > 1 ? monthlyTrend[monthlyTrend.length - 2] : null;
    if (last) {
      const currentSpend = formatCurrency(last.total);
      let trendLine = `Latest month spend: ${currentSpend}.`;
      if (before) {
        const delta = last.total - before.total;
        const deltaPercent =
          before.total > 0 ? Math.round((delta / before.total) * 100) : 0;
        trendLine += ` Vs previous month ${delta >= 0 ? 'up' : 'down'} ${Math.abs(deltaPercent)}%.`;
      }
      lines.push(trendLine);
    }
  }

  lines.push(
    'Market note: living costs typically rise toward year end, monitor budgets closely.',
  );

  return lines.join('\n');
};




const parseAssistantResponse = (raw) => {
  try {
    const cleaned = cleanJsonResponse(raw);
    return JSON.parse(cleaned);
  } catch (error) {
    return {
      answer: raw,
      confidence: 0.55,
      recommendations: [],
      visualizations: [],
      followUpQuestions: [],
      relatedFeatures: [],
      disclaimers: [DEFAULT_DISCLAIMER],
    };
  }
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

    const response = await openRouterChat(messages, {
      maxTokens: 320,
      temperature: 0.1,
    });

    // Clean the response to remove markdown formatting
    const cleanedResponse = cleanJsonResponse(response);
    if (!cleanedResponse) {
      throw new Error('AI returned an empty response');
    }
    let parsedData;
    try {
      parsedData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      const sample =
        cleanedResponse.length > 200
          ? `${cleanedResponse.slice(0, 200)}...`
          : cleanedResponse;
      throw new Error(
        `Failed to parse AI JSON response: ${parseError.message}. Sample: ${sample}`,
      );
    }

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

  const categoryResolution = await safeResolveCategory(userId, {
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
    categoryResolution = await safeResolveCategory(userId, {
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

    // Resolve category (use safe wrapper to handle rare duplicate-key races)
    const categoryResolution = await safeResolveCategory(userId, { categoryName });

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

export const chat = async (userId, payload = {}) => {
  const conversationId = payload.conversationId;
  const question = sanitizeQuestion(payload.question || '');

  if (!question) {
    return {
      success: false,
      statusCode: 400,
      message: 'Thiếu câu hỏi cho trợ lý AI',
    };
  }

  if (hasContentViolation(question)) {
    return {
      success: false,
      statusCode: 400,
      message: 'Nội dung câu hỏi không phù hợp để xử lý',
    };
  }

  const quota = await checkAndIncrementAiQuota(userId);
  if (!quota.allowed) {
    return {
      success: false,
      statusCode: 429,
      message: quota.message || 'Đã vượt giới hạn lượt AI',
      data: {
        used: quota.usageCount,
        monthlyLimit: quota.limit ?? null,
      },
    };
  }

  const conversation = await getOrCreateConversation(userId, conversationId);
  const effectiveConversationId = conversation.conversationId;

  const snapshot = await buildFinancialSnapshot(userId);
  const contextSummary = formatFinancialContext(snapshot);

  const { intent, confidence: intentConfidence, complexity, recommendedModel } =
    classifyIntent(question);

  const historyMessages = trimMessages(
    conversation.messages.map((msg) => ({ role: msg.role, content: msg.content })),
  );

  // Detect language of user question (simple heuristic)
  const detectLanguage = (text) => {
    if (!text) return 'vi';
    const hasVietnamese = /[áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/i.test(text);
    if (hasVietnamese) return 'vi';
    const englishHits = (text.match(/\b(the|what|how|is|are|spend|budget|month|report|goal|analysis)\b/gi) || []).length;
    if (englishHits >= 2) return 'en';
    return 'vi';
  };
  // Allow client override via payload.lang = 'vi' | 'en'
  const langParam = typeof payload.lang === 'string' ? payload.lang.toLowerCase() : null;
  const lang = (langParam === 'vi' || langParam === 'en') ? langParam : detectLanguage(question);

  const messages = [
    { role: 'system', content: buildChatSystemPrompt(lang) },
    {
      role: 'system',
      content: `User profile: ${JSON.stringify(snapshot.profile)}\nPredicted intent: ${intent} (confidence ${intentConfidence}).\nContext language: ${lang}`,
    },
    {
      role: 'assistant',
      content: (lang === 'vi' ? 'Tóm tắt gần đây:' : 'Recent summary:') + `\n${contextSummary}`,
    },
    ...historyMessages,
    { role: 'user', content: question },
  ];

  const usageDoc = quota.usageDoc;
  const startedAt = Date.now();
  let rawResponse;
  try {
    rawResponse = await openRouterChat(messages, {
      model: recommendedModel,
      temperature: complexity === 'high' ? 0.2 : 0.35,
      maxTokens: 600,
    });
  } catch (error) {
    if (usageDoc) {
      usageDoc.aiCallsCount = Math.max((usageDoc.aiCallsCount || 1) - 1, 0);
      await usageDoc.save();
    }
    throw error;
  }
  const latencyMs = Date.now() - startedAt;

  const parsed = parseAssistantResponse(rawResponse);

  // Post-process to enforce simplicity & language consistency
  const simplifyAnswer = (text) => {
    if (!text || typeof text !== 'string') return text;
    // Remove excessive whitespace
    let cleaned = text.replace(/\s+/g, ' ').trim();
    // Split sentences by period/question/exclamation
    const sentences = cleaned.split(/(?<=[\.\?\!])\s+/);
    const limited = sentences.slice(0, 2).join(' ').trim();
    // If still long (> 300 chars) cut at 300 preserving whole word
    if (limited.length > 300) {
      cleaned = limited.slice(0, 300).replace(/\S+$/, '').trim();
      return cleaned;
    }
    return limited;
  };

  parsed.answer = simplifyAnswer(parsed.answer || rawResponse);

  // Trim arrays lengths
  if (Array.isArray(parsed.recommendations)) {
    parsed.recommendations = parsed.recommendations.slice(0, 2).map(simplifyAnswer);
  }
  if (Array.isArray(parsed.followUpQuestions)) {
    parsed.followUpQuestions = parsed.followUpQuestions.slice(0, 2).map(simplifyAnswer);
  }

  // Localize disclaimers
  const disclaimerVi = 'Thông tin chỉ để tham khảo, không phải tư vấn tài chính chuyên nghiệp.';
  const disclaimerEn = 'Information is for reference only and not professional financial advice.';
  parsed.disclaimers = [lang === 'en' ? disclaimerEn : disclaimerVi];
  parsed.disclaimers =
    Array.isArray(parsed.disclaimers) && parsed.disclaimers.length > 0
      ? parsed.disclaimers
      : [DEFAULT_DISCLAIMER];
  parsed.followUpQuestions =
    Array.isArray(parsed.followUpQuestions) && parsed.followUpQuestions.length > 0
      ? parsed.followUpQuestions
      : buildFollowUpQuestions(intent);
  parsed.relatedFeatures =
    Array.isArray(parsed.relatedFeatures) && parsed.relatedFeatures.length > 0
      ? parsed.relatedFeatures
      : relatedFeaturesByIntent(intent);
  parsed.recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations
    : [];
  parsed.visualizations = Array.isArray(parsed.visualizations)
    ? parsed.visualizations
    : [];

  const answerText = parsed.answer || rawResponse;
  await updateConversationMessages(conversation, question, answerText);

  // Ensure we never save empty content to avoid validation errors
  if (!answerText || answerText.trim() === '') {
    console.error('[AI] Empty answer generated, using fallback');
    const fallbackAnswer = lang === 'en'
      ? 'I apologize, I could not generate a proper response. Please try rephrasing your question.'
      : 'Xin lỗi, tôi không thể tạo câu trả lời phù hợp. Vui lòng diễn đạt lại câu hỏi.';

    await updateConversationMessages(conversation, question, fallbackAnswer);

    return {
      success: true,
      statusCode: 200,
      data: {
        conversationId: effectiveConversationId,
        answer: fallbackAnswer,
        confidence: 0.3,
        recommendations: [],
        visualizations: [],
        followUpQuestions: [],
        relatedFeatures: [],
        disclaimers: [lang === 'en' ? disclaimerEn : disclaimerVi],
        intent,
        model: recommendedModel,
        language: lang,
        usage: {
          monthlyLimit: quota.limit ?? null,
          used: quota.usageCount,
          warnings: quota.warnings || [],
        },
        metadata: {
          intentConfidence,
          complexity,
          latencyMs,
          language: lang,
          error: 'Empty response from AI model',
        },
      },
    };
  }

  await logAiAudit(userId, 'ai_chat_exchange', {
    conversationId: effectiveConversationId,
    question,
    intent,
    intentConfidence,
    model: recommendedModel,
    response: parsed,
    rawResponse,
    latencyMs,
    warnings: quota.warnings,
  });

  await publishDomainEvents([
    {
      name: 'ai.query_processed',
      payload: {
        userId,
        conversationId: effectiveConversationId,
        intent,
        model: recommendedModel,
        latencyMs,
        confidence: parsed.confidence ?? null,
      },
    },
    {
      name: 'recommendation.generated',
      payload: {
        userId,
        conversationId: effectiveConversationId,
        recommendations: parsed.recommendations,
        confidence: parsed.confidence ?? null,
      },
    },
    {
      name: 'user.engagement_tracked',
      payload: {
        userId,
        feature: 'ai_chat',
        metadata: {
          conversationId: effectiveConversationId,
          intent,
          complexity,
        },
      },
    },
  ]);

  return {
    success: true,
    statusCode: 200,
    data: {
      conversationId: effectiveConversationId,
      answer: parsed.answer || answerText,
      confidence: parsed.confidence ?? 0.7,
      recommendations: parsed.recommendations,
      visualizations: parsed.visualizations,
      followUpQuestions: parsed.followUpQuestions,
      relatedFeatures: parsed.relatedFeatures,
      disclaimers: parsed.disclaimers,
      intent,
      model: recommendedModel,
      language: lang,
      usage: {
        monthlyLimit: quota.limit ?? null,
        used: quota.usageCount,
        warnings: quota.warnings || [],
      },
      metadata: {
        intentConfidence,
        complexity,
        latencyMs,
        language: lang,
      },
    },
  };
};

export default {
  parseExpense,
  qa,
  chat,
  generateTransactionDraftFromText,
  createTransactionFromDraft,
  createTransactionFromParsedData,
  confirmCategorySuggestion,
};



