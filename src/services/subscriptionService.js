import Subscription from '../models/subscription.js';

const ensureSingleActive = async (userId, session, excludeId = null) => {
  const query = { user: userId, status: 'active' };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const activeSub = await Subscription.findOne(query).session(session || null);
  if (!activeSub) return null;

  activeSub.status = 'expired';
  activeSub.statusChangeNote = 'Auto-expired because a new subscription was activated.';
  activeSub.endDate = activeSub.endDate || new Date();
  await activeSub.save({ session });
  return activeSub;
};

const createSubscription = async (
  userId,
  planId,
  {
    startDate = new Date(),
    endDate,
    autoRenew = true,
    gracePeriodEndsAt,
    renewedFrom = null,
    status = 'active',
    statusChangeNote,
    statusChangeMetadata,
  } = {},
  options = {},
) => {
  const session = options.session || null;

  if (status === 'active') {
    await ensureSingleActive(userId, session);
  }

  const [subscription] = await Subscription.create(
    [
      {
        user: userId,
        plan: planId,
        status,
        startDate,
        endDate,
        autoRenew,
        gracePeriodEndsAt,
        renewedFrom,
        statusChangeNote:
          statusChangeNote ||
          (status === 'active'
            ? 'Subscription activated'
            : 'Subscription created'),
        statusChangeMetadata,
      },
    ],
    { session },
  );

  return subscription;
};

const changeStatus = async (
  subscriptionId,
  status,
  { note, metadata, endDate, cancelledAt, gracePeriodEndsAt } = {},
  options = {},
) => {
  const session = options.session || null;
  const subscription = await Subscription.findById(subscriptionId).session(session || null);
  if (!subscription) {
    throw new Error('Subscription not found');
  }

  if (status === 'active') {
    await ensureSingleActive(subscription.user, session, subscription._id);
  }

  subscription.status = status;
  subscription.statusChangeNote = note;
  subscription.statusChangeMetadata = metadata;
  if (endDate !== undefined) subscription.endDate = endDate;
  if (cancelledAt !== undefined) subscription.cancelledAt = cancelledAt;
  if (gracePeriodEndsAt !== undefined) subscription.gracePeriodEndsAt = gracePeriodEndsAt;
  subscription.lastStatusChangedAt = new Date();

  await subscription.save({ session });
  return subscription;
};

const getActiveSubscription = async (userId) => {
  return Subscription.findOne({ user: userId, status: 'active' }).populate('plan');
};

export default {
  createSubscription,
  changeStatus,
  getActiveSubscription,
};