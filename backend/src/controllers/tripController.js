import { catchAsync, AppError } from '../utils/errors.js';
import * as tripService from '../services/tripService.js';
import LiveTrip from '../models/LiveTrip.js';

/**
 * @desc    Suggest route templates for start trip guidance
 * @route   GET /api/trips/suggest-routes
 * @access  Public
 */
export const suggestRoutes = catchAsync(async (req, res, next) => {
  const { source, destination } = req.query;

  const suggestions = await tripService.suggestRouteTemplates(source, destination, true);
  res.status(200).json(suggestions);
});

/**
 * @desc    Start a live transit trip
 * @route   POST /api/trips/start
 * @access  Private (Admin / Driver Clearance)
 */
export const startLiveTrip = catchAsync(async (req, res, next) => {
  const driverId = req.user._id || req.user.id;

  const tripData = {
    source: req.body.source,
    destination: req.body.destination,
    busId: req.body.busId,
    selectedRouteTemplateId: req.body.selectedRouteTemplateId,
    physicalBusId: req.body.physicalBusId,
    customRouteDetails: req.body.customRouteDetails,
    driverId
  };

  const trip = await tripService.startLiveTrip(tripData, true);

  // Broadcast status update via Socket.IO
  const io = req.app.get('io');
  if (io) {
    io.emit('trip-status-changed', {
      tripId: trip.tripId,
      status: 'active',
      trip
    });
  }

  res.status(201).json(trip);
});

/**
 * @desc    End an active live trip
 * @route   POST /api/trips/end
 * @access  Private (Admin / Driver Clearance)
 */
export const endLiveTrip = catchAsync(async (req, res, next) => {
  const driverId = req.user._id || req.user.id;

  let tripId = req.body.tripId;

  // If tripId is not specified, auto-detect active trip for driver
  if (!tripId) {
    const activeTrip = await tripService.getActiveDriverTrip(driverId, true);
    if (!activeTrip) {
      return next(new AppError('No active live trip session found for this driver to end', 404));
    }
    tripId = activeTrip.tripId;
  }

  const trip = await tripService.endLiveTrip(tripId, true);

  // Broadcast status update via Socket.IO
  const io = req.app.get('io');
  if (io) {
    io.emit('trip-status-changed', {
      tripId: trip.tripId,
      status: 'completed',
      trip
    });
  }

  res.status(200).json(trip);
});

/**
 * @desc    Update active trip occupancy level
 * @route   POST /api/trips/occupancy
 * @access  Private (Driver Only)
 */
export const updateTripOccupancy = catchAsync(async (req, res, next) => {
  const driverId = req.user._id || req.user.id;
  const { occupancyLevel } = req.body;
  let tripId = req.body.tripId;

  // Auto-detect active trip if not passed
  if (!tripId) {
    const activeTrip = await tripService.getActiveDriverTrip(driverId, true);
    if (!activeTrip) {
      return next(new AppError('No active live trip session found for this driver', 404));
    }
    tripId = activeTrip.tripId;
  }

  const trip = await tripService.updateOccupancy(tripId, occupancyLevel, true);

  // Broadcast occupancy update via Socket.IO
  const io = req.app.get('io');
  if (io) {
    io.emit('trip-occupancy-changed', {
      tripId: trip.tripId,
      occupancyLevel: trip.occupancyLevel
    });
    // For legacy tracking compatibility
    if (trip.physicalBusId) {
      const busNumber = trip.physicalBusId.busNumber || trip.physicalBusId;
      io.emit('crowd-update', {
        busId: trip.physicalBusId._id || trip.physicalBusId,
        busNumber,
        crowdLevel: trip.occupancyLevel
      });
    }
  }

  res.status(200).json(trip);
});

/**
 * @desc    Get a specific active live trip by tripId or document id
 * @route   GET /api/trips/:tripId
 * @access  Public
 */
export const fetchActiveTripById = catchAsync(async (req, res, next) => {
  const { tripId } = req.params;

  // Build query: always search by tripId string; only include _id lookup if param
  // looks like a valid MongoDB ObjectId (24 hex chars) to avoid CastError 400s.
  const isObjectId = /^[a-f\d]{24}$/i.test(tripId);
  const query = isObjectId
    ? { isActive: true, $or: [{ tripId }, { _id: tripId }] }
    : { isActive: true, tripId };

  const trip = await LiveTrip.findOne(query)
    .populate('driverId', 'name employeeId phone')
    .populate('physicalBusId')
    .populate('selectedRouteTemplateId');

  if (!trip) {
    return next(new AppError('Active live trip session not found', 404));
  }

  res.status(200).json({
    success: true,
    data: trip
  });
});

/**
 * @desc    Get all active live trips
 * @route   GET /api/trips/active
 * @access  Public
 */
export const fetchActiveTrips = catchAsync(async (req, res, next) => {
  const list = await tripService.getActiveTrips(true);

  res.status(200).json({
    success: true,
    count: list.length,
    data: list
  });
});

/**
 * @desc    Get complete ended trip audit logs
 * @route   GET /api/trips/history
 * @access  Private (Admin Only)
 */
export const fetchTripHistory = catchAsync(async (req, res, next) => {
  const list = await tripService.getTripHistory(true);

  res.status(200).json(list);
});

/**
 * @desc    Get active trip for currently logged-in driver
 * @route   GET /api/trips/driver/active
 * @access  Private (Driver Only)
 */
export const fetchActiveDriverTrip = catchAsync(async (req, res, next) => {
  const driverId = req.user._id || req.user.id;

  const trip = await tripService.getActiveDriverTrip(driverId, true);
  res.status(200).json(trip);
});
