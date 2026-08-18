import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { EventQuerySchema } from '../validators/event';
import { CreateReservationSchema } from '../validators/reservation';
import {
  listEventsController,
  getEventController,
  getEventSeatsController,
} from '../controllers/event.controller';
import { createReservationController } from '../controllers/reservation.controller';

const router = Router();

// GET /api/events — public browse (PUBLISHED only)
router.get('/', validate(EventQuerySchema, 'query'), listEventsController);

// GET /api/events/:eventId — public get (PUBLISHED only)
router.get('/:eventId', getEventController);

// GET /api/events/:eventId/seats — public seat list (PUBLISHED event only)
router.get('/:eventId/seats', getEventSeatsController);

// POST /api/events/:eventId/reservations — create reservation (requires auth & Idempotency-Key)
router.post(
  '/:eventId/reservations',
  authenticate,
  validate(CreateReservationSchema),
  createReservationController
);

export default router;
