import express from 'express';
import {
  startLiveTrip,
  endLiveTrip,
  fetchActiveTrips,
  fetchTripHistory,
  updateTripOccupancy,
  suggestRoutes,
  fetchActiveDriverTrip
} from '../controllers/tripController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public route template suggestions
router.get('/suggest-routes', suggestRoutes);

// Publicly active visualizer trips list
router.get('/active', fetchActiveTrips);

// Secured driver trip operational controls
router.post('/start', protect, authorize('driver', 'admin'), startLiveTrip);
router.post('/end', protect, authorize('driver', 'admin'), endLiveTrip);
router.post('/occupancy', protect, authorize('driver', 'admin'), updateTripOccupancy);
router.get('/driver/active', protect, authorize('driver', 'admin'), fetchActiveDriverTrip);

// Administrative Audits (Admin Only)
router.get('/history', protect, authorize('admin'), fetchTripHistory);

export default router;
