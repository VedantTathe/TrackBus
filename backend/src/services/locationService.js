import Location from '../models/Location.js';
import Bus from '../models/Bus.js';
import { AppError } from '../utils/errors.js';

/**
 * Validate and save GPS telemetry data.
 * Updates the active Bus state and creates a record in the Location log history.
 */
export const saveLocationLog = async (busId, telemetryPayload) => {
  const { latitude, longitude, speed, heading, timestamp } = telemetryPayload;
  const time = timestamp ? new Date(timestamp) : new Date();

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
};

/**
 * Retrieve latest logged coordinates for a bus node.
 */
export const getLatestBusLocation = async (busId) => {
  // Check if busId matches standard ObjectId format
  const isObjectId = busId.match(/^[0-9a-fA-F]{24}$/);
  let queryBusId = busId;

  if (!isObjectId) {
    const bus = await Bus.findOne({ busNumber: busId.toUpperCase() });
    if (!bus) return null;
    queryBusId = bus._id;
  }

  return await Location.findOne({ busId: queryBusId }).sort({ timestamp: -1 });
};
