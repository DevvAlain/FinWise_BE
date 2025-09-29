import Transaction from '../models/transaction.js';
import Wallet from '../models/wallet.js';
import { ensureUsage } from '../middleware/quotaMiddleware.js';

const create = async (userId, payload) => {
  const {
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
  } = payload;
  if (!wallet || !type || !amount || !occurredAt)
    return {
      success: false,
      statusCode: 400,
      message: 'Thiếu trường bắt buộc',
    };
  if (!['expense', 'income', 'transfer'].includes(type))
    return {
      success: false,
      statusCode: 400,
      message: 'Loại giao dịch không hợp lệ',
    };
  if (type === 'transfer') {
    if (!fromWallet || !toWallet)
      return {
        success: false,
        statusCode: 400,
        message: 'Transfer cần fromWallet và toWallet',
      };
  }
  const w = await Wallet.findOne({ _id: wallet, user: userId, isActive: true });
  if (!w)
    return {
      success: false,
      statusCode: 404,
      message: 'Không tìm thấy ví',
    };

  // Amount as number
  const amt = parseFloat(amount.toString());

  // Prevent negative balance for expense on cash/credit_card
  if (
    type === 'expense' &&
    (w.walletType === 'cash' || w.walletType === 'credit_card')
  ) {
    const currentBalance = parseFloat((w.balance || 0).toString());
    if (currentBalance - amt < 0) {
      return {
        success: false,
        statusCode: 400,
        message: 'Số dư không đủ để thực hiện chi tiêu',
      };
    }
  }

  // Prevent negative balance for transfer from fromWallet on cash/credit_card
  if (type === 'transfer') {
    const fromWalletDoc = await Wallet.findOne({
      _id: fromWallet,
      user: userId,
      isActive: true,
    });
    const toWalletDoc = await Wallet.findOne({
      _id: toWallet,
      user: userId,
      isActive: true,
    });
    if (!fromWalletDoc || !toWalletDoc) {
      return {
        success: false,
        statusCode: 404,
        message: 'Không tìm thấy ví nguồn hoặc ví đích',
      };
    }
    if (
      fromWalletDoc.walletType === 'cash' ||
      fromWalletDoc.walletType === 'credit_card'
    ) {
      const currentBalance = parseFloat(
        (fromWalletDoc.balance || 0).toString(),
      );
      if (currentBalance - amt < 0) {
        return {
          success: false,
          statusCode: 400,
          message: 'Số dư ví nguồn không đủ để chuyển tiền',
        };
      }
    }
  }
  const tx = await Transaction.create({
    user: userId,
    wallet,
    type,
    amount,
    currency,
    category: category || null,
    occurredAt,
    description,
    merchant,
    fromWallet: fromWallet || null,
    toWallet: toWallet || null,
    inputMethod: 'manual',
  });

  // Update wallet balance based on transaction type
  let balanceChange = 0;
  if (type === 'income') {
    balanceChange = parseFloat(amount.toString());
  } else if (type === 'expense') {
    balanceChange = -parseFloat(amount.toString());
  } else if (type === 'transfer') {
    // For transfer, we need to update both fromWallet and toWallet
    const fromWalletDoc = await Wallet.findOne({
      _id: fromWallet,
      user: userId,
      isActive: true,
    });
    const toWalletDoc = await Wallet.findOne({
      _id: toWallet,
      user: userId,
      isActive: true,
    });

    if (!fromWalletDoc || !toWalletDoc) {
      return {
        success: false,
        statusCode: 404,
        message: 'Không tìm thấy ví nguồn hoặc ví đích',
      };
    }

    const transferAmount = parseFloat(amount.toString());

    // Update fromWallet balance (subtract)
    await Wallet.findByIdAndUpdate(fromWallet, {
      $inc: { balance: -transferAmount },
    });

    // Update toWallet balance (add)
    await Wallet.findByIdAndUpdate(toWallet, {
      $inc: { balance: transferAmount },
    });

    // Update quota usage
    const usage = await ensureUsage(userId);
    await usage.updateOne({ $inc: { transactionsCount: 1 } });

    return {
      success: true,
      statusCode: 201,
      transaction: tx,
    };
  }

  // Update wallet balance for income/expense
  await Wallet.findByIdAndUpdate(wallet, {
    $inc: { balance: balanceChange },
  });

  // Update quota usage
  const usage = await ensureUsage(userId);
  await usage.updateOne({ $inc: { transactionsCount: 1 } });

  return {
    success: true,
    statusCode: 201,
    transaction: tx,
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
  if (!tx)
    return {
      success: false,
      statusCode: 404,
      message: 'Không tìm thấy giao dịch',
    };
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
