import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './middleware';
import routes from './routes';

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  })
);

// Rate limiting (disabled in test environment, relaxed in development)
if (config.nodeEnv !== 'test') {
  const maxRequests = config.nodeEnv === 'development' ? 10000 : config.rateLimit.max;
  console.log(
    `[Rate Limiter] Configured with max: ${maxRequests} requests per ${config.rateLimit.windowMs}ms in NODE_ENV: '${config.nodeEnv}'`
  );

  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Too many requests, please try again later.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
    },
  });
  app.use('/api', limiter);
}

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Routes
app.use('/api', routes);

// 404 handler for unmatched routes
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    errorCode: 'INVALID_REQUEST',
  });
});

// Global error handler (must be last)
app.use(errorHandler);

export default app;
