import mongoose from 'mongoose';
import { findEventById } from '../repositories/event.repository';
import {
  atomicReserveSeat,
  releaseSeatsByReservation,
  findSeatsByIds,
} from '../repositories/seat.repository';
import {
  createReservationRecord,
  findReservationById,
  updateReservationStatus,
  findExpiredActiveReservations,
} from '../repositories/reservation.repository';
import {
  handleIdempotencyCheck,
  completeIdempotencyRecord,
  failIdempotencyRecord,
} from './idempotency.service';
import { EventStatus, ReservationStatus } from '../constants/enums';
import { ErrorCode } from '../constants/errorCodes';
import {
  NotFoundError,
  BusinessError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors';
import { config } from '../config/env';
import { runInTransaction } from '../utils/transaction';
import { IReservation } from '../models/Reservation';

export interface ReservationResult {
  reservation: IReservation;
  seats: { id: string; seatNumber: string; price: number }[];
  totalAmount: number;
}

/**
 * Creates a multi-seat 5-minute reservation.
 * Enforces all-or-nothing seat locking (if any seat is unavailable, all locked seats roll back).
 */
export async function createReservation(
  userId: string,
  eventId: string,
  seatIds: string[],
  idempotencyKey: string
): Promise<ReservationResult> {
  const endpoint = `POST /api/events/${eventId}/reservations`;
  const payload = { seatIds };

  // 1. Idempotency Check
  const check = await handleIdempotencyCheck(userId, idempotencyKey, endpoint, payload);
  if (check.isDuplicate && check.storedResponse) {
    return check.storedResponse as unknown as ReservationResult;
  }

  try {
    // 2. Validate Event
    const event = await findEventById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
    }
    if (event.status !== EventStatus.PUBLISHED) {
      throw new BusinessError(
        'Event is not available for booking',
        409,
        ErrorCode.EVENT_NOT_BOOKABLE
      );
    }

    // Generate reservation ID and calculate 5-minute expiry
    const reservationObjectId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + config.reservation.ttlMinutes * 60 * 1000);
    const userIdObjectId = new mongoose.Types.ObjectId(userId);
    const eventIdObjectId = new mongoose.Types.ObjectId(eventId);

    const lockedSeatIds: mongoose.Types.ObjectId[] = [];
    const seatDetails: { id: string; seatNumber: string; price: number }[] = [];
    let totalAmount = 0;

    // 3. ALL-OR-NOTHING MULTI-SEAT LOCKING & RESERVATION CREATION IN SINGLE TRANSACTION
    const reservation = await runInTransaction(async (session) => {
      for (const seatIdStr of seatIds) {
        const seatObjectId = new mongoose.Types.ObjectId(seatIdStr);
        const lockedSeat = await atomicReserveSeat(
          seatObjectId,
          eventIdObjectId,
          userIdObjectId,
          reservationObjectId,
          expiresAt,
          session
        );

        if (!lockedSeat) {
          throw new ConflictError(
            `Seat ${seatIdStr} is unavailable`,
            ErrorCode.SEAT_UNAVAILABLE
          );
        }

        lockedSeatIds.push(lockedSeat._id);
        seatDetails.push({
          id: lockedSeat._id.toString(),
          seatNumber: lockedSeat.seatNumber,
          price: lockedSeat.price,
        });
        totalAmount += lockedSeat.price;
      }

      // 4. Create Reservation Record inside same transaction
      return createReservationRecord(
        {
          _id: reservationObjectId,
          userId: userIdObjectId,
          eventId: eventIdObjectId,
          seatIds: lockedSeatIds,
          expiresAt,
          status: ReservationStatus.ACTIVE,
        },
        session
      );
    });

    const result: ReservationResult = {
      reservation,
      seats: seatDetails,
      totalAmount,
    };

    // 5. Store response for idempotency
    await completeIdempotencyRecord(
      userId,
      idempotencyKey,
      result as unknown as Record<string, unknown>
    );

    return result;
  } catch (err) {
    await failIdempotencyRecord(userId, idempotencyKey);
    throw err;
  }
}

/**
 * Gets a reservation by ID with AUTHORITATIVE server-side 5-minute expiry check.
 */
export async function getReservation(
  userId: string,
  reservationId: string
): Promise<ReservationResult> {
  const reservation = await findReservationById(reservationId);
  if (!reservation) {
    throw new NotFoundError('Reservation not found', ErrorCode.RESERVATION_NOT_FOUND);
  }

  // Ownership check
  if (reservation.userId.toString() !== userId) {
    throw new ForbiddenError('Access denied to this reservation');
  }

  // AUTHORITATIVE SERVER TIME EXPIRY CHECK
  if (
    reservation.status === ReservationStatus.ACTIVE &&
    reservation.expiresAt.getTime() <= Date.now()
  ) {
    // Perform auto-expiry cleanup
    await updateReservationStatus(reservation._id.toString(), ReservationStatus.EXPIRED);
    await releaseSeatsByReservation(reservation._id.toString());

    throw new BusinessError(
      'Reservation has expired',
      409,
      ErrorCode.RESERVATION_EXPIRED
    );
  }

  if (reservation.status === ReservationStatus.EXPIRED) {
    throw new BusinessError(
      'Reservation has expired',
      409,
      ErrorCode.RESERVATION_EXPIRED
    );
  }

  // Fetch seat details for response
  const seats = await findSeatsByIds(reservation.seatIds);
  const seatDetails = seats.map((s) => ({
    id: s._id.toString(),
    seatNumber: s.seatNumber,
    price: s.price,
  }));
  const totalAmount = seats.reduce((sum, s) => sum + s.price, 0);

  return {
    reservation,
    seats: seatDetails,
    totalAmount,
  };
}

/**
 * Cancels a reservation manually and releases locked seats back to AVAILABLE.
 */
export async function cancelReservation(
  userId: string,
  reservationId: string
): Promise<void> {
  const reservation = await findReservationById(reservationId);
  if (!reservation) {
    throw new NotFoundError('Reservation not found', ErrorCode.RESERVATION_NOT_FOUND);
  }

  if (reservation.userId.toString() !== userId) {
    throw new ForbiddenError('Access denied to this reservation');
  }

  if (reservation.status !== ReservationStatus.ACTIVE) {
    throw new BusinessError(
      `Cannot cancel reservation with status ${reservation.status}`,
      409,
      ErrorCode.INVALID_STATE_TRANSITION
    );
  }

  await updateReservationStatus(reservation._id.toString(), ReservationStatus.CANCELLED);
  await releaseSeatsByReservation(reservation._id.toString());
}

/**
 * Background job runner: finds all active reservations where expiresAt <= now,
 * transitions them to EXPIRED, and releases locked seats back to AVAILABLE.
 */
export async function releaseExpiredReservations(eventId?: string): Promise<number> {
  const now = new Date();
  const expired = await findExpiredActiveReservations(now, eventId);

  let releasedCount = 0;
  for (const res of expired) {
    await updateReservationStatus(res._id.toString(), ReservationStatus.EXPIRED);
    await releaseSeatsByReservation(res._id.toString());
    releasedCount++;
  }

  return releasedCount;
}
