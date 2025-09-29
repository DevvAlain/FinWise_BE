import Transaction from '../models/transaction.js';
import mongoose from 'mongoose';

const spendByCategory = async (
  userId,
  { startDate, endDate, wallet, currency } = {},
) => {
  const match = {
    user: new mongoose.Types.ObjectId(userId),
    isDeleted: false,
    type: 'expense',
  };
  if (startDate || endDate) {
    match.occurredAt = {};
    if (startDate) match.occurredAt.$gte = new Date(startDate);
    if (endDate) match.occurredAt.$lte = new Date(endDate);
  }
  if (wallet) match.wallet = new mongoose.Types.ObjectId(wallet);
  if (currency) match.currency = currency;
  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: '$category',
        total: { $sum: { $toDouble: '$amount' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ];
  const items = await Transaction.aggregate(pipeline);
  return { success: true, statusCode: 200, items };
};

const monthlyTrend = async (userId, { months = 6, wallet, currency } = {}) => {
  const from = new Date();
  from.setMonth(from.getMonth() - (Number(months) - 1));
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  const match = {
    user: new mongoose.Types.ObjectId(userId),
    isDeleted: false,
    type: 'expense',
    occurredAt: { $gte: from },
  };
  if (wallet) match.wallet = new mongoose.Types.ObjectId(wallet);
  if (currency) match.currency = currency;
  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: { y: { $year: '$occurredAt' }, m: { $month: '$occurredAt' } },
        total: { $sum: { $toDouble: '$amount' } },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ];
  const items = await Transaction.aggregate(pipeline);
  return { success: true, statusCode: 200, items };
};

export default { spendByCategory, monthlyTrend };
