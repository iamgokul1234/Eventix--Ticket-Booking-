import { describe, it, expect, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Event } from '../models/Event';
import { Seat } from '../models/Seat';
import { Reservation } from '../models/Reservation';
import { Booking } from '../models/Booking';
import { WalletTransaction } from '../models/WalletTransaction';
import { IdempotencyRecord } from '../models/IdempotencyRecord';
import {
  EventStatus,
  SeatStatus,
  ReservationStatus,
  BookingStatus,
  WalletTransactionType,
  WalletReferenceType,
  WalletTransactionStatus,
  IdempotencyStatus,
} from '../constants/enums';

beforeAll(async () => {
  // Ensure all Mongoose schema indexes are created in MongoDB before tests run
  await Promise.all([
    User.init(),
    Event.init(),
    Seat.init(),
    Reservation.init(),
    Booking.init(),
    WalletTransaction.init(),
    IdempotencyRecord.init(),
  ]);
});

// ─── helpers ────────────────────────────────────────────────────────────────

function makeOId() {
  return new mongoose.Types.ObjectId();
}

async function createUser(overrides: Partial<InstanceType<typeof User>> = {}) {
  return User.create({
    name: 'Test User',
    email: `user-${Date.now()}-${Math.random()}@test.com`,
    passwordHash: 'hashedpassword',
    role: 'USER',
    walletBalance: 0,
    ...overrides,
  });
}

// ─── User ────────────────────────────────────────────────────────────────────

describe('User model', () => {
  it('creates a valid user', async () => {
    const user = await createUser();
    expect(user._id).toBeDefined();
    expect(user.walletBalance).toBe(0);
    expect(user.role).toBe('USER');
  });

  it('enforces unique email index', async () => {
    const email = `dup-${Date.now()}@test.com`;
    await createUser({ email } as never);
    await expect(createUser({ email } as never)).rejects.toThrow(/duplicate key/i);
  });

  it('rejects non-integer walletBalance', async () => {
    await expect(
      createUser({ walletBalance: 100.5 } as never)
    ).rejects.toThrow(/integer/i);
  });

  it('rejects negative walletBalance', async () => {
    await expect(
      createUser({ walletBalance: -1 } as never)
    ).rejects.toThrow();
  });

  it('strips passwordHash from toJSON output', async () => {
    const user = await createUser();
    const json = user.toJSON();
    expect((json as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('passwordHash is not returned by default find', async () => {
    const user = await createUser();
    const found = await User.findById(user._id);
    expect(found).not.toBeNull();
    expect((found as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
  });

  it('passwordHash is returned when explicitly selected', async () => {
    const user = await createUser();
    const found = await User.findById(user._id).select('+passwordHash');
    expect(found?.passwordHash).toBe('hashedpassword');
  });
});

// ─── Event ───────────────────────────────────────────────────────────────────

describe('Event model', () => {
  it('creates a valid event', async () => {
    const event = await Event.create({
      title: 'Test Concert',
      description: 'A great show',
      venue: 'Mumbai Arena',
      eventDate: new Date('2026-12-01'),
      eventTime: '19:30',
      totalSeats: 100,
      price: 50000,
      status: EventStatus.PUBLISHED,
    });
    expect(event._id).toBeDefined();
    expect(event.price).toBe(50000);
    expect(event.status).toBe(EventStatus.PUBLISHED);
  });

  it('rejects float price', async () => {
    await expect(
      Event.create({
        title: 'T',
        description: 'D',
        venue: 'V',
        eventDate: new Date(),
        eventTime: '10:00',
        totalSeats: 10,
        price: 100.5,
      })
    ).rejects.toThrow(/integer/i);
  });

  it('rejects invalid eventTime format', async () => {
    await expect(
      Event.create({
        title: 'T',
        description: 'D',
        venue: 'V',
        eventDate: new Date(),
        eventTime: '25:00',
        totalSeats: 10,
        price: 100,
      })
    ).rejects.toThrow(/HH:MM/i);
  });

  it('defaults status to DRAFT', async () => {
    const event = await Event.create({
      title: 'T',
      description: 'D',
      venue: 'V',
      eventDate: new Date(),
      eventTime: '10:00',
      totalSeats: 10,
      price: 1000,
    });
    expect(event.status).toBe(EventStatus.DRAFT);
  });
});

// ─── Seat ────────────────────────────────────────────────────────────────────

describe('Seat model', () => {
  it('creates a valid seat', async () => {
    const eventId = makeOId();
    const seat = await Seat.create({
      eventId,
      seatNumber: 'A1',
      status: SeatStatus.AVAILABLE,
      price: 50000,
    });
    expect(seat._id).toBeDefined();
    expect(seat.status).toBe(SeatStatus.AVAILABLE);
    expect(seat.reservationId).toBeNull();
    expect(seat.bookingId).toBeNull();
  });

  it('enforces unique (eventId, seatNumber) index', async () => {
    const eventId = makeOId();
    await Seat.create({ eventId, seatNumber: 'B1', price: 1000 });
    await expect(
      Seat.create({ eventId, seatNumber: 'B1', price: 1000 })
    ).rejects.toThrow(/duplicate key/i);
  });

  it('allows same seatNumber on different events', async () => {
    const ev1 = makeOId();
    const ev2 = makeOId();
    await Seat.create({ eventId: ev1, seatNumber: 'C1', price: 1000 });
    const seat2 = await Seat.create({ eventId: ev2, seatNumber: 'C1', price: 1000 });
    expect(seat2._id).toBeDefined();
  });

  it('rejects float price', async () => {
    await expect(
      Seat.create({ eventId: makeOId(), seatNumber: 'D1', price: 100.99 })
    ).rejects.toThrow(/integer/i);
  });
});

// ─── Reservation ─────────────────────────────────────────────────────────────

describe('Reservation model', () => {
  it('creates a valid reservation with future expiresAt', async () => {
    const userId = makeOId();
    const eventId = makeOId();
    const seatId = makeOId();
    const res = await Reservation.create({ userId, eventId, seatIds: [seatId] });
    expect(res.status).toBe(ReservationStatus.ACTIVE);
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('expiresAt is ~5 minutes in the future', async () => {
    const res = await Reservation.create({
      userId: makeOId(),
      eventId: makeOId(),
      seatIds: [makeOId()],
    });
    const diffMs = res.expiresAt.getTime() - Date.now();
    // Allow ±10s tolerance
    expect(diffMs).toBeGreaterThan(4 * 60 * 1000 - 10000);
    expect(diffMs).toBeLessThan(6 * 60 * 1000);
  });

  it('rejects empty seatIds array', async () => {
    await expect(
      Reservation.create({ userId: makeOId(), eventId: makeOId(), seatIds: [] })
    ).rejects.toThrow(/At least one seat/i);
  });
});

// ─── Booking ─────────────────────────────────────────────────────────────────

describe('Booking model', () => {
  it('creates a valid booking', async () => {
    const booking = await Booking.create({
      bookingReference: `TKT-${Date.now()}`,
      userId: makeOId(),
      eventId: makeOId(),
      reservationId: makeOId(),
      seatIds: [makeOId()],
      amount: 50000,
      status: BookingStatus.CONFIRMED,
      walletTransactionId: makeOId(),
    });
    expect(booking._id).toBeDefined();
    expect(booking.refundTransactionId).toBeNull();
  });

  it('enforces unique bookingReference', async () => {
    const ref = `TKT-DUP-${Date.now()}`;
    const base = {
      bookingReference: ref,
      userId: makeOId(),
      eventId: makeOId(),
      reservationId: makeOId(),
      seatIds: [makeOId()],
      amount: 1000,
      walletTransactionId: makeOId(),
    };
    await Booking.create(base);
    await expect(Booking.create({ ...base, userId: makeOId() })).rejects.toThrow(/duplicate key/i);
  });

  it('rejects float amount', async () => {
    await expect(
      Booking.create({
        bookingReference: `TKT-FLOAT-${Date.now()}`,
        userId: makeOId(),
        eventId: makeOId(),
        reservationId: makeOId(),
        seatIds: [makeOId()],
        amount: 100.5,
        walletTransactionId: makeOId(),
      })
    ).rejects.toThrow(/integer/i);
  });
});

// ─── WalletTransaction ───────────────────────────────────────────────────────

describe('WalletTransaction model', () => {
  it('creates a valid transaction', async () => {
    const tx = await WalletTransaction.create({
      userId: makeOId(),
      type: WalletTransactionType.CREDIT,
      amount: 100000,
      balanceBefore: 0,
      balanceAfter: 100000,
      referenceType: WalletReferenceType.TOP_UP,
      status: WalletTransactionStatus.COMPLETED,
    });
    expect(tx._id).toBeDefined();
    expect(tx.balanceAfter).toBe(100000);
  });

  it('rejects float amount', async () => {
    await expect(
      WalletTransaction.create({
        userId: makeOId(),
        type: WalletTransactionType.CREDIT,
        amount: 100.5,
        balanceBefore: 0,
        balanceAfter: 100,
        referenceType: WalletReferenceType.TOP_UP,
      })
    ).rejects.toThrow(/integer/i);
  });

  it('rejects negative balanceAfter', async () => {
    await expect(
      WalletTransaction.create({
        userId: makeOId(),
        type: WalletTransactionType.DEBIT,
        amount: 1000,
        balanceBefore: 500,
        balanceAfter: -500,
        referenceType: WalletReferenceType.BOOKING,
      })
    ).rejects.toThrow();
  });

  it('throws on findOneAndUpdate (append-only enforcement)', async () => {
    await expect(
      WalletTransaction.findOneAndUpdate({}, { status: 'FAILED' }).exec()
    ).rejects.toThrow(/append-only/i);
  });

  it('throws on updateOne (append-only enforcement)', async () => {
    await expect(
      WalletTransaction.updateOne({}, { status: 'FAILED' }).exec()
    ).rejects.toThrow(/append-only/i);
  });
});

// ─── IdempotencyRecord ───────────────────────────────────────────────────────

describe('IdempotencyRecord model', () => {
  it('creates a valid record', async () => {
    const userId = makeOId();
    const rec = await IdempotencyRecord.create({
      userId,
      key: 'idem-key-1',
      endpoint: 'POST /api/bookings',
      requestHash: 'abc123',
      status: IdempotencyStatus.COMPLETED,
      storedResponse: { success: true, data: {} },
    });
    expect(rec._id).toBeDefined();
    expect(rec.status).toBe(IdempotencyStatus.COMPLETED);
  });

  it('enforces unique (userId, key) compound index', async () => {
    const userId = makeOId();
    const key = `idem-${Date.now()}`;
    await IdempotencyRecord.create({
      userId,
      key,
      endpoint: 'POST /api/bookings',
      requestHash: 'hash1',
    });
    await expect(
      IdempotencyRecord.create({
        userId,
        key,
        endpoint: 'POST /api/bookings',
        requestHash: 'hash2',
      })
    ).rejects.toThrow(/duplicate key/i);
  });

  it('allows same key for different users', async () => {
    const key = `shared-${Date.now()}`;
    const base = { key, endpoint: 'POST /api/wallet/top-up', requestHash: 'h' };
    await IdempotencyRecord.create({ userId: makeOId(), ...base });
    const rec2 = await IdempotencyRecord.create({ userId: makeOId(), ...base });
    expect(rec2._id).toBeDefined();
  });
});
