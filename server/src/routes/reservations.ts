import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getReservationController,
  cancelReservationController,
} from '../controllers/reservation.controller';

const router = Router();

// All reservation endpoints require authentication
router.use(authenticate);

// GET /api/reservations/:reservationId — lookup reservation (authoritative expiry check)
router.get('/:reservationId', getReservationController);

// DELETE /api/reservations/:reservationId — cancel reservation & release seats
router.delete('/:reservationId', cancelReservationController);

export default router;
