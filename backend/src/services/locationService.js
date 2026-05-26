import Location from '../models/Location.js';
import Bus from '../models/Bus.js';
import { MOCK_BUSES } from './busService.js';
import { AppError } from '../utils/errors.js';

/**
 * Validate and save GPS telemetry data.
 * Updates the active Bus state and creates a record in the Location log history.
 */
export const saveLocationLog = async (busId, telemetryPayload, isDbConnected) => {
  const { latitude, longitude, speed, heading, timestamp } = telemetryPayload;
  const time = timestamp ? new Date(timestamp) : new Date();

  if (isDbConnected) {
    // 1. Log coordinates in Location history
    const locationLog = await Location.create({
      busId,
      latitude: Number(latitude),
      longitude: Number(longitude),
      speed: Number(speed || 0),
      heading: Number(heading || 0),
      timestamp: time
    });

    // 2. Synchronize active telemetry status on core Bus document
    const updatedBus = await Bus.findByIdAndUpdate(
      busId,
      {
        latitude: Number(latitude),
        longitude: Number(longitude),
        speed: Number(speed || 0),
        heading: Number(heading || 0),
        status: 'active',
        lastUpdated: time
      },
      { new: true }
    ).populate('assignedDriver', 'name employeeId phone role');

    if (!updatedBus) {
      throw new AppError('Bus telemetry sync target not found', 404);
    }

    return updatedBus;
  } else {
    // Mock Telemetry Update Fallback
    const busIndex = MOCK_BUSES.findIndex(b => b._id === busId);
    if (busIndex === -1) {
      throw new AppError('Bus telemetry sync target not found (Mock)', 404);
    }

    MOCK_BUSES[busIndex].latitude = Number(latitude);
    MOCK_BUSES[busIndex].longitude = Number(longitude);
    MOCK_BUSES[busIndex].speed = Number(speed || 0);
    MOCK_BUSES[busIndex].heading = Number(heading || 0);
    MOCK_BUSES[busIndex].status = 'active';
    MOCK_BUSES[busIndex].lastUpdated = time;

    return MOCK_BUSES[busIndex];
  }
};

/**
 * Retrieve latest logged coordinates for a bus node.
 */
export const getLatestBusLocation = async (busId, isDbConnected) => {
  if (isDbConnected) {
    // Check if busId matches standard ObjectId format
    const isObjectId = busId.match(/^[0-9a-fA-F]{24}$/);
    let queryBusId = busId;

    if (!isObjectId) {
      const bus = await Bus.findOne({ busNumber: busId.toUpperCase() });
      if (!bus) return null;
      queryBusId = bus._id;
    }

    return await Location.findOne({ busId: queryBusId }).sort({ timestamp: -1 });
  } else {
    // Mock Mode fallback coordinate extract
    const mockBus = MOCK_BUSES.find(
      b => b._id === busId || b.busNumber.toUpperCase() === busId.toUpperCase()
    );
    if (!mockBus) return null;

    return {
      busId: mockBus._id,
      busNumber: mockBus.busNumber,
      latitude: mockBus.latitude,
      longitude: mockBus.longitude,
      speed: mockBus.speed,
      heading: mockBus.heading,
      timestamp: mockBus.lastUpdated
    };
  }
};
