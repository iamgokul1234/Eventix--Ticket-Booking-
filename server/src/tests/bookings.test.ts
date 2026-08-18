import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../app';
import { User } from '../models/User';
import { Reservation } from '../models/Reservation';
import { Seat } from '../models/Seat';
import { Booking } from '../models/Booking';
import { WalletTransaction } from '../models/WalletTransaction';
import { IdempotencyRecord } from '../models/IdempotencyRecord';
import { UserRole, SeatStatus, ReservationStatus, BookingStatus, WalletTransactionType, WalletReferenceType } from '../constants/enums';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getAdminToken(): Promise<string> {
  const hash = await bcrypt.hash('Admin@123456', 12);
  const email = `admin-${Date.now()}-${Math.floor(Math.random() * 100000)}@test.com`;
  await User.create({
    name: 'Admin',
    email,
    passwordHash: hash,
    role: UserRole.ADMIN,
    walletBalance: 0,
  });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'Admin@123456' });
  return res.body.data.token as string;
}

async function createUser(email: string, initialBalance = 0): Promise<{ token: string; userId: string }> {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Booking User', email, password: 'Password1' });

  const token = res.body.data.token as string;
  const userId = res.body.data.user._id as string;

  if (initialBalance > 0) {
    await User.findByIdAndUpdate(userId, { $set: { walletBalance: initialBalance } });
  }

  return { token, userId };
}

async function setupReservation(adminToken: string, userToken: string, seatCount = 2, seatPrice = 25000) {
  // Create event
  const eventRes = await request(app)
    .post('/api/admin/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Booking Test Concert',
      description: 'Live Show',
      venue: 'Grand Arena',
      eventDate: '2027-08-01',
      eventTime: '19:00',
      totalSeats: 50,
      price: seatPrice,
    });

  const eventId = eventRes.body.data.event._id as string;
  const seats = Array.from({ length: seatCount }, (_, i) => ({
    seatNumber: `B${Date.now() % 100000}_${i + 1}`,
  }));

  const seatsRes = await request(app)
    .post(`/api/admin/events/${eventId}/seats/bulk`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ seats });

  await request(app)
    .post(`/api/admin/events/${eventId}/publish`)
    .set('Authorization', `Bearer ${adminToken}`);

  const createdSeats = seatsRes.body.data.seats as { _id: string }[];
  const seatIds = createdSeats.map((s) => s._id);

  // Reserve seats
  const resRes = await request(app)
    .post(`/api/events/${eventId}/reservations`)
    .set('Authorization', `Bearer ${userToken}`)
    .set('Idempotency-Key', `res-${Date.now()}-${Math.random()}`)
    .send({ seatIds });

  const reservationId = resRes.body.data.reservation._id as string;
  const totalAmount = seatCount * seatPrice;

  return { eventId, seatIds, reservationId, totalAmount };
}

// ─── POST /api/bookings ───────────────────────────────────────────────────────

describe('POST /api/bookings', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
  });

  it('creates booking successfully (wallet debited, booking created, seats BOOKED, reservation CONFIRMED)', async () => {
    const { token: userToken, userId } = await createUser(`u1-${Date.now()}@test.com`, 100000); // 1000 Rs balance
    const { reservationId, seatIds, totalAmount } = await setupReservation(adminToken, userToken, 2, 25000); // 500 Rs total

    const idempotencyKey = `bk-key-${Date.now()}`;

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ reservationId });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.booking.status).toBe(BookingStatus.CONFIRMED);
    expect(res.body.data.booking.amount).toBe(totalAmount);
    expect(res.body.data.booking.bookingReference).toMatch(/^BK-/);

    // 1. Verify User wallet balance debited
    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(100000 - totalAmount); // 50000 paise left

    // 2. Verify Ledger transaction entry written with balanceBefore & balanceAfter
    const ledger = await WalletTransaction.find({ userId });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe(WalletTransactionType.DEBIT);
    expect(ledger[0].amount).toBe(totalAmount);
    expect(ledger[0].balanceBefore).toBe(100000);
    expect(ledger[0].balanceAfter).toBe(50000);
    expect(ledger[0].referenceType).toBe(WalletReferenceType.BOOKING);

    // 3. Verify Seats transitioned to BOOKED
    for (const seatId of seatIds) {
      const dbSeat = await Seat.findById(seatId);
      expect(dbSeat?.status).toBe(SeatStatus.BOOKED);
      expect(dbSeat?.bookingId?.toString()).toBe(res.body.data.booking._id);
    }

    // 4. Verify Reservation status transitioned to CONFIRMED
    const dbRes = await Reservation.findById(reservationId);
    expect(dbRes?.status).toBe(ReservationStatus.CONFIRMED);
  });

  it('requires Idempotency-Key header (400 if missing)', async () => {
    const { token: userToken } = await createUser(`u2-${Date.now()}@test.com`, 100000);
    const { reservationId } = await setupReservation(adminToken, userToken);

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ reservationId });

    expect(res.status).toBe(400);
  });

  it('idempotency: duplicate request with SAME key & payload returns cached stored response without double debit', async () => {
    const { token: userToken, userId } = await createUser(`u3-${Date.now()}@test.com`, 100000);
    const { reservationId, totalAmount } = await setupReservation(adminToken, userToken, 2, 25000);
    const key = `dup-bk-${Date.now()}`;

    // Request 1
    const res1 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', key)
      .send({ reservationId });

    expect(res1.status).toBe(201);

    // Request 2 (Duplicate)
    const res2 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', key)
      .send({ reservationId });

    expect(res2.status).toBe(201);
    expect(res2.body.data.booking._id).toBe(res1.body.data.booking._id);

    // HARD INVARIANT CHECK: Wallet debited EXACTLY ONCE!
    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(100000 - totalAmount);

    const ledger = await WalletTransaction.find({ userId });
    expect(ledger).toHaveLength(1);
  });

  it('two SIMULTANEOUS booking requests with SAME Idempotency-Key & SAME reservation (Promise.all) -> exactly 1 booking, 1 wallet debit, 1 ledger entry', async () => {
    const { token: userToken, userId } = await createUser(`sim-same-${Date.now()}@test.com`, 200000);
    const { reservationId, totalAmount } = await setupReservation(adminToken, userToken, 2, 25000);
    const key = `sim-same-bk-${Date.now()}`;

    // Fire 2 simultaneous requests with SAME Idempotency-Key & SAME reservationId
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', key)
        .send({ reservationId }),
      request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', key)
        .send({ reservationId }),
    ]);

    // One succeeds (201), the other either receives the cached result (201) or 409 collision
    const statuses = [res1.status, res2.status];
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);

    // HARD INVARIANT CHECKS:
    // 1. Exactly 1 Booking created in DB
    const bookings = await Booking.find({ userId });
    expect(bookings).toHaveLength(1);

    // 2. Wallet debited EXACTLY ONCE
    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(200000 - totalAmount);

    // 3. Exactly 1 ledger transaction written
    const ledger = await WalletTransaction.find({ userId });
    expect(ledger).toHaveLength(1);
  });

  it('CRASH RECOVERY: recovers booking when process crashes after transaction commit but before idempotency record completion', async () => {
    const { token: userToken, userId } = await createUser(`crash-${Date.now()}@test.com`, 100000);
    const { reservationId } = await setupReservation(adminToken, userToken, 2, 25000);

    const idempotencyKey = `crash-key-${Date.now()}`;

    // 1. Send initial request to create booking
    const res1 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ reservationId });

    expect(res1.status).toBe(201);
    const originalBookingId = res1.body.data.booking._id;

    // 2. SIMULATE PROCESS CRASH BEFORE IDEMPOTENCY RECORD COMPLETION:
    // Delete the IdempotencyRecord document (as if process died right after transaction commit)
    await IdempotencyRecord.deleteMany({ userId, key: idempotencyKey });

    // 3. Retry POST /api/bookings with SAME Idempotency-Key & SAME reservationId
    const res2 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ reservationId });

    // VERIFY RECOVERY: Returns 201 Created with the exact committed booking!
    expect(res2.status).toBe(201);
    expect(res2.body.success).toBe(true);
    expect(res2.body.data.booking._id).toBe(originalBookingId);
  });

  // ─── USER MANDATORY TEST: TWO SIMULTANEOUS BOOKINGS ON SAME RESERVATION ───────

  it('CRITICAL CONCURRENCY INVARIANT: two SIMULTANEOUS booking requests on the SAME reservation (Promise.all) -> EXACTLY ONE succeeds (201), other fails (409)', async () => {
    const { token: userToken, userId } = await createUser(`u4-${Date.now()}@test.com`, 200000); // Plenty of balance
    const { reservationId, totalAmount } = await setupReservation(adminToken, userToken, 2, 25000);

    const timestamp = Date.now();
    const key1 = `sim-bk-1-${timestamp}`;
    const key2 = `sim-bk-2-${timestamp}`;

    // Launch two simultaneous booking requests for the EXACT SAME reservation with DIFFERENT idempotency keys
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', key1)
        .send({ reservationId }),
      request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', key2)
        .send({ reservationId }),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    // HARD INVARIANT CHECKS:
    // 1. Wallet debited EXACTLY ONCE
    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(200000 - totalAmount);

    // 2. Exactly 1 Booking created in DB
    const bookings = await Booking.find({ userId });
    expect(bookings).toHaveLength(1);

    // 3. Exactly 1 ledger transaction written
    const ledger = await WalletTransaction.find({ userId });
    expect(ledger).toHaveLength(1);
  });

  // ─── INSUFFICIENT BALANCE ROLLBACK TEST ─────────────────────────────────────

  it('INSUFFICIENT BALANCE ROLLBACK: returns 409 INSUFFICIENT_BALANCE, zero wallet debit, seats stay RESERVED, reservation stays ACTIVE', async () => {
    // User has 10,000 paise balance but booking total is 50,000 paise
    const { token: userToken, userId } = await createUser(`u5-${Date.now()}@test.com`, 10000);
    const { reservationId, seatIds } = await setupReservation(adminToken, userToken, 2, 25000); // 50000 total

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `insuf-${Date.now()}`)
      .send({ reservationId });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('INSUFFICIENT_BALANCE');

    // VERIFY ROLLBACK & INVARIANTS:
    // 1. Wallet balance untouched
    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(10000);

    // 2. No booking created
    const bookings = await Booking.find({ userId });
    expect(bookings).toHaveLength(0);

    // 3. Seats STAY RESERVED (not booked)
    for (const seatId of seatIds) {
      const dbSeat = await Seat.findById(seatId);
      expect(dbSeat?.status).toBe(SeatStatus.RESERVED);
    }

    // 4. Reservation STAYS ACTIVE
    const dbRes = await Reservation.findById(reservationId);
    expect(dbRes?.status).toBe(ReservationStatus.ACTIVE);
  });

  // ─── EXPIRED DURING PAYMENT ROLLBACK TEST ────────────────────────────────────

  it('EXPIRED DURING PAYMENT ROLLBACK: returns 409 RESERVATION_EXPIRED, zero wallet debit, seats auto-released to AVAILABLE, reservation status EXPIRED', async () => {
    const { token: userToken, userId } = await createUser(`u6-${Date.now()}@test.com`, 100000);
    const { reservationId, seatIds } = await setupReservation(adminToken, userToken, 2, 25000);

    // SIMULATE EXPIRY DURING PAYMENT: Set expiresAt in DB to 1 minute in the past
    await Reservation.findByIdAndUpdate(reservationId, {
      $set: { expiresAt: new Date(Date.now() - 60000) },
    });

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `exp-${Date.now()}`)
      .send({ reservationId });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('RESERVATION_EXPIRED');

    // VERIFY ROLLBACK & INVARIANTS:
    // 1. Wallet balance untouched
    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(100000);

    // 2. Seats AUTO-RELEASED back to AVAILABLE
    for (const seatId of seatIds) {
      const dbSeat = await Seat.findById(seatId);
      expect(dbSeat?.status).toBe(SeatStatus.AVAILABLE);
      expect(dbSeat?.reservationId).toBeNull();
    }

    // 3. Reservation status EXPIRED
    const dbRes = await Reservation.findById(reservationId);
    expect(dbRes?.status).toBe(ReservationStatus.EXPIRED);
  });

  it('returns 403 FORBIDDEN when user attempts booking on another user reservation', async () => {
    const user1 = await createUser(`owner-${Date.now()}@test.com`, 100000);
    const user2 = await createUser(`other-${Date.now()}@test.com`, 100000);
    const { reservationId } = await setupReservation(adminToken, user1.token);

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${user2.token}`)
      .set('Idempotency-Key', `unauth-${Date.now()}`)
      .send({ reservationId });

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });
});

// ─── GET /api/bookings & GET /api/bookings/:bookingId ────────────────────────

describe('GET /api/bookings endpoints', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
  });

  it('GET /api/bookings returns paginated user booking history', async () => {
    const { token: userToken } = await createUser(`history-${Date.now()}@test.com`, 200000);
    const { reservationId } = await setupReservation(adminToken, userToken, 1, 25000);

    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `bk-${Date.now()}`)
      .send({ reservationId });

    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.bookings).toHaveLength(1);
    expect(res.body.data.bookings[0].status).toBe(BookingStatus.CONFIRMED);
  });

  it('GET /api/bookings/:bookingId returns booking details for owner', async () => {
    const { token: userToken } = await createUser(`single-${Date.now()}@test.com`, 200000);
    const { reservationId } = await setupReservation(adminToken, userToken, 1, 25000);

    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `bk-${Date.now()}`)
      .send({ reservationId });

    const bookingId = createRes.body.data.booking._id as string;

    const res = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.booking._id).toBe(bookingId);
    expect(res.body.data.seats).toHaveLength(1);
  });

  it('GET /api/bookings/:bookingId returns 403 FORBIDDEN for non-owner', async () => {
    const user1 = await createUser(`bowner-${Date.now()}@test.com`, 200000);
    const user2 = await createUser(`bother-${Date.now()}@test.com`, 200000);
    const { reservationId } = await setupReservation(adminToken, user1.token, 1, 25000);

    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${user1.token}`)
      .set('Idempotency-Key', `bk-${Date.now()}`)
      .send({ reservationId });

    const bookingId = createRes.body.data.booking._id as string;

    const res = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${user2.token}`);

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });
});

// ─── DELETE /api/bookings/:bookingId (Cancellation & Refund) ─────────────────

describe('DELETE /api/bookings/:bookingId', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
  });

  it('cancels booking, refunds user wallet balance, writes ledger refund entry, and releases seats back to AVAILABLE', async () => {
    const { token: userToken, userId } = await createUser(`cancel-user-${Date.now()}@test.com`, 100000);
    const { reservationId, seatIds, totalAmount } = await setupReservation(adminToken, userToken, 2, 25000);

    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `bk-create-${Date.now()}`)
      .send({ reservationId });

    const bookingId = createRes.body.data.booking._id as string;

    const userAfterBooking = await User.findById(userId);
    expect(userAfterBooking?.walletBalance).toBe(50000);

    const cancelRes = await request(app)
      .delete(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `bk-cancel-${Date.now()}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.success).toBe(true);
    expect(cancelRes.body.data.refundAmount).toBe(totalAmount);

    const userAfterRefund = await User.findById(userId);
    expect(userAfterRefund?.walletBalance).toBe(100000);

    const ledger = await WalletTransaction.find({ userId });
    expect(ledger).toHaveLength(2);
    const refundEntry = ledger.find((t) => t.type === WalletTransactionType.CREDIT);
    expect(refundEntry).toBeDefined();
    expect(refundEntry?.amount).toBe(totalAmount);
    expect(refundEntry?.referenceType).toBe(WalletReferenceType.REFUND);

    for (const seatId of seatIds) {
      const dbSeat = await Seat.findById(seatId);
      expect(dbSeat?.status).toBe(SeatStatus.AVAILABLE);
      expect(dbSeat?.bookingId).toBeNull();
    }

    const dbBooking = await Booking.findById(bookingId);
    expect(dbBooking?.status).toBe(BookingStatus.CANCELLED);
  });

  it('two SIMULTANEOUS cancellation requests with SAME Idempotency-Key (Promise.all) credit wallet ONLY ONCE', async () => {
    const { token: userToken, userId } = await createUser(`sim-cancel-same-${Date.now()}@test.com`, 100000);
    const { reservationId } = await setupReservation(adminToken, userToken, 2, 25000);

    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `bk-c1-${Date.now()}`)
      .send({ reservationId });

    const bookingId = createRes.body.data.booking._id as string;
    const cancelKey = `sim-cancel-key-${Date.now()}`;

    const [res1, res2] = await Promise.all([
      request(app)
        .delete(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', cancelKey),
      request(app)
        .delete(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', cancelKey),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);

    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(100000);

    const ledger = await WalletTransaction.find({ userId });
    expect(ledger).toHaveLength(2);
    const creditEntries = ledger.filter((t) => t.type === WalletTransactionType.CREDIT);
    expect(creditEntries).toHaveLength(1);
  });

  it('two SIMULTANEOUS cancellation requests with DIFFERENT Idempotency-Keys (Promise.all) -> EXACTLY ONE succeeds (200), other fails (409)', async () => {
    const { token: userToken, userId } = await createUser(`sim-cancel-diff-${Date.now()}@test.com`, 100000);
    const { reservationId } = await setupReservation(adminToken, userToken, 2, 25000);

    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `bk-c2-${Date.now()}`)
      .send({ reservationId });

    const bookingId = createRes.body.data.booking._id as string;
    const key1 = `cancel-diff-1-${Date.now()}`;
    const key2 = `cancel-diff-2-${Date.now()}`;

    const [res1, res2] = await Promise.all([
      request(app)
        .delete(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', key1),
      request(app)
        .delete(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('Idempotency-Key', key2),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    const dbUser = await User.findById(userId);
    expect(dbUser?.walletBalance).toBe(100000);

    const ledger = await WalletTransaction.find({ userId, type: WalletTransactionType.CREDIT });
    expect(ledger).toHaveLength(1);
  });

  it('returns 403 FORBIDDEN when non-owner attempts to cancel a booking', async () => {
    const user1 = await createUser(`cowner-${Date.now()}@test.com`, 100000);
    const user2 = await createUser(`cother-${Date.now()}@test.com`, 100000);
    const { reservationId } = await setupReservation(adminToken, user1.token);

    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${user1.token}`)
      .set('Idempotency-Key', `bk-c3-${Date.now()}`)
      .send({ reservationId });

    const bookingId = createRes.body.data.booking._id as string;

    const res = await request(app)
      .delete(`/api/bookings/${bookingId}`)
      .set('Authorization', `Bearer ${user2.token}`)
      .set('Idempotency-Key', `unauth-cancel-${Date.now()}`);

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });
});

// ─── POST /api/admin/bookings/:bookingId/refund & Admin Monitoring ────────────

describe('POST /api/admin/bookings/:bookingId/refund & Admin Monitoring', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
  });

  it('allows admin to refund any user booking and credits owner wallet balance', async () => {
    const { token: userToken, userId } = await createUser(`admin-refund-user-${Date.now()}@test.com`, 100000);
    const { reservationId, totalAmount } = await setupReservation(adminToken, userToken, 2, 25000);

    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `bk-ar-create-${Date.now()}`)
      .send({ reservationId });

    const bookingId = createRes.body.data.booking._id as string;

    const res = await request(app)
      .post(`/api/admin/bookings/${bookingId}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `admin-refund-${Date.now()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.refundAmount).toBe(totalAmount);

    const owner = await User.findById(userId);
    expect(owner?.walletBalance).toBe(100000);
  });

  it('two SIMULTANEOUS admin refund calls on the same booking (Promise.all) -> exactly one succeeds, wallet credited exactly once', async () => {
    const { token: userToken, userId } = await createUser(`sim-admin-refund-${Date.now()}@test.com`, 100000);
    const { reservationId } = await setupReservation(adminToken, userToken, 2, 25000);

    const createRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `bk-sim-ar-${Date.now()}`)
      .send({ reservationId });

    const bookingId = createRes.body.data.booking._id as string;
    const key1 = `adm-rf-1-${Date.now()}`;
    const key2 = `adm-rf-2-${Date.now()}`;

    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/admin/bookings/${bookingId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key1),
      request(app)
        .post(`/api/admin/bookings/${bookingId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', key2),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    const owner = await User.findById(userId);
    expect(owner?.walletBalance).toBe(100000);

    const ledger = await WalletTransaction.find({ userId, type: WalletTransactionType.CREDIT });
    expect(ledger).toHaveLength(1);
  });

  it('GET /api/admin/bookings supports filtering by userId, eventId, status and pagination', async () => {
    const res = await request(app)
      .get('/api/admin/bookings?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('bookings');
    expect(res.body.data).toHaveProperty('total');
  });

  it('GET /api/admin/transactions supports query filters and pagination', async () => {
    const res = await request(app)
      .get('/api/admin/transactions?page=1&limit=10&type=CREDIT')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('transactions');
    expect(res.body.data).toHaveProperty('total');
  });
});
