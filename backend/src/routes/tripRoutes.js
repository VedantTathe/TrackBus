import express from 'express';
import {
  startLiveTrip,
  endLiveTrip,
  fetchActiveTrips,
  fetchTripHistory
} from '../controllers/tripController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Publicly active visualizer trips list
router.get('/active', fetchActiveTrips);

// Secured trip operational controls
router.post('/start', protect, startLiveTrip);
router.post('/end', protect, endLiveTrip);

// Administrative Audits (Admin Only)
router.get('/history', protect, authorize('admin'), fetchTripHistory);

export default router;
