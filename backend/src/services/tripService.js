import Trip from '../models/Trip.js';
import Bus from '../models/Bus.js';
import Route from '../models/Route.js';
import User from '../models/User.js';
import { AppError } from '../utils/errors.js';
import { MOCK_BUSES, SEED_ROUTES } from './busService.js';
import { MOCK_USERS } from './authService.js';

export const MOCK_TRIPS = [
  {
    _id: 'mock-trip-101',
    busId: { _id: 'mock-bus-101', busNumber: 'TB-101', routeName: 'Seattle Core Link' },
    driverId: { _id: 'mock-driver-111', name: 'Captain Alex', employeeId: 'driver@trackbus.com' },
    routeId: { _id: '60c72b2f9b1d8b22a8a8e101', routeName: 'Seattle Core Link', routeNumber: '101' },
    startTime: new Date(Date.now() - 3600000), // 1 hour ago
    endTime: null,
    tripStatus: 'active',
    liveLocation: { latitude: 47.6205, longitude: -122.3493, speed: 35, heading: 135, lastUpdated: new Date() }
  }
];

/**
 * Start a live transit trip
 */
export const startTrip = async (tripData, isDbConnected) => {
  const { busId, driverId, routeId } = tripData;

  if (isDbConnected) {
    // 1. Verify bus exists
    const bus = await Bus.findById(busId);
    if (!bus) throw new AppError('Bus node not found in grid inventory', 404);

    // 2. Start Trip record
    const trip = await Trip.create({
      busId,
      driverId,
      routeId,
      tripStatus: 'active',
      startTime: new Date()
    });

    // 3. Mark bus status as active
    bus.status = 'active';
    bus.currentStatus = 'active';
    bus.assignedDriver = driverId;
    bus.currentDriver = driverId;
    await bus.save();

    return await Trip.findById(trip._id)
      .populate('busId')
      .populate('driverId', 'name employeeId phone')
      .populate('routeId');
  } else {
    // Mock Mode fallback
    const mockBus = MOCK_BUSES.find(b => b._id === busId) || MOCK_BUSES[0];
    const mockDriver = MOCK_USERS.find(u => u._id === driverId) || MOCK_USERS[0];
    const mockRoute = SEED_ROUTES.find(r => r._id === routeId) || SEED_ROUTES[0];

    const newMockTrip = {
      _id: `mock-trip-${Date.now()}`,
      busId: mockBus,
      driverId: mockDriver,
      routeId: mockRoute,
      startTime: new Date(),
      endTime: null,
      tripStatus: 'active',
      liveLocation: { latitude: mockBus.latitude || 47.62, longitude: mockBus.longitude || -122.34, speed: 0, heading: 0, lastUpdated: new Date() }
    };

    // Update mock bus to active
    mockBus.status = 'active';
    mockBus.assignedDriver = mockDriver;

    MOCK_TRIPS.push(newMockTrip);
    return newMockTrip;
  }
};

/**
 * End a live transit trip
 */
export const endTrip = async (tripId, isDbConnected) => {
  if (isDbConnected) {
    const trip = await Trip.findById(tripId);
    if (!trip) throw new AppError('Active trip node not found', 404);

    trip.tripStatus = 'completed';
    trip.endTime = new Date();
    await trip.save();

    // Revert bus status back to inactive
    const bus = await Bus.findById(trip.busId);
    if (bus) {
      bus.status = 'inactive';
      bus.currentStatus = 'inactive';
      await bus.save();
    }

    return trip;
  } else {
    // Mock Mode fallback
    const idx = MOCK_TRIPS.findIndex(t => t._id === tripId);
    if (idx === -1) throw new AppError('Active trip node not found (Mock)', 404);

    MOCK_TRIPS[idx].tripStatus = 'completed';
    MOCK_TRIPS[idx].endTime = new Date();

    const mockBus = MOCK_BUSES.find(b => b._id === MOCK_TRIPS[idx].busId._id);
    if (mockBus) {
      mockBus.status = 'inactive';
      mockBus.speed = 0;
    }

    return MOCK_TRIPS[idx];
  }
};

/**
 * Fetch all active trips
 */
export const getActiveTrips = async (isDbConnected) => {
  if (isDbConnected) {
    return await Trip.find({ tripStatus: 'active' })
      .populate('busId')
      .populate('driverId', 'name employeeId phone')
      .populate('routeId');
  } else {
    return MOCK_TRIPS.filter(t => t.tripStatus === 'active');
  }
};

/**
 * Fetch all trip histories
 */
export const getTripHistory = async (isDbConnected) => {
  if (isDbConnected) {
    return await Trip.find({ tripStatus: { $ne: 'active' } })
      .populate('busId')
      .populate('driverId', 'name employeeId phone')
      .populate('routeId')
      .sort({ endTime: -1 });
  } else {
    return MOCK_TRIPS.filter(t => t.tripStatus !== 'active');
  }
};
