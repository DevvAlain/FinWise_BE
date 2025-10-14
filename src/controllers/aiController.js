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

// 🆕 NEW: Create transaction with wallet selection
const createTransactionWithWallet = async (req, res) => {
  try {
    const { walletId, transactionData } = req.body;

    if (!walletId) {
      return res.status(400).json({
        success: false,
        message: 'Vui long chon vi'
      });
    }

    if (!transactionData) {
      return res.status(400).json({
        success: false,
        message: 'Thieu thong tin giao dich'
      });
    }

    // Create transaction with selected wallet
    const result = await aiService.createTransactionFromParsedData(req.user.id, {
      ...transactionData,
      walletId,
    });

    return res.status(result.statusCode || 201).json(result);
  } catch (e) {
    console.error('AI createTransactionWithWallet error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

const chat = async (req, res) => {
  try {
    const result = await aiService.chat(req.user.id, req.body || {});
    return res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error('AI chat error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

export default {
  parseExpense,
  qa,
  chat,
  parseTransactionDraft,
  createTransactionWithWallet
};
