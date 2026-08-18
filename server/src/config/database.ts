import mongoose from 'mongoose';
import { config } from './env';

/**
 * Validates that the connected MongoDB instance supports Multi-Document Transactions (Replica Set / mongos).
 * Executes an actual database read within a transaction to force MongoDB server verification.
 * Fails loudly on startup if MongoDB is a standalone instance.
 */
export async function verifyReplicaSetSupport(): Promise<void> {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    await mongoose.connection.db!
      .collection('__tx_test')
      .findOne({}, { session });
    await session.abortTransaction();
  } catch (err: unknown) {
    throw new Error(
      'CRITICAL DATABASE CONFIGURATION ERROR: MongoDB transactions are NOT supported on this MongoDB instance. ' +
      'MongoDB must be running as a Replica Set (or mongos) to guarantee ACID transactional correctness for ticket bookings, seat locking, and wallet ledgers.'
    );
  } finally {
    await session.endSession();
  }
}

export async function connectDatabase(uri?: string): Promise<void> {
  const mongoUri = uri || config.mongodbUri;

  mongoose.set('strictQuery', true);

  await mongoose.connect(mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  console.log(`MongoDB connected: ${mongoose.connection.host}`);
  await verifyReplicaSetSupport();
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.log('MongoDB disconnected');
}

export { mongoose };
