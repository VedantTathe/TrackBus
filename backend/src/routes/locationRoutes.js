import express from 'express';
import { updateLocation, getLatestLocation } from '../controllers/locationController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Telemetry coordination endpoints
router.post('/update', protect, authorize('driver'), updateLocation);
router.get('/:busId', protect, getLatestLocation);

export default router;
