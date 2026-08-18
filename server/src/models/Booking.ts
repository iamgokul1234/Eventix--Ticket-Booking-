import mongoose, { Schema, Document, Model } from 'mongoose';
import { BookingStatus } from '../constants/enums';

export interface IBooking extends Document {
  _id: mongoose.Types.ObjectId;
  bookingReference: string;
  userId: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  reservationId: mongoose.Types.ObjectId;
  seatIds: mongoose.Types.ObjectId[];
  /** Total booking amount in integer paise. Server-calculated, never from client. */
  amount: number;
  status: BookingStatus;
  walletTransactionId: mongoose.Types.ObjectId;
  refundTransactionId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    bookingReference: {
      type: String,
      required: [true, 'Booking reference is required'],
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
    },
    reservationId: {
      type: Schema.Types.ObjectId,
      ref: 'Reservation',
      required: [true, 'Reservation ID is required'],
    },
    seatIds: {
      type: [Schema.Types.ObjectId],
      ref: 'Seat',
      required: true,
      validate: {
        validator: (arr: mongoose.Types.ObjectId[]) => arr.length >= 1,
        message: 'At least one seat ID is required',
      },
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Amount must be an integer (paise)',
      },
    },
    status: {
      type: String,
      enum: Object.values(BookingStatus),
      default: BookingStatus.CONFIRMED,
    },
    walletTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      required: [true, 'Wallet transaction ID is required'],
    },
    refundTransactionId: {
      type: Schema.Types.ObjectId,
      ref: 'WalletTransaction',
      default: null,
    },
  },
  { timestamps: true }
);

// Unique booking reference
bookingSchema.index({ bookingReference: 1 }, { unique: true });

// Required indexes for monitoring/filtering queries
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ eventId: 1, createdAt: -1 });
bookingSchema.index({ status: 1 });

export const Booking: Model<IBooking> =
  mongoose.models.Booking || mongoose.model<IBooking>('Booking', bookingSchema);
