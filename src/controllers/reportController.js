import reportService from '../services/reportService.js';

const spendByCategory = async (req, res) => {
  try {
    const result = await reportService.spendByCategory(req.user.id, req.query);
    return res.status(result.statusCode).json(result);
  } catch (e) {
    console.error('Report spendByCategory error:', e);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

const monthlyTrend = async (req, res) => {
  try {
    const result = await reportService.monthlyTrend(req.user.id, req.query);
    return res.status(result.statusCode).json(result);
  } catch (e) {
    console.error('Report monthlyTrend error:', e);
    return res.status(500).json({ success: false, message: 'Lỗi máy chủ' });
  }
};

export default { spendByCategory, monthlyTrend };
