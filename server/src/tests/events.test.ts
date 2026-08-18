import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../app';
import { User } from '../models/User';
import { Event } from '../models/Event';
import { Seat } from '../models/Seat';
import { UserRole, EventStatus, SeatStatus } from '../constants/enums';

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

async function getUserToken(): Promise<string> {
  const res = await request(app)
    .post('/api/auth/signup')
    .send({ name: 'User', email: 'user@test.com', password: 'Password1' });
  return res.body.data.token as string;
}

const BASE_EVENT = {
  title: 'Test Concert',
  description: 'A great show',
  venue: 'Mumbai Arena',
  eventDate: '2027-01-01',
  eventTime: '19:00',
  totalSeats: 50,
  price: 50000,
};

async function createDraftEvent(adminToken: string) {
  const res = await request(app)
    .post('/api/admin/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(BASE_EVENT);
  return res.body.data.event as { _id: string };
}

async function addSeatsAndPublish(adminToken: string, eventId: string, count = 5) {
  const seats = Array.from({ length: count }, (_, i) => ({ seatNumber: `A${i + 1}` }));
  await request(app)
    .post(`/api/admin/events/${eventId}/seats/bulk`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ seats });
  await request(app)
    .post(`/api/admin/events/${eventId}/publish`)
    .set('Authorization', `Bearer ${adminToken}`);
}

// ─── Admin event CRUD ─────────────────────────────────────────────────────────

describe('Admin Events CRUD', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
  });

  it('POST /api/admin/events — creates a DRAFT event', async () => {
    const res = await request(app)
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(BASE_EVENT);
    expect(res.status).toBe(201);
    expect(res.body.data.event.status).toBe(EventStatus.DRAFT);
    expect(res.body.data.event.price).toBe(50000);
  });

  it('POST /api/admin/events — rejects missing title', async () => {
    const { title: _t, ...noTitle } = BASE_EVENT;
    const res = await request(app)
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(noTitle);
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/events — rejects float price', async () => {
    const res = await request(app)
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...BASE_EVENT, price: 100.5 });
    expect(res.status).toBe(400);
  });

  it('POST /api/admin/events — rejects status in body', async () => {
    const res = await request(app)
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...BASE_EVENT });
    // status comes from service, not body
    expect(res.body.data.event.status).toBe(EventStatus.DRAFT);
  });

  it('GET /api/admin/events — returns all statuses', async () => {
    const event = await createDraftEvent(adminToken);
    await addSeatsAndPublish(adminToken, event._id);

    const res = await request(app)
      .get('/api/admin/events')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/admin/events/:id — returns DRAFT event', async () => {
    const created = await createDraftEvent(adminToken);
    const res = await request(app)
      .get(`/api/admin/events/${created._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.event.status).toBe(EventStatus.DRAFT);
  });

  it('PATCH /api/admin/events/:id — updates DRAFT event', async () => {
    const created = await createDraftEvent(adminToken);
    const res = await request(app)
      .patch(`/api/admin/events/${created._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.event.title).toBe('Updated Title');
  });

  it('PATCH /api/admin/events/:id — rejects status field (strict schema)', async () => {
    const created = await createDraftEvent(adminToken);
    const res = await request(app)
      .patch(`/api/admin/events/${created._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PUBLISHED' });
    expect(res.status).toBe(400);
  });

  it('PATCH /api/admin/events/:id — cannot edit PUBLISHED event', async () => {
    const created = await createDraftEvent(adminToken);
    await addSeatsAndPublish(adminToken, created._id);
    const res = await request(app)
      .patch(`/api/admin/events/${created._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'New Title' });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('INVALID_STATE_TRANSITION');
  });

  it('DELETE /api/admin/events/:id — deletes DRAFT event and its seats', async () => {
    const created = await createDraftEvent(adminToken);
    // Add some seats first
    await request(app)
      .post(`/api/admin/events/${created._id}/seats/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seats: [{ seatNumber: 'A1' }] });

    const res = await request(app)
      .delete(`/api/admin/events/${created._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // Verify event and seats deleted
    const event = await Event.findById(created._id);
    const seats = await Seat.find({ eventId: created._id });
    expect(event).toBeNull();
    expect(seats).toHaveLength(0);
  });

  it('DELETE /api/admin/events/:id — cannot delete PUBLISHED event', async () => {
    const created = await createDraftEvent(adminToken);
    await addSeatsAndPublish(adminToken, created._id);
    const res = await request(app)
      .delete(`/api/admin/events/${created._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('INVALID_STATE_TRANSITION');
  });
});

// ─── Publish / Cancel ─────────────────────────────────────────────────────────

describe('Admin Event Status Transitions', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
  });

  it('publish: DRAFT → PUBLISHED when seats exist', async () => {
    const created = await createDraftEvent(adminToken);
    await request(app)
      .post(`/api/admin/events/${created._id}/seats/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seats: [{ seatNumber: 'A1' }] });

    const res = await request(app)
      .post(`/api/admin/events/${created._id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.event.status).toBe(EventStatus.PUBLISHED);
  });

  it('publish: fails when event has no seats (422)', async () => {
    const created = await createDraftEvent(adminToken);
    const res = await request(app)
      .post(`/api/admin/events/${created._id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });

  it('publish: PUBLISHED event cannot be re-published (409)', async () => {
    const created = await createDraftEvent(adminToken);
    await addSeatsAndPublish(adminToken, created._id);
    const res = await request(app)
      .post(`/api/admin/events/${created._id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('INVALID_STATE_TRANSITION');
  });

  it('cancel: DRAFT → CANCELLED', async () => {
    const created = await createDraftEvent(adminToken);
    const res = await request(app)
      .post(`/api/admin/events/${created._id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.event.status).toBe(EventStatus.CANCELLED);
  });

  it('cancel: PUBLISHED → CANCELLED', async () => {
    const created = await createDraftEvent(adminToken);
    await addSeatsAndPublish(adminToken, created._id);
    const res = await request(app)
      .post(`/api/admin/events/${created._id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.event.status).toBe(EventStatus.CANCELLED);
  });

  it('cancel: CANCELLED event cannot be re-cancelled (409)', async () => {
    const created = await createDraftEvent(adminToken);
    await request(app)
      .post(`/api/admin/events/${created._id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);
    const res = await request(app)
      .post(`/api/admin/events/${created._id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
  });
});

// ─── Bulk seat creation ───────────────────────────────────────────────────────

describe('Admin Bulk Seat Creation', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
  });

  it('creates seats with event price as default', async () => {
    const created = await createDraftEvent(adminToken);
    const res = await request(app)
      .post(`/api/admin/events/${created._id}/seats/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seats: [{ seatNumber: 'A1' }, { seatNumber: 'A2' }] });
    expect(res.status).toBe(201);
    expect(res.body.data.count).toBe(2);
    expect(res.body.data.seats[0].price).toBe(50000); // event price
    expect(res.body.data.seats[0].status).toBe(SeatStatus.AVAILABLE);
  });

  it('allows seat-level price override', async () => {
    const created = await createDraftEvent(adminToken);
    const res = await request(app)
      .post(`/api/admin/events/${created._id}/seats/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seats: [{ seatNumber: 'VIP1', price: 100000 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.seats[0].price).toBe(100000);
  });

  it('rejects duplicate seat numbers in request', async () => {
    const created = await createDraftEvent(adminToken);
    const res = await request(app)
      .post(`/api/admin/events/${created._id}/seats/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seats: [{ seatNumber: 'A1' }, { seatNumber: 'A1' }] });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate seat numbers already in DB (409)', async () => {
    const created = await createDraftEvent(adminToken);
    await request(app)
      .post(`/api/admin/events/${created._id}/seats/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seats: [{ seatNumber: 'A1' }] });
    const res = await request(app)
      .post(`/api/admin/events/${created._id}/seats/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seats: [{ seatNumber: 'A1' }] });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe('SEAT_UNAVAILABLE');
  });

  it('rejects empty seats array', async () => {
    const created = await createDraftEvent(adminToken);
    const res = await request(app)
      .post(`/api/admin/events/${created._id}/seats/bulk`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ seats: [] });
    expect(res.status).toBe(400);
  });
});

// ─── Public event endpoints ───────────────────────────────────────────────────

describe('Public Event Endpoints', () => {
  let adminToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
  });

  it('GET /api/events — returns only PUBLISHED events', async () => {
    // Create two events: one published, one draft
    const draft = await createDraftEvent(adminToken);
    const published = await createDraftEvent(adminToken);
    await addSeatsAndPublish(adminToken, published._id);

    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    const ids = res.body.data.events.map((e: { _id: string }) => e._id);
    expect(ids).toContain(published._id);
    expect(ids).not.toContain(draft._id);
  });

  it('GET /api/events/:eventId — returns 404 for DRAFT event', async () => {
    const draft = await createDraftEvent(adminToken);
    const res = await request(app).get(`/api/events/${draft._id}`);
    expect(res.status).toBe(404);
    expect(res.body.errorCode).toBe('EVENT_NOT_FOUND');
  });

  it('GET /api/events/:eventId — returns PUBLISHED event', async () => {
    const created = await createDraftEvent(adminToken);
    await addSeatsAndPublish(adminToken, created._id);
    const res = await request(app).get(`/api/events/${created._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.event.status).toBe(EventStatus.PUBLISHED);
  });

  it('GET /api/events/:eventId/seats — returns seats for PUBLISHED event', async () => {
    const created = await createDraftEvent(adminToken);
    await addSeatsAndPublish(adminToken, created._id, 3);
    const res = await request(app).get(`/api/events/${created._id}/seats`);
    expect(res.status).toBe(200);
    expect(res.body.data.seats).toHaveLength(3);
    expect(res.body.data.seats[0].status).toBe(SeatStatus.AVAILABLE);
  });

  it('GET /api/events/:eventId/seats — 404 for DRAFT event', async () => {
    const draft = await createDraftEvent(adminToken);
    const res = await request(app).get(`/api/events/${draft._id}/seats`);
    expect(res.status).toBe(404);
  });
});

// ─── Authorization guards ─────────────────────────────────────────────────────

describe('Admin authorization on event endpoints', () => {
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    adminToken = await getAdminToken();
    userToken = await getUserToken();
  });

  it('normal user cannot POST /api/admin/events (403)', async () => {
    const res = await request(app)
      .post('/api/admin/events')
      .set('Authorization', `Bearer ${userToken}`)
      .send(BASE_EVENT);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });

  it('unauthenticated request to /api/admin/events returns 401', async () => {
    const res = await request(app).post('/api/admin/events').send(BASE_EVENT);
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('UNAUTHORIZED');
  });

  it('normal user cannot bulk create seats (403)', async () => {
    const created = await createDraftEvent(adminToken);
    const res = await request(app)
      .post(`/api/admin/events/${created._id}/seats/bulk`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ seats: [{ seatNumber: 'A1' }] });
    expect(res.status).toBe(403);
  });
});
