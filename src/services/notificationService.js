import Notification from '../models/notification.js';

const list = async (userId, { page = 1, limit = 20 } = {}) => {
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Notification.countDocuments({ user: userId }),
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

const markRead = async (userId, id) => {
  const doc = await Notification.findOneAndUpdate(
    { _id: id, user: userId },
    { $set: { isRead: true } },
    { new: true },
  );
  if (!doc)
    return {
      success: false,
      statusCode: 404,
      message: 'Không tìm thấy thông báo',
    };
  return { success: true, statusCode: 200, item: doc };
};

export default { list, markRead };
