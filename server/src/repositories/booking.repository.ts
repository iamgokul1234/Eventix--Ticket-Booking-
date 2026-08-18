import mongoose from 'mongoose';
import { Booking, IBooking } from '../models/Booking';
import { BookingStatus } from '../constants/enums';

export interface CreateBookingData {
  _id?: mongoose.Types.ObjectId | string;
  userId: mongoose.Types.ObjectId | string;
  eventId: mongoose.Types.ObjectId | string;
  reservationId: mongoose.Types.ObjectId | string;
  seatIds: (mongoose.Types.ObjectId | string)[];
  amount: number;
  walletTransactionId: mongoose.Types.ObjectId | string;
  bookingReference: string;
  idempotencyKey?: string | null;
  status?: BookingStatus;
}

export interface PaginatedBookings {
  bookings: IBooking[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function createBookingRecord(
  data: CreateBookingData,
  session?: mongoose.ClientSession
): Promise<IBooking> {
  const docData: Record<string, unknown> = {
    userId: data.userId,
    eventId: data.eventId,
    reservationId: data.reservationId,
    seatIds: data.seatIds,
    amount: data.amount,
    walletTransactionId: data.walletTransactionId,
    bookingReference: data.bookingReference,
    idempotencyKey: data.idempotencyKey ?? null,
    status: data.status ?? BookingStatus.CONFIRMED,
  };

  if (data._id) {
    docData._id = data._id;
  }

  const docs = await Booking.create([docData], { session });
  return docs[0];
}

export async function findBookingById(
  id: string | mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<IBooking | null> {
  return Booking.findById(id, null, { session }).exec();
}

export async function findBookingsByUser(
  userId: string | mongoose.Types.ObjectId,
  page = 1,
  limit = 20
): Promise<PaginatedBookings> {
  const skip = (page - 1) * limit;

  const [bookings, total] = await Promise.all([
    Booking.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    Booking.countDocuments({ userId }).exec(),
  ]);

  return {
    bookings,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Atomic conditional booking cancellation primitive.
 * Filters on { _id: bookingId, userId, status: CONFIRMED }
 * Sets status: CANCELLED, refundTransactionId.
 */
export async function cancelBookingRecord(
  bookingId: string | mongoose.Types.ObjectId,
  userId: string | mongoose.Types.ObjectId,
  refundTransactionId: mongoose.Types.ObjectId,
  session?: mongoose.ClientSession
): Promise<IBooking | null> {
  const options = session ? { new: true, session } : { new: true };
  return Booking.findOneAndUpdate(
    {
      _id: bookingId,
      userId,
      status: BookingStatus.CONFIRMED,
    },
    {
      $set: {
        status: BookingStatus.CANCELLED,
        refundTransactionId,
      },
    },
    options
  ).exec();
}
