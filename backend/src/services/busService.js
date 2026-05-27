import Bus from '../models/Bus.js';
import User from '../models/User.js';
import Route from '../models/Route.js';
import { AppError } from '../utils/errors.js';
import { MOCK_USERS } from './authService.js';

// Pre-seeded MSRTC transit routes — 2 official routes
export const SEED_ROUTES = [
  {
    _id: '60c72b2f9b1d8b22a8a8e303',
    routeName: 'Pune – Sangli Shivshahi',
    routeNumber: '303',
    startPoint: 'Pune',
    endPoint: 'Sangli',
    source: 'Pune',
    destination: 'Sangli',
    busNumbers: [],
    stops: [
      { name: 'Pune Swargate Stand', arrivalTime: '07:00', departureTime: '07:10', lat: 18.5018, lng: 73.8636, sequence: 1, isConfirmed: true },
      { name: 'Satara ST Stand', arrivalTime: '08:35', departureTime: '08:40', lat: 17.6805, lng: 73.9997, sequence: 2, isConfirmed: true },
      { name: 'Karad CBS', arrivalTime: '09:40', departureTime: '09:45', lat: 17.2885, lng: 74.1812, sequence: 3, isConfirmed: false },
      { name: 'Sangli Main ST', arrivalTime: '10:45', departureTime: null, lat: 16.8524, lng: 74.5815, sequence: 4, isConfirmed: true }
    ],
    pathCoordinates: [
      [18.5018, 73.8636],
      [17.6805, 73.9997],
      [17.2885, 74.1812],
      [16.8524, 74.5815]
    ]
  },
  {
    _id: '60c72b2f9b1d8b22a8a8e606',
    routeName: 'Sangli – Kolhapur Ordinary',
    routeNumber: '606',
    startPoint: 'Sangli',
    endPoint: 'Kolhapur',
    source: 'Sangli',
    destination: 'Kolhapur',
    busNumbers: [],
    stops: [
      { name: 'Sangli Main ST', arrivalTime: '08:00', departureTime: '08:05', lat: 16.8524, lng: 74.5815, sequence: 1, isConfirmed: true },
      { name: 'Jaysingpur', arrivalTime: '08:22', departureTime: '08:24', lat: 16.7865, lng: 74.5583, sequence: 2, isConfirmed: false },
      { name: 'Hatkanangale', arrivalTime: '08:40', departureTime: '08:42', lat: 16.7483, lng: 74.4447, sequence: 3, isConfirmed: false },
      { name: 'Kolhapur CBS', arrivalTime: '09:10', departureTime: null, lat: 16.7050, lng: 74.2433, sequence: 4, isConfirmed: true }
    ],
    pathCoordinates: [
      [16.8524, 74.5815],
      [16.7865, 74.5583],
      [16.7483, 74.4447],
      [16.7050, 74.2433]
    ]
  }
];

// Seeded local mock buses for offline/demo fallback — 2 official mock virtual timetabled buses
export const MOCK_BUSES = [
  {
    _id: 'mock-bus-303a',
    busNumber: 'Pune – Sangli Shivshahi [07:00]',
    routeName: 'Pune – Sangli Shivshahi',
    scheduledDepartureTime: '07:00',
    capacity: 45,
    assignedDriver: null,
    status: 'inactive',
    latitude: 18.5018,
    longitude: 73.8636,
    speed: 0,
    heading: 0,
    currentCrowd: 1,
    lastUpdated: new Date()
  },
  {
    _id: 'mock-bus-606a',
    busNumber: 'Sangli – Kolhapur Ordinary [08:00]',
    routeName: 'Sangli – Kolhapur Ordinary',
    scheduledDepartureTime: '08:00',
    capacity: 50,
    assignedDriver: null,
    status: 'inactive',
    latitude: 16.8524,
    longitude: 74.5815,
    speed: 0,
    heading: 0,
    currentCrowd: 1,
    lastUpdated: new Date()
  }
];

export const seedRoutesIfEmpty = async () => {
  try {
    let seededCount = 0;
    for (const route of SEED_ROUTES) {
      const exists = await Route.findOne({ routeNumber: route.routeNumber });
      if (!exists) {
        await Route.create(route);
        seededCount++;
      }
    }
    if (seededCount > 0) {
      console.log(`Seeded exactly ${seededCount} real official MSRTC transit routes.`);
    } else {
      console.log('Official routes already present. Skipping routes seeding.');
    }
  } catch (error) {
    console.error('Failed to seed routes:', error.message);
  }
};

export const seedBusesIfEmpty = async () => {
  try {
    const seedBuses = [
      { busNumber: 'Pune – Sangli Shivshahi [07:00]', routeName: 'Pune – Sangli Shivshahi', scheduledDepartureTime: '07:00', capacity: 45, status: 'inactive', latitude: 18.5018, longitude: 73.8636 },
      { busNumber: 'Sangli – Kolhapur Ordinary [08:00]', routeName: 'Sangli – Kolhapur Ordinary', scheduledDepartureTime: '08:00', capacity: 50, status: 'inactive', latitude: 16.8524, longitude: 74.5815 }
    ];

    let seededCount = 0;
    for (const b of seedBuses) {
      const exists = await Bus.findOne({ busNumber: b.busNumber });
      if (!exists) {
        const matchedRoute = await Route.findOne({ routeName: new RegExp(`^${b.routeName}$`, 'i') });
        await Bus.create({ ...b, route: matchedRoute?._id || null });
        seededCount++;
      }
    }
    if (seededCount > 0) {
      console.log(`Seeded exactly ${seededCount} real official timetabled virtual buses.`);
    } else {
      console.log('Virtual buses already present. Skipping buses seeding.');
    }
  } catch (error) {
    console.error('Failed to seed buses:', error.message);
  }
};

export const createBus = async (busData, isDbConnected) => {
  const { busNumber, routeName, capacity, status, scheduledDepartureTime } = busData;
  if (isDbConnected) {
    const busExists = await Bus.findOne({ busNumber });
    if (busExists) throw new AppError('A bus with this number already exists', 400);
    const matchedRoute = await Route.findOne({ routeName: new RegExp(`^${routeName}$`, 'i') });
    return await Bus.create({ busNumber, routeName, route: matchedRoute?._id || null, capacity, status: status || 'inactive', scheduledDepartureTime });
  } else {
    if (MOCK_BUSES.find(b => b.busNumber.toUpperCase() === busNumber.toUpperCase())) throw new AppError('Bus already exists', 400);
    const routeObj = SEED_ROUTES.find(r => r.routeName.toLowerCase() === routeName.toLowerCase()) || SEED_ROUTES[0];
    const newBus = { _id: `mock-bus-${Date.now()}`, busNumber, routeName, route: routeObj, capacity: Number(capacity), assignedDriver: null, status: status || 'inactive', scheduledDepartureTime, latitude: 0, longitude: 0, speed: 0, heading: 0, currentCrowd: 1, lastUpdated: new Date() };
    MOCK_BUSES.push(newBus);
    return newBus;
  }
};

export const getAllBuses = async (isDbConnected) => {
  if (isDbConnected) return await Bus.find({}).populate('assignedDriver', 'name employeeId phone role');
  return MOCK_BUSES;
};

export const assignDriverToBus = async (busNumber, employeeId, isDbConnected) => {
  if (isDbConnected) {
    const bus = await Bus.findOne({ busNumber });
    if (!bus) throw new AppError('Bus not found', 404);
    const driver = await User.findOne({ employeeId });
    if (!driver) throw new AppError('Driver not found', 404);
    if (driver.role !== 'driver') throw new AppError('Only drivers can be assigned', 400);
    bus.assignedDriver = driver._id;
    await bus.save();
    return await Bus.findById(bus._id).populate('assignedDriver', 'name employeeId phone role');
  } else {
    const idx = MOCK_BUSES.findIndex(b => b.busNumber.toUpperCase() === busNumber.toUpperCase());
    if (idx === -1) throw new AppError('Bus not found', 404);
    const driver = MOCK_USERS.find(u => u.employeeId.toLowerCase() === employeeId.toLowerCase());
    if (!driver) throw new AppError('Driver not found', 404);
    if (driver.role !== 'driver') throw new AppError('Only drivers can be assigned', 400);
    MOCK_BUSES[idx].assignedDriver = { _id: driver._id, name: driver.name, employeeId: driver.employeeId, phone: driver.phone, role: driver.role };
    return MOCK_BUSES[idx];
  }
};

export const toggleBusTracking = async (reqUser, toggleData, isDbConnected) => {
  const { busNumber, routeId, status } = toggleData;
  if (isDbConnected) {
    let bus = await Bus.findOne({ busNumber });
    const matchedRoute = routeId ? await Route.findById(routeId) : await Route.findOne({ routeName: new RegExp('^Pune', 'i') });
    if (!bus) {
      bus = new Bus({ busNumber, routeName: matchedRoute?.routeName || 'Pune – Sangli Express', route: matchedRoute?._id || null, capacity: 50, assignedDriver: reqUser._id, status: status || 'active', latitude: 18.5204, longitude: 73.8567 });
    } else {
      bus.assignedDriver = reqUser._id;
      bus.status = status;
      if (matchedRoute) { bus.route = matchedRoute._id; bus.routeName = matchedRoute.routeName; }
    }
    await bus.save();
    return await Bus.findById(bus._id).populate('route').populate('assignedDriver', 'name');
  } else {
    let mockBus = MOCK_BUSES.find(b => b.busNumber === busNumber);
    const routeObj = routeId ? SEED_ROUTES.find(r => r._id === routeId) : SEED_ROUTES[0];
    if (!mockBus) {
      mockBus = { _id: `mock-bus-${Date.now()}`, busNumber, routeName: routeObj.routeName, route: routeObj, capacity: 50, assignedDriver: { _id: reqUser._id, name: reqUser.name }, status, latitude: 18.5204, longitude: 73.8567, speed: 0, heading: 0, currentCrowd: 1, lastUpdated: new Date() };
      MOCK_BUSES.push(mockBus);
    } else {
      mockBus.status = status;
      mockBus.assignedDriver = { _id: reqUser._id, name: reqUser.name };
      mockBus.route = routeObj;
      mockBus.routeName = routeObj.routeName;
    }
    return mockBus;
  }
};

export const updateCrowdStatus = async (busNumber, currentCrowd, isDbConnected) => {
  if (isDbConnected) {
    const bus = await Bus.findOne({ busNumber });
    if (!bus) throw new AppError('Bus not found', 404);
    bus.currentCrowd = currentCrowd;
    bus.lastUpdated = Date.now();
    await bus.save();
    return bus;
  } else {
    const mockBus = MOCK_BUSES.find(b => b.busNumber === busNumber);
    if (!mockBus) throw new AppError('Bus not found', 404);
    mockBus.currentCrowd = currentCrowd;
    mockBus.lastUpdated = new Date();
    return mockBus;
  }
};

export const editBus = async (busId, updateData, isDbConnected) => {
  const { busNumber, routeName, capacity, status, scheduledDepartureTime } = updateData;
  if (isDbConnected) {
    const matchedRoute = await Route.findOne({ routeName: new RegExp(`^${routeName}$`, 'i') });
    const updated = await Bus.findByIdAndUpdate(busId, { busNumber: busNumber.toUpperCase(), routeName, route: matchedRoute?._id || null, capacity: Number(capacity), status: status || 'inactive', currentStatus: status || 'inactive', scheduledDepartureTime, lastUpdated: Date.now() }, { new: true }).populate('assignedDriver', 'name employeeId phone role');
    if (!updated) throw new AppError('Bus not found', 404);
    return updated;
  } else {
    const idx = MOCK_BUSES.findIndex(b => b._id === busId);
    if (idx === -1) throw new AppError('Bus not found', 404);
    const routeObj = SEED_ROUTES.find(r => r.routeName.toLowerCase() === routeName.toLowerCase()) || SEED_ROUTES[0];
    Object.assign(MOCK_BUSES[idx], { busNumber: busNumber.toUpperCase(), routeName, route: routeObj, capacity: Number(capacity), status: status || 'inactive', scheduledDepartureTime, lastUpdated: new Date() });
    return MOCK_BUSES[idx];
  }
};

export const deleteBus = async (busId, isDbConnected) => {
  if (isDbConnected) {
    const deleted = await Bus.findByIdAndDelete(busId);
    if (!deleted) throw new AppError('Bus not found', 404);
    return deleted;
  } else {
    const idx = MOCK_BUSES.findIndex(b => b._id === busId);
    if (idx === -1) throw new AppError('Bus not found', 404);
    return MOCK_BUSES.splice(idx, 1)[0];
  }
};

export const removeDriverFromBus = async (busNumber, isDbConnected) => {
  if (isDbConnected) {
    const bus = await Bus.findOne({ busNumber: busNumber.toUpperCase() });
    if (!bus) throw new AppError('Bus not found', 404);
    bus.assignedDriver = null;
    bus.currentDriver = null;
    await bus.save();
    return bus;
  } else {
    const idx = MOCK_BUSES.findIndex(b => b.busNumber.toUpperCase() === busNumber.toUpperCase());
    if (idx === -1) throw new AppError('Bus not found', 404);
    MOCK_BUSES[idx].assignedDriver = null;
    return MOCK_BUSES[idx];
  }
};

export const getActiveDriversList = async (isDbConnected) => {
  if (isDbConnected) return await User.find({ role: 'driver' }).select('name employeeId phone role');
  return MOCK_USERS.filter(u => u.role === 'driver');
};

export const createRoute = async (routeData, isDbConnected) => {
  const { routeName, routeNumber, startPoint, endPoint, estimatedDuration, stops, pathCoordinates } = routeData;
  if (isDbConnected) {
    const exists = await Route.findOne({ routeNumber });
    if (exists) throw new AppError('Route number already exists', 400);
    return await Route.create({ routeName, routeNumber, startPoint, endPoint, source: startPoint, destination: endPoint, stops: stops || [], pathCoordinates: pathCoordinates || [[18.5204, 73.8567], [16.8524, 74.5815]], estimatedDuration: Number(estimatedDuration || 120) });
  } else {
    if (SEED_ROUTES.find(r => r.routeNumber === routeNumber)) throw new AppError('Route already exists', 400);
    const newRoute = { _id: `mock-route-${Date.now()}`, routeName, routeNumber, startPoint, endPoint, source: startPoint, destination: endPoint, stops: stops || [], pathCoordinates: pathCoordinates || [[18.5204, 73.8567], [16.8524, 74.5815]], estimatedDuration: Number(estimatedDuration || 120), createdAt: new Date() };
    SEED_ROUTES.push(newRoute);
    return newRoute;
  }
};

export const editRoute = async (routeId, updateData, isDbConnected) => {
  const { routeName, startPoint, endPoint, estimatedDuration, stops } = updateData;
  if (isDbConnected) {
    const updated = await Route.findByIdAndUpdate(routeId, { routeName, startPoint, endPoint, source: startPoint, destination: endPoint, stops: stops || [], estimatedDuration: Number(estimatedDuration || 120) }, { new: true });
    if (!updated) throw new AppError('Route not found', 404);
    return updated;
  } else {
    const idx = SEED_ROUTES.findIndex(r => r._id === routeId);
    if (idx === -1) throw new AppError('Route not found', 404);
    Object.assign(SEED_ROUTES[idx], { routeName, startPoint, endPoint, source: startPoint, destination: endPoint, stops: stops || [], estimatedDuration: Number(estimatedDuration || 120) });
    return SEED_ROUTES[idx];
  }
};
