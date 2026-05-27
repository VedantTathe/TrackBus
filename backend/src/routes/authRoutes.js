import express from 'express';
import { register, login, verifyOtp, resendOtp, getProfile, approveDriver } from '../controllers/authController.js';
import { authorize, protect } from '../middleware/authMiddleware.js';
import { validateRegister, validateLogin, validateOtpRequest } from '../middleware/validationMiddleware.js';

const router = express.Router();

// Public auth routes
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/verify-otp', validateOtpRequest, verifyOtp);
router.post('/resend-otp', validateOtpRequest, resendOtp);

// Private profile routes
router.get('/me', protect, getProfile);
router.get('/profile', protect, getProfile); // Backward-compatible alias for existing frontend clients

// Private driver approval route
router.put('/approve-driver', protect, authorize('admin'), approveDriver);

export default router;
