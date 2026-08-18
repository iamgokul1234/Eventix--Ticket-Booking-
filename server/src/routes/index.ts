import { Router } from 'express';
import authRoutes from './auth';
import eventRoutes from './events';
import walletRoutes from './wallet';
import reservationsRoutes from './reservations';
import bookingsRoutes from './bookings';
import adminRoutes from './admin/index';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    data: { timestamp: new Date().toISOString() },
  });
});

// Public auth
router.use('/auth', authRoutes);

// Public events
router.use('/events', eventRoutes);

// User wallet
router.use('/wallet', walletRoutes);

// User reservations
router.use('/reservations', reservationsRoutes);

// User bookings
router.use('/bookings', bookingsRoutes);

// Admin (authenticate + authorizeAdmin applied inside adminRoutes)
router.use('/admin', adminRoutes);

export default router;
