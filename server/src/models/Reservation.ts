import mongoose, { Schema, Document, Model } from 'mongoose';
import { ReservationStatus } from '../constants/enums';
import { config } from '../config/env';

export interface IReservation extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  seatIds: mongoose.Types.ObjectId[];
  status: ReservationStatus;
  /** Authoritative expiry timestamp. Server checks this inside the booking transaction. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reservationSchema = new Schema<IReservation>(
  {
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
    seatIds: {
      type: [Schema.Types.ObjectId],
      ref: 'Seat',
      required: [true, 'Seat IDs are required'],
      validate: {
        validator: (arr: mongoose.Types.ObjectId[]) => arr.length >= 1,
        message: 'At least one seat ID is required',
      },
    },
    status: {
      type: String,
      enum: Object.values(ReservationStatus),
      default: ReservationStatus.ACTIVE,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiry time is required'],
      default: () => new Date(Date.now() + config.reservation.ttlMinutes * 60 * 1000),
    },
  },
  { timestamps: true }
);

// Required index: cleanup job queries (status=ACTIVE, expiresAt <= now)
reservationSchema.index({ status: 1, expiresAt: 1 });

// For looking up a user's active reservations on an event
reservationSchema.index({ userId: 1, eventId: 1 });

// TTL index: secondary auto-expiry via MongoDB (5-minute window + 60s grace).
// IMPORTANT: this is NOT authoritative — the booking transaction re-checks
// expiresAt server-side. This is only a cleanup mechanism.
reservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 });

export const Reservation: Model<IReservation> =
  mongoose.models.Reservation || mongoose.model<IReservation>('Reservation', reservationSchema);
