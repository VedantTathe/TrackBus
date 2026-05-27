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
  searchCorridors,
  getUniqueCities,
  getCityCoords,
  submitOccupancyVote,
  submitPassengerCheckIn,
  submitPassengerCheckOut,
} from '../controllers/passengerController.js';

const router = express.Router();

// Public Routes - No authentication required
router.get('/cities', getUniqueCities);
router.get('/cities/coords', getCityCoords);

// Crowd-sourced occupancy polling
router.post('/trips/:tripId/occupancy-vote', submitOccupancyVote);

// Passenger DB-level onboarding check-in / check-out
router.post('/trips/:tripId/check-in', submitPassengerCheckIn);
router.post('/trips/:tripId/check-out', submitPassengerCheckOut);

// New unified search for Live Trips and Route Templates
router.get('/search', searchCorridors);

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
