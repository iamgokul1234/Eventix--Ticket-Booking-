import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { CreateEventSchema, UpdateEventSchema, EventQuerySchema } from '../../validators/event';
import {
  adminListEventsController,
  adminGetEventController,
  adminCreateEventController,
  adminUpdateEventController,
  adminPublishEventController,
  adminCancelEventController,
  adminDeleteEventController,
} from '../../controllers/event.controller';

import adminSeatRoutes from './seats';

const router = Router({ mergeParams: true });
// Note: authenticate + authorizeAdmin are applied at the /admin router level in routes/index.ts

// Seat management under events
router.use('/:eventId/seats', adminSeatRoutes);

// POST /api/admin/events
router.post('/', validate(CreateEventSchema), adminCreateEventController);

// GET /api/admin/events
router.get('/', validate(EventQuerySchema, 'query'), adminListEventsController);

// GET /api/admin/events/:id
router.get('/:id', adminGetEventController);

// PATCH /api/admin/events/:id
router.patch('/:id', validate(UpdateEventSchema), adminUpdateEventController);

// DELETE /api/admin/events/:id
router.delete('/:id', adminDeleteEventController);

// POST /api/admin/events/:id/publish
router.post('/:id/publish', adminPublishEventController);

// POST /api/admin/events/:id/cancel
router.post('/:id/cancel', adminCancelEventController);

export default router;
