import mongoose from 'mongoose';
import { Reservation } from '../models/Reservation';
import { Booking } from '../models/Booking';
import { WalletTransaction } from '../models/WalletTransaction';
import {
  createBookingRecord,
  findBookingById,
  findBookingsByUser,
  cancelBookingRecord,
  PaginatedBookings,
} from '../repositories/booking.repository';
import {
  findSeatsByIds,
  releaseSeatsByReservation,
  bookSeatsByReservation,
  releaseSeatsByBooking,
} from '../repositories/seat.repository';
import { updateReservationStatus } from '../repositories/reservation.repository';
import {
  atomicCreditUserBalance,
  createWalletTransactionRecord,
} from '../repositories/wallet.repository';
import { debitWallet } from './wallet.service';
import {
  handleIdempotencyCheck,
  completeIdempotencyRecord,
  failIdempotencyRecord,
} from './idempotency.service';
import {
  ReservationStatus,
  BookingStatus,
  WalletReferenceType,
  WalletTransactionType,
  WalletTransactionStatus,
} from '../constants/enums';
import { ErrorCode } from '../constants/errorCodes';
import {
  NotFoundError,
  BusinessError,
  ForbiddenError,
  ConflictError,
} from '../utils/errors';
import { runInTransaction } from '../utils/transaction';
import { IBooking } from '../models/Booking';

export interface BookingResult {
  booking: IBooking;
  seats: { id: string; seatNumber: string; price: number }[];
}

function generateBookingReference(): string {
  const timeHex = Date.now().toString(36).toUpperCase();
  const randHex = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `BK-${timeHex}-${randHex}`;
}

/**
 * Creates a Booking atomically within a single Mongoose transaction.
 * Steps (Atomic Unit of Work):
 * 1. Atomic reservation status transition ACTIVE -> CONFIRMED via findOneAndUpdate with status in query filter.
 * 2. Authoritative server time expiry check (expiresAt <= serverTime). If expired, auto-release seats & set status EXPIRED.
 * 3. Fetch seats directly from DB to compute totalAmount from DB seat prices (never trust client payload).
 * 4. Perform atomic wallet debit with balance >= totalAmount filter (debitWallet) recording balanceBefore/balanceAfter in ledger.
 * 5. Transition seats RESERVED -> BOOKED with bookingId.
 * 6. Create Booking document.
 */
export async function createBooking(
  userId: string,
  reservationId: string,
  idempotencyKey: string
): Promise<BookingResult> {
  const endpoint = 'POST /api/bookings';
  const payload = { reservationId };

  // 1. Idempotency Check
  const check = await handleIdempotencyCheck(userId, idempotencyKey, endpoint, payload);
  if (check.isDuplicate && check.storedResponse) {
    return check.storedResponse as unknown as BookingResult;
  }

  try {
    const bookingObjectId = new mongoose.Types.ObjectId();
    const bookingReference = generateBookingReference();

    const { booking, seatDetails } = await runInTransaction(async (session) => {
      // Step A: EXPLICIT RESERVATION LOOKUP & OWNERSHIP / EXPIRY / STATE CHECKS
      const existingRes = await Reservation.findById(reservationId, null, { session });
      if (!existingRes) {
        throw new NotFoundError('Reservation not found', ErrorCode.RESERVATION_NOT_FOUND);
      }

      // Explicit ownership check: return 403 FORBIDDEN if reservation.userId !== authenticated userId
      if (existingRes.userId.toString() !== userId.toString()) {
        throw new ForbiddenError('You do not own this reservation');
      }

      // Authoritative server expiry check: return 409 RESERVATION_EXPIRED
      if (existingRes.expiresAt.getTime() <= Date.now() || existingRes.status === ReservationStatus.EXPIRED) {
        throw new BusinessError(
          'Reservation has expired',
          409,
          ErrorCode.RESERVATION_EXPIRED
        );
      }

      // State check: return 409 INVALID_STATE_TRANSITION
      if (existingRes.status !== ReservationStatus.ACTIVE) {
        throw new BusinessError(
          'Reservation is not active or already processed',
          409,
          ErrorCode.INVALID_STATE_TRANSITION
        );
      }

      // Step B: ATOMIC RESERVATION LOCK (ACTIVE -> CONFIRMED in single findOneAndUpdate filter)
      const confirmedReservation = await Reservation.findOneAndUpdate(
        {
          _id: reservationId,
          userId,
          status: ReservationStatus.ACTIVE,
        },
        { $set: { status: ReservationStatus.CONFIRMED } },
        { new: true, session }
      ).exec();

      if (!confirmedReservation) {
        throw new BusinessError(
          'Reservation is not active or already processed',
          409,
          ErrorCode.INVALID_STATE_TRANSITION
        );
      }

      // Step C: Read seat prices directly from DB (never trust client payload)
      const seats = await findSeatsByIds(confirmedReservation.seatIds, session);
      if (seats.length !== confirmedReservation.seatIds.length) {
        throw new ConflictError(
          'One or more reserved seats were not found',
          ErrorCode.SEAT_UNAVAILABLE
        );
      }

      const totalAmount = seats.reduce((sum, s) => sum + s.price, 0);

      // Step D: Atomic Wallet Debit (filters walletBalance >= totalAmount, records balanceBefore & balanceAfter)
      const debitResult = await debitWallet(
        userId,
        totalAmount,
        WalletReferenceType.BOOKING,
        bookingObjectId,
        idempotencyKey,
        session
      );

      // Step E: Transition seat statuses RESERVED -> BOOKED
      await bookSeatsByReservation(confirmedReservation._id, bookingObjectId, session);

      // Step F: Create Booking record inside same transaction
      const newBooking = await createBookingRecord(
        {
          _id: bookingObjectId,
          userId,
          eventId: confirmedReservation.eventId,
          reservationId: confirmedReservation._id,
          seatIds: confirmedReservation.seatIds,
          amount: totalAmount,
          walletTransactionId: debitResult.walletTransaction._id,
          bookingReference,
          idempotencyKey,
          status: BookingStatus.CONFIRMED,
        },
        session
      );

      const seatDetailsArr = seats.map((s) => ({
        id: s._id.toString(),
        seatNumber: s.seatNumber,
        price: s.price,
      }));

      return { booking: newBooking, seatDetails: seatDetailsArr };
    });

    const result: BookingResult = {
      booking,
      seats: seatDetails,
    };

    // Store completed idempotency record
    await completeIdempotencyRecord(
      userId,
      idempotencyKey,
      result as unknown as Record<string, unknown>
    );

    return result;
  } catch (err) {
    // CRASH RECOVERY: If process crashed between transaction commit and completeIdempotencyRecord,
    // a retry will hit INVALID_STATE_TRANSITION. Recover the committed booking ONLY if a WalletTransaction exists matching THIS idempotencyKey.
    const errCode = (err as { errorCode?: string })?.errorCode || (err as { code?: string })?.code;
    if (errCode === ErrorCode.INVALID_STATE_TRANSITION) {
      const userObjId = new mongoose.Types.ObjectId(userId.toString());

      const walletTx = await WalletTransaction.findOne({
        userId: userObjId,
        idempotencyKey,
      }).exec();

      if (walletTx) {
        const resObjId = new mongoose.Types.ObjectId(reservationId.toString());
        const recoveredBooking = await Booking.findOne({
          reservationId: resObjId,
          userId: userObjId,
          idempotencyKey,
        }).exec();

        if (recoveredBooking) {
          const seats = await findSeatsByIds(recoveredBooking.seatIds);
          const seatDetails = seats.map((s) => ({
            id: s._id.toString(),
            seatNumber: s.seatNumber,
            price: s.price,
          }));
          const recoveredResult: BookingResult = {
            booking: recoveredBooking,
            seats: seatDetails,
          };
          await completeIdempotencyRecord(
            userId,
            idempotencyKey,
            recoveredResult as unknown as Record<string, unknown>
          );
          return recoveredResult;
        }
      }
    }

    const isExpiredError = errCode === ErrorCode.RESERVATION_EXPIRED;
    const resDoc = await Reservation.findById(reservationId).exec();
    if (isExpiredError || (resDoc && resDoc.expiresAt.getTime() <= Date.now())) {
      await updateReservationStatus(reservationId, ReservationStatus.EXPIRED);
      await releaseSeatsByReservation(reservationId);
    }
    await failIdempotencyRecord(userId, idempotencyKey);
    throw err;
  }
}

/**
 * Gets a user's single booking by ID with ownership guard.
 */
export async function getBookingById(
  userId: string,
  bookingId: string
): Promise<BookingResult> {
  const booking = await findBookingById(bookingId);
  if (!booking) {
    throw new NotFoundError('Booking not found', ErrorCode.BOOKING_NOT_FOUND);
  }

  if (booking.userId.toString() !== userId) {
    throw new ForbiddenError('Access denied to this booking');
  }

  const seats = await findSeatsByIds(booking.seatIds);
  const seatDetails = seats.map((s) => ({
    id: s._id.toString(),
    seatNumber: s.seatNumber,
    price: s.price,
  }));

  return {
    booking,
    seats: seatDetails,
  };
}

/**
 * Gets user's paginated booking history.
 */
export async function getUserBookings(
  userId: string,
  page = 1,
  limit = 20
): Promise<PaginatedBookings> {
  return findBookingsByUser(userId, page, limit);
}

export interface CancelBookingResult {
  booking: IBooking;
  refundAmount: number;
  refundTransactionId: string;
}

/**
 * Cancels a booking atomically within a single Mongoose transaction.
 * Steps:
 * 1. Mandatory Idempotency check.
 * 2. Atomic unit of work (runInTransaction):
 *    a. Verify booking exists, belongs to user, and is CONFIRMED.
 *    b. Atomic booking status transition CONFIRMED -> CANCELLED via cancelBookingRecord.
 *    c. Atomic wallet credit refund via atomicCreditUserBalance.
 *    d. Append-only WalletTransaction ledger record with balanceBefore and balanceAfter.
 *    e. Release seats back to AVAILABLE.
 * 3. Complete idempotency record.
 */
export async function cancelBooking(
  userId: string,
  bookingId: string,
  idempotencyKey: string
): Promise<CancelBookingResult> {
  const endpoint = 'DELETE /api/bookings/:bookingId';
  const payload = { bookingId };

  const check = await handleIdempotencyCheck(userId, idempotencyKey, endpoint, payload);
  if (check.isDuplicate && check.storedResponse) {
    return check.storedResponse as unknown as CancelBookingResult;
  }

  try {
    const refundTxId = new mongoose.Types.ObjectId();

    const { cancelledBooking, refundAmount } = await runInTransaction(async (session) => {
      // 1. Verify booking ownership and state BEFORE cancellation
      const existingBooking = await findBookingById(bookingId, session);
      if (!existingBooking) {
        throw new NotFoundError('Booking not found', ErrorCode.BOOKING_NOT_FOUND);
      }

      if (existingBooking.userId.toString() !== userId) {
        throw new ForbiddenError('Access denied to cancel this booking');
      }

      if (existingBooking.status !== BookingStatus.CONFIRMED) {
        throw new BusinessError(
          'Booking is not active or already cancelled',
          409,
          ErrorCode.INVALID_STATE_TRANSITION
        );
      }

      const refundAmt = existingBooking.amount;

      // 2. Atomic status transition CONFIRMED -> CANCELLED
      const updatedBooking = await cancelBookingRecord(
        bookingId,
        userId,
        refundTxId,
        session
      );

      if (!updatedBooking) {
        throw new BusinessError(
          'Booking cancellation failed due to concurrent update',
          409,
          ErrorCode.INVALID_STATE_TRANSITION
        );
      }

      // 3. Atomic wallet credit refund
      const creditRes = await atomicCreditUserBalance(userId, refundAmt, session);
      if (!creditRes) {
        throw new NotFoundError('User not found for wallet refund', ErrorCode.UNAUTHORIZED);
      }

      // 4. Ledger entry with balanceBefore and balanceAfter
      await createWalletTransactionRecord(
        {
          _id: refundTxId,
          userId,
          type: WalletTransactionType.CREDIT,
          amount: refundAmt,
          balanceBefore: creditRes.balanceBefore,
          balanceAfter: creditRes.balanceAfter,
          referenceType: WalletReferenceType.REFUND,
          referenceId: updatedBooking._id,
          idempotencyKey,
          status: WalletTransactionStatus.COMPLETED,
        },
        session
      );

      // 5. Release seats back to AVAILABLE
      await releaseSeatsByBooking(updatedBooking._id, session);

      return { cancelledBooking: updatedBooking, refundAmount: refundAmt };
    });

    const result: CancelBookingResult = {
      booking: cancelledBooking,
      refundAmount,
      refundTransactionId: refundTxId.toString(),
    };

    await completeIdempotencyRecord(
      userId,
      idempotencyKey,
      result as unknown as Record<string, unknown>
    );

    return result;
  } catch (err) {
    // CRASH RECOVERY: If process crashed between transaction commit and completeIdempotencyRecord,
    // a retry with the SAME idempotencyKey will hit INVALID_STATE_TRANSITION. Recover the committed cancellation
    // ONLY if the WalletTransaction refund ledger record matches this specific idempotencyKey.
    const errCode = (err as { errorCode?: string })?.errorCode || (err as { code?: string })?.code;
    if (errCode === ErrorCode.INVALID_STATE_TRANSITION) {
      const userObjId = new mongoose.Types.ObjectId(userId.toString());
      const bObjId = new mongoose.Types.ObjectId(bookingId.toString());

      const refundTx = await WalletTransaction.findOne({
        userId: userObjId,
        referenceId: bObjId,
        referenceType: WalletReferenceType.REFUND,
        idempotencyKey,
      }).exec();

      if (refundTx) {
        const recoveredBooking = await Booking.findOne({
          _id: bObjId,
          userId: userObjId,
          status: BookingStatus.CANCELLED,
        }).exec();

        if (recoveredBooking) {
          const recoveredResult: CancelBookingResult = {
            booking: recoveredBooking,
            refundAmount: recoveredBooking.amount,
            refundTransactionId: refundTx._id.toString(),
          };
          await completeIdempotencyRecord(
            userId,
            idempotencyKey,
            recoveredResult as unknown as Record<string, unknown>
          );
          return recoveredResult;
        }
      }
    }

    await failIdempotencyRecord(userId, idempotencyKey);
    throw err;
  }
}

/**
 * Admin-initiated refund for any booking (no ownership check required, admin authorization enforced at route level).
 * Performs atomic status transition CONFIRMED -> CANCELLED and refunds booking owner's wallet balance.
 */
export async function adminRefundBooking(
  adminUserId: string,
  bookingId: string,
  idempotencyKey: string
): Promise<CancelBookingResult> {
  const endpoint = 'POST /api/admin/bookings/:bookingId/refund';
  const payload = { bookingId };

  const check = await handleIdempotencyCheck(adminUserId, idempotencyKey, endpoint, payload);
  if (check.isDuplicate && check.storedResponse) {
    return check.storedResponse as unknown as CancelBookingResult;
  }

  try {
    const refundTxId = new mongoose.Types.ObjectId();

    const { cancelledBooking, refundAmount } = await runInTransaction(async (session) => {
      const existingBooking = await findBookingById(bookingId, session);
      if (!existingBooking) {
        throw new NotFoundError('Booking not found', ErrorCode.BOOKING_NOT_FOUND);
      }

      if (existingBooking.status !== BookingStatus.CONFIRMED) {
        throw new BusinessError(
          'Booking is not active or already cancelled',
          409,
          ErrorCode.INVALID_STATE_TRANSITION
        );
      }

      const refundAmt = existingBooking.amount;
      const ownerUserId = existingBooking.userId.toString();

      // Atomic status transition CONFIRMED -> CANCELLED via cancelBookingRecord
      const updatedBooking = await cancelBookingRecord(
        bookingId,
        ownerUserId,
        refundTxId,
        session
      );

      if (!updatedBooking) {
        throw new BusinessError(
          'Booking refund failed due to concurrent update',
          409,
          ErrorCode.INVALID_STATE_TRANSITION
        );
      }

      // Atomic wallet credit refund to the booking owner's wallet
      const creditRes = await atomicCreditUserBalance(ownerUserId, refundAmt, session);
      if (!creditRes) {
        throw new NotFoundError('User not found for wallet refund', ErrorCode.UNAUTHORIZED);
      }

      // Append-only WalletTransaction ledger record for booking owner
      await createWalletTransactionRecord(
        {
          _id: refundTxId,
          userId: ownerUserId,
          type: WalletTransactionType.CREDIT,
          amount: refundAmt,
          balanceBefore: creditRes.balanceBefore,
          balanceAfter: creditRes.balanceAfter,
          referenceType: WalletReferenceType.REFUND,
          referenceId: updatedBooking._id,
          idempotencyKey,
          status: WalletTransactionStatus.COMPLETED,
        },
        session
      );

      // Release seats back to AVAILABLE
      await releaseSeatsByBooking(updatedBooking._id, session);

      return { cancelledBooking: updatedBooking, refundAmount: refundAmt };
    });

    const result: CancelBookingResult = {
      booking: cancelledBooking,
      refundAmount,
      refundTransactionId: refundTxId.toString(),
    };

    await completeIdempotencyRecord(
      adminUserId,
      idempotencyKey,
      result as unknown as Record<string, unknown>
    );

    return result;
  } catch (err) {
    const errCode = (err as { errorCode?: string })?.errorCode || (err as { code?: string })?.code;
    if (errCode === ErrorCode.INVALID_STATE_TRANSITION) {
      const bObjId = new mongoose.Types.ObjectId(bookingId.toString());

      const refundTx = await WalletTransaction.findOne({
        referenceId: bObjId,
        referenceType: WalletReferenceType.REFUND,
        idempotencyKey,
      }).exec();

      if (refundTx) {
        const recoveredBooking = await Booking.findOne({
          _id: bObjId,
          status: BookingStatus.CANCELLED,
        }).exec();

        if (recoveredBooking) {
          const recoveredResult: CancelBookingResult = {
            booking: recoveredBooking,
            refundAmount: recoveredBooking.amount,
            refundTransactionId: refundTx._id.toString(),
          };
          await completeIdempotencyRecord(
            adminUserId,
            idempotencyKey,
            recoveredResult as unknown as Record<string, unknown>
          );
          return recoveredResult;
        }
      }
    }

    await failIdempotencyRecord(adminUserId, idempotencyKey);
    throw err;
  }
}
