import PaymentWebhookEvent from '../models/payment_webhook_event.js';
import { verifySignature as verifyPayosSignature } from './payments/payosClient.js';

const MAX_PAYLOAD_BYTES = 1_000_000;
const RATE_LIMIT_WINDOW_MS = 1_000;
const RATE_LIMIT_MAX_EVENTS = 30;

const rateLimitState = new Map();

const getRequestIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const parts = Array.isArray(forwarded) ? forwarded : forwarded.split(',');
    return parts[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
};

const isWithinRateLimit = (provider) => {
  const now = Date.now();
  const state = rateLimitState.get(provider) || { windowStart: now, count: 0 };
  if (now - state.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitState.set(provider, { windowStart: now, count: 1 });
    return true;
  }
  if (state.count >= RATE_LIMIT_MAX_EVENTS) {
    return false;
  }
  state.count += 1;
  rateLimitState.set(provider, state);
  return true;
};

const getIpWhitelist = (provider) => {
  if (provider === 'payos') {
    const whitelist = process.env.PAYOS_IP_WHITELIST || '';
    return whitelist
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
  }
  return [];
};

const validateSignature = (provider, payload, rawBody, signature) => {
  if (provider === 'payos') {
    return verifyPayosSignature(rawBody || payload, signature);
  }
  return false;
};

const extractEventId = (provider, body) => {
  if (provider === 'payos') {
    return (
      body?.data?.transactionId ||
      body?.data?.paymentLinkId ||
      body?.data?.code ||
      body?.transactionId ||
      body?.paymentLinkId ||
      body?.code ||
      body?.id
    );
  }
  return body?.id || body?.eventId;
};

const extractRequestId = (provider, body) => {
  if (provider === 'payos') {
    return body?.data?.orderCode || body?.orderCode || body?.data?.orderId;
  }
  return body?.requestId;
};

const parseTimestamp = (req) => {
  const header =
    req.headers['x-payos-timestamp'] ||
    req.headers['x-signature-timestamp'] ||
    req.headers['x-request-timestamp'];
  if (!header) return null;
  const numeric = Number(header);
  if (Number.isFinite(numeric)) {
    return new Date(numeric);
  }
  const date = new Date(header);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const validateWebhookRequest = (provider, req, rawBody) => {
  if (!isWithinRateLimit(provider)) {
    return { ok: false, statusCode: 429, message: 'Webhook rate limit exceeded' };
  }

  const rawLength = rawBody ? Buffer.byteLength(rawBody) : 0;
  if (rawLength > MAX_PAYLOAD_BYTES) {
    return { ok: false, statusCode: 413, message: 'Payload too large' };
  }

  const whitelist = getIpWhitelist(provider);
  if (whitelist.length > 0) {
    const ip = getRequestIp(req);
    if (!whitelist.includes(ip)) {
      return { ok: false, statusCode: 403, message: 'IP not allowed' };
    }
  }

  const timestamp = parseTimestamp(req);
  if (!timestamp) {
    return { ok: false, statusCode: 400, message: 'Missing signature timestamp' };
  }
  if (Math.abs(Date.now() - timestamp.getTime()) > 5 * 60 * 1000) {
    return { ok: false, statusCode: 408, message: 'Signature timestamp expired' };
  }

  const signature =
    req.headers['x-payos-signature'] ||
    req.headers['x-signature'] ||
    req.headers['x-webhook-signature'];

  if (!validateSignature(provider, req.body, rawBody, signature)) {
    return { ok: false, statusCode: 401, message: 'Invalid signature' };
  }

  return { ok: true, signature, timestamp };
};

export const registerWebhookEvent = async ({
  provider,
  body,
  rawBody,
  signature,
  timestamp,
}) => {
  const eventId = extractEventId(provider, body);
  if (!eventId) {
    return {
      success: false,
      statusCode: 400,
      message: 'Unable to determine webhook event id',
    };
  }

  const requestId = extractRequestId(provider, body);

  try {
    const event = await PaymentWebhookEvent.create({
      provider,
      eventId: String(eventId),
      requestId: requestId ? String(requestId) : undefined,
      signature,
      timestamp,
      payload: body,
      rawPayload: typeof rawBody === 'string' ? rawBody : JSON.stringify(body),
      status: 'queued',
      metadata: {
        retryable: true,
      },
    });

    return {
      success: true,
      statusCode: 202,
      event,
      duplicate: false,
    };
  } catch (error) {
    if (error?.code === 11000) {
      const existing = await PaymentWebhookEvent.findOne({
        provider,
        eventId: String(eventId),
      });
      if (existing) {
        return {
          success: true,
          statusCode: 200,
          event: existing,
          duplicate: true,
        };
      }
    }
    console.error('[PaymentWebhook] Failed to register webhook event:', error);
    return {
      success: false,
      statusCode: 500,
      message: 'Failed to queue webhook event',
    };
  }
};

export default {
  validateWebhookRequest,
  registerWebhookEvent,
};
