import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../app';
import { User } from '../models/User';
import { Reservation } from '../models/Reservation';
import { Seat } from '../models/Seat';
import { UserRole, SeatStatus, ReservationStatus } from '../constants/enums';
import { releaseExpiredReservations } from '../services/reservation.service';

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getAdminToken(): Promise<string> {
  const hash = await bcrypt.hash('Admin@123456', 12);
  await User.create({
    name: 'Admin',
    email: 'admin@test.com',
    passwordHash: hash,
    role: UserRole.ADMIN,
    walletBalance: 0,
  });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.com', password: 'Admin@123456' });
  return res.body.data.token as string;
}

async function getUserToken(email = 'user@test.com'): Promise<{ token: string; userId: string }> {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Test User', email, password: 'Password1' });
  return {
    token: res.body.data.token as string,
    userId: res.body.data.user._id as string,
  };
}

async function setupPublishedEventWithSeats(adminToken: string, seatCount = 4) {
  const eventRes = await request(app)
    .post('/api/admin/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      title: 'Concert',
      description: 'Live Show',
      venue: 'Arena',
      eventDate: '2027-05-01',
      eventTime: '20:00',
      totalSeats: 100,
      price: 25000, // 250 Rs
    });

  const eventId = eventRes.body.data.event._id as string;
  const seats = Array.from({ length: seatCount }, (_, i) => ({ seatNumber: `S${i + 1}` }));

  const seatsRes = await request(app)
    .post(`/api/admin/events/${eventId}/seats/bulk`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ seats });

  await request(app)
    .post(`/api/admin/events/${eventId}/publish`)
    .set('Authorization', `Bearer ${adminToken}`);

  const createdSeats = seatsRes.body.data.seats as { _id: string; seatNumber: string }[];
  return { eventId, seats: createdSeats };
}

// ─── POST /api/events/:eventId/reservations ──────────────────────────────────

describe('POST /api/events/:eventId/reservations', () => {
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
    const u = await getUserToken();
    userToken = u.token;
  });

  it('reserves seats successfully (status ACTIVE, expiresAt ~5m future, seats RESERVED)', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 2);
    const key = `res-key-${Date.now()}`;

    const res = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', key)
      .send({ seatIds: [seats[0]._id, seats[1]._id] });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.reservation.status).toBe(ReservationStatus.ACTIVE);
    expect(res.body.data.seats).toHaveLength(2);
    expect(res.body.data.totalAmount).toBe(50000); // 2 * 25000

    // Verify seats in DB are RESERVED
    const dbSeat0 = await Seat.findById(seats[0]._id);
    const dbSeat1 = await Seat.findById(seats[1]._id);
    expect(dbSeat0?.status).toBe(SeatStatus.RESERVED);
    expect(dbSeat1?.status).toBe(SeatStatus.RESERVED);
    expect(dbSeat0?.reservationId.toString()).toBe(res.body.data.reservation._id);
  });

  it('requires Idempotency-Key header (400 if missing)', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 1);

    const res = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ seatIds: [seats[0]._id] });

    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_REQUEST');
  });

  it('returns cached response on duplicate request with SAME key & payload', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 1);
    const key = `dup-key-${Date.now()}`;

    const res1 = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', key)
      .send({ seatIds: [seats[0]._id] });

    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', key)
      .send({ seatIds: [seats[0]._id] });

    expect(res2.status).toBe(201);
    expect(res2.body.data.reservation._id).toBe(res1.body.data.reservation._id);
  });

  it('returns 409 IDEMPOTENCY_KEY_REUSED when same key used with DIFFERENT payload', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 2);
    const key = `dup-key-${Date.now()}`;

    await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', key)
      .send({ seatIds: [seats[0]._id] });

    const res2 = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', key)
      .send({ seatIds: [seats[1]._id] });

    expect(res2.status).toBe(409);
    expect(res2.body.errorCode).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('returns 409 SEAT_UNAVAILABLE if seat is already RESERVED', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 1);

    // Reserve seat first
    await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `first-${Date.now()}`)
      .send({ seatIds: [seats[0]._id] });

    // Second user tries to reserve the same seat
    const user2 = await getUserToken('user2@test.com');
    const res2 = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${user2.token}`)
      .set('Idempotency-Key', `second-${Date.now()}`)
      .send({ seatIds: [seats[0]._id] });

    expect(res2.status).toBe(409);
    expect(res2.body.errorCode).toBe('SEAT_UNAVAILABLE');
  });

  it('all-or-nothing multi-seat locking: rolls back locked seats if any seat fails', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 2);

    // Reserve seat 1 first
    const user2 = await getUserToken('user2@test.com');
    await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${user2.token}`)
      .set('Idempotency-Key', `k1-${Date.now()}`)
      .send({ seatIds: [seats[1]._id] });

    // User 1 tries to reserve [seat 0, seat 1] — seat 1 is unavailable
    const res = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `k2-${Date.now()}`)
      .send({ seatIds: [seats[0]._id, seats[1]._id] });

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SEAT_UNAVAILABLE');

    // VERIFY ROLLBACK: seat 0 MUST STILL BE AVAILABLE!
    const dbSeat0 = await Seat.findById(seats[0]._id);
    expect(dbSeat0?.status).toBe(SeatStatus.AVAILABLE);
  });
});

// ─── GET /api/reservations/:reservationId ────────────────────────────────────

describe('GET /api/reservations/:reservationId', () => {
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
    const u = await getUserToken();
    userToken = u.token;
  });

  it('returns active reservation details for owner', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 1);
    const createRes = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `k-${Date.now()}`)
      .send({ seatIds: [seats[0]._id] });

    const resId = createRes.body.data.reservation._id;

    const res = await request(app)
      .get(`/api/reservations/${resId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.reservation.status).toBe(ReservationStatus.ACTIVE);
  });

  it('returns 403 FORBIDDEN if different user attempts lookup', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 1);
    const createRes = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `k-${Date.now()}`)
      .send({ seatIds: [seats[0]._id] });

    const resId = createRes.body.data.reservation._id;
    const user2 = await getUserToken('other@test.com');

    const res = await request(app)
      .get(`/api/reservations/${resId}`)
      .set('Authorization', `Bearer ${user2.token}`);

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });

  // ─── CRITICAL AUTHORITATIVE EXPIRY TEST ────────────────────────────────────

  it('AUTHORITATIVE SERVER EXPIRY: returns 409 RESERVATION_EXPIRED and releases seats when expiresAt is past', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 1);
    const createRes = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `k-${Date.now()}`)
      .send({ seatIds: [seats[0]._id] });

    const resId = createRes.body.data.reservation._id;

    // SIMULATE TIME PASSAGE: Set expiresAt in DB to 1 minute in the past
    await Reservation.findByIdAndUpdate(resId, {
      $set: { expiresAt: new Date(Date.now() - 60000) },
    });

    // Lookup reservation
    const res = await request(app)
      .get(`/api/reservations/${resId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('RESERVATION_EXPIRED');

    // VERIFY AUTO-CLEANUP: Reservation status EXPIRED in DB
    const dbRes = await Reservation.findById(resId);
    expect(dbRes?.status).toBe(ReservationStatus.EXPIRED);

    // VERIFY SEAT RELEASE: Seat status MUST be released back to AVAILABLE!
    const dbSeat = await Seat.findById(seats[0]._id);
    expect(dbSeat?.status).toBe(SeatStatus.AVAILABLE);
    expect(dbSeat?.reservationId).toBeNull();
  });
});

// ─── DELETE /api/reservations/:reservationId ─────────────────────────────────

describe('DELETE /api/reservations/:reservationId', () => {
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
    const u = await getUserToken();
    userToken = u.token;
  });

  it('manually cancels reservation and releases locked seats', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 1);
    const createRes = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `k-${Date.now()}`)
      .send({ seatIds: [seats[0]._id] });

    const resId = createRes.body.data.reservation._id;

    const res = await request(app)
      .delete(`/api/reservations/${resId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);

    // Verify DB reservation status CANCELLED
    const dbRes = await Reservation.findById(resId);
    expect(dbRes?.status).toBe(ReservationStatus.CANCELLED);

    // Verify seat released back to AVAILABLE
    const dbSeat = await Seat.findById(seats[0]._id);
    expect(dbSeat?.status).toBe(SeatStatus.AVAILABLE);
  });

  it('calling DELETE /api/reservations/:id twice in a row returns 409 INVALID_STATE_TRANSITION', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 1);
    const createRes = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `k-${Date.now()}`)
      .send({ seatIds: [seats[0]._id] });

    const resId = createRes.body.data.reservation._id;

    // 1st delete -> succeeds (200)
    const res1 = await request(app)
      .delete(`/api/reservations/${resId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res1.status).toBe(200);

    // 2nd delete -> fails with 409 INVALID_STATE_TRANSITION
    const res2 = await request(app)
      .delete(`/api/reservations/${resId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res2.status).toBe(409);
    expect(res2.body.errorCode).toBe('INVALID_STATE_TRANSITION');
  });
});

// ─── Background Cleanup Job ───────────────────────────────────────────────────

describe('Reservation Background Cleanup Job', () => {
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
    const u = await getUserToken();
    userToken = u.token;
  });

  it('releaseExpiredReservations releases active expired reservations & seats', async () => {
    const { eventId, seats } = await setupPublishedEventWithSeats(adminToken, 2);
    const createRes = await request(app)
      .post(`/api/events/${eventId}/reservations`)
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', `k-${Date.now()}`)
      .send({ seatIds: [seats[0]._id, seats[1]._id] });

    const resId = createRes.body.data.reservation._id;

    // Manually set expiresAt in past
    await Reservation.findByIdAndUpdate(resId, {
      $set: { expiresAt: new Date(Date.now() - 120000) },
    });

    // Trigger background release function
    const releasedCount = await releaseExpiredReservations();
    expect(releasedCount).toBeGreaterThanOrEqual(1);

    // Check DB status
    const dbRes = await Reservation.findById(resId);
    expect(dbRes?.status).toBe(ReservationStatus.EXPIRED);

    const dbSeat0 = await Seat.findById(seats[0]._id);
    const dbSeat1 = await Seat.findById(seats[1]._id);
    expect(dbSeat0?.status).toBe(SeatStatus.AVAILABLE);
    expect(dbSeat1?.status).toBe(SeatStatus.AVAILABLE);
  });
});
