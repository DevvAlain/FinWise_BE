import subscriptionService from '../services/subscriptionService.js';

const active = async (req, res) => {
  try {
    const subscription = await subscriptionService.getActiveSubscription(req.user.id);
    return res.status(200).json({ success: true, subscription: subscription || null });
  } catch (error) {
    console.error('[SubscriptionController] active error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch active subscription' });
  }
};

export default { active };
