import mongoose from 'mongoose';
import SyncLog from '../models/sync_log.js';

const { Types } = mongoose;

const parseDate = (value, fallback = null) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date;
};

const buildQuery = ({ startDate, endDate, status, syncType, userId, walletId }) => {
  const query = {};

  const rangeStart = parseDate(startDate);
  const rangeEnd = parseDate(endDate);
  if (rangeStart || rangeEnd) {
    query.createdAt = {};
    if (rangeStart) query.createdAt.$gte = rangeStart;
    if (rangeEnd) query.createdAt.$lte = rangeEnd;
  }

  if (status) {
    const statuses = Array.isArray(status) ? status : String(status).split(',');
    query.status = { $in: statuses.map((item) => item.trim()).filter(Boolean) };
  }

  if (syncType) {
    const syncTypes = Array.isArray(syncType)
      ? syncType
      : String(syncType).split(',');
    query.syncType = { $in: syncTypes.map((item) => item.trim()).filter(Boolean) };
  }

  if (userId && Types.ObjectId.isValid(userId)) {
    query.user = new Types.ObjectId(userId);
  }

  if (walletId && Types.ObjectId.isValid(walletId)) {
    query.wallet = new Types.ObjectId(walletId);
  }

  return query;
};

const listSyncLogs = async (filters = {}) => {
  const {
    page = 1,
    limit = 50,
    sort = 'desc',
  } = filters;
  const sanitizedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const sanitizedPage = Math.max(Number(page) || 1, 1);
  const skip = (sanitizedPage - 1) * sanitizedLimit;

  const query = buildQuery(filters);

  const sortOption = sort === 'asc' ? 1 : -1;

  const [items, total] = await Promise.all([
    SyncLog.find(query)
      .populate('user', 'email fullName')
      .populate('wallet', 'walletName walletType provider')
      .sort({ createdAt: sortOption })
      .skip(skip)
      .limit(sanitizedLimit)
      .lean(),
    SyncLog.countDocuments(query),
  ]);

  return {
    success: true,
    statusCode: 200,
    items,
    pagination: {
      page: sanitizedPage,
      limit: sanitizedLimit,
      total,
      pages: Math.ceil(total / sanitizedLimit) || 1,
    },
  };
};

export default {
  listSyncLogs,
};
