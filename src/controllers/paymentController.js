import mongoose from 'mongoose';
import paymentWebhookService from '../services/paymentWebhookService.js';
import paymentProcessingService from '../services/paymentProcessingService.js';
import Payment from '../models/payment.js';

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

const reviewPayment = async (req, res) => {
  try {
    const { paymentId } = req.params; // may be Mongo _id OR provider requestId/orderCode/transactionId
    const { content, rating } = req.body;

    console.log('[PaymentController] reviewPayment request:', {
      paymentId,
      body: req.body,
      user: req.user ? req.user._id : null,
    });

    // basic validation
    if (!content || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Invalid review data' });
    }

    let payment = null;

    // 1) Try by Mongo ObjectId (fast path)
    if (mongoose.Types.ObjectId.isValid(paymentId)) {
      payment = await Payment.findById(paymentId);
      if (payment) {
        console.log('[PaymentController] Found by _id');
      }
    }

    // 2) Try common top-level provider fields
    if (!payment) {
      const orClauses = [
        { requestId: paymentId },
        { orderCode: paymentId },
        { orderId: paymentId },
        { transactionId: paymentId },
        { providerRequestId: paymentId },
        { providerTransactionId: paymentId },
        { paymentLinkId: paymentId },
        { externalId: paymentId },
        { code: paymentId },
        // add more fields your app might use
      ];
      payment = await Payment.findOne({ $or: orClauses });
      if (payment) {
        console.log('[PaymentController] Found by top-level provider field');
      }
    }

    // 3) Fallback: search inside providerData values using aggregation (objectToArray)
    if (!payment) {
      // aggregate to find any payment whose providerData contains the value
      const agg = await Payment.aggregate([
        {
          $project: {
            providerData: 1,
          },
        },
        {
          $addFields: {
            provArr: { $objectToArray: '$providerData' },
          },
        },
        { $unwind: '$provArr' },
        { $match: { 'provArr.v': paymentId } },
        { $limit: 1 },
      ]);

      if (agg && agg.length > 0) {
        const foundId = agg[0]._id;
        payment = await Payment.findById(foundId);
        if (payment) {
          console.log('[PaymentController] Found by providerData value (aggregation)');
        }
      }
    }

    if (!payment) {
      console.warn('[PaymentController] reviewPayment: payment not found for', paymentId);
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    // optional: if you want to restrict who can review a payment, add check here:
    // if (payment.user && req.user && payment.user.toString() !== req.user._id.toString()) {
    //   return res.status(403).json({ success: false, message: 'Not allowed to review this payment' });
    // }

    // attach review; include user if available
    payment.review = {
      ...(req.user && req.user._id ? { user: req.user._id } : {}),
      content,
      rating,
      createdAt: new Date(),
    };

    await payment.save();

    return res.status(200).json({ success: true, review: payment.review });
  } catch (error) {
    console.error('[PaymentController] reviewPayment error:', error);
    return res.status(500).json({ success: false, message: 'Failed to submit review' });
  }
};

export default {
  handleWebhook,
  reviewPayment,
};
