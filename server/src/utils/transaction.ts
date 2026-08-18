import mongoose from 'mongoose';
import { BusinessError } from '../utils/errors';
import { ErrorCode } from '../constants/errorCodes';

/**
 * Runs an async function inside a Mongoose transaction.
 * Automatically handles commit/abort and retries on MongoDB TransientTransactionError / WriteConflict (code 112).
 * Converts persistent WriteConflict into 409 INVALID_STATE_TRANSITION error.
 */
export async function runInTransaction<T>(
  fn: (session: mongoose.ClientSession) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let attempts = 0;
  while (true) {
    attempts++;
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (err: unknown) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      const isTransient =
        (typeof err === 'object' &&
          err !== null &&
          'hasErrorLabel' in err &&
          typeof (err as { hasErrorLabel: unknown }).hasErrorLabel === 'function' &&
          (err as { hasErrorLabel: (label: string) => boolean }).hasErrorLabel(
            'TransientTransactionError'
          )) ||
        (typeof err === 'object' &&
          err !== null &&
          (err as { code?: number }).code === 112);

      if (isTransient && attempts < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 50 * attempts));
        continue;
      }

      if (isTransient) {
        throw new BusinessError(
          'Resource is currently locked by a concurrent transaction',
          409,
          ErrorCode.INVALID_STATE_TRANSITION
        );
      }

      throw err;
    } finally {
      await session.endSession();
    }
  }
}
