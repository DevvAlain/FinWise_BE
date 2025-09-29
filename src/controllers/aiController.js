import aiService, { createTransactionFromText, createTransactionFromDraft } from '../services/aiService.js';

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

export const createTransaction = async (req, res) => {
  try {
    const { text, walletId, fromWallet, toWallet } = req.body;
    if (!text)
      return res.status(400).json({ success: false, message: 'Thieu text' });
    const result = await createTransactionFromText(req.user.id, {
      text,
      walletId,
      fromWallet,
      toWallet,
    });
    return res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error('AI createTransaction error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};
export const createTransactionFromConfirmedDraft = async (req, res) => {
  try {
    const result = await createTransactionFromDraft(req.user.id, req.body);
    return res.status(result.statusCode || 200).json(result);
  } catch (e) {
    console.error('AI createTransactionFromConfirmedDraft error:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

export default { parseExpense, qa, createTransaction, createTransactionFromConfirmedDraft };