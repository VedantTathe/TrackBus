/**
 * Passenger Routes
 * All public passenger endpoints for viewing buses, routes, and real-time tracking
 */
import express from 'express';
import {
  getNearbyBuses,
  getActiveBuses,
  searchRoutes,
  getRouteDetails,
  getBusDetails,
  getActiveTrips,
  getAllRoutes,
} from '../controllers/passengerController.js';

const router = express.Router();

// Public Routes - No authentication required
// Nearby buses based on user location
router.get('/nearby-buses', getNearbyBuses);

// All active buses on the network
router.get('/active-buses', getActiveBuses);

// Route search and discovery
router.get('/routes/search', searchRoutes);
router.get('/routes/:id', getRouteDetails);
router.get('/routes', getAllRoutes);

// Bus details
router.get('/bus/:id', getBusDetails);

// Active trips
router.get('/active-trips', getActiveTrips);

export default router;
