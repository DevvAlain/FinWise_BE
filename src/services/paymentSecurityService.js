import crypto from 'crypto';

const {
  PAYMENT_METADATA_SECRET,
  PAYOS_CHECKSUM_KEY,
} = process.env;

const metadataSecret = PAYMENT_METADATA_SECRET || PAYOS_CHECKSUM_KEY || 'fallback-secret-key';

const getAesKey = () => {
  return crypto.createHash('sha256').update(metadataSecret).digest();
};

export const generateSecureRequestId = () => {
  const timestamp = BigInt(Date.now()); // 13 digits
  const randomPart = BigInt(crypto.randomInt(100, 1000)); // 3 digits
  let orderCode = timestamp * 1000n + randomPart;
  // Ensure within PayOS limit (<= 9_007_199_254_740_991). Trim if necessary.
  const maxOrderCode = 9_007_199_254_740_991n;
  if (orderCode > maxOrderCode) {
    orderCode = maxOrderCode - BigInt(crypto.randomInt(0, 1000));
  }
  return orderCode.toString();
};

export const encryptMetadata = (metadataObj = {}) => {
  const key = getAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const serialized = JSON.stringify(metadataObj);
  const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}.${authTag.toString('hex')}.${encrypted.toString('hex')}`;
};

export const decryptMetadata = (encryptedValue) => {
  if (!encryptedValue || typeof encryptedValue !== 'string') return null;
  try {
    const [ivHex, authTagHex, dataHex] = encryptedValue.split('.');
    const key = getAesKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error) {
    console.error('[PaymentSecurity] decryptMetadata error:', error);
    return null;
  }
};

export const assessPaymentRisk = ({ user, plan, amount }) => {
  const flags = [];
  if (!user?.isActive) {
    flags.push('user_inactive');
  }
  if (!plan?.isActive) {
    flags.push('plan_inactive');
  }
  if (!(amount > 0)) {
    flags.push('invalid_amount');
  }
  const score = flags.length ? 95 : 5;
  return {
    score,
    flags,
    allow: flags.length === 0,
  };
};

export default {
  generateSecureRequestId,
  encryptMetadata,
  decryptMetadata,
  assessPaymentRisk,
};
