import { Router } from 'express';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { SignupSchema, LoginSchema } from '../validators/auth';
import {
  signupController,
  loginController,
  getMeController,
} from '../controllers/auth.controller';

const router = Router();

// POST /api/auth/signup
router.post('/signup', validate(SignupSchema), signupController);

// POST /api/auth/login
router.post('/login', validate(LoginSchema), loginController);

// GET /api/auth/me  — requires valid JWT
router.get('/me', authenticate, getMeController);

export default router;
