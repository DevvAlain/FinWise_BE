import mongoose from 'mongoose';
import Transaction from '../models/transaction.js';
import Wallet from '../models/wallet.js';
import { ensureUsage } from '../middleware/quotaMiddleware.js';
import { publishDomainEvents } from '../events/domainEvents.js';

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
      message: 'Thieu truong bat buoc',
    };
  }

  if (!['expense', 'income', 'transfer'].includes(type)) {
    return {
      success: false,
      statusCode: 400,
      message: 'Loai giao dich khong hop le',
    };
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return {
      success: false,
      statusCode: 400,
      message: 'So tien phai lon hon 0',
    };
  }

  if (type === 'transfer') {
    if (!fromWallet || !toWallet) {
      return {
        success: false,
        statusCode: 400,
        message: 'Chuyen tien can fromWallet va toWallet',
      };
    }
  } else if (!walletId && !wallet) {
    return {
      success: false,
      statusCode: 400,
      message: 'Thieu walletId',
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
      const primaryWalletId =
        type === 'transfer' ? fromWallet : walletId || wallet;

      const walletDoc = await Wallet.findOne({
        _id: primaryWalletId,
        user: userId,
        isActive: true,
      })
        .session(session)
        .exec();

      if (!walletDoc) {
        fail(404, 'Khong tim thay vi');
      }

      let fromWalletDoc = null;
      let toWalletDoc = null;

      if (type === 'transfer') {
        fromWalletDoc = walletDoc;
        toWalletDoc = await Wallet.findOne({
          _id: toWallet,
          user: userId,
          isActive: true,
        })
          .session(session)
          .exec();

        if (!toWalletDoc) {
          fail(404, 'Khong tim thay vi dich');
        }

        if (String(fromWalletDoc._id) === String(toWalletDoc._id)) {
          fail(400, 'Vi nguon va vi dich phai khac nhau');
        }
      }

      const currentBalance = decimalToNumber(walletDoc.balance);

      if (
        type === 'expense' &&
        ['cash', 'credit_card'].includes(walletDoc.walletType) &&
        currentBalance - numericAmount < 0
      ) {
        fail(400, 'So du khong du de chi tieu');
      }

      if (type === 'transfer') {
        const fromBalance = decimalToNumber(
          (fromWalletDoc && fromWalletDoc.balance) || 0,
        );
        if (
          ['cash', 'credit_card'].includes(fromWalletDoc.walletType) &&
          fromBalance - numericAmount < 0
        ) {
          fail(400, 'So du vi nguon khong du de chuyen');
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
            category: category || null,
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
        await Wallet.updateOne(
          { _id: walletDoc._id },
          { $inc: { balance: numericAmount } },
          { session },
        );
        updatedBalances[String(walletDoc._id)] = newBalance;
      } else if (type === 'expense') {
        const newBalance = currentBalance - numericAmount;
        await Wallet.updateOne(
          { _id: walletDoc._id },
          { $inc: { balance: -numericAmount } },
          { session },
        );
        updatedBalances[String(walletDoc._id)] = newBalance;
      } else if (type === 'transfer') {
        const fromBalanceBefore = decimalToNumber(
          (fromWalletDoc && fromWalletDoc.balance) || 0,
        );
        const toBalanceBefore = decimalToNumber(
          (toWalletDoc && toWalletDoc.balance) || 0,
        );

        await Wallet.updateOne(
          { _id: fromWalletDoc._id },
          { $inc: { balance: -numericAmount } },
          { session },
        );
        await Wallet.updateOne(
          { _id: toWalletDoc._id },
          { $inc: { balance: numericAmount } },
          { session },
        );

        updatedBalances[String(fromWalletDoc._id)] =
          fromBalanceBefore - numericAmount;
        updatedBalances[String(toWalletDoc._id)] =
          toBalanceBefore + numericAmount;
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
      message: 'Khong the tao giao dich',
    };
  } finally {
    session.endSession();
  }

  if (createdTransaction) {
    await publishDomainEvents(eventsToPublish);

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
    };
  }

  return {
    success: false,
    statusCode: 500,
    message: 'Khong the tao giao dich',
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
      message: 'Khong tim thay giao dich',
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
  if (!originalTx)
    return {
      success: false,
      statusCode: 404,
      message: 'Không tìm thấy giao dịch',
    };

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
    // Reverse transfer
    const transferAmount = parseFloat(originalTx.amount.toString());
    await Wallet.findByIdAndUpdate(originalTx.fromWallet, {
      $inc: { balance: transferAmount },
    });
    await Wallet.findByIdAndUpdate(originalTx.toWallet, {
      $inc: { balance: -transferAmount },
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
  if (!tx)
    return {
      success: false,
      statusCode: 404,
      message: 'Không tìm thấy giao dịch',
    };

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
        // revert reverse operation to keep data consistent
        await Wallet.findByIdAndUpdate(originalTx.wallet, {
          $inc: {
            balance:
              originalTx.type === 'income'
                ? parseFloat(originalTx.amount.toString())
                : originalTx.type === 'expense'
                  ? -parseFloat(originalTx.amount.toString())
                  : 0,
          },
        });
        if (originalTx.type === 'transfer') {
          const revAmt = parseFloat(originalTx.amount.toString());
          await Wallet.findByIdAndUpdate(originalTx.fromWallet, {
            $inc: { balance: -revAmt },
          });
          await Wallet.findByIdAndUpdate(originalTx.toWallet, {
            $inc: { balance: revAmt },
          });
        }
        return {
          success: false,
          statusCode: 400,
          message: 'Số dư không đủ để cập nhật chi tiêu',
        };
      }
    }
  } else if (tx.type === 'transfer') {
    const fromDoc = await Wallet.findOne({
      _id: tx.fromWallet,
      user: userId,
      isActive: true,
    });
    if (!fromDoc)
      return {
        success: false,
        statusCode: 404,
        message: 'Không tìm thấy ví nguồn',
      };
    if (fromDoc.walletType === 'cash' || fromDoc.walletType === 'credit_card') {
      const currentBalance = parseFloat((fromDoc.balance || 0).toString());
      const newAmt = parseFloat(tx.amount.toString());
      if (currentBalance - newAmt < 0) {
        // revert reverse operation
        await Wallet.findByIdAndUpdate(originalTx.wallet, {
          $inc: {
            balance:
              originalTx.type === 'income'
                ? parseFloat(originalTx.amount.toString())
                : originalTx.type === 'expense'
                  ? -parseFloat(originalTx.amount.toString())
                  : 0,
          },
        });
        if (originalTx.type === 'transfer') {
          const revAmt = parseFloat(originalTx.amount.toString());
          await Wallet.findByIdAndUpdate(originalTx.fromWallet, {
            $inc: { balance: -revAmt },
          });
          await Wallet.findByIdAndUpdate(originalTx.toWallet, {
            $inc: { balance: revAmt },
          });
        }
        return {
          success: false,
          statusCode: 400,
          message: 'Số dư ví nguồn không đủ để cập nhật chuyển khoản',
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
    const transferAmount = parseFloat(tx.amount.toString());
    await Wallet.findByIdAndUpdate(tx.fromWallet, {
      $inc: { balance: -transferAmount },
    });
    await Wallet.findByIdAndUpdate(tx.toWallet, {
      $inc: { balance: transferAmount },
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
  if (!tx)
    return {
      success: false,
      statusCode: 404,
      message: 'Không tìm thấy giao dịch',
    };

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
    const transferAmount = parseFloat(tx.amount.toString());
    await Wallet.findByIdAndUpdate(tx.fromWallet, {
      $inc: { balance: transferAmount },
    });
    await Wallet.findByIdAndUpdate(tx.toWallet, {
      $inc: { balance: -transferAmount },
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
