import User from '../models/user.js';
import mongoose from 'mongoose';

export const listUsers = async ({ search = '', status, role, page = 1, limit = 20 }) => {
    const query = {};
    if (search) {
        query.$or = [
            { email: { $regex: search, $options: 'i' } },
            { username: { $regex: search, $options: 'i' } },
            { fullName: { $regex: search, $options: 'i' } },
        ];
    }
    if (status) query.status = status;
    if (role) query.role = role;
    const skip = (Number(page) - 1) * Number(limit);
    const users = await User.find(query).skip(skip).limit(Number(limit)).sort({ createdAt: -1 });
    const total = await User.countDocuments(query);
    return { users, total, page: Number(page), limit: Number(limit) };
};

export const getUserDetail = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return User.findById(id);
};

export const updateUser = async (id, data) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return User.findByIdAndUpdate(id, data, { new: true });
};

export const lockUser = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return User.findByIdAndUpdate(id, { status: 'locked' }, { new: true });
};

export const unlockUser = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return User.findByIdAndUpdate(id, { status: 'active' }, { new: true });
};

export const deleteUser = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const result = await User.findByIdAndDelete(id);
    return !!result;
};

export default {
    listUsers,
    getUserDetail,
    updateUser,
    lockUser,
    unlockUser,
    deleteUser,
};
