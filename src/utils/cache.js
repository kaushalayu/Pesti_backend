// In-memory cache (works without Redis)
const memoryCache = new Map();
const DEFAULT_TTL = 300; // 5 minutes

const getCacheKey = (prefix, params) => {
  const paramStr = JSON.stringify(params || {});
  return `cache:${prefix}:${paramStr}`;
};

const cleanupExpired = () => {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expires < now) {
      memoryCache.delete(key);
    }
  }
};

// Cleanup every 5 minutes
setInterval(cleanupExpired, 5 * 60 * 1000);

exports.get = async (key) => {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  
  if (entry.expires < Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  
  return entry.data;
};

exports.set = async (key, data, ttl = DEFAULT_TTL) => {
  memoryCache.set(key, {
    data,
    expires: Date.now() + (ttl * 1000)
  });
};

exports.del = async (key) => {
  memoryCache.delete(key);
};

exports.delPattern = async (pattern) => {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
    }
  }
};

exports.cached = async (key, fn, ttl = DEFAULT_TTL) => {
  const cached = await exports.get(key);
  if (cached) return cached;
  
  const data = await fn();
  await exports.set(key, data, ttl);
  return data;
};

exports.invalidateStats = async () => {
  await exports.delPattern('cache:stats:*');
  await exports.delPattern('cache:dashboard:*');
  await exports.delPattern('dashboard:*');
  await exports.delPattern('cache:collections:*');
  await exports.delPattern('cache:receipts:*');
};

exports.invalidateCache = async (key) => {
  await exports.del(key);
  await exports.del(`cache:${key}`);
  await exports.delPattern(`cache:${key}:*`);
  await exports.delPattern(`${key}:*`);
};

console.log('✅ In-memory cache initialized');
