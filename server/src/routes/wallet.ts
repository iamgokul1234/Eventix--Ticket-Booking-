import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { TopUpSchema, WalletQuerySchema } from '../validators/wallet';
import {
  getWalletController,
  topUpWalletController,
  getWalletTransactionsController,
} from '../controllers/wallet.controller';

const router = Router();

// All wallet routes require authentication
router.use(authenticate);

// GET /api/wallet — get wallet details & balance
router.get('/', getWalletController);

// POST /api/wallet/top-up — top up wallet balance (requires Idempotency-Key header)
router.post('/top-up', validate(TopUpSchema), topUpWalletController);

// GET /api/wallet/transactions — transaction history
router.get('/transactions', validate(WalletQuerySchema, 'query'), getWalletTransactionsController);

export default router;
