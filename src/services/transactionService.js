import Transaction from "../models/transaction.js";
import Wallet from "../models/wallet.js";
import { ensureUsage } from "../middleware/quotaMiddleware.js";

const create = async (userId, payload) => {
    const
        {
            wallet, type, amount, currency = 'VND', category, occurredAt,
            description, merchant, fromWallet, toWallet
        } = payload;
    if (!wallet || !type || !amount || !occurredAt)
        return {
            success: false,
            statusCode: 400,
            message: "Thiếu trường bắt buộc"
        };
    if (!['expense', 'income', 'transfer'].includes(type))
        return {
            success: false,
            statusCode: 400,
            message: "Loại giao dịch không hợp lệ"
        };
    if (type === 'transfer') {
        if (!fromWallet || !toWallet)
            return {
                success: false,
                statusCode: 400,
                message: "Transfer cần fromWallet và toWallet"
            };
    }
    const w = await Wallet.findOne({ _id: wallet, user: userId, isActive: true });
    if (!w)
        return {
            success: false,
            statusCode: 404,
            message: "Không tìm thấy ví"
        };
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
        inputMethod: 'manual'
    });
    const usage = await ensureUsage(userId);
    await usage.updateOne({ $inc: { transactionsCount: 1 } });
    return {
        success: true,
        statusCode: 201,
        transaction: tx
    };
};

const list = async (userId, query) => {
    const { startDate, endDate, category, wallet, type, page = 1, limit = 20 } = query;
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
        Transaction.find(filter).sort({ occurredAt: -1 }).skip(skip).limit(Number(limit)),
        Transaction.countDocuments(filter)
    ]);
    return { success: true, statusCode: 200, items, total, page: Number(page), limit: Number(limit) };
};

const detail = async (userId, id) => {
    const tx = await Transaction.findOne({ _id: id, user: userId, isDeleted: false });
    if (!tx) return { success: false, statusCode: 404, message: "Không tìm thấy giao dịch" };
    return { success: true, statusCode: 200, transaction: tx };
};

const update = async (userId, id, payload) => {
    const allowed = ["wallet", "type", "amount", "currency", "category", "occurredAt", "description", "merchant", "fromWallet", "toWallet"];
    const updates = {};
    allowed.forEach(k => { if (typeof payload[k] !== 'undefined') updates[k] = payload[k]; });
    const tx = await Transaction.findOneAndUpdate({ _id: id, user: userId, isDeleted: false }, { $set: updates }, { new: true });
    if (!tx) return { success: false, statusCode: 404, message: "Không tìm thấy giao dịch" };
    return { success: true, statusCode: 200, transaction: tx };
};

const remove = async (userId, id) => {
    const tx = await Transaction.findOneAndUpdate({ _id: id, user: userId, isDeleted: false }, { $set: { isDeleted: true } }, { new: true });
    if (!tx) return { success: false, statusCode: 404, message: "Không tìm thấy giao dịch" };
    return { success: true, statusCode: 200, message: "Đã xóa giao dịch", transaction: tx };
};

export default { create, list, detail, update, remove };


