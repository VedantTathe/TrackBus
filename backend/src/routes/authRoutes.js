import express from 'express';
import { register, login, verifyOtp, resendOtp, getProfile, approveDriver } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { validateRegister, validateLogin } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Public auth routes
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);

// Private profile routes
router.get('/me', protect, getProfile);
router.get('/profile', protect, getProfile); // Backward-compatible alias for existing frontend clients

// Private driver approval route
router.put('/approve-driver', approveDriver);

export default router;
