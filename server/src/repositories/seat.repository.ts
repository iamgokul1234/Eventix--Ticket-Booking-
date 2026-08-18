import mongoose from 'mongoose';
import { Seat, ISeat } from '../models/Seat';
import { SeatStatus } from '../constants/enums';
import { runInTransaction } from '../utils/transaction';

export interface CreateSeatData {
  eventId: mongoose.Types.ObjectId;
  seatNumber: string;
  price: number;
}

/**
 * Bulk-create seats atomically inside a MongoDB transaction.
 */
export async function bulkCreateSeats(seats: CreateSeatData[]): Promise<ISeat[]> {
  return runInTransaction(async (session) => {
    return Seat.insertMany(seats, { session });
  });
}

/**
 * Find all seats for an event. Returns in natural numeric seatNumber order
 * (e.g. A1, A2, A3 ... A9, A10, A11 ... A100, B1, B2).
 */
export async function findSeatsByEventId(
  eventId: string | mongoose.Types.ObjectId
): Promise<ISeat[]> {
  const seats = await Seat.find({ eventId }).exec();
  return seats.sort((a, b) =>
    a.seatNumber.localeCompare(b.seatNumber, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  );
}

/**
 * Count seats for an event, optionally filtered by status.
 */
export async function countSeatsByEventId(
  eventId: string | mongoose.Types.ObjectId,
  status?: SeatStatus
): Promise<number> {
  const query: Record<string, unknown> = { eventId };
  if (status) query.status = status;
  return Seat.countDocuments(query).exec();
}

/**
 * Find seats by their IDs.
 */
export async function findSeatsByIds(
  ids: (string | mongoose.Types.ObjectId)[],
  session?: mongoose.ClientSession
): Promise<ISeat[]> {
  const options = session ? { session } : {};
  return Seat.find({ _id: { $in: ids } }, null, options).exec();
}

/**
 * Delete all seats for an event.
 */
export async function deleteSeatsByEventId(
  eventId: string | mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<void> {
  const options = session ? { session } : {};
  await Seat.deleteMany({ eventId }, options);
}

/**
 * Atomically reserve a single seat (AVAILABLE -> RESERVED).
 */
export async function atomicReserveSeat(
  seatId: string | mongoose.Types.ObjectId,
  _eventId?: string | mongoose.Types.ObjectId,
  _userId?: string | mongoose.Types.ObjectId,
  reservationId?: string | mongoose.Types.ObjectId,
  _expiresAt?: Date,
  session?: mongoose.ClientSession
): Promise<ISeat | null> {
  const options: mongoose.QueryOptions = { new: true };
  if (session) options.session = session;

  return Seat.findOneAndUpdate(
    { _id: seatId, status: SeatStatus.AVAILABLE },
    { $set: { status: SeatStatus.RESERVED, reservationId } },
    options
  ).exec();
}

/**
 * Release seats linked to an expired or cancelled reservation back to AVAILABLE.
 */
export async function releaseSeatsByReservation(
  reservationId: string | mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<void> {
  const options = session ? { session } : {};
  await Seat.updateMany(
    { reservationId },
    { $set: { status: SeatStatus.AVAILABLE, reservationId: null } },
    options
  ).exec();
}

/**
 * Confirm reservation hold seats into BOOKED state.
 */
export async function bookSeatsByReservation(
  reservationId: string | mongoose.Types.ObjectId,
  bookingId: string | mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<void> {
  const options = session ? { session } : {};
  await Seat.updateMany(
    { reservationId },
    { $set: { status: SeatStatus.BOOKED, bookingId, reservationId: null } },
    options
  ).exec();
}

/**
 * Release seats linked to a refunded booking back to AVAILABLE.
 */
export async function releaseSeatsByBooking(
  bookingId: string | mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<void> {
  const options = session ? { session } : {};
  await Seat.updateMany(
    { bookingId },
    { $set: { status: SeatStatus.AVAILABLE, bookingId: null } },
    options
  ).exec();
}
