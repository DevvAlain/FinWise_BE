import subscriptionBillingService from '../services/subscriptionBillingService.js';

const checkout = async (req, res) => {
  try {
    const result = await subscriptionBillingService.initiateCheckout(req.user, req.body);
    return res.status(result.statusCode || 500).json(result);
  } catch (error) {
    console.error('[SubscriptionBillingController] checkout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to initiate subscription checkout',
    });
  }
};

const cancel = async (req, res) => {
  try {
    const result = await subscriptionBillingService.cancelCheckout(req.user.id, req.body?.requestId);
    return res.status(result.statusCode || 500).json(result);
  } catch (error) {
    console.error('[SubscriptionBillingController] cancel error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription checkout',
    });
  }
};

export default {
  checkout,
  cancel,
};
