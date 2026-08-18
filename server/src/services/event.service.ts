import mongoose from 'mongoose';
import {
  findEvents,
  findEventById,
  createEvent as createEventRepo,
  updateEvent as updateEventRepo,
  updateEventStatus,
  deleteEventById,
  PaginatedEvents,
} from '../repositories/event.repository';
import {
  bulkCreateSeats,
  findSeatsByEventId,
  countSeatsByEventId,
  deleteSeatsByEventId,
} from '../repositories/seat.repository';
import { IEvent } from '../models/Event';
import { ISeat } from '../models/Seat';
import { EventStatus, SeatStatus } from '../constants/enums';
import { ErrorCode } from '../constants/errorCodes';
import { NotFoundError, BusinessError, ConflictError, ValidationError } from '../utils/errors';
import { runInTransaction } from '../utils/transaction';
import {
  CreateEventInput,
  UpdateEventInput,
  EventQueryInput,
  BulkCreateSeatsInput,
} from '../validators/event';

import { releaseExpiredReservations } from './reservation.service';

// ─── Public endpoints ─────────────────────────────────────────────────────────

/** List PUBLISHED events only — public browse */
export async function listEvents(query: EventQueryInput): Promise<PaginatedEvents> {
  return findEvents({
    status: EventStatus.PUBLISHED,
    page: query.page,
    limit: query.limit,
  });
}

/** Get a single PUBLISHED event — public */
export async function getPublicEvent(eventId: string): Promise<IEvent> {
  const event = await findEventById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
  }
  if (event.status !== EventStatus.PUBLISHED) {
    throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
  }
  return event;
}

/** List seats for a PUBLISHED event — public */
export async function getEventSeats(eventId: string): Promise<ISeat[]> {
  const event = await findEventById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
  }
  if (event.status !== EventStatus.PUBLISHED) {
    throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
  }

  // Layer 2: Passive lazy cleanup of expired reservations scoped specifically to this event
  await releaseExpiredReservations(eventId);

  return findSeatsByEventId(eventId);
}

// ─── Admin endpoints ──────────────────────────────────────────────────────────

/** List all events for admin (all statuses) */
export async function adminListEvents(query: EventQueryInput): Promise<PaginatedEvents> {
  const statusFilter = query.status as EventStatus | undefined;
  return findEvents({
    status: statusFilter,
    page: query.page,
    limit: query.limit,
  });
}

/** Get any event by ID for admin */
export async function adminGetEvent(eventId: string): Promise<IEvent> {
  const event = await findEventById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
  }
  return event;
}

/** Create a new event (starts as DRAFT) */
export async function adminCreateEvent(input: CreateEventInput): Promise<IEvent> {
  return createEventRepo(input);
}

/** Update a DRAFT event — status changes via dedicated endpoints only */
export async function adminUpdateEvent(
  eventId: string,
  input: UpdateEventInput
): Promise<IEvent> {
  const event = await findEventById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
  }
  if (event.status !== EventStatus.DRAFT) {
    throw new BusinessError(
      'Only DRAFT events can be edited',
      409,
      ErrorCode.INVALID_STATE_TRANSITION
    );
  }
  const updated = await updateEventRepo(eventId, input);
  return updated!;
}

/** Publish a DRAFT event → PUBLISHED. Requires ≥1 seat to exist. */
export async function adminPublishEvent(eventId: string): Promise<IEvent> {
  const event = await findEventById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
  }
  if (event.status !== EventStatus.DRAFT) {
    throw new BusinessError(
      `Cannot publish event with status ${event.status}`,
      409,
      ErrorCode.INVALID_STATE_TRANSITION
    );
  }

  const seatCount = await countSeatsByEventId(eventId);
  if (seatCount === 0) {
    throw new BusinessError(
      'Event must have at least one seat before publishing',
      422,
      ErrorCode.INVALID_REQUEST
    );
  }

  const updated = await updateEventStatus(eventId, EventStatus.PUBLISHED);
  return updated!;
}

/** Cancel an event (DRAFT or PUBLISHED → CANCELLED) */
export async function adminCancelEvent(eventId: string): Promise<IEvent> {
  const event = await findEventById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
  }
  if (
    event.status !== EventStatus.DRAFT &&
    event.status !== EventStatus.PUBLISHED
  ) {
    throw new BusinessError(
      `Cannot cancel event with status ${event.status}`,
      409,
      ErrorCode.INVALID_STATE_TRANSITION
    );
  }

  const updated = await updateEventStatus(eventId, EventStatus.CANCELLED);
  return updated!;
}

function isDuplicateKeyError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  if (e.code === 11000) return true;
  if (e.codeName === 'DuplicateKey' || e.codeName === 'DuplicateKeyError') return true;
  if (typeof e.message === 'string' && (e.message.includes('E11000') || e.message.includes('duplicate key') || e.message.includes('DuplicateKey'))) return true;
  if (e.errorResponse && typeof e.errorResponse === 'object' && (e.errorResponse as { code?: number }).code === 11000) return true;
  if (Array.isArray(e.writeErrors) && e.writeErrors.some((we: Record<string, unknown>) => we?.code === 11000)) return true;
  return false;
}

/** Delete a DRAFT event and its seats atomically */
export async function adminDeleteEvent(eventId: string): Promise<void> {
  const event = await findEventById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
  }
  if (event.status !== EventStatus.DRAFT) {
    throw new BusinessError(
      'Only DRAFT events can be deleted',
      409,
      ErrorCode.INVALID_STATE_TRANSITION
    );
  }

  await runInTransaction(async (session) => {
    await deleteSeatsByEventId(eventId, session);
    await deleteEventById(eventId);
  });
}

/** Bulk-create seats for an event. All-or-nothing. */
export async function adminBulkCreateSeats(
  eventId: string,
  input: BulkCreateSeatsInput
): Promise<ISeat[]> {
  const event = await findEventById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found', ErrorCode.EVENT_NOT_FOUND);
  }

  // Validate no duplicate seatNumbers in the request itself
  const seatNumbers = input.seats.map((s) => s.seatNumber);
  const unique = new Set(seatNumbers);
  if (unique.size !== seatNumbers.length) {
    throw new ValidationError('Duplicate seat numbers in request');
  }

  const eventOId = new mongoose.Types.ObjectId(eventId);

  const seatsToCreate = input.seats.map((s) => ({
    eventId: eventOId,
    seatNumber: s.seatNumber,
    // Default to event price if seat-level price not provided
    price: s.price ?? event.price,
    status: SeatStatus.AVAILABLE,
  }));

  try {
    return await bulkCreateSeats(seatsToCreate);
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      throw new ConflictError(
        'One or more seat numbers already exist for this event',
        ErrorCode.SEAT_UNAVAILABLE
      );
    }
    throw err;
  }
}
