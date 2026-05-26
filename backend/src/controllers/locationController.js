import { catchAsync, AppError } from '../utils/errors.js';
import * as locationService from '../services/locationService.js';
import Bus from '../models/Bus.js';
import { MOCK_BUSES } from '../services/busService.js';

/**
 * @desc    Submit live GPS telemetry update
 * @route   POST /api/location/update
 * @access  Private (Driver Only)
 */
export const updateLocation = catchAsync(async (req, res, next) => {
  const isDbConnected = req.app.get('isDbConnected');
  const userId = req.user._id || req.user.id;
  const { latitude, longitude, speed, heading, busNumber } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return next(new AppError('Please provide latitude and longitude coordinates', 400));
  }

  let bus;

  if (isDbConnected) {
    // 1. Locate bus assigned to driver
    bus = await Bus.findOne({ assignedDriver: userId });

    // Fallback: search by busNumber if sent
    if (!bus && busNumber) {
      bus = await Bus.findOne({ busNumber });
    }
  } else {
    // Mock Fallback: locate assigned mock bus
    bus = MOCK_BUSES.find(b => b.assignedDriver && (b.assignedDriver._id === userId || b.assignedDriver.id === userId));

    // Fallback search by busNumber
    if (!bus && busNumber) {
      bus = MOCK_BUSES.find(b => b.busNumber.toUpperCase() === busNumber.toUpperCase());
    }
  }

  if (!bus) {
    return next(new AppError('No active or assigned bus found for this driver telemetry stream', 404));
  }

  // 2. Commit coordinates to database log history and update core Bus coordinates
  const updatedBus = await locationService.saveLocationLog(bus._id, req.body, isDbConnected);

  // 3. Broadcast real-time Socket.IO telemetry feeds
  const io = req.app.get('io');
  if (io) {
    // Extract route ID for room filtering
    let routeId = '60c72b2f9b1d8b22a8a8e101'; // default backup
    if (updatedBus.route) {
      routeId = updatedBus.route._id || updatedBus.route;
    }

    const payload = {
      busNumber: updatedBus.busNumber,
      routeId: routeId.toString(),
      latitude: Number(latitude),
      longitude: Number(longitude),
      speed: Number(speed || 0),
      heading: Number(heading || 0),
      currentCrowd: Number(updatedBus.currentCrowd || 1),
      lastUpdated: updatedBus.lastUpdated
    };

    // Broadcast specifically to the subscribed route room
    io.to(`route:${payload.routeId}`).emit('bus-location-changed', payload);

    // Broadcast globally for municipal feeds overlay
    io.emit('global-bus-location-changed', payload);
  }

  res.status(200).json({
    success: true,
    message: 'GPS telemetry logged and broadcasted successfully',
    bus: updatedBus
  });
});

/**
 * @desc    Get latest bus location telemetry log
 * @route   GET /api/location/:busId
 * @access  Private (Authenticated Users)
 */
export const getLatestLocation = catchAsync(async (req, res, next) => {
  const { busId } = req.params;
  const isDbConnected = req.app.get('isDbConnected');

  const location = await locationService.getLatestBusLocation(busId, isDbConnected);
  if (!location) {
    return next(new AppError('No location logs found for this vehicle node', 404));
  }

  res.status(200).json(location);
});
