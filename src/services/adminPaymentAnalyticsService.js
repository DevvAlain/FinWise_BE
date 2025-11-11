import mongoose from 'mongoose';
import Payment from '../models/payment.js';

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const SUCCESS_STATUSES = ['completed', 'succeeded'];
const SUPPORTED_METHODS = ['bank_transfer', 'payos_qr', 'payos', 'momo', 'zalopay', 'stripe'];

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const decimalToNumber = (value) => {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof mongoose.Types.Decimal128) {
    return Number.parseFloat(value.toString());
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const buildBaseMatch = ({
  paymentMethods = SUPPORTED_METHODS,
  statuses = SUCCESS_STATUSES,
}) => {
  const match = {};

  if (Array.isArray(statuses) && statuses.length > 0) {
    // Match either 'status' or 'paymentStatus' field
    match.$or = [
      { status: { $in: statuses } },
      { paymentStatus: { $in: statuses } },
    ];
  }

  if (Array.isArray(paymentMethods) && paymentMethods.length > 0) {
    match.paymentMethod = { $in: paymentMethods };
  }

  return match;
};

const buildDateMatch = ({ startDate, endDate }) => {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start && !end) {
    return null;
  }

  const range = {};
  if (start) {
    range.$gte = start;
  }
  if (end) {
    range.$lte = end;
  }

  return { effectivePaidAt: range };
};

export const getTransferSummary = async ({ startDate, endDate } = {}) => {
  const baseMatch = buildBaseMatch({});
  const dateMatch = buildDateMatch({ startDate, endDate });

  const pipeline = [
    { $match: baseMatch },
    {
      $addFields: {
        effectivePaidAt: {
          $ifNull: ['$paidAt', '$createdAt'],
        },
      },
    },
    ...(dateMatch ? [{ $match: dateMatch }] : []),
    {
      $group: {
        _id: null,
        totalAmount: { $sum: { $toDouble: '$amount' } },
        count: { $sum: 1 },
      },
    },
  ];

  // Also get recent transactions with user info for summary
  const recentPipeline = [
    { $match: baseMatch },
    {
      $addFields: {
        effectivePaidAt: {
          $ifNull: ['$paidAt', '$createdAt'],
        },
      },
    },
    ...(dateMatch ? [{ $match: dateMatch }] : []),
    { $sort: { effectivePaidAt: -1 } },
    { $limit: 10 }, // top 10 recent for summary
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userInfo',
      },
    },
    {
      $project: {
        _id: 1,
        userInfo: { $arrayElemAt: ['$userInfo', 0] },
        transactionId: 1,
        providerTransactionId: 1,
        providerRequestId: 1,
        provider: 1,
        amount: 1,
        currency: 1,
        paymentStatus: 1,
        paidAt: 1,
        createdAt: 1,
      },
    },
  ];

  const [result, recentTransactions] = await Promise.all([
    Payment.aggregate(pipeline).then(res => res[0]),
    Payment.aggregate(recentPipeline),
  ]);

  return {
    range: {
      start: parseDate(startDate)?.toISOString() ?? null,
      end: parseDate(endDate)?.toISOString() ?? null,
    },
    currency: 'VND',
    totalRevenue: decimalToNumber(result?.totalAmount ?? 0),
    transactionCount: result?.count ?? 0,
    recentTransactions: recentTransactions.map((item) => ({
      paymentId: item._id,
      user: item.userInfo
        ? {
          id: item.userInfo._id,
          name: item.userInfo.fullName || item.userInfo.username || item.userInfo.email,
          email: item.userInfo.email,
        }
        : null,
      transactionId: item.transactionId || item.providerTransactionId || item.providerRequestId || null,
      provider: item.provider,
      amount: decimalToNumber(item.amount),
      currency: item.currency || 'VND',
      status: item.paymentStatus,
      createdAt: item.createdAt,
      paidAt: item.paidAt,
    })),
  };
};

export const getTransferHistory = async ({
  startDate,
  endDate,
  groupBy = 'day',
  timezone = DEFAULT_TIMEZONE,
} = {}) => {
  const baseMatch = buildBaseMatch({});
  const dateMatch = buildDateMatch({ startDate, endDate });

  const supportedGroups = new Set(['hour', 'day', 'month']);
  const normalizedGroup = supportedGroups.has(groupBy) ? groupBy : 'day';

  const dateFormatMap = {
    hour: '%Y-%m-%dT%H:00',
    day: '%Y-%m-%d',
    month: '%Y-%m',
  };

  const pipeline = [
    { $match: baseMatch },
    {
      $addFields: {
        effectivePaidAt: {
          $ifNull: ['$paidAt', '$createdAt'],
        },
      },
    },
    ...(dateMatch ? [{ $match: dateMatch }] : []),
    {
      $group: {
        _id: {
          $dateToString: {
            format: dateFormatMap[normalizedGroup],
            date: '$effectivePaidAt',
            timezone,
          },
        },
        totalAmount: { $sum: { $toDouble: '$amount' } },
        count: { $sum: 1 },
      },
    },
    {
      $sort: {
        _id: 1,
      },
    },
    {
      $project: {
        _id: 0,
        period: '$_id',
        totalRevenue: '$totalAmount',
        transactionCount: '$count',
      },
    },
  ];

  const docs = await Payment.aggregate(pipeline);

  // Also get detailed payment items with timestamps for admin dashboard
  const itemsPipeline = [
    { $match: baseMatch },
    {
      $addFields: {
        effectivePaidAt: {
          $ifNull: ['$paidAt', '$createdAt'],
        },
      },
    },
    ...(dateMatch ? [{ $match: dateMatch }] : []),
    { $sort: { effectivePaidAt: -1 } },
    { $limit: 100 }, // reasonable limit for dashboard
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userInfo',
      },
    },
    {
      $project: {
        _id: 1,
        user: 1,
        userInfo: { $arrayElemAt: ['$userInfo', 0] },
        transactionId: 1,
        providerRequestId: 1,
        providerTransactionId: 1,
        provider: 1,
        paymentMethod: 1,
        amount: 1,
        currency: 1,
        paymentStatus: 1,
        paidAt: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  ];

  const items = await Payment.aggregate(itemsPipeline);

  return {
    range: {
      start: parseDate(startDate)?.toISOString() ?? null,
      end: parseDate(endDate)?.toISOString() ?? null,
    },
    groupBy: normalizedGroup,
    timezone,
    points: docs.map((doc) => ({
      period: doc.period,
      totalRevenue: decimalToNumber(doc.totalRevenue),
      transactionCount: doc.transactionCount ?? 0,
    })),
    // Add detailed items with all timestamps
    items: items.map((item) => ({
      paymentId: item._id,
      user: item.userInfo
        ? {
          id: item.userInfo._id,
          name: item.userInfo.fullName || item.userInfo.username || item.userInfo.email,
          email: item.userInfo.email,
        }
        : null,
      transactionId: item.transactionId || item.providerTransactionId || item.providerRequestId || null,
      provider: item.provider,
      paymentMethod: item.paymentMethod,
      amount: decimalToNumber(item.amount),
      currency: item.currency || 'VND',
      status: item.paymentStatus,
      createdAt: item.createdAt,
      paidAt: item.paidAt,
      updatedAt: item.updatedAt,
    })),
  };
};

export default {
  getTransferSummary,
  getTransferHistory,
};
