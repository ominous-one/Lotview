import rateLimit from "express-rate-limit";

/**
 * Shared HTTP rate limiters.
 *
 * Keep these outside server/app.ts so route modules can import them without
 * creating an ESM circular dependency back into the Express application module.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again after 15 minutes" },
});

export const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests for this sensitive operation, please try again later" },
});
