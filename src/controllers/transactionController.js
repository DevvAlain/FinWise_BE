import transactionService from '../services/transactionService.js';

const create = async (req, res) => {
  try {
    const result = await transactionService.create(req.user.id, req.body);
    return res.status(result.statusCode).json(result);
  } catch (e) {
    console.error('Create transaction error:', e);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const list = async (req, res) => {
  try {
    const result = await transactionService.list(req.user.id, req.query);
    return res.status(result.statusCode).json(result);
  } catch (e) {
    console.error('List transaction error:', e);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const detail = async (req, res) => {
  try {
    const result = await transactionService.detail(req.user.id, req.params.id);
    return res.status(result.statusCode).json(result);
  } catch (e) {
    console.error('Get transaction error:', e);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const update = async (req, res) => {
  try {
    const result = await transactionService.update(
      req.user.id,
      req.params.id,
      req.body,
    );
    return res.status(result.statusCode).json(result);
  } catch (e) {
    console.error('Update transaction error:', e);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const remove = async (req, res) => {
  try {
    const result = await transactionService.remove(req.user.id, req.params.id);
    return res.status(result.statusCode).json(result);
  } catch (e) {
    console.error('Delete transaction error:', e);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

export default { create, list, detail, update, remove };
