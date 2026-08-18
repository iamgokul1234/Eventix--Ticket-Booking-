import mongoose, { Schema, Document, Model } from 'mongoose';
import { IdempotencyStatus } from '../constants/enums';

export interface IIdempotencyRecord extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  /** The Idempotency-Key header value from the client */
  key: string;
  /** The endpoint path this key was used on (e.g. POST /api/bookings) */
  endpoint: string;
  /** SHA-256 hash of the request payload — used to detect same-key/different-payload reuse */
  requestHash: string;
  status: IdempotencyStatus;
  /** The full serialized response body stored for replaying on duplicate requests */
  storedResponse: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

const idempotencyRecordSchema = new Schema<IIdempotencyRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    key: {
      type: String,
      required: [true, 'Idempotency key is required'],
      trim: true,
      maxlength: [255, 'Idempotency key must be at most 255 characters'],
    },
    endpoint: {
      type: String,
      required: [true, 'Endpoint is required'],
      trim: true,
    },
    requestHash: {
      type: String,
      required: [true, 'Request hash is required'],
    },
    status: {
      type: String,
      enum: Object.values(IdempotencyStatus),
      default: IdempotencyStatus.PROCESSING,
    },
    storedResponse: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

// Primary lookup: userId + key must be unique per user (different users may reuse same key)
idempotencyRecordSchema.index({ userId: 1, key: 1 }, { unique: true });

// TTL: auto-delete idempotency records after 24 hours
idempotencyRecordSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export const IdempotencyRecord: Model<IIdempotencyRecord> =
  mongoose.models.IdempotencyRecord ||
  mongoose.model<IIdempotencyRecord>('IdempotencyRecord', idempotencyRecordSchema);
