import categoryService from '../services/categoryService.js';

const listSystem = async (req, res) => {
  try {
    const result = await categoryService.listSystem();
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('List system categories error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const listMine = async (req, res) => {
  try {
    const result = await categoryService.listMine(req.user.id);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('List my categories error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const createMine = async (req, res) => {
  try {
    const result = await categoryService.createMine(req.user.id, req.body);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Create my category error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const updateMine = async (req, res) => {
  try {
    const result = await categoryService.updateMine(
      req.user.id,
      req.params.categoryId,
      req.body,
    );
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Update my category error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const deleteMine = async (req, res) => {
  try {
    const result = await categoryService.deleteMine(
      req.user.id,
      req.params.categoryId,
    );
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Delete my category error:', error);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

export default { listSystem, listMine, createMine, updateMine, deleteMine };
