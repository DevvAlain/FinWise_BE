import Wallet from '../models/wallet.js';
import { ensureUsage, getPeriodMonth } from '../middleware/quotaMiddleware.js';

const createWallet = async (userId, payload) => {
  const {
    walletName,
    walletType,
    currency = 'VND',
    provider,
    accountNumber,
    alias,
  } = payload;
  if (!walletName || !walletType) {
    return {
      success: false,
      statusCode: 400,
      message: 'Thiếu walletName hoặc walletType',
    };
  }
  const newDoc = {
    user: userId,
    walletName: String(walletName).trim(),
    walletType,
    currency,
    provider,
    accountNumber,
  };
  if (typeof alias === 'string' && alias.trim() !== '') {
    newDoc.alias = alias.trim();
  }
  const wallet = await Wallet.create(newDoc);
  // increment wallet count in quota usage for this period
  const usage = await ensureUsage(userId);
  await usage.updateOne({ $inc: { walletsCount: 1 } });
  return { success: true, statusCode: 201, wallet };
};

const listWallets = async (userId) => {
  const items = await Wallet.find({ user: userId, isActive: true }).sort({
    createdAt: -1,
  });
  return { success: true, statusCode: 200, items };
};

const getWallet = async (userId, walletId) => {
  const wallet = await Wallet.findOne({
    _id: walletId,
    user: userId,
    isActive: true,
  });
  if (!wallet)
    return { success: false, statusCode: 404, message: 'Không tìm thấy ví' };
  return { success: true, statusCode: 200, wallet };
};

const updateWallet = async (userId, walletId, payload) => {
  const allowed = [
    'walletName',
    'walletType',
    'currency',
    'provider',
    'accountNumber',
    'balance',
    'alias',
  ];
  const updates = {};
  for (const key of allowed) {
    if (typeof payload[key] !== 'undefined') updates[key] = payload[key];
  }
  const wallet = await Wallet.findOneAndUpdate(
    { _id: walletId, user: userId, isActive: true },
    { $set: updates },
    { new: true },
  );
  if (!wallet)
    return { success: false, statusCode: 404, message: 'Không tìm thấy ví' };
  return { success: true, statusCode: 200, wallet };
};

const deleteWallet = async (userId, walletId) => {
  const wallet = await Wallet.findOneAndUpdate(
    { _id: walletId, user: userId, isActive: true },
    { $set: { isActive: false } },
    { new: true },
  );
  if (!wallet)
    return { success: false, statusCode: 404, message: 'Không tìm thấy ví' };
  return { success: true, statusCode: 200, message: 'Đã xóa ví', wallet };
};

export default {
  createWallet,
  listWallets,
  getWallet,
  updateWallet,
  deleteWallet,
};
