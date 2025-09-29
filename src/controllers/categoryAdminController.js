import categoryAdminService from '../services/categoryAdminService.js';

const create = async (req, res) => {
  try {
    const result = await categoryAdminService.createSystemCategory(req.body);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Create system category error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const update = async (req, res) => {
  try {
    const result = await categoryAdminService.updateSystemCategory(
      req.params.categoryId,
      req.body,
    );
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Update system category error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const remove = async (req, res) => {
  try {
    const result = await categoryAdminService.deleteSystemCategory(
      req.params.categoryId,
    );
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Delete system category error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

export default { create, update, remove };
