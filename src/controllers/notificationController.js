import notificationService from '../services/notificationService.js';

const list = async (req, res) => {
  try {
    const result = await notificationService.list(req.user.id, req.query);
    return res.status(result.statusCode).json(result);
  } catch (e) {
    console.error('List notifications error:', e);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const markRead = async (req, res) => {
  try {
    const result = await notificationService.markRead(
      req.user.id,
      req.params.id,
    );
    return res.status(result.statusCode).json(result);
  } catch (e) {
    console.error('Mark read notification error:', e);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

export default { list, markRead };
