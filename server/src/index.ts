/**
 * Server entry point.
 * Loads .env FIRST before any other imports so config/env.ts sees process.env.
 */
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the repo root (two levels up from server/src/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { config } from './config';
import { connectDatabase } from './config/database';
import { startReservationCleanupJob, stopReservationCleanupJob } from './jobs';
import app from './app';

async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();

    // Start background reservation cleanup job (runs every 10s)
    startReservationCleanupJob(10000);

    const server = app.listen(config.port, () => {
      console.log(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
    });

    // Graceful shutdown
    const shutdown = (signal: string) => {
      console.log(`${signal} received. Shutting down gracefully...`);
      stopReservationCleanupJob();
      server.close(async () => {
        const { disconnectDatabase } = await import('./config/database');
        await disconnectDatabase();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
