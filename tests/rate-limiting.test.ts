import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, getClientIp, _resetRateLimitStore } from '../api/_rate-limit';
import zonalHandler from '../api/gee-zonal-stats';
import lstHandler from '../api/gee-lst-tiles';

describe('Serverless Rate Limiting & Protection', () => {
  beforeEach(() => {
    _resetRateLimitStore();
  });

  it('should extract client IP from x-forwarded-for or x-real-ip headers', () => {
    // Node style headers
    expect(getClientIp({ headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18' } })).toBe('203.0.113.195');
    expect(getClientIp({ headers: { 'x-real-ip': '198.51.100.4' } })).toBe('198.51.100.4');
    expect(getClientIp({ headers: {} })).toBe('127.0.0.1');

    // Edge style headers
    const mockEdgeReq = {
      headers: {
        get: (header: string) => {
          if (header === 'x-forwarded-for') return '192.0.2.1';
          return null;
        }
      }
    };
    expect(getClientIp(mockEdgeReq)).toBe('192.0.2.1');
  });

  it('should allow requests under the limit and throttle when limit is reached', () => {
    const ip = '198.51.100.25';
    const config = { maxRequests: 3, windowSeconds: 60 };

    // 1st request
    const r1 = checkRateLimit(ip, config);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    // 2nd request
    const r2 = checkRateLimit(ip, config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    // 3rd request
    const r3 = checkRateLimit(ip, config);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4th request (Over limit)
    const r4 = checkRateLimit(ip, config);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfter).toBeGreaterThan(0);
  });

  it('should reject requests exceeding rate limit with 429 Too Many Requests in GEE zonal handler', async () => {
    const mockReq = {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.99' },
      body: { geometry: null }
    };

    let lastStatus = 0;
    let lastJson: any = null;
    const createRes = () => ({
      setHeader: () => {},
      status: (code: number) => {
        lastStatus = code;
        return {
          json: (data: any) => { lastJson = data; }
        };
      }
    });

    // Fire 30 requests (the limit)
    for (let i = 0; i < 30; i++) {
      await zonalHandler(mockReq, createRes());
    }

    // 31st request should be throttled (429)
    await zonalHandler(mockReq, createRes());
    expect(lastStatus).toBe(429);
    expect(lastJson.error).toContain('Rate limit exceeded');
    expect(lastJson.retryAfter).toBeGreaterThan(0);
  });

  it('should throttle GEE LST tile endpoint when exceeded', async () => {
    const mockReq = {
      method: 'GET',
      headers: { 'x-forwarded-for': '10.0.0.88' },
      query: {}
    };

    let lastStatus = 0;
    let lastJson: any = null;
    const createRes = () => ({
      setHeader: () => {},
      status: (code: number) => {
        lastStatus = code;
        return {
          json: (data: any) => { lastJson = data; }
        };
      }
    });

    // Fire 60 requests (limit for LST tiles)
    for (let i = 0; i < 60; i++) {
      await lstHandler(mockReq, createRes());
    }

    // 61st request should be throttled (429)
    await lstHandler(mockReq, createRes());
    expect(lastStatus).toBe(429);
    expect(lastJson.error).toContain('Rate limit exceeded');
  });
});
