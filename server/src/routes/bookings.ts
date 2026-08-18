import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { CreateBookingSchema, BookingQuerySchema } from '../validators/booking';
import {
  createBookingController,
  getBookingController,
  getUserBookingsController,
  cancelBookingController,
} from '../controllers/booking.controller';

const router = Router();

// All booking routes require authentication
router.use(authenticate);

// POST /api/bookings — confirm booking & payment (requires Idempotency-Key)
router.post('/', validate(CreateBookingSchema), createBookingController);

// GET /api/bookings — user booking history
router.get('/', validate(BookingQuerySchema, 'query'), getUserBookingsController);

// GET /api/bookings/:bookingId — single booking details
router.get('/:bookingId', getBookingController);

// DELETE /api/bookings/:bookingId — cancel booking & process atomic wallet refund
router.delete('/:bookingId', cancelBookingController);

export default router;
