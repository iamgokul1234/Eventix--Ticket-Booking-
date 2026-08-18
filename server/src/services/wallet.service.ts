import mongoose from 'mongoose';
import { findUserById } from '../repositories/user.repository';
import {
  atomicCreditUserBalance,
  atomicDebitUserBalance,
  createWalletTransactionRecord,
  findWalletTransactionsByUser,
  PaginatedWalletTransactions,
} from '../repositories/wallet.repository';
import {
  handleIdempotencyCheck,
  completeIdempotencyRecord,
  failIdempotencyRecord,
} from './idempotency.service';
import {
  WalletTransactionType,
  WalletReferenceType,
  WalletTransactionStatus,
} from '../constants/enums';
import { ErrorCode } from '../constants/errorCodes';
import { NotFoundError, BusinessError } from '../utils/errors';
import { runInTransaction } from '../utils/transaction';
import { IWalletTransaction } from '../models/WalletTransaction';

export interface WalletInfo {
  userId: string;
  name: string;
  email: string;
  walletBalance: number;
}

export interface TopUpResult {
  user: {
    id: string;
    email: string;
    walletBalance: number;
  };
  transaction: IWalletTransaction;
}

/**
 * Gets user wallet info (authoritative server-side balance).
 */
export async function getWallet(userId: string): Promise<WalletInfo> {
  const user = await findUserById(userId);
  if (!user) {
    throw new NotFoundError('User not found', ErrorCode.UNAUTHORIZED);
  }
  return {
    userId: user._id.toString(),
    name: user.name,
    email: user.email,
    walletBalance: user.walletBalance,
  };
}

/**
 * Tops up a user's wallet with an atomic credit and append-only ledger entry.
 * Enforces strict Idempotency-Key handling.
 */
export async function topUpWallet(
  userId: string,
  amount: number,
  idempotencyKey: string
): Promise<TopUpResult> {
  const endpoint = 'POST /api/wallet/top-up';
  const payload = { amount };

  // 1. Idempotency Check
  const check = await handleIdempotencyCheck(userId, idempotencyKey, endpoint, payload);
  if (check.isDuplicate && check.storedResponse) {
    return check.storedResponse as unknown as TopUpResult;
  }

  try {
    const { creditResult, txRecord } = await runInTransaction(async (session) => {
      // 2. Atomic Credit
      const creditRes = await atomicCreditUserBalance(userId, amount, session);
      if (!creditRes) {
        throw new NotFoundError('User not found', ErrorCode.UNAUTHORIZED);
      }

      // 3. Append-only ledger record
      const txRec = await createWalletTransactionRecord(
        {
          userId,
          type: WalletTransactionType.CREDIT,
          amount,
          balanceBefore: creditRes.balanceBefore,
          balanceAfter: creditRes.balanceAfter,
          referenceType: WalletReferenceType.TOP_UP,
          idempotencyKey,
          status: WalletTransactionStatus.COMPLETED,
        },
        session
      );

      return { creditResult: creditRes, txRecord: txRec };
    });

    const result: TopUpResult = {
      user: {
        id: creditResult!.user._id.toString(),
        email: creditResult!.user.email,
        walletBalance: creditResult!.user.walletBalance,
      },
      transaction: txRecord!,
    };

    // 4. Save completed response to idempotency store
    await completeIdempotencyRecord(userId, idempotencyKey, result as unknown as Record<string, unknown>);

    return result;
  } catch (err) {
    // If operational error, release idempotency lock so client can retry
    await failIdempotencyRecord(userId, idempotencyKey);
    throw err;
  }
}

/**
 * Gets transaction history for user with pagination.
 */
export async function getWalletTransactions(
  userId: string,
  page = 1,
  limit = 20
): Promise<PaginatedWalletTransactions> {
  return findWalletTransactionsByUser(userId, page, limit);
}

/**
 * Internal Atomic Debit Helper Primitive for booking/services.
 * Guarantees balance never goes negative using atomic conditional update.
 */
export async function debitWallet(
  userId: string | mongoose.Types.ObjectId,
  amount: number,
  referenceType: WalletReferenceType,
  referenceId?: string | mongoose.Types.ObjectId | null,
  idempotencyKey?: string | null,
  session?: mongoose.ClientSession
): Promise<{ walletTransaction: IWalletTransaction; balanceBefore: number; balanceAfter: number }> {
  // 1. Atomic Debit Primitive (filter guards walletBalance >= amount)
  const debitResult = await atomicDebitUserBalance(userId, amount, session);

  if (!debitResult) {
    throw new BusinessError(
      'Insufficient wallet balance',
      409,
      ErrorCode.INSUFFICIENT_BALANCE
    );
  }

  // 2. Ledger recording (append-only)
  const walletTransaction = await createWalletTransactionRecord(
    {
      userId,
      type: WalletTransactionType.DEBIT,
      amount,
      balanceBefore: debitResult.balanceBefore,
      balanceAfter: debitResult.balanceAfter,
      referenceType,
      referenceId: referenceId ?? null,
      idempotencyKey: idempotencyKey ?? null,
      status: WalletTransactionStatus.COMPLETED,
    },
    session
  );

  return {
    walletTransaction,
    balanceBefore: debitResult.balanceBefore,
    balanceAfter: debitResult.balanceAfter,
  };
}
