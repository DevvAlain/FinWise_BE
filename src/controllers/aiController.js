import aiService from '../services/aiService.js';

const parseExpense = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text)
      return res.status(400).json({ success: false, message: 'Thieu text' });
    const result = await aiService.parseExpense(req.user.id, text);
    return res.json({ success: true, data: result });
  } catch (e) {
    console.error('AI parseExpense error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

const qa = async (req, res) => {
  try {
    const { question, context } = req.body;
    if (!question)
      return res
        .status(400)
        .json({ success: false, message: 'Thieu question' });
    const answer = await aiService.qa(req.user.id, question, context);
    return res.json({ success: true, answer });
  } catch (e) {
    console.error('AI qa error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

const parseTransactionDraft = async (req, res) => {
  try {
    const { text, walletId } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'Thieu text' });
    }

    const result = await aiService.generateTransactionDraftFromText(req.user.id, {
      text,
      walletId,
    });

    return res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error('AI parseTransactionDraft error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

export default { parseExpense, qa, parseTransactionDraft };
