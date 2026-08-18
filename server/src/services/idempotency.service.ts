import mongoose from 'mongoose';
import { IdempotencyRecord, IIdempotencyRecord } from '../models/IdempotencyRecord';
import { IdempotencyStatus } from '../constants/enums';
import { ErrorCode } from '../constants/errorCodes';
import { ConflictError, ValidationError } from '../utils/errors';
import { hashPayload } from '../utils/helpers';

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  storedResponse?: Record<string, unknown> | null;
  record?: IIdempotencyRecord;
}

/**
 * Checks an Idempotency-Key header against existing database records.
 * - Same key + same payload + COMPLETED -> Returns cached storedResponse
 * - Same key + different payload -> Throws 409 IDEMPOTENCY_KEY_REUSED
 * - Same key + PROCESSING -> Throws 409 IDEMPOTENCY_KEY_REUSED
 * - New key -> Creates record in PROCESSING state
 */
export async function handleIdempotencyCheck(
  userId: string,
  key: string,
  endpoint: string,
  payload: unknown
): Promise<IdempotencyCheckResult> {
  if (!key || typeof key !== 'string' || key.trim() === '') {
    throw new ValidationError('Idempotency-Key header is required for this operation');
  }

  const trimmedKey = key.trim();
  const requestHash = hashPayload(payload);

  // Check if record exists for this (userId, key)
  const existing = await IdempotencyRecord.findOne({ userId, key: trimmedKey }).exec();

  if (existing) {
    // 1. Same key + different payload -> 409 IDEMPOTENCY_KEY_REUSED
    if (existing.requestHash !== requestHash) {
      throw new ConflictError(
        'Idempotency key reused with different request payload',
        ErrorCode.IDEMPOTENCY_KEY_REUSED
      );
    }

    // 2. Same key + currently PROCESSING -> 409 IDEMPOTENCY_KEY_REUSED
    if (existing.status === IdempotencyStatus.PROCESSING) {
      throw new ConflictError(
        'A request with this Idempotency-Key is currently processing',
        ErrorCode.IDEMPOTENCY_KEY_REUSED
      );
    }

    // 3. Same key + COMPLETED -> return stored result
    if (existing.status === IdempotencyStatus.COMPLETED) {
      return {
        isDuplicate: true,
        storedResponse: existing.storedResponse as Record<string, unknown>,
      };
    }

    // If FAILED state, delete the old record so it can be retried fresh
    await IdempotencyRecord.deleteOne({ _id: existing._id }).exec();
  }

  // Create new PROCESSING record
  try {
    const record = await IdempotencyRecord.create({
      userId,
      key: trimmedKey,
      endpoint,
      requestHash,
      status: IdempotencyStatus.PROCESSING,
    });

    return {
      isDuplicate: false,
      record,
    };
  } catch (err: unknown) {
    // Catch rare concurrent insert duplicate key race condition
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      throw new ConflictError(
        'Idempotency key request collision',
        ErrorCode.IDEMPOTENCY_KEY_REUSED
      );
    }
    throw err;
  }
}

/**
 * Marks an idempotency record as COMPLETED and saves the response payload to replay on duplicate calls.
 */
export async function completeIdempotencyRecord(
  userId: string,
  key: string,
  storedResponse: Record<string, unknown>,
  session?: mongoose.ClientSession
): Promise<void> {
  await IdempotencyRecord.findOneAndUpdate(
    { userId, key: key.trim() },
    {
      $set: {
        status: IdempotencyStatus.COMPLETED,
        storedResponse,
      },
    },
    { session }
  ).exec();
}

/**
 * Removes or marks FAILED an idempotency record if an operational error occurred so user can retry.
 */
export async function failIdempotencyRecord(
  userId: string,
  key: string
): Promise<void> {
  await IdempotencyRecord.deleteOne({ userId, key: key.trim() }).exec();
}
