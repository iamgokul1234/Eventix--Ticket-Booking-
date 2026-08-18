import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { BulkCreateSeatsSchema } from '../../validators/event';
import { adminBulkCreateSeatsController } from '../../controllers/event.controller';

const router = Router({ mergeParams: true });
// Note: authenticate + authorizeAdmin applied at /admin router level

// POST /api/admin/events/:eventId/seats/bulk
router.post('/bulk', validate(BulkCreateSeatsSchema), adminBulkCreateSeatsController);

export default router;
