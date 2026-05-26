import { catchAsync } from '../utils/errors.js';
import * as tripService from '../services/tripService.js';

/**
 * @desc    Start a live driving trip
 * @route   POST /api/trips/start
 * @access  Private (Admin / Driver Clearance)
 */
export const startLiveTrip = catchAsync(async (req, res, next) => {
  const isDbConnected = req.app.get('isDbConnected');
  const trip = await tripService.startTrip(req.body, isDbConnected);
  
  res.status(201).json(trip);
});

/**
 * @desc    End a live driving trip
 * @route   POST /api/trips/end
 * @access  Private (Admin / Driver Clearance)
 */
export const endLiveTrip = catchAsync(async (req, res, next) => {
  const { tripId } = req.body;
  const isDbConnected = req.app.get('isDbConnected');
  const trip = await tripService.endTrip(tripId, isDbConnected);

  res.status(200).json(trip);
});

/**
 * @desc    Get all active live trips
 * @route   GET /api/trips/active
 * @access  Public
 */
export const fetchActiveTrips = catchAsync(async (req, res, next) => {
  const isDbConnected = req.app.get('isDbConnected');
  const list = await tripService.getActiveTrips(isDbConnected);

  res.status(200).json(list);
});

/**
 * @desc    Get complete ended trip audit logs
 * @route   GET /api/trips/history
 * @access  Private (Admin Only)
 */
export const fetchTripHistory = catchAsync(async (req, res, next) => {
  const isDbConnected = req.app.get('isDbConnected');
  const list = await tripService.getTripHistory(isDbConnected);

  res.status(200).json(list);
});
