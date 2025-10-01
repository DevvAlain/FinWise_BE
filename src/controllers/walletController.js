import walletService from '../services/walletService.js';

const create = async (req, res) => {
  try {
    const result = await walletService.createWallet(req.user.id, req.body);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Create wallet error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};

const list = async (req, res) => {
  try {
    const result = await walletService.listWallets(req.user.id);
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('List wallets error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};

const detail = async (req, res) => {
  try {
    const result = await walletService.getWallet(
      req.user.id,
      req.params.walletId,
    );
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Get wallet error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};

const update = async (req, res) => {
  try {
    const result = await walletService.updateWallet(
      req.user.id,
      req.params.walletId,
      req.body,
    );
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Update wallet error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};


const sync = async (req, res) => {
  try {
    const result = await walletService.requestWalletSync(
      req.user.id,
      req.params.walletId,
      req.body || {},
    );
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Sync wallet error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};

const remove = async (req, res) => {
  try {
    const result = await walletService.deleteWallet(
      req.user.id,
      req.params.walletId,
    );
    return res.status(result.statusCode).json(result);
  } catch (error) {
    console.error('Delete wallet error:', error);
    return res.status(500).json({ success: false, message: 'Loi may chu' });
  }
};

export default { create, list, detail, update, remove, sync };
