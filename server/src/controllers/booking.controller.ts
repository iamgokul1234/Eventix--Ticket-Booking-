import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import {
  createBooking,
  getBookingById,
  getUserBookings,
  cancelBooking,
} from '../services/booking.service';
import { CreateBookingInput, BookingQueryInput } from '../validators/booking';
import { ValidationError } from '../utils/errors';

export async function createBookingController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new ValidationError('Idempotency-Key header is required');
    }

    const { reservationId } = req.body as CreateBookingInput;
    const result = await createBooking(
      req.user!.userId,
      reservationId,
      idempotencyKey
    );

    sendSuccess(res, result, 'Booking confirmed successfully', 201);
  } catch (err) {
    next(err);
  }
}

export async function getBookingController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await getBookingById(req.user!.userId, req.params.bookingId);
    sendSuccess(res, result, 'Booking details fetched');
  } catch (err) {
    next(err);
  }
}

export async function getUserBookingsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.query as unknown as BookingQueryInput;
    const history = await getUserBookings(req.user!.userId, query.page, query.limit);
    sendSuccess(res, history, 'User bookings fetched');
  } catch (err) {
    next(err);
  }
}

export async function cancelBookingController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new ValidationError('Idempotency-Key header is required');
    }

    const result = await cancelBooking(
      req.user!.userId,
      req.params.bookingId,
      idempotencyKey
    );
    sendSuccess(res, result, 'Booking cancelled and refund processed');
  } catch (err) {
    next(err);
  }
}
