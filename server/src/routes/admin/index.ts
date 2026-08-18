import { Router } from 'express';
import { authenticate, authorizeAdmin } from '../../middleware/auth';
import adminEventRoutes from './events';
import {
  getSystemMetricsController,
  getEventOccupancyController,
  adminRefundBookingController,
  adminGetBookingsController,
  adminGetTransactionsController,
  adminGetUsersController,
} from '../../controllers/admin.controller';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, authorizeAdmin);

// Dashboard Metrics & Occupancy
router.get('/metrics', getSystemMetricsController);
router.get('/events/:eventId/occupancy', getEventOccupancyController);

// Admin Refund Endpoint
router.post('/bookings/:bookingId/refund', adminRefundBookingController);

// Admin Monitoring Endpoints
router.get('/users', adminGetUsersController);
router.get('/bookings', adminGetBookingsController);
router.get('/transactions', adminGetTransactionsController);

// Admin Event & Seat Management
router.use('/events', adminEventRoutes);

export default router;
