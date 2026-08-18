import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { config } from '../config/env';
import { User } from '../models/User';
import { UserRole } from '../constants/enums';
import { authenticate, authorizeAdmin } from '../middleware/auth';
import { Router, Request, Response, NextFunction } from 'express';

// ─── helpers ─────────────────────────────────────────────────────────────────

const VALID_USER = {
  name: 'Test User',
  email: 'testuser@example.com',
  password: 'Password1',
};

const ADMIN_USER = {
  name: 'Admin',
  email: 'admin@example.com',
  password: 'AdminPass1',
};

async function registerAndLogin(data: typeof VALID_USER) {
  const res = await request(app).post('/api/auth/signup').send(data);
  return res.body.data as { token: string };
}

async function seedAdmin() {
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash(ADMIN_USER.password, 12);
  await User.create({
    name: ADMIN_USER.name,
    email: ADMIN_USER.email,
    passwordHash: hash,
    role: UserRole.ADMIN,
    walletBalance: 0,
  });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: ADMIN_USER.email, password: ADMIN_USER.password });
  return res.body.data as { token: string };
}

// ─── Signup ──────────────────────────────────────────────────────────────────

describe('POST /api/auth/signup', () => {
  it('creates a user and returns a token', async () => {
    const res = await request(app).post('/api/auth/signup').send(VALID_USER);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(VALID_USER.email);
    expect(res.body.data.user.role).toBe(UserRole.USER);
    expect(res.body.data.user.walletBalance).toBe(0);
  });

  it('never returns passwordHash in response', async () => {
    const res = await request(app).post('/api/auth/signup').send(VALID_USER);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('always assigns role=USER regardless of payload', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ ...VALID_USER, email: 'roletest@example.com', role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe(UserRole.USER);
  });

  it('rejects duplicate email with 409', async () => {
    await request(app).post('/api/auth/signup').send(VALID_USER);
    const res = await request(app).post('/api/auth/signup').send(VALID_USER);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects missing name with 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'a@b.com', password: 'Password1' });
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('INVALID_REQUEST');
  });

  it('rejects invalid email with 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'A', email: 'not-an-email', password: 'Password1' });
    expect(res.status).toBe(400);
  });

  it('rejects weak password (no uppercase) with 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'A', email: 'a@b.com', password: 'password1' });
    expect(res.status).toBe(400);
  });

  it('rejects weak password (no digit) with 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'A', email: 'a@b.com', password: 'Passworddd' });
    expect(res.status).toBe(400);
  });

  it('rejects password shorter than 8 chars with 400', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'A', email: 'a@b.com', password: 'P1' });
    expect(res.status).toBe(400);
  });
});

// ─── Login ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('returns a token on valid credentials', async () => {
    await request(app).post('/api/auth/signup').send(VALID_USER);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email, password: VALID_USER.password });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(VALID_USER.email);
  });

  it('never returns passwordHash in login response', async () => {
    await request(app).post('/api/auth/signup').send(VALID_USER);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email, password: VALID_USER.password });
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects wrong password with 401 (generic message)', async () => {
    await request(app).post('/api/auth/signup').send(VALID_USER);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email, password: 'WrongPass1' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    // Generic message — no hint about which field is wrong
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  it('rejects unknown email with 401 (same generic message)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@nowhere.com', password: 'Password1' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  it('rejects missing password with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: VALID_USER.email });
    expect(res.status).toBe(400);
  });
});

// ─── GET /me ─────────────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns current user with valid token', async () => {
    const { token } = await registerAndLogin(VALID_USER);
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(VALID_USER.email);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('UNAUTHORIZED');
  });

  it('returns 401 with malformed Bearer token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('UNAUTHORIZED');
  });

  it('returns 401 with expired token', async () => {
    // Sign a token that expired 1 second ago
    const expiredToken = jwt.sign(
      { userId: 'someid', role: UserRole.USER },
      config.jwt.secret,
      { expiresIn: -1 }
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('returns 401 with token signed by wrong secret', async () => {
    const badToken = jwt.sign(
      { userId: 'someid', role: UserRole.USER },
      'wrong-secret'
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('UNAUTHORIZED');
  });

  it('returns 401 with Bearer but empty token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
  });
});

// ─── Admin authorization ──────────────────────────────────────────────────────

describe('Admin authorization middleware', () => {
  // Mount a temporary test-only admin route on the app for this suite
  // We test via middleware unit tests rather than wiring a real admin route
  // (admin routes are added in Phase 4+)

  it('authenticate + authorizeAdmin rejects a USER role with 403', async () => {
    // Register a normal user and get token
    const { token } = await registerAndLogin({
      name: 'Normal',
      email: 'normal@example.com',
      password: 'Password1',
    });

    // Build a minimal express app with the guards on a test route
    const testApp = (await import('express')).default();
    testApp.use((await import('express')).json());
    testApp.get(
      '/test-admin',
      authenticate,
      authorizeAdmin,
      (_req: Request, res: Response) => res.json({ ok: true })
    );
    testApp.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const e = err as { statusCode?: number; errorCode?: string; message?: string };
      res.status(e.statusCode ?? 500).json({
        success: false,
        errorCode: e.errorCode ?? 'INTERNAL_ERROR',
        message: e.message ?? 'Error',
      });
    });

    const res = await request(testApp)
      .get('/test-admin')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('FORBIDDEN');
  });

  it('authenticate + authorizeAdmin passes for ADMIN role', async () => {
    const { token } = await seedAdmin();

    const testApp = (await import('express')).default();
    testApp.use((await import('express')).json());
    testApp.get(
      '/test-admin',
      authenticate,
      authorizeAdmin,
      (_req: Request, res: Response) => res.json({ ok: true })
    );
    testApp.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const e = err as { statusCode?: number; errorCode?: string; message?: string };
      res.status(e.statusCode ?? 500).json({
        success: false,
        errorCode: e.errorCode ?? 'INTERNAL_ERROR',
        message: e.message ?? 'Error',
      });
    });

    const res = await request(testApp)
      .get('/test-admin')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('authorizeAdmin with no token returns 401', async () => {
    const testApp = (await import('express')).default();
    testApp.get(
      '/test-admin',
      authenticate,
      authorizeAdmin,
      (_req: Request, res: Response) => res.json({ ok: true })
    );
    testApp.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const e = err as { statusCode?: number; errorCode?: string; message?: string };
      res.status(e.statusCode ?? 500).json({
        success: false,
        errorCode: e.errorCode ?? 'INTERNAL_ERROR',
        message: e.message ?? 'Error',
      });
    });

    const res = await request(testApp).get('/test-admin');
    expect(res.status).toBe(401);
  });
});
