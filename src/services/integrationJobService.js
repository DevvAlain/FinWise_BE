const enqueueInitConnection = async ({
  userId,
  walletId,
  provider,
  integrationId,
}) => {
  setImmediate(() => {
    try {
      console.info('integration.init_connection queued', {
        userId: userId?.toString?.() ?? userId,
        walletId: walletId?.toString?.() ?? walletId,
        provider,
        integrationId: integrationId?.toString?.() ?? integrationId,
        queuedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('integration.init_connection logging failed', error);
    }
  });

  return { queued: true };
};

export default { enqueueInitConnection };