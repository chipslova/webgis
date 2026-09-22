// Lightweight in-memory sliding window rate limiter for Vercel Serverless & Edge Functions

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  maxRequests: number; // Maximum allowed requests within the time window
  windowSeconds: number; // Sliding window duration in seconds
}

// In-memory store per serverless instance
const ipStore = new Map<string, RateLimitRecord>();

// Periodic pruning of expired entries to prevent memory buildup
let lastCleanup = Date.now();
function cleanupExpiredRecords(now: number) {
  if (now - lastCleanup < 60000) return; // run at most once per minute
  lastCleanup = now;
  for (const [ip, record] of ipStore.entries()) {
    if (now >= record.resetTime) {
      ipStore.delete(ip);
    }
  }
}

/**
 * Extracts client IP address reliably across Vercel Edge & Node.js runtimes
 */
export function getClientIp(req: any): string {
  let forwarded: string | null = null;
  let realIp: string | null = null;

  if (typeof req.headers?.get === 'function') {
    // Edge Runtime (Request object)
    forwarded = req.headers.get('x-forwarded-for');
    realIp = req.headers.get('x-real-ip');
  } else if (req.headers) {
    // Node.js Runtime (IncomingMessage / VercelRequest)
    forwarded = req.headers['x-forwarded-for'] as string;
    realIp = req.headers['x-real-ip'] as string;
  }

  if (forwarded) {
    // x-forwarded-for can be a comma-separated list of IPs: "client, proxy1, proxy2"
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  return '127.0.0.1';
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  retryAfter: number; // Seconds to wait
}

/**
 * Evaluates rate limit for a given IP with sliding window
 */
export function checkRateLimit(ip: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  cleanupExpiredRecords(now);

  const windowMs = config.windowSeconds * 1000;
  const current = ipStore.get(ip);

  if (!current || now >= current.resetTime) {
    // New or expired window
    const resetTime = now + windowMs;
    ipStore.set(ip, { count: 1, resetTime });
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      resetTime: Math.ceil(resetTime / 1000),
      retryAfter: 0
    };
  }

  if (current.count < config.maxRequests) {
    // Allowed within window
    current.count += 1;
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - current.count,
      resetTime: Math.ceil(current.resetTime / 1000),
      retryAfter: 0
    };
  }

  // Rate limit exceeded
  const retryAfter = Math.max(1, Math.ceil((current.resetTime - now) / 1000));
  return {
    allowed: false,
    limit: config.maxRequests,
    remaining: 0,
    resetTime: Math.ceil(current.resetTime / 1000),
    retryAfter
  };
}

/**
 * Resets the in-memory rate limiter store (useful for testing)
 */
export function _resetRateLimitStore() {
  ipStore.clear();
}
