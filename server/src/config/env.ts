/**
 * Central config module.
 *
 * Does NOT call dotenv.config() — that is the responsibility of the process
 * entry point (src/index.ts for the server, vitest.config.ts env block for tests).
 * This keeps env loading explicit and prevents double-loading.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongodbUri: requireEnv('MONGODB_URI'),
  mongodbUriTest: process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/ticket-booking-test',
  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@ticketbooking.com',
    password: process.env.ADMIN_PASSWORD || 'Admin@123456',
    name: process.env.ADMIN_NAME || 'Super Admin',
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
  reservation: {
    ttlMinutes: 5,
  },
} as const;
