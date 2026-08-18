import mongoose from 'mongoose';
import { Event, IEvent } from '../models/Event';
import { EventStatus } from '../constants/enums';
import { CreateEventInput, UpdateEventInput } from '../validators/event';

export interface EventFilter {
  status?: EventStatus | EventStatus[];
  page?: number;
  limit?: number;
}

export interface PaginatedEvents {
  events: IEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function findEvents(filter: EventFilter): Promise<PaginatedEvents> {
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  if (filter.status) {
    query.status = Array.isArray(filter.status)
      ? { $in: filter.status }
      : filter.status;
  }

  const [events, total] = await Promise.all([
    Event.find(query).sort({ eventDate: 1 }).skip(skip).limit(limit).exec(),
    Event.countDocuments(query).exec(),
  ]);

  return {
    events,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function findEventById(
  id: string | mongoose.Types.ObjectId
): Promise<IEvent | null> {
  return Event.findById(id).exec();
}

export async function createEvent(input: CreateEventInput): Promise<IEvent> {
  const event = new Event({
    title: input.title,
    description: input.description,
    venue: input.venue,
    eventDate: new Date(input.eventDate),
    eventTime: input.eventTime,
    totalSeats: input.totalSeats,
    price: input.price,
    status: EventStatus.DRAFT,
  });
  return event.save();
}

export async function updateEvent(
  id: string | mongoose.Types.ObjectId,
  input: UpdateEventInput
): Promise<IEvent | null> {
  const update: Partial<IEvent> = {};
  if (input.title !== undefined) update.title = input.title;
  if (input.description !== undefined) update.description = input.description;
  if (input.venue !== undefined) update.venue = input.venue;
  if (input.eventDate !== undefined) update.eventDate = new Date(input.eventDate);
  if (input.eventTime !== undefined) update.eventTime = input.eventTime;
  if (input.totalSeats !== undefined) update.totalSeats = input.totalSeats;
  if (input.price !== undefined) update.price = input.price;

  return Event.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).exec();
}

export async function updateEventStatus(
  id: string | mongoose.Types.ObjectId,
  status: EventStatus,
  session?: mongoose.ClientSession
): Promise<IEvent | null> {
  return Event.findByIdAndUpdate(
    id,
    { $set: { status } },
    { new: true, session }
  ).exec();
}

export async function deleteEventById(
  id: string | mongoose.Types.ObjectId
): Promise<IEvent | null> {
  return Event.findByIdAndDelete(id).exec();
}
