import categoryService from '../services/categoryService.js';

const listSystem = async (req, res) => {
  try {
    const result = await categoryService.listSystem();
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('List system categories error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};

const listMine = async (req, res) => {
  try {
    const result = await categoryService.listMine(req.user.id);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('List my categories error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};

const createMine = async (req, res) => {
  try {
    const result = await categoryService.createMine(req.user.id, req.body);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Create my category error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
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
    return res.status(500).json({ success: false, message: 'Loi may chu' });
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
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};

const listSuggestions = async (req, res) => {
  try {
    const result = await categoryService.listSuggestions(req.user.id);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('List category suggestions error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};

const confirmSuggestion = async (req, res) => {
  try {
    const result = await categoryService.confirmSuggestion(
      req.user.id,
      req.params.suggestionId,
      req.body || {},
    );
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Confirm category suggestion error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};

// 🆕 ADD MISSING: Reject suggestion controller
const rejectSuggestion = async (req, res) => {
  try {
    const result = await categoryService.rejectSuggestion(
      req.user.id,
      req.params.suggestionId,
      req.body?.feedback || null,
    );
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Reject category suggestion error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};

export default {
  listSystem,
  listMine,
  createMine,
  updateMine,
  deleteMine,
  listSuggestions,
  confirmSuggestion,
  rejectSuggestion, // 🆕 ADD MISSING EXPORT
};
