import { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '../utils/response';
import { ValidationError } from '../utils/errors';
import {
  getSystemMetrics,
  getEventOccupancy,
  adminGetBookings,
  adminGetTransactions,
  adminGetUsers,
} from '../services/admin.service';
import { adminRefundBooking } from '../services/booking.service';
import { BookingStatus, WalletTransactionType, WalletReferenceType, WalletTransactionStatus } from '../constants/enums';

export async function getSystemMetricsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const metrics = await getSystemMetrics();
    sendSuccess(res, metrics, 'System metrics fetched successfully');
  } catch (err) {
    next(err);
  }
}

export async function getEventOccupancyController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { eventId } = req.params;
    const occupancy = await getEventOccupancy(eventId);
    sendSuccess(res, occupancy, 'Event occupancy details fetched successfully');
  } catch (err) {
    next(err);
  }
}

export async function adminRefundBookingController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idempotencyKey = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) {
      throw new ValidationError('Idempotency-Key header is required');
    }

    const adminUserId = req.user!.userId;
    const { bookingId } = req.params;

    const result = await adminRefundBooking(adminUserId, bookingId, idempotencyKey);
    sendSuccess(res, result, 'Admin refund processed successfully');
  } catch (err) {
    next(err);
  }
}

export async function adminGetBookingsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId, eventId, status, page, limit } = req.query;

    const filter = {
      userId: userId as string | undefined,
      eventId: eventId as string | undefined,
      status: status as BookingStatus | undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    };

    const data = await adminGetBookings(filter);
    sendSuccess(res, data, 'Admin bookings fetched successfully');
  } catch (err) {
    next(err);
  }
}

export async function adminGetTransactionsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId, type, referenceType, status, startDate, endDate, page, limit } = req.query;

    const filter = {
      userId: userId as string | undefined,
      type: type as WalletTransactionType | undefined,
      referenceType: referenceType as WalletReferenceType | undefined,
      status: status as WalletTransactionStatus | undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    };

    const data = await adminGetTransactions(filter);
    sendSuccess(res, data, 'Admin transactions fetched successfully');
  } catch (err) {
    next(err);
  }
}

export async function adminGetUsersController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const data = await adminGetUsers(page, limit);
    sendSuccess(res, data, 'Admin users fetched successfully');
  } catch (err) {
    next(err);
  }
}
