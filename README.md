# Ticket Booking System - Production Monorepo

Production-grade, correctness-first ticket booking and live seat reservation monorepo built with **Node.js, Express, TypeScript, MongoDB Atlas, React, and Tailwind CSS**.

This system guarantees **zero double-booking**, **zero double-spending**, **atomic multi-document ACID transactions**, **custom idempotency with process-crash recovery**, and **real-time append-only wallet ledger settlement**.

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Features](#2-features)
- [3. Tech Stack](#3-tech-stack)
- [4. Architecture](#4-architecture)
- [5. Database Schema](#5-database-schema)
- [6. Setup Instructions](#6-setup-instructions)
- [7. Environment Variables](#7-environment-variables)
- [8. Seed Instructions](#8-seed-instructions)
- [9. API Documentation](#9-api-documentation)
- [10. Postman Collection Reference](#10-postman-collection-reference)
- [11. Testing](#11-testing)
- [12. Concurrency Strategy](#12-concurrency-strategy)
- [13. Transaction Strategy](#13-transaction-strategy)
- [14. Idempotency Strategy & Crash Recovery](#14-idempotency-strategy--crash-recovery)
- [15. Reservation Expiry Strategy](#15-reservation-expiry-strategy)
- [16. Wallet Consistency Strategy](#16-wallet-consistency-strategy)
- [17. Refund Strategy](#17-refund-strategy)
- [18. Security Strategy](#18-security-strategy)
- [19. Key Assumptions & Explicit Trade-offs](#19-key-assumptions--explicit-trade-offs)
- [20. Production Deployment Strategy](#20-production-deployment-strategy)

---

## 1. Overview

The **Ticket Booking System** addresses the fundamental challenges of high-concurrency event ticketing:
1. **Seat Contention**: Hundreds of users attempting to reserve the exact same seat simultaneously.
2. **Financial Race Conditions**: Simultaneous requests spending the same wallet balance.
3. **Partial Failures**: Server crashes after MongoDB commits a transaction but before the client receives an HTTP response.
4. **Hold Expirations**: Held seats expiring after 5 minutes and returning to available inventory without ghost bookings.

Every mutating operation runs inside a single Mongoose session transaction backed by MongoDB Atlas multi-document ACID transaction guarantees.

---

## 2. Features

### User Capabilities
- **Event Discovery**: Search and filter events with live seat availability counters and price in Indian Rupees (`₹`).
- **Interactive Seat Map**: Real-time seat grid displaying `AVAILABLE` (emerald), `SELECTED` (violet), `RESERVED` (amber), and `BOOKED` (slate).
- **Atomic 5-Minute Seat Hold**: Holds seats for 5 minutes with a live countdown timer (`ReservationTimer`).
- **In-App Digital Wallet**: Instant wallet top-ups (₹500, ₹1,000, ₹2,000, ₹5,000 or custom) with append-only ledger transaction logging.
- **Instant Booking & Refunds**: Checkout seats directly from wallet balance and cancel confirmed bookings for instant wallet refunds.

### Admin Capabilities
- **System Monitoring**: Live metrics dashboard tracking total users, active events, total revenue in paise, active holds, and bookings.
- **Event Management**: Create events, bulk-generate seats (`S1`..`SN`), publish draft events, cancel events, and delete events.
- **User Bookings & Transaction Auditing**: Filter bookings and ledger transactions by user, event, status, type, reference, and date ranges.
- **Admin Refunds**: Issue administrative refunds for any booking (bypassing ownership checks while enforcing atomic status transitions `CONFIRMED -> REFUNDED` and wallet credits).

---

## 3. Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Monorepo Architecture** | npm workspaces (`server`, `client`) |
| **Backend Core** | Node.js (`v22.17.0`), Express.js, TypeScript |
| **Database & ORM** | MongoDB Atlas (Replica Set), Mongoose |
| **Validation & Security** | Zod, JSON Web Tokens (JWT), bcryptjs, Helmet, Express Rate Limit |
| **Testing** | Vitest, Supertest (128 passing tests across 8 test suites) |
| **Frontend Core** | React 18, Vite, TypeScript, React Router DOM v6 |
| **UI & Styling** | Tailwind CSS v3, Lucide Icons, Radix UI Primitives |
| **HTTP Client** | Axios with `VITE_API_BASE_URL` fallback & JWT/Idempotency interceptors |

---

## 4. Architecture

```text
                                  +-----------------------+
                                  |    React Client App   |
                                  | (Vite + Tailwind CSS) |
                                  +-----------+-----------+
                                              |
                                HTTP REST (JSON) + JWT + Idempotency-Key
                                              |
                                              v
                                  +-----------------------+
                                  |  Express REST API     |
                                  | (Auth, Rate Limiting) |
                                  +-----------+-----------+
                                              |
                                     Mongoose Transactions
                                              |
                                              v
                                  +-----------------------+
                                  |  MongoDB Atlas        |
                                  | (Replica Set ACID)    |
                                  +-----------------------+
```

---

## 5. Database Schema

### `User`
- `name` (String, required)
- `email` (String, required, unique index)
- `password` (String, required, bcrypt hash)
- `role` (Enum: `USER`, `ADMIN`, default `USER`)
- `walletBalance` (Number, integer paise, min 0, default 0)

### `Event`
- `title` (String, required)
- `description` (String, required)
- `venue` (String, required)
- `eventDate` (String, required)
- `eventTime` (String, required)
- `totalSeats` (Number, integer >= 1)
- `availableSeats` (Number, integer >= 0)
- `price` (Number, integer paise >= 0)
- `status` (Enum: `DRAFT`, `PUBLISHED`, `CANCELLED`, `COMPLETED`)

### `Seat`
- `eventId` (ObjectId, ref `Event`, indexed)
- `seatNumber` (String, required)
- `price` (Number, integer paise)
- `status` (Enum: `AVAILABLE`, `RESERVED`, `BOOKED`)
- `reservationId` (ObjectId, ref `Reservation`, default null)
- `bookingId` (ObjectId, ref `Booking`, default null)
- *Compound Index*: `{ eventId: 1, seatNumber: 1 }` (Unique)

### `Reservation`
- `userId` (ObjectId, ref `User`, indexed)
- `eventId` (ObjectId, ref `Event`, indexed)
- `seatIds` ([ObjectId], ref `Seat`)
- `status` (Enum: `ACTIVE`, `EXPIRED`, `CONFIRMED`, `CANCELLED`)
- `expiresAt` (Date, required, indexed)
- `totalAmount` (Number, integer paise)

### `Booking`
- `bookingReference` (String, unique index, e.g. `BK-8F3A2190`)
- `userId` (ObjectId, ref `User`, indexed)
- `eventId` (ObjectId, ref `Event`, indexed)
- `reservationId` (ObjectId, ref `Reservation`, indexed)
- `seatIds` ([ObjectId], ref `Seat`)
- `amount` (Number, integer paise)
- `status` (Enum: `CONFIRMED`, `CANCELLED`, `REFUNDED`)
- `walletTransactionId` (ObjectId, ref `WalletTransaction`)

### `WalletTransaction`
- `userId` (ObjectId, ref `User`, indexed)
- `type` (Enum: `CREDIT`, `DEBIT`)
- `amount` (Number, integer paise)
- `balanceBefore` (Number, integer paise)
- `balanceAfter` (Number, integer paise)
- `referenceType` (Enum: `TOP_UP`, `BOOKING`, `REFUND`, `ADMIN_ADJUSTMENT`)
- `referenceId` (ObjectId)
- `idempotencyKey` (String, indexed)
- `status` (Enum: `PENDING`, `COMPLETED`, `FAILED`)

### `IdempotencyRecord`
- `userId` (ObjectId, ref `User`)
- `idempotencyKey` (String, required)
- `endpoint` (String, required)
- `requestHash` (String, required)
- `status` (Enum: `PROCESSING`, `COMPLETED`, `FAILED`)
- `statusCode` (Number)
- `responseData` (Object)
- `expiresAt` (Date, TTL Index: 86400 seconds / 24 hours)
- *Compound Index*: `{ userId: 1, idempotencyKey: 1 }` (Unique)

---

## 6. Setup Instructions

### Prerequisites
- **Node.js**: `v22.17.0` or higher
- **npm**: `v10.0.0` or higher
- **MongoDB**: MongoDB Atlas Cluster or local MongoDB configured with a Replica Set (`mongod --replSet rs0`).

### Installation
1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd "Ticket Booking"
   ```
2. Install monorepo dependencies:
   ```bash
   npm install
   ```

### Running Locally
1. Start the Express backend server (port `5000`):
   ```bash
   npm run dev --workspace=server
   ```
2. Start the Vite React client app (port `5173`):
   ```bash
   npm run dev --workspace=client
   ```

---

## 7. Environment Variables

Copy `.env.example` to `.env` in the root directory:

```ini
# Server Environment Variables

# Server
NODE_ENV=development
PORT=5000

# MongoDB (MUST BE A REPLICA SET FOR TRANSACTIONS)
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/ticket_booking?retryWrites=true&w=majority
MONGODB_URI_TEST=mongodb://localhost:27017/ticket-booking-test

# JWT
JWT_SECRET=your_super_secret_jwt_key_here_change_in_production
JWT_EXPIRES_IN=7d

# Admin Seed Credentials
ADMIN_EMAIL=admin@ticketbooking.com
ADMIN_PASSWORD=Admin@123456
ADMIN_NAME=Super Admin

# CORS
CLIENT_URL=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

For the client (`client/.env` or Vercel environment variables):
```ini
VITE_API_BASE_URL=http://localhost:5000/api
```

---

## 8. Seed Instructions

Seed the entire database with sample events, seats, and demo accounts:

```bash
# Full database seed (events, seats, admin & demo users)
npm run seed --workspace=server

# Or seed ONLY the admin account
npm run seed:admin --workspace=server
```

> **Note**: Both seed scripts (`seed.ts` and `seedAdmin.ts`) perform direct database model inserts via Mongoose (`User.create` / `User.findOneAndUpdate` with bcrypt hashed passwords), ensuring admin role privileges are granted directly without exposing role creation through public signup endpoints.

### Demo Credentials
- **Admin Account**:
  - Email: `admin@ticketbooking.com`
  - Password: `Admin@123456`
  - Balance: ₹10,000 (1,000,000 paise)
- **User Accounts**:
  - Email: `alice@example.com` | Password: `Password123!` | Balance: ₹5,000 (500,000 paise)
  - Email: `bob@example.com` | Password: `Password123!` | Balance: ₹2,000 (200,000 paise)
  - Email: `charlie@example.com` | Password: `Password123!` | Balance: ₹2,000 (200,000 paise)

---

## 9. API Documentation

### Auth Routes (`/api/auth`)
- `POST /api/auth/signup`: Create a new user account.
- `POST /api/auth/login`: Authenticate user and receive JWT.
- `GET /api/auth/me`: Get current authenticated user profile & balance.

### Event & Seat Routes (`/api/events`)
- `GET /api/events`: List published events (supports pagination & status filter).
- `GET /api/events/:id`: Get event details by ID.
- `GET /api/events/:id/seats`: Get seat map and statuses for an event.
- `POST /api/events/:id/reservations`: Hold seats for 5 minutes (`Idempotency-Key` required).

### Booking Routes (`/api/bookings`)
- `POST /api/bookings`: Confirm booking from reservation & debit wallet (`Idempotency-Key` required).
- `GET /api/bookings`: List current user's booking history.
- `GET /api/bookings/:id`: Get booking details & assigned seat details.
- `DELETE /api/bookings/:id`: Cancel booking & receive instant wallet refund (`Idempotency-Key` required).

### Wallet Routes (`/api/wallet`)
- `GET /api/wallet/balance`: Get current wallet balance in integer paise.
- `POST /api/wallet/top-up`: Top up wallet balance (`Idempotency-Key` required).
- `GET /api/wallet/transactions`: Get user's append-only transaction history.

### Admin Routes (`/api/admin`) *(Requires Admin Role)*
- `GET /api/admin/metrics`: Get system performance & revenue metrics.
- `GET /api/admin/events`: Manage all draft & published events.
- `POST /api/admin/events`: Create a new event.
- `PATCH /api/admin/events/:id`: Update event details (restricted to `DRAFT` events).
- `POST /api/admin/events/:id/publish`: Publish event for public booking.
- `POST /api/admin/events/:id/seats/bulk`: Generate bulk seats (`S1`..`SN`).
- `POST /api/admin/bookings/:id/refund`: Admin refund for any booking (`Idempotency-Key` required).
- `GET /api/admin/bookings`: Query user bookings with filters and pagination.
- `GET /api/admin/transactions`: Audit wallet ledger transactions with query filters.

---

## 10. Postman Collection Reference

A production-ready Postman collection is located at [`postman_collection.json`](file:///e:/Projects/Ticket%20Booking/postman_collection.json).
It includes:
- Automated test scripts that save JWT tokens to collection variables.
- Auto-generation of unique `Idempotency-Key` headers (`{{$guid}}`).
- Built-in runner support for testing concurrent seat reservation conflict resolution.

---

## 11. Testing

The codebase includes **128 unit, integration, and concurrency tests** across 8 test suites:

```bash
# Run all server test suites
npm test --workspace=server
```

### Test Suite Breakdown
1. `bookings.test.ts` (20 tests): Seat reservation, booking checkout, idempotency, crash recovery, admin refunds.
2. `events.test.ts` (30 tests): Event creation, publishing, bulk seat generation, updating, deletion.
3. `reservations.test.ts` (12 tests): Seat hold creation, expiration enforcement, cleanup cron job.
4. `models.test.ts` (29 tests): Schema validation, integer paise rules, compound indexes.
5. `auth.test.ts` (23 tests): Registration, password hashing, JWT authorization, admin role guards.
6. `wallet.test.ts` (11 tests): Wallet top-up, atomic debits, balance constraints, ledger entries.
7. `concurrency.test.ts` (1 test): Promise.all simultaneous seat reservation stress test under load.
8. `health.test.ts` (2 tests): Server & database health check endpoints.

---

## 12. Concurrency Strategy

High-concurrency contention is handled using **optimistic locking and conditional MongoDB atomic operations**:

```typescript
// Atomic seat lock query requiring AVAILABLE status
const updatedSeat = await Seat.findOneAndUpdate(
  { _id: seatId, status: SeatStatus.AVAILABLE },
  { $set: { status: SeatStatus.RESERVED, reservationId } },
  { new: true, session }
);
```

If 10 concurrent requests target the same seat simultaneously:
- Exactly **1 request** satisfies `status: AVAILABLE` and transitions the seat.
- The remaining **9 requests** receive `null`, rolling back their transactions and returning HTTP `409 SEAT_UNAVAILABLE`.

---

## 13. Transaction Strategy

All multi-step operations execute within a Mongoose session transaction (`runInTransaction` wrapper):

```typescript
export async function runInTransaction<T>(
  fn: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}
```

If any step fails (e.g. insufficient wallet balance, expired reservation, database constraint error), MongoDB automatically rolls back all operations across all documents.

---

## 14. Idempotency Strategy & Crash Recovery

### Strategy
1. Client sends `Idempotency-Key` header with mutating requests (`POST /api/bookings`, `POST /api/wallet/top-up`, etc.).
2. Before processing, an `IdempotencyRecord` is created with status `PROCESSING`.
3. The unique compound index `{ userId: 1, idempotencyKey: 1 }` rejects duplicate concurrent requests with HTTP `409 CONCURRENT_REQUEST`.
4. Upon transaction success, `IdempotencyRecord` status updates to `COMPLETED` storing the response payload.
5. Subsequent retries with the same key immediately return the stored 200/201 response.

### Process Crash Window Recovery
If the server crashes *after* a MongoDB transaction commits but *before* `completeIdempotencyRecord` executes:
- A client retry encounters `INVALID_STATE_TRANSITION` (e.g., reservation already confirmed).
- The service catches `INVALID_STATE_TRANSITION`, queries `Booking.findOne({ reservationId, userId })`, detects the committed transaction, completes the idempotency record, and safely returns the HTTP 201 response.

---

## 15. Reservation Expiry Strategy

1. **Duration**: Seat holds expire 5 minutes after creation (`expiresAt = Date.now() + 5 * 60 * 1000`).
2. **Server-Side Enforcement**: Expiry checks evaluate `Date.now() >= reservation.expiresAt.getTime()`. Client clock values are strictly ignored.
3. **Background Cleanup**: A background cron job (`ReservationCleanupJob`) runs periodically to transition expired `ACTIVE` reservations to `EXPIRED` and release their held seats back to `AVAILABLE`.

---

## 16. Wallet Consistency Strategy

1. **Integer Paise Storage**: All balances and transaction amounts are stored as 64-bit integers representing paise (`₹1.00` = `100` paise) to prevent floating-point rounding errors.
2. **Atomic Conditional Debit**:
   ```typescript
   const updatedUser = await User.findOneAndUpdate(
     { _id: userId, walletBalance: { $gte: debitAmount } },
     { $inc: { walletBalance: -debitAmount } },
     { new: true, session }
   );
   ```
   If balance is insufficient, `updatedUser` is `null` and the transaction aborts with HTTP `409 INSUFFICIENT_BALANCE`.
3. **Append-Only Ledger**: Every balance mutation produces an immutable `WalletTransaction` record storing `balanceBefore` and `balanceAfter`.

---

## 17. Refund Strategy

1. **User Cancellation (`DELETE /api/bookings/:id`)**:
   - Requires user ownership (`booking.userId === authUser._id`).
   - Atomically updates booking status `CONFIRMED -> CANCELLED`.
   - Atomically credits booking amount back to user's wallet.
   - Appends a `CREDIT` ledger entry and releases seats back to `AVAILABLE`.
2. **Admin Refund (`POST /api/admin/bookings/:id/refund`)**:
   - Bypasses ownership check (authorized via `authorizeAdmin`).
   - Performs atomic status transition `CONFIRMED -> REFUNDED`.
   - Credits the booking owner's wallet balance and records an append-only ledger transaction.

---

## 18. Security Strategy

- **Authentication**: Stateless JSON Web Tokens (JWT) sent via `Authorization: Bearer <token>` header.
- **Role-Based Authorization**: `authorizeAdmin` middleware protects administrative routes.
- **Input Sanitization & Validation**: Strict schema parsing using Zod for all request bodies, query params, and route parameters.
- **HTTP Hardening**: Helmet middleware sets security headers; CORS restricted to trusted origin.
- **Rate Limiting**: `express-rate-limit` prevents brute-force login and spam attacks.

---

## 19. Key Assumptions & Explicit Trade-offs

1. **Database & Infrastructure**: Docker containerization was intentionally replaced with native MongoDB Atlas Replica Sets to guarantee production ACID multi-document transaction support.
2. **Idempotency Expiration**: `IdempotencyRecord` documents use a MongoDB TTL index set to 24 hours (`86400` seconds).
3. **Event Updates Scoping**: `PATCH /api/admin/events/:id` is restricted strictly to `DRAFT` events. Published events cannot have their seat structures mutated to prevent orphaned bookings.
4. **Separate Cancellation & Admin Refund Functions**: User cancellation requires strict user ownership (`cancelBooking`), whereas administrative refunds (`adminRefundBooking`) run via a dedicated administrative service method.
5. **Development Rate Limiting**: Rate limiting is set to 10,000 req/15min in development mode (`NODE_ENV === 'development'`) to accommodate React 18 Strict Mode double-rendering effect execution, component polling, and rapid manual click-testing across endpoints, while enforcing the strict production threshold (100 req/15min) whenever `NODE_ENV=production`.
6. **Server Process Restart Requirement**: Updates to environment variables (`.env`) or server entry-point job registrations in `src/index.ts` require restarting the long-running Node process (`npm run dev --workspace=server`) to take effect in active process memory.
7. **Admin User Filter Hard Cap**: The Bookings and Transactions tab user-filter dropdowns load at most 200 users from `GET /api/admin/users?limit=200`. Installations with more than 200 users will silently omit the oldest registrants from the dropdown. The long-term fix is a server-side search/type-ahead (`GET /api/admin/users?search=<query>`) replacing the static `<select>` — not implemented in the current scope.

---

## 20. Production Deployment Strategy

The application is deployed using a decoupled, zero-downtime static/microservice architecture:

- **Frontend Application**: Deployed to **Vercel** as a static Vite production build (`npm run build --workspace=client`). Configured via `VITE_API_BASE_URL` environment variable pointing to the Render API endpoint.
- **Backend Application**: Deployed to **Render** as a long-running Node.js/Express server (`npm start --workspace=server`).
- **Database**: Managed **MongoDB Atlas Cluster** (Replica Set enabled for ACID transactions).
- **Version Control**: Managed manually via standard Git workflow.
