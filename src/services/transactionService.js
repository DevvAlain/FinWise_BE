import mongoose from 'mongoose';
import Transaction from '../models/transaction.js';
import Wallet from '../models/wallet.js';
import { ensureUsage } from '../middleware/quotaMiddleware.js';
import { publishDomainEvents } from '../events/domainEvents.js';
import { sendTransactionCreatedEmail } from '../services/emailService.js';
import User from '../models/user.js';
import { resolveCategory } from './categoryResolutionService.js';
import { recalculateBudgetsForTransaction } from './budgetService.js';

// Wrap resolveCategory to handle rare E11000 duplicate-key races when
// two concurrent processes try to create the same user category. In that
// case we catch the error and fallback to returning no category so the
// transaction can still be created; the calling flow can later refresh
// and pick up the created category.
const safeResolveCategory = async (userId, opts) => {
  try {
    return await resolveCategory(userId, opts);
  } catch (err) {
    const msg = (err && err.message) ? err.message : '';
    const isDup = /E11000|duplicate key|normalizedName/i.test(msg);
    if (isDup) {
      console.warn('[Category] Duplicate-key race when resolving category, falling back to no-category for transaction', { userId, opts });
      return { categoryId: null, needsConfirmation: false };
    }
    throw err;
  }
};

const decimalToNumber = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value);
  if (value && value.toString) return parseFloat(value.toString());
  return Number(value);
};

const create = async (userId, payload) => {
  const {
    walletId,
    wallet,
    type,
    amount,
    currency = 'VND',
    category,
    categoryName,
    occurredAt,
    description,
    merchant,
    fromWallet,
    toWallet,
    inputMethod = 'manual',
  } = payload;

  if (!type || amount === undefined || amount === null || !occurredAt) {
    return {
      success: false,
      statusCode: 400,
      message: 'Thiếu trường bắt buộc',
    };
  }

  if (!['expense', 'income', 'transfer'].includes(type)) {
    return {
      success: false,
      statusCode: 400,
      message: 'Loại giao dịch không hợp lệ',
    };
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return {
      success: false,
      statusCode: 400,
      message: 'Số tiền phải lớn hơn 0',
    };
  }

  let categoryResolution = { categoryId: category || null, needsConfirmation: false };
  try {
    if (categoryResolution.categoryId) {
      categoryResolution = await safeResolveCategory(userId, {
        categoryId: categoryResolution.categoryId,
      });
      if (!categoryResolution.categoryId) {
        return {
          success: false,
          statusCode: 404,
          message: 'Không tìm thấy danh mục',
        };
      }
    } else if (categoryName) {
      categoryResolution = await safeResolveCategory(userId, { categoryName });

      // If resolver indicates the category needs confirmation, return a
      // handled response so callers (AI/chat) can show a confirmation UI
      // instead of letting an exception propagate.
      if (categoryResolution && categoryResolution.needsConfirmation) {
        return {
          success: false,
          statusCode: 422,
          data: {
            walletId: walletId || wallet || null,
            type,
            amount,
            currency,
            categoryName,
            occurredAt,
            description,
            suggestedCategory: categoryResolution.suggestion || null,
          },
          needsConfirmation: true,
          message: 'Can xac nhan danh muc truoc khi tao giao dich',
        };
      }
    }
  } catch (err) {
    // Some implementations of the category resolver may throw an Error when
    // a confirmation is required. Catch that specific case and convert it to
    // the same structured response the AI flow expects.
    const msg = (err && err.message) ? err.message : '';
    if (/xac nhan danh muc|Can xac nhan|Cần xác nhận danh mục/i.test(msg)) {
      return {
        success: false,
        statusCode: 422,
        data: {
          walletId: walletId || wallet || null,
          type,
          amount,
          currency,
          categoryName,
          occurredAt,
          description,
          suggestedCategory: (err && err.suggestion) || null,
        },
        needsConfirmation: true,
        message: 'Can xac nhan danh muc truoc khi tao giao dich',
      };
    }
    throw err;
  }

  const resolvedCategoryId = categoryResolution.categoryId || null;
  const needsCategoryConfirmation = !!categoryResolution.needsConfirmation;
  const categorySuggestion = categoryResolution.suggestion || null;
  const categoryMatchedSource = categoryResolution.matchedSource || null;

  if (type === 'transfer') {
    if (!fromWallet || !toWallet) {
      return {
        success: false,
        statusCode: 400,
        message: 'Chuyển tiền cần fromWallet và toWallet',
      };
    }
  } else if (!walletId && !wallet) {
    return {
      success: false,
      statusCode: 400,
      message: 'Thiếu walletId',
    };
  }

  const session = await mongoose.startSession();
  let createdTransaction = null;
  const updatedBalances = {};
  const eventsToPublish = [];

  const fail = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.isHandled = true;
    throw error;
  };

  try {
    await session.withTransaction(async () => {
      const primaryWalletId = type === 'transfer' ? fromWallet : walletId || wallet;

      const walletDoc = await Wallet.findOne({
        _id: primaryWalletId,
        user: userId,
        isActive: true,
      }).session(session).exec();

      if (!walletDoc) {
        fail(404, 'Không tìm thấy ví');
      }

      let fromWalletDoc = null;
      let toWalletDoc = null;

      if (type === 'transfer') {
        fromWalletDoc = await Wallet.findOne({
          _id: fromWallet,
          user: userId,
          isActive: true,
        }).session(session).exec();

        toWalletDoc = await Wallet.findOne({
          _id: toWallet,
          user: userId,
          isActive: true,
        }).session(session).exec();

        if (!fromWalletDoc || !toWalletDoc) {
          fail(404, 'Không tìm thấy ví chuyển hoặc ví nhận');
        }
      }

      const currentBalance = decimalToNumber(walletDoc.balance);

      if (
        type === 'expense' &&
        ['cash', 'credit_card'].includes(walletDoc.walletType) &&
        currentBalance - numericAmount < 0
      ) {
        fail(400, 'Không đủ số dư trong ví');
      }

      if (type === 'transfer') {
        const fromBalance = decimalToNumber(fromWalletDoc.balance);
        if (['cash', 'credit_card'].includes(fromWalletDoc.walletType) && fromBalance - numericAmount < 0) {
          fail(400, 'Không đủ số dư trong ví chuyển');
        }
      }

      const usage = await ensureUsage(userId, session);
      await usage.updateOne({ $inc: { transactionsCount: 1 } }, { session });

      const [tx] = await Transaction.create(
        [
          {
            user: userId,
            wallet: walletDoc._id,
            type,
            amount: numericAmount,
            currency,
            category: resolvedCategoryId,
            occurredAt,
            description,
            merchant,
            fromWallet: type === 'transfer' ? fromWallet : null,
            toWallet: type === 'transfer' ? toWallet : null,
            inputMethod,
          },
        ],
        { session },
      );

      createdTransaction = tx;

      if (type === 'income') {
        const newBalance = currentBalance + numericAmount;
        await walletDoc.updateOne({ $set: { balance: newBalance } }, { session });
        updatedBalances[walletDoc._id] = newBalance;
      } else if (type === 'expense') {
        const newBalance = currentBalance - numericAmount;
        await walletDoc.updateOne({ $set: { balance: newBalance } }, { session });
        updatedBalances[walletDoc._id] = newBalance;
      } else if (type === 'transfer') {
        const fromBalance = decimalToNumber(fromWalletDoc.balance);
        const toBalance = decimalToNumber(toWalletDoc.balance);

        const newFromBalance = fromBalance - numericAmount;
        const newToBalance = toBalance + numericAmount;

        await fromWalletDoc.updateOne({ $set: { balance: newFromBalance } }, { session });
        await toWalletDoc.updateOne({ $set: { balance: newToBalance } }, { session });

        updatedBalances[fromWalletDoc._id] = newFromBalance;
        updatedBalances[toWalletDoc._id] = newToBalance;
      }

      const baseEventPayload = {
        transactionId: tx._id,
        userId,
        walletId: tx.wallet,
        type: tx.type,
        occurredAt: tx.occurredAt,
        amount: tx.amount,
      };

      eventsToPublish.push(
        { name: 'budget.recalculate', payload: baseEventPayload },
        { name: 'goal.recalculate', payload: baseEventPayload },
        {
          name: 'report.transaction_aggregated',
          payload: baseEventPayload,
        },
      );

      if (resolvedCategoryId && !needsCategoryConfirmation) {
        eventsToPublish.push({
          name: 'analytics.category_usage',
          payload: {
            userId,
            categoryId: resolvedCategoryId,
            transactionId: tx._id,
            source: 'transaction_creation',
          },
        });
      }
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    if (error.isHandled) {
      return {
        success: false,
        statusCode: error.statusCode,
        message: error.message,
      };
    }
    console.error('Transaction create failed:', error);
    return {
      success: false,
      statusCode: 500,
      message: 'Không thể tạo giao dịch',
    };
  } finally {
    session.endSession();
  }

  if (createdTransaction) {
    await publishDomainEvents(eventsToPublish);
    const budgetsUpdated = await recalculateBudgetsForTransaction(userId, createdTransaction);

    // If transaction was created by AI/chat flow, send an email notification to the user.
    // We don't want to block the main response on email delivery, so run it async and log failures.
    try {
      if (createdTransaction.inputMethod === 'ai_assisted' || createdTransaction.inputMethod === 'ai') {
        // Resolve a recipient email deterministically before calling the email helper
        // to avoid the helper throwing when no recipient is found.
        let userEmail = null;
        let userName = '';

        if (createdTransaction.userEmail) {
          userEmail = createdTransaction.userEmail;
        } else if (createdTransaction.user && createdTransaction.user.email) {
          userEmail = createdTransaction.user.email;
          userName = createdTransaction.user.fullName || '';
        } else if (createdTransaction.user) {
          // If transaction.user holds an id, try loading the user
          try {
            const u = await User.findById(createdTransaction.user).select('email fullName');
            if (u && u.email) {
              userEmail = u.email;
              userName = u.fullName || '';
            }
          } catch (e) {
            // ignore user lookup failures and continue to fallback
          }
        }

        // Final fallback to DEBUG_USER_EMAIL env var if set
        if (!userEmail && process.env.DEBUG_USER_EMAIL) userEmail = process.env.DEBUG_USER_EMAIL;

        if (!userEmail) {
          console.warn('[Email] Skipping transaction-created email: no recipient email available for transaction', { transactionId: createdTransaction._id });
        } else {
          // fire-and-forget using named export (avoid default export timing issues)
          sendTransactionCreatedEmail(userEmail, userName, createdTransaction).then((res) => {
            if (!res || !res.success) console.warn('[Email] Transaction-created email was not sent', res);
          }).catch((err) => {
            console.error('[Email] Error sending transaction-created email:', err);
          });
        }
      }
    } catch (err) {
      console.error('[Email] Unexpected error when attempting to send transaction email:', err);
    }

    const balances = Object.entries(updatedBalances).map(
      ([walletIdValue, balanceValue]) => ({
        walletId: walletIdValue,
        balance: balanceValue,
      }),
    );

    return {
      success: true,
      statusCode: 201,
      transaction: createdTransaction,
      balances,
      // Enhanced category resolution metadata theo flow 3.6
      categoryId: resolvedCategoryId,
      needsCategoryConfirmation,
      categorySuggestion,
      matchedSource: categoryMatchedSource,
      budgetsUpdated,
    };
  }

  return {
    success: false,
    statusCode: 500,
    message: 'Không thể tạo giao dịch',
  };
};

const list = async (userId, query) => {
  const {
    startDate,
    endDate,
    category,
    wallet,
    type,
    page = 1,
    limit = 20,
  } = query;
  const filter = { user: userId, isDeleted: false };
  if (category) filter.category = category;
  if (wallet) filter.wallet = wallet;
  if (type) filter.type = type;
  if (startDate || endDate) {
    filter.occurredAt = {};
    if (startDate) filter.occurredAt.$gte = new Date(startDate);
    if (endDate) filter.occurredAt.$lte = new Date(endDate);
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ occurredAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Transaction.countDocuments(filter),
  ]);
  return {
    success: true,
    statusCode: 200,
    items,
    total,
    page: Number(page),
    limit: Number(limit),
  };
};

const detail = async (userId, id) => {
  const tx = await Transaction.findOne({
    _id: id,
    user: userId,
    isDeleted: false,
  });
  if (!tx) {
    return {
      success: false,
      statusCode: 404,
      message: 'Không tìm thấy giao dịch',
    };
  }
  return { success: true, statusCode: 200, transaction: tx };
};

const update = async (userId, id, payload) => {
  // First get the original transaction to reverse its balance changes
  const originalTx = await Transaction.findOne({
    _id: id,
    user: userId,
    isDeleted: false,
  });
  if (!originalTx) {
    return {
      success: false,
      statusCode: 404,
      message: 'Không tìm thấy giao dịch',
    };
  }

  // Reverse the original transaction's balance impact
  if (originalTx.type === 'income') {
    await Wallet.findByIdAndUpdate(originalTx.wallet, {
      $inc: { balance: -parseFloat(originalTx.amount.toString()) },
    });
  } else if (originalTx.type === 'expense') {
    await Wallet.findByIdAndUpdate(originalTx.wallet, {
      $inc: { balance: parseFloat(originalTx.amount.toString()) },
    });
  } else if (originalTx.type === 'transfer') {
    await Wallet.findByIdAndUpdate(originalTx.fromWallet, {
      $inc: { balance: parseFloat(originalTx.amount.toString()) },
    });
    await Wallet.findByIdAndUpdate(originalTx.toWallet, {
      $inc: { balance: -parseFloat(originalTx.amount.toString()) },
    });
  }

  // Update the transaction
  const allowed = [
    'wallet',
    'type',
    'amount',
    'currency',
    'category',
    'occurredAt',
    'description',
    'merchant',
    'fromWallet',
    'toWallet',
  ];
  const updates = {};
  allowed.forEach((k) => {
    if (typeof payload[k] !== 'undefined') updates[k] = payload[k];
  });
  const tx = await Transaction.findOneAndUpdate(
    { _id: id, user: userId, isDeleted: false },
    { $set: updates },
    { new: true },
  );
  if (!tx) {
    return {
      success: false,
      statusCode: 404,
      message: 'Không tìm thấy giao dịch',
    };
  }

  // Validate new transaction won't make balance negative for cash/credit_card
  if (tx.type === 'expense') {
    const newWallet = await Wallet.findOne({
      _id: tx.wallet,
      user: userId,
      isActive: true,
    });
    if (
      newWallet &&
      (newWallet.walletType === 'cash' ||
        newWallet.walletType === 'credit_card')
    ) {
      const currentBalance = parseFloat((newWallet.balance || 0).toString());
      const newAmt = parseFloat(tx.amount.toString());
      if (currentBalance - newAmt < 0) {
        // Revert balance change and return error
        await Wallet.findByIdAndUpdate(tx.wallet, {
          $inc: { balance: -parseFloat(tx.amount.toString()) },
        });
        await Wallet.findByIdAndUpdate(originalTx.wallet, {
          $inc: {
            balance:
              originalTx.type === 'income'
                ? parseFloat(originalTx.amount.toString())
                : -parseFloat(originalTx.amount.toString()),
          },
        });
        return {
          success: false,
          statusCode: 400,
          message: 'Không đủ số dư trong ví',
        };
      }
    }
  } else if (tx.type === 'transfer') {
    const fromDoc = await Wallet.findOne({
      _id: tx.fromWallet,
      user: userId,
      isActive: true,
    });
    if (!fromDoc) {
      return {
        success: false,
        statusCode: 404,
        message: 'Không tìm thấy ví chuyển',
      };
    }
    if (fromDoc.walletType === 'cash' || fromDoc.walletType === 'credit_card') {
      const fromBalance = parseFloat((fromDoc.balance || 0).toString());
      const transferAmt = parseFloat(tx.amount.toString());
      if (fromBalance - transferAmt < 0) {
        // Revert all balance changes
        await Wallet.findByIdAndUpdate(originalTx.fromWallet, {
          $inc: { balance: parseFloat(originalTx.amount.toString()) },
        });
        await Wallet.findByIdAndUpdate(originalTx.toWallet, {
          $inc: { balance: -parseFloat(originalTx.amount.toString()) },
        });
        await Wallet.findByIdAndUpdate(tx.fromWallet, {
          $inc: { balance: parseFloat(tx.amount.toString()) },
        });
        await Wallet.findByIdAndUpdate(tx.toWallet, {
          $inc: { balance: -parseFloat(tx.amount.toString()) },
        });
        return {
          success: false,
          statusCode: 400,
          message: 'Không đủ số dư trong ví chuyển',
        };
      }
    }
  }

  // Apply the new transaction's balance impact
  if (tx.type === 'income') {
    await Wallet.findByIdAndUpdate(tx.wallet, {
      $inc: { balance: parseFloat(tx.amount.toString()) },
    });
  } else if (tx.type === 'expense') {
    await Wallet.findByIdAndUpdate(tx.wallet, {
      $inc: { balance: -parseFloat(tx.amount.toString()) },
    });
  } else if (tx.type === 'transfer') {
    await Wallet.findByIdAndUpdate(tx.fromWallet, {
      $inc: { balance: -parseFloat(tx.amount.toString()) },
    });
    await Wallet.findByIdAndUpdate(tx.toWallet, {
      $inc: { balance: parseFloat(tx.amount.toString()) },
    });
  }

  return { success: true, statusCode: 200, transaction: tx };
};

const remove = async (userId, id) => {
  const tx = await Transaction.findOne({
    _id: id,
    user: userId,
    isDeleted: false,
  });
  if (!tx) {
    return {
      success: false,
      statusCode: 404,
      message: 'Không tìm thấy giao dịch',
    };
  }

  // Reverse the transaction's balance impact before soft deleting
  if (tx.type === 'income') {
    await Wallet.findByIdAndUpdate(tx.wallet, {
      $inc: { balance: -parseFloat(tx.amount.toString()) },
    });
  } else if (tx.type === 'expense') {
    await Wallet.findByIdAndUpdate(tx.wallet, {
      $inc: { balance: parseFloat(tx.amount.toString()) },
    });
  } else if (tx.type === 'transfer') {
    await Wallet.findByIdAndUpdate(tx.fromWallet, {
      $inc: { balance: parseFloat(tx.amount.toString()) },
    });
    await Wallet.findByIdAndUpdate(tx.toWallet, {
      $inc: { balance: -parseFloat(tx.amount.toString()) },
    });
  }

  // Soft delete the transaction
  await Transaction.findByIdAndUpdate(id, { $set: { isDeleted: true } });

  return {
    success: true,
    statusCode: 200,
    message: 'Đã xóa giao dịch',
    transaction: tx,
  };
};

export default { create, list, detail, update, remove };
