import userProfileService from '../services/userProfileService.js';

const getMe = async (req, res) => {
  try {
    const result = await userProfileService.getMe(req.user.id);
    if (!result.success) {
      return res.status(result.statusCode).json(result);
    }
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const updateMe = async (req, res) => {
  try {
    const file =
      req.file ||
      (req.files && (req.files.avatar?.[0] || req.files.image?.[0]));
    const result = await userProfileService.updateMe(
      req.user.id,
      req.body,
      file,
    );
    if (!result.success) {
      return res.status(result.statusCode).json(result);
    }
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Update me error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

export default { getMe, updateMe };
