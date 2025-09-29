// Simple in-memory per-user rate limit (sufficient for single-instance dev)
const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  return (req, res, next) => {
    try {
      const userId = req.user?.id || req.ip;
      const key = `${userId}`;
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || now - bucket.start > windowMs) {
        bucket = { start: now, count: 0 };
      }
      bucket.count += 1;
      buckets.set(key, bucket);
      if (bucket.count > max) {
        return res
          .status(429)
          .json({
            success: false,
            message: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
          });
      }
      next();
    } catch (e) {
      next();
    }
  };
}
