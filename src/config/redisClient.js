import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || null;
const REDIS_HOST = process.env.REDIS_HOST || null;
const REDIS_PORT = process.env.REDIS_PORT || null;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || null;

let client = null;
let connecting = null;

const isRedisConfigured = () => {
  if (REDIS_URL) return true;
  if (REDIS_HOST && REDIS_PORT) return true;
  return false;
};

const buildRedisUrl = () => {
  if (REDIS_URL) return REDIS_URL;
  const host = REDIS_HOST || '127.0.0.1';
  const port = Number(REDIS_PORT) || 6379;
  if (REDIS_PASSWORD) {
    return `redis://:${encodeURIComponent(REDIS_PASSWORD)}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
};

const handleClientError = (error) => {
  console.error('[Redis] Client error:', error);
};

export const getRedisClient = async () => {
  if (!isRedisConfigured()) {
    return null;
  }

  if (client && client.isOpen) {
    return client;
  }

  if (!client) {
    const url = buildRedisUrl();
    client = createClient({ url });
    client.on('error', handleClientError);
  }

  if (!client.isOpen && !connecting) {
    connecting = client.connect().catch((error) => {
      console.error('[Redis] Failed to connect:', error);
      connecting = null;
      client = null;
    });
  }

  if (connecting) {
    await connecting;
  }

  return client?.isOpen ? client : null;
};

export const closeRedisClient = async () => {
  if (client && client.isOpen) {
    await client.quit();
    client = null;
    connecting = null;
  }
};

export const redisAvailable = () => isRedisConfigured();

export default {
  getRedisClient,
  closeRedisClient,
  redisAvailable,
};
