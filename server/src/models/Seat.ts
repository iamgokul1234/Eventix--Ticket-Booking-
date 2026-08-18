import mongoose, { Schema, Document, Model } from 'mongoose';
import { SeatStatus } from '../constants/enums';

export interface ISeat extends Document {
  _id: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  seatNumber: string;
  status: SeatStatus;
  reservationId: mongoose.Types.ObjectId | null;
  reservedBy: mongoose.Types.ObjectId | null;
  reservedUntil: Date | null;
  bookingId: mongoose.Types.ObjectId | null;
  /** Price for this specific seat in integer paise. Never a float. */
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

const seatSchema = new Schema<ISeat>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: [true, 'Event ID is required'],
    },
    seatNumber: {
      type: String,
      required: [true, 'Seat number is required'],
      trim: true,
      maxlength: [20, 'Seat number must be at most 20 characters'],
    },
    status: {
      type: String,
      enum: Object.values(SeatStatus),
      default: SeatStatus.AVAILABLE,
    },
    reservationId: {
      type: Schema.Types.ObjectId,
      ref: 'Reservation',
      default: null,
    },
    reservedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reservedUntil: {
      type: Date,
      default: null,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    price: {
      type: Number,
      required: [true, 'Seat price is required'],
      min: [0, 'Price cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Price must be an integer (paise)',
      },
    },
  },
  { timestamps: true }
);

// PRIMARY CONCURRENCY GUARD: unique compound index on (eventId, seatNumber).
// Atomic conditional updates filter on this pair — prevents two threads from
// booking the same seat even under high concurrency.
seatSchema.index({ eventId: 1, seatNumber: 1 }, { unique: true });

// Required index: filter available seats for an event efficiently
seatSchema.index({ eventId: 1, status: 1 });

// For looking up all seats belonging to a reservation
seatSchema.index({ reservationId: 1 });

export const Seat: Model<ISeat> = mongoose.models.Seat || mongoose.model<ISeat>('Seat', seatSchema);
