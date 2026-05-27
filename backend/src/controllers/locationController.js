import { catchAsync, AppError } from '../utils/errors.js';
import Bus from '../models/Bus.js';
import LiveTrip from '../models/LiveTrip.js';
import * as locationService from '../services/locationService.js';

/**
 * @desc    Submit live GPS telemetry update for active LiveTrip
 * @route   POST /api/location/update
 * @access  Private (Driver Only)
 */
export const updateLocation = catchAsync(async (req, res, next) => {
  const userId = req.user._id || req.user.id;
  const { latitude, longitude, speed, heading, busNumber } = req.body;

  if (latitude === undefined || longitude === undefined) {
    return next(new AppError('Please provide latitude and longitude coordinates', 400));
  }

  const latNum = Number(latitude);
  const lngNum = Number(longitude);
  const spdNum = Number(speed || 0);
  const hdgNum = Number(heading || 0);
  const timestamp = new Date();

  // 1. Locate active LiveTrip for driver
  let activeTrip = await LiveTrip.findOne({ driverId: userId, isActive: true })
    .populate('physicalBusId')
    .populate('selectedRouteTemplateId');

  // Fallback: search by busNumber if driver mapping is tricky
  if (!activeTrip && busNumber) {
    const bus = await Bus.findOne({ busNumber });
    if (bus) {
      activeTrip = await LiveTrip.findOne({ physicalBusId: bus._id, isActive: true })
        .populate('physicalBusId')
        .populate('selectedRouteTemplateId');
    }
  }

  if (!activeTrip) {
    return next(new AppError('No active live trip session found for this driver telemetry stream', 404));
  }

  // 2. Commit coordinate update to LiveTrip and push to pathHistory
  if (req.body.resetHistory) {
    activeTrip.pathHistory = [];
    console.log(`🧹 Cleared path history contamination for active trip: ${activeTrip.tripId}`);
  }
  activeTrip.currentLocation = { lat: latNum, lng: lngNum };
  activeTrip.speed = spdNum;
  activeTrip.heading = hdgNum;
  activeTrip.lastUpdatedAt = timestamp;
  activeTrip.pathHistory.push({ lat: latNum, lng: lngNum, timestamp });
  await activeTrip.save();

  // Sync to legacy Bus model if attached, so old clients still show the bus location
  if (activeTrip.physicalBusId) {
    await Bus.findByIdAndUpdate(activeTrip.physicalBusId._id, {
      latitude: latNum,
      longitude: lngNum,
      speed: spdNum,
      heading: hdgNum,
      lastUpdated: timestamp
    });
    // Log location log coordinates in legacy Location logs
    try {
      await locationService.saveLocationLog(activeTrip.physicalBusId._id, {
        latitude: latNum,
        longitude: lngNum,
        speed: spdNum,
        heading: hdgNum,
        timestamp
      });
    } catch (err) {
      console.warn('Failed to log legacy location coordinate:', err.message);
    }
  }

  // 3. Broadcast real-time Socket.IO telemetry feeds
  const io = req.app.get('io');
  if (io) {
    const tripId = activeTrip.tripId;
    const busNum = activeTrip.physicalBusId?.busNumber || busNumber || 'N/A';
    const routeId = activeTrip.selectedRouteTemplateId?._id?.toString() || activeTrip.selectedRouteTemplateId?.toString() || 'mock-route-id';

    const payload = {
      tripId,
      busNumber: busNum,
      routeId,
      latitude: latNum,
      longitude: lngNum,
      currentLocation: activeTrip.currentLocation,
      pathHistory: activeTrip.pathHistory,
      speed: spdNum,
      heading: hdgNum,
      occupancyLevel: activeTrip.occupancyLevel,
      currentCrowd: activeTrip.occupancyLevel, // backward compatibility
      lastUpdated: timestamp
    };

    // Broadcast to trip-specific room
    io.to(`trip:${tripId}`).emit('trip-location-changed', payload);

    // Broadcast to legacy route room
    io.to(`route:${routeId}`).emit('bus-location-changed', payload);

    // Broadcast specifically to the bus-tracking room (backward compatibility)
    if (activeTrip.physicalBusId) {
      const busId = activeTrip.physicalBusId._id?.toString() || activeTrip.physicalBusId?.toString();
      io.to(`bus:${busId}`).emit('bus-location-update', {
        busId,
        busNumber: busNum,
        latitude: latNum,
        longitude: lngNum,
        speed: spdNum,
        heading: hdgNum,
        currentCrowd: activeTrip.occupancyLevel,
        timestamp
      });
    }

    // Broadcast globally for municipal overlays
    io.emit('global-bus-location-changed', payload);
  }

  res.status(200).json({
    success: true,
    message: 'GPS telemetry logged and broadcasted successfully',
    trip: activeTrip
  });
});

/**
 * @desc    Get latest bus location telemetry log
 * @route   GET /api/location/:busId
 * @access  Private (Authenticated Users)
 */
export const getLatestLocation = catchAsync(async (req, res, next) => {
  const { busId } = req.params;

  const location = await locationService.getLatestBusLocation(busId);
  if (!location) {
    return next(new AppError('No location logs found for this vehicle node', 404));
  }

  res.status(200).json(location);
});
