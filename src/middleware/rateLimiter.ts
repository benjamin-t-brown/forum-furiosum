import rateLimit from 'express-rate-limit';

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { ok: false, error: { code: 'RATE_LIMITED', message: 'Too many signup attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
