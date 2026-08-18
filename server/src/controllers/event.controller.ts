import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import {
  listEvents,
  getPublicEvent,
  getEventSeats,
  adminListEvents,
  adminGetEvent,
  adminCreateEvent,
  adminUpdateEvent,
  adminPublishEvent,
  adminCancelEvent,
  adminDeleteEvent,
  adminBulkCreateSeats,
} from '../services/event.service';
import {
  CreateEventInput,
  UpdateEventInput,
  EventQueryInput,
  BulkCreateSeatsInput,
} from '../validators/event';

// ─── Public ───────────────────────────────────────────────────────────────────

export async function listEventsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.query as unknown as EventQueryInput;
    const result = await listEvents(query);
    sendSuccess(res, result, 'Events fetched');
  } catch (err) {
    next(err);
  }
}

export async function getEventController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const event = await getPublicEvent(req.params.eventId);
    sendSuccess(res, { event }, 'Event fetched');
  } catch (err) {
    next(err);
  }
}

export async function getEventSeatsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const seats = await getEventSeats(req.params.eventId);
    sendSuccess(res, { seats }, 'Seats fetched');
  } catch (err) {
    next(err);
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export async function adminListEventsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.query as unknown as EventQueryInput;
    const result = await adminListEvents(query);
    sendSuccess(res, result, 'Events fetched');
  } catch (err) {
    next(err);
  }
}

export async function adminGetEventController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const event = await adminGetEvent(req.params.id);
    sendSuccess(res, { event }, 'Event fetched');
  } catch (err) {
    next(err);
  }
}

export async function adminCreateEventController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = req.body as CreateEventInput;
    const event = await adminCreateEvent(input);
    sendSuccess(res, { event }, 'Event created', 201);
  } catch (err) {
    next(err);
  }
}

export async function adminUpdateEventController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = req.body as UpdateEventInput;
    const event = await adminUpdateEvent(req.params.id, input);
    sendSuccess(res, { event }, 'Event updated');
  } catch (err) {
    next(err);
  }
}

export async function adminPublishEventController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const event = await adminPublishEvent(req.params.id);
    sendSuccess(res, { event }, 'Event published');
  } catch (err) {
    next(err);
  }
}

export async function adminCancelEventController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const event = await adminCancelEvent(req.params.id);
    sendSuccess(res, { event }, 'Event cancelled');
  } catch (err) {
    next(err);
  }
}

export async function adminDeleteEventController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await adminDeleteEvent(req.params.id);
    sendSuccess(res, null, 'Event deleted');
  } catch (err) {
    next(err);
  }
}

export async function adminBulkCreateSeatsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = req.body as BulkCreateSeatsInput;
    const seats = await adminBulkCreateSeats(req.params.eventId, input);
    sendSuccess(res, { seats, count: seats.length }, 'Seats created', 201);
  } catch (err) {
    next(err);
  }
}
