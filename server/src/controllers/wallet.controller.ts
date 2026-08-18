import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { getWallet, topUpWallet, getWalletTransactions } from '../services/wallet.service';
import { TopUpInput, WalletQueryInput } from '../validators/wallet';
import { ValidationError } from '../utils/errors';

export async function getWalletController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const walletInfo = await getWallet(req.user!.userId);
    sendSuccess(res, walletInfo, 'Wallet details fetched');
  } catch (err) {
    next(err);
  }
}

export async function topUpWalletController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new ValidationError('Idempotency-Key header is required');
    }

    const { amount } = req.body as TopUpInput;
    const result = await topUpWallet(req.user!.userId, amount, idempotencyKey);
    sendSuccess(res, result, 'Wallet topped up successfully', 200);
  } catch (err) {
    next(err);
  }
}

export async function getWalletTransactionsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.query as unknown as WalletQueryInput;
    const history = await getWalletTransactions(req.user!.userId, query.page, query.limit);
    sendSuccess(res, history, 'Wallet transactions fetched');
  } catch (err) {
    next(err);
  }
}
