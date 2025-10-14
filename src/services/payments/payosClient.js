import crypto from 'crypto';

const {
  PAYOS_CLIENT_ID,
  PAYOS_API_KEY,
  PAYOS_CHECKSUM_KEY,
  PAYOS_BASE_URL,
  PAYOS_RETURN_URL,
  PAYOS_CANCEL_URL,
} = process.env;

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_BASE_URL = 'https://api-merchant.payos.vn';

const getBaseUrl = () => PAYOS_BASE_URL || DEFAULT_BASE_URL;

const isConfigured = () => {
  return Boolean(PAYOS_CLIENT_ID && PAYOS_API_KEY && PAYOS_CHECKSUM_KEY);
};

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Client-Id': PAYOS_CLIENT_ID,
  'X-Api-Key': PAYOS_API_KEY,
});

const createSignatureFromString = (value) => {
  if (!PAYOS_CHECKSUM_KEY) {
    throw new Error('PAYOS_CHECKSUM_KEY is not configured');
  }
  return crypto.createHmac('sha256', PAYOS_CHECKSUM_KEY).update(value).digest('hex');
};

const sortObjectKeys = (input) => {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((item) => sortObjectKeys(item));
  }
  return Object.keys(input)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortObjectKeys(input[key]);
      return acc;
    }, {});
};

const objectToQueryString = (obj) =>
  Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .map((key) => {
      let value = obj[key];
      if (Array.isArray(value)) {
        value = JSON.stringify(value.map((item) => sortObjectKeys(item)));
      } else if (value && typeof value === 'object') {
        value = JSON.stringify(sortObjectKeys(value));
      } else if (value === null || value === undefined) {
        value = '';
      }
      return `${key}=${value}`;
    })
    .join('&');

const createSignatureFromObject = (payload) => {
  const sorted = sortObjectKeys(payload);
  const queryString = objectToQueryString(sorted);
  return createSignatureFromString(queryString);
};

const buildPaymentRequestSignature = ({ amount, cancelUrl, description, orderCode, returnUrl }) => {
  const dataStr = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
  return createSignatureFromString(dataStr);
};

export const verifySignature = (payload, signature) => {
  if (!signature) return false;
  try {
    const data =
      typeof payload === 'string' ? JSON.parse(payload) : payload;
    const expected = createSignatureFromObject(data);
    const provided = Buffer.from(signature);
    const comparison = Buffer.from(expected);
    if (provided.length !== comparison.length) return false;
    return crypto.timingSafeEqual(provided, comparison);
  } catch (error) {
    console.error('[PayOS] verifySignature error:', error);
    return false;
  }
};

const callPayOs = async (path, body, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_TIMEOUT);
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(`[PayOS] HTTP ${res.status}`);
      error.response = data;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
};

export const createPaymentRequest = async ({
  requestId,
  amount,
  description,
  items = [],
  buyer = {},
  returnUrl,
  cancelUrl,
  expiredAt,
}) => {
  if (!isConfigured()) {
    throw new Error('PayOS is not configured. Missing credentials.');
  }

  const normalizedReturnUrl = returnUrl || PAYOS_RETURN_URL || '';
  const normalizedCancelUrl = cancelUrl || PAYOS_CANCEL_URL || '';

  const payload = {
    orderCode: Number(requestId),
    amount: Math.round(Number(amount)),
    description: description || `Subscription checkout ${requestId}`,
    returnUrl: normalizedReturnUrl,
    cancelUrl: normalizedCancelUrl,
    expiredAt: Math.floor((expiredAt?.getTime?.() || Date.now()) / 1000),
    items,
    buyerName: buyer.name,
    buyerEmail: buyer.email,
    buyerPhone: buyer.phone,
    buyerAddress: buyer.address,
  };

  payload.signature = buildPaymentRequestSignature({
    amount: payload.amount,
    cancelUrl: normalizedCancelUrl,
    description: payload.description,
    orderCode: payload.orderCode,
    returnUrl: normalizedReturnUrl,
  });

  const response = await callPayOs('/v2/payment-requests', payload);

  if (!response || response.code !== '00') {
    const error = new Error(response?.desc || 'PayOS payment request failed');
    error.response = response;
    throw error;
  }

  const paymentData = response.data || {};

  return {
    raw: response,
    checkoutUrl: paymentData.checkoutUrl || paymentData.paymentLink,
    qrCode: paymentData.qrCode,
    expiredAt: paymentData.expiredAt
      ? new Date(paymentData.expiredAt * 1000)
      : expiredAt,
    providerTransactionId: paymentData.paymentLinkId || paymentData.code,
  };
};

export const payosClient = {
  isConfigured,
  createPaymentRequest,
  verifySignature,
};

export default payosClient;
