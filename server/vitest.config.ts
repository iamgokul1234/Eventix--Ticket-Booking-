import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    fileParallelism: false,
    testTimeout: 60000, // 60s timeout per test for remote Atlas network operations
    hookTimeout: 60000, // 60s hook timeout
    env: {
      NODE_ENV: 'test',
      PORT: '5001',
      MONGODB_URI:
        process.env.MONGODB_URI ||
        'mongodb://localhost:27017/ticket-booking',
      MONGODB_URI_TEST:
        process.env.MONGODB_URI_TEST ||
        'mongodb://localhost:27017/ticket-booking-test',
      JWT_SECRET: 'test-jwt-secret-do-not-use-in-production',
      JWT_EXPIRES_IN: '1h',
      CLIENT_URL: 'http://localhost:5173',
    },
  },
});
