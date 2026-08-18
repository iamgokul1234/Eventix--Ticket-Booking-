import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../app';
import { User } from '../models/User';
import { Seat } from '../models/Seat';
import { Reservation } from '../models/Reservation';
import { UserRole, SeatStatus, ReservationStatus } from '../constants/enums';

async function getAdminToken(): Promise<string> {
  const hash = await bcrypt.hash('Admin@123456', 12);
  await User.create({
    name: 'Admin',
    email: 'admin@concurrency.com',
    passwordHash: hash,
    role: UserRole.ADMIN,
    walletBalance: 0,
  });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@concurrency.com', password: 'Admin@123456' });
  return res.body.data.token as string;
}

async function createUser(email: string): Promise<{ token: string; userId: string }> {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'Conc User', email, password: 'Password1' });
  return {
    token: res.body.data.token as string,
    userId: res.body.data.user._id as string,
  };
}

describe('Phase 7: Concurrency Hardening for Seat Reservation', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
  });

  it('CRITICAL CONCURRENCY INVARIANT: 10 simultaneous requests for the SAME seat -> EXACTLY 1 success (201), 9 conflict (409 SEAT_UNAVAILABLE)', async () => {
    // 1. Create a published event with 1 seat ("SEAT-100")
    const eventRes = await request(app)
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'High Demand Concert',
        description: 'Single Seat Hot Sale',
        venue: 'Stadium',
        eventDate: '2027-10-10',
        eventTime: '18:00',
        totalSeats: 10,
        price: 100000,
      });

    const eventId = eventRes.body.data.event._id as string;

    const seatsRes = await request(app)
      .post(`/api/admin/events/${eventId}/seats/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seats: [{ seatNumber: 'SEAT-100' }] });

    await request(app)
      .post(`/api/admin/events/${eventId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);

    const targetSeatId = seatsRes.body.data.seats[0]._id as string;

    // 2. Create 10 distinct users with distinct tokens
    const users = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createUser(`concurrent-user-${i}-${Date.now()}@test.com`))
    );

    // 3. Fire 10 simultaneous reservation requests for the EXACT SAME seat using Promise.allSettled
    const timestamp = Date.now();
    const reservationPromises = users.map((u, i) =>
      request(app)
        .post(`/api/events/${eventId}/reservations`)
        .set('Authorization', `Bearer ${u.token}`)
        .set('Idempotency-Key', `conc-seat-req-${i}-${timestamp}`)
        .send({ seatIds: [targetSeatId] })
    );

    const responses = await Promise.all(reservationPromises);

    // 4. Analyze HTTP Status Codes
    const successes = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    // EXACTLY ONE SUCCESS, EXACTLY 9 CONFLICTS
    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(9);

    // Verify all 9 conflict responses have errorCode 'SEAT_UNAVAILABLE'
    for (const c of conflicts) {
      expect(c.body.success).toBe(false);
      expect(c.body.errorCode).toBe('SEAT_UNAVAILABLE');
    }

    // 5. HARD DB INVARIANT CHECK:
    // The target seat in DB MUST be RESERVED by the 1 winning reservation!
    const winningReservationId = successes[0].body.data.reservation._id as string;
    const dbSeat = await Seat.findById(targetSeatId);

    expect(dbSeat?.status).toBe(SeatStatus.RESERVED);
    expect(dbSeat?.reservationId.toString()).toBe(winningReservationId);

    // Exactly 1 ACTIVE reservation document exists in DB for this event
    const activeReservations = await Reservation.find({ eventId, status: ReservationStatus.ACTIVE });
    expect(activeReservations).toHaveLength(1);
    expect(activeReservations[0]._id.toString()).toBe(winningReservationId);
  });
});
