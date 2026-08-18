import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import {
  createReservation,
  getReservation,
  cancelReservation,
} from '../services/reservation.service';
import { CreateReservationInput } from '../validators/reservation';
import { ValidationError } from '../utils/errors';

export async function createReservationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new ValidationError('Idempotency-Key header is required');
    }

    const { seatIds } = req.body as CreateReservationInput;
    const result = await createReservation(
      req.user!.userId,
      req.params.eventId,
      seatIds,
      idempotencyKey
    );

    sendSuccess(res, result, 'Reservation created successfully', 201);
  } catch (err) {
    next(err);
  }
}

export async function getReservationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await getReservation(req.user!.userId, req.params.reservationId);
    sendSuccess(res, result, 'Reservation details fetched');
  } catch (err) {
    next(err);
  }
}

export async function cancelReservationController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await cancelReservation(req.user!.userId, req.params.reservationId);
    sendSuccess(res, null, 'Reservation cancelled successfully');
  } catch (err) {
    next(err);
  }
}
