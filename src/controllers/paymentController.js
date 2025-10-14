import paymentWebhookService from '../services/paymentWebhookService.js';
import paymentProcessingService from '../services/paymentProcessingService.js';

const supportedProviders = new Set(['payos']);

const handleWebhook = async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!supportedProviders.has(provider)) {
    return res.status(404).json({
      success: false,
      message: `Unsupported payment provider ${provider}`,
    });
  }

  const rawBody =
    typeof req.rawBody === 'string'
      ? req.rawBody
      : req.rawBody instanceof Buffer
        ? req.rawBody.toString()
        : JSON.stringify(req.body || {});

  const validation = paymentWebhookService.validateWebhookRequest(
    provider,
    req,
    rawBody,
  );
  if (!validation.ok) {
    return res.status(validation.statusCode).json({
      success: false,
      message: validation.message,
    });
  }

  const registration = await paymentWebhookService.registerWebhookEvent({
    provider,
    body: req.body,
    rawBody,
    signature: validation.signature,
    timestamp: validation.timestamp,
  });

  if (!registration.success) {
    return res.status(registration.statusCode).json({
      success: false,
      message: registration.message,
    });
  }

  if (!registration.duplicate) {
    paymentProcessingService
      .processWebhookEvent(registration.event._id)
      .catch((error) =>
        console.error('[PaymentController] async processing error:', error),
      );
  }

  return res.status(registration.statusCode).json({
    success: true,
    duplicate: registration.duplicate,
  });
};

export default {
  handleWebhook,
};
