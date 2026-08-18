import mongoose, { Schema, Document, Model } from 'mongoose';
import { EventStatus } from '../constants/enums';

export interface IEvent extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  venue: string;
  eventDate: Date;
  eventTime: string;
  totalSeats: number;
  /** Price per seat in integer paise. Never a float. */
  price: number;
  status: EventStatus;
  createdAt: Date;
  updatedAt: Date;
}

const eventSchema = new Schema<IEvent>(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title must be at most 200 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [5000, 'Description must be at most 5000 characters'],
    },
    venue: {
      type: String,
      required: [true, 'Venue is required'],
      trim: true,
      maxlength: [300, 'Venue must be at most 300 characters'],
    },
    eventDate: {
      type: Date,
      required: [true, 'Event date is required'],
    },
    eventTime: {
      type: String,
      required: [true, 'Event time is required'],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Event time must be in HH:MM format'],
    },
    totalSeats: {
      type: Number,
      required: [true, 'Total seats is required'],
      min: [1, 'Total seats must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Total seats must be an integer',
      },
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Price must be an integer (paise)',
      },
    },
    status: {
      type: String,
      enum: Object.values(EventStatus),
      default: EventStatus.DRAFT,
    },
  },
  { timestamps: true }
);

// Indexes for public browse queries
eventSchema.index({ status: 1, eventDate: 1 });

export const Event: Model<IEvent> = mongoose.models.Event || mongoose.model<IEvent>('Event', eventSchema);
