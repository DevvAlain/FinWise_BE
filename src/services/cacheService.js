import { getRedisClient } from '../config/redisClient.js';

const memoryStore = new Map();

const normalizeTtl = (ttlSeconds) => {
  const ttl = Number(ttlSeconds);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    return null;
  }
  return Math.floor(ttl);
};

const getFromMemory = (key) => {
  const cached = memoryStore.get(key);
  if (!cached) return null;
  if (cached.expiresAt && cached.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return cached.value;
};

const setInMemory = (key, value, ttlSeconds) => {
  const ttl = normalizeTtl(ttlSeconds);
  const payload = {
    value,
    expiresAt: ttl ? Date.now() + ttl * 1000 : null,
  };
  memoryStore.set(key, payload);
};

export const get = async (key) => {
  const client = await getRedisClient();
  if (client) {
    try {
      const raw = await client.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('[CacheService] Redis get error:', error);
    }
  }
  return getFromMemory(key);
};

export const set = async (key, value, ttlSeconds) => {
  const client = await getRedisClient();
  const ttl = normalizeTtl(ttlSeconds);
  if (client) {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await client.setEx(key, ttl, serialized);
      } else {
        await client.set(key, serialized);
      }
      return;
    } catch (error) {
      console.error('[CacheService] Redis set error:', error);
    }
  }
  setInMemory(key, value, ttl);
};

export const del = async (key) => {
  const client = await getRedisClient();
  if (client) {
    try {
      await client.del(key);
    } catch (error) {
      console.error('[CacheService] Redis del error:', error);
    }
  }
  memoryStore.delete(key);
};

export const wrap = async (key, ttlSeconds, resolver) => {
  const cached = await get(key);
  if (cached !== null && cached !== undefined) {
    return cached;
  }
  const value = await resolver();
  if (value !== undefined) {
    await set(key, value, ttlSeconds);
  }
  return value;
};

export default {
  get,
  set,
  del,
  wrap,
};
