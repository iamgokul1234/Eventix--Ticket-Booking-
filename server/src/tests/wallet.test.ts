import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app';
import { User } from '../models/User';
import { WalletTransaction } from '../models/WalletTransaction';
import { debitWallet } from '../services/wallet.service';
import { WalletReferenceType, WalletTransactionType } from '../constants/enums';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function createTestUser(initialBalance = 0) {
  const email = `wallet-${Date.now()}-${Math.random()}@test.com`;
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Wallet User', email, password: 'Password1' });

  const token = res.body.data.token as string;
  const userId = res.body.data.user._id as string;

  if (initialBalance > 0) {
    await User.findByIdAndUpdate(userId, { $set: { walletBalance: initialBalance } });
  }

  return { token, userId, email };
}

// ─── GET /api/wallet ─────────────────────────────────────────────────────────

describe('GET /api/wallet', () => {
  it('returns wallet details and balance for authenticated user', async () => {
    const { token, email } = await createTestUser(5000);

    const res = await request(app)
      .get('/api/wallet')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(email);
    expect(res.body.data.walletBalance).toBe(5000);
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/wallet');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('UNAUTHORIZED');
  });
});

// ─── POST /api/wallet/top-up ──────────────────────────────────────────────────

describe('POST /api/wallet/top-up', () => {
  it('tops up wallet balance and creates ledger transaction', async () => {
    const { token, userId } = await createTestUser(0);
    const idempotencyKey = `topup-key-${Date.now()}`;

    const res = await request(app)
      .post('/api/wallet/top-up')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ amount: 10000 }); // 100 Rs

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.walletBalance).toBe(10000);

    // Verify DB user balance
    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(10000);

    // Verify ledger record
    const ledger = await WalletTransaction.find({ userId });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe(WalletTransactionType.CREDIT);
    expect(ledger[0].amount).toBe(10000);
    expect(ledger[0].balanceBefore).toBe(0);
    expect(ledger[0].balanceAfter).toBe(10000);
    expect(ledger[0].referenceType).toBe(WalletReferenceType.TOP_UP);
    expect(ledger[0].idempotencyKey).toBe(idempotencyKey);
  });

  it('requires Idempotency-Key header (returns 400)', async () => {
    const { token } = await createTestUser(0);

    const res = await request(app)
      .post('/api/wallet/top-up')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 10000 });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_REQUEST');
  });

  it('rejects float amount (returns 400)', async () => {
    const { token } = await createTestUser(0);

    const res = await request(app)
      .post('/api/wallet/top-up')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `key-${Date.now()}`)
      .send({ amount: 100.5 });

    expect(res.status).toBe(400);
  });

  it('rejects zero or negative amount (returns 400)', async () => {
    const { token } = await createTestUser(0);

    const res = await request(app)
      .post('/api/wallet/top-up')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `key-${Date.now()}`)
      .send({ amount: 0 });

    expect(res.status).toBe(400);
  });

  // ─── Idempotency tests ─────────────────────────────────────────────────────

  it('returns cached response on duplicate request with SAME Idempotency-Key & SAME payload', async () => {
    const { token, userId } = await createTestUser(0);
    const key = `idempotent-topup-${Date.now()}`;
    const payload = { amount: 5000 };

    // Request 1
    const res1 = await request(app)
      .post('/api/wallet/top-up')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res1.body.data.user.walletBalance).toBe(5000);

    // Request 2 with EXACT SAME key and payload
    const res2 = await request(app)
      .post('/api/wallet/top-up')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.data.user.walletBalance).toBe(5000);

    // CRITICAL INVARIANT: User balance must STILL be 5000, NOT 10000!
    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(5000);

    // Only 1 ledger transaction created
    const ledger = await WalletTransaction.find({ userId });
    expect(ledger).toHaveLength(1);
  });

  it('returns 409 IDEMPOTENCY_KEY_REUSED when same key used with DIFFERENT payload', async () => {
    const { token } = await createTestUser(0);
    const key = `idempotent-topup-${Date.now()}`;

    // Request 1
    await request(app)
      .post('/api/wallet/top-up')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ amount: 5000 });

    // Request 2 with SAME key but DIFFERENT payload (amount: 10000)
    const res2 = await request(app)
      .post('/api/wallet/top-up')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({ amount: 10000 });

    expect(res2.status).toBe(409);
    expect(res2.body.errorCode).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('two SIMULTANEOUS requests with SAME Idempotency-Key (Promise.all) credit the wallet ONLY ONCE', async () => {
    const { token, userId } = await createTestUser(0);
    const key = `simultaneous-topup-${Date.now()}`;
    const payload = { amount: 5000 };

    // Fire 2 requests at the exact same millisecond via Promise.all
    const [req1, req2] = await Promise.all([
      request(app)
        .post('/api/wallet/top-up')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send(payload),
      request(app)
        .post('/api/wallet/top-up')
        .set('Authorization', `Bearer ${token}`)
        .set('Idempotency-Key', key)
        .send(payload),
    ]);

    // One succeeds (200), the other either receives the cached result (200) or 409 collision
    const statuses = [req1.status, req2.status];
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);

    // CRITICAL HARD INVARIANT CHECK: Wallet balance MUST be 5000, NOT 10000!
    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(5000);

    // Ledger MUST contain exactly 1 transaction
    const ledger = await WalletTransaction.find({ userId });
    expect(ledger).toHaveLength(1);
  });
});

// ─── GET /api/wallet/transactions ───────────────────────────────────────────

describe('GET /api/wallet/transactions', () => {
  it('returns paginated ledger transaction history', async () => {
    const { token, userId } = await createTestUser(0);

    // Perform two top-ups
    await request(app)
      .post('/api/wallet/top-up')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `t1-${Date.now()}`)
      .send({ amount: 5000 });

    await request(app)
      .post('/api/wallet/top-up')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', `t2-${Date.now()}`)
      .send({ amount: 3000 });

    const res = await request(app)
      .get('/api/wallet/transactions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.transactions).toHaveLength(2);
    // Newest first
    expect(res.body.data.transactions[0].amount).toBe(3000);
    expect(res.body.data.transactions[0].balanceBefore).toBe(5000);
    expect(res.body.data.transactions[0].balanceAfter).toBe(8000);
  });
});

// ─── CRITICAL RACE CONDITION & CONCURRENCY TEST ─────────────────────────────

describe('Wallet Concurrency Hardening (Atomic Debit Primitive)', () => {
  it('10 simultaneous wallet debits against an insufficient combined balance -> no negative balance, only valid ones succeed', async () => {
    // User starts with balance of 50,000 paise (Rs 500)
    const initialBalance = 50000;
    const { userId } = await createTestUser(initialBalance);

    // 10 concurrent debits of 10,000 paise each (total attempted = 100,000 paise)
    const debitAmount = 10000;
    const concurrentRequests = 10;

    // Launch all 10 debit operations simultaneously using Promise.allSettled
    const promises = Array.from({ length: concurrentRequests }, (_, i) =>
      debitWallet(
        userId,
        debitAmount,
        WalletReferenceType.BOOKING,
        null,
        `conc-debit-${i}-${Date.now()}`
      )
    );

    const results = await Promise.allSettled(promises);

    // Count fulfilled vs rejected
    const succeeded = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    // Expected: Exactly 5 succeed (5 * 10,000 = 50,000), exactly 5 fail
    expect(succeeded).toHaveLength(5);
    expect(failed).toHaveLength(5);

    // Verify all failed ones threw INSUFFICIENT_BALANCE error code
    for (const f of failed) {
      if (f.status === 'rejected') {
        expect(f.reason.errorCode).toBe('INSUFFICIENT_BALANCE');
      }
    }

    // ABSOLUTE HARD CORRECTNESS INVARIANT CHECK:
    // Final wallet balance MUST BE EXACTLY 0 — NEVER NEGATIVE!
    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(0);

    // Verify ledger count: exactly 5 DEBIT entries recorded
    const ledger = await WalletTransaction.find({ userId });
    expect(ledger).toHaveLength(5);
    for (const tx of ledger) {
      expect(tx.type).toBe(WalletTransactionType.DEBIT);
      expect(tx.amount).toBe(debitAmount);
    }
  });
});
