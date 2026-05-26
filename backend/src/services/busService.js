import Bus from '../models/Bus.js';
import User from '../models/User.js';
import Route from '../models/Route.js';
import { AppError } from '../utils/errors.js';
import { MOCK_USERS } from './authService.js';

// Pre-seeded Indian transit routes
export const SEED_ROUTES = [
  {
    _id: '60c72b2f9b1d8b22a8a8e303',
    routeName: 'Pune – Sangli Express',
    routeNumber: '303',
    startPoint: 'Pune',
    endPoint: 'Sangli',
    source: 'Pune',
    destination: 'Sangli',
    busNumbers: ['MH12-9401', 'MH09-4560'],
    stops: [
      { name: 'Pune Central Bus Stand', arrivalTime: '06:00', departureTime: '06:10', lat: 18.5204, lng: 73.8567, sequence: 1 },
      { name: 'Satara ST Stand', arrivalTime: '07:25', departureTime: '07:35', lat: 17.6805, lng: 73.9997, sequence: 2 },
      { name: 'Karad Junction', arrivalTime: '08:25', departureTime: '08:30', lat: 17.2885, lng: 74.1812, sequence: 3 },
      { name: 'Sangli Main ST', arrivalTime: '09:30', departureTime: null, lat: 16.8524, lng: 74.5815, sequence: 4 }
    ],
    pathCoordinates: [
      [18.5204, 73.8567],[18.2000, 73.9000],[17.9000, 73.9500],
      [17.6805, 73.9997],[17.5000, 74.1000],[17.2885, 74.1812],
      [17.0000, 74.3500],[16.8524, 74.5815]
    ]
  },
  {
    _id: '60c72b2f9b1d8b22a8a8e404',
    routeName: 'Solapur – Pune Fast',
    routeNumber: '404',
    startPoint: 'Solapur',
    endPoint: 'Pune',
    source: 'Solapur',
    destination: 'Pune',
    busNumbers: ['MH13-7702'],
    stops: [
      { name: 'Solapur ST Depot', arrivalTime: '05:40', departureTime: '05:50', lat: 17.6868, lng: 75.9060, sequence: 1 },
      { name: 'Barshi ST', arrivalTime: '06:55', departureTime: '07:05', lat: 18.2312, lng: 75.6939, sequence: 2 },
      { name: 'Pandharpur Stand', arrivalTime: '07:45', departureTime: '07:55', lat: 17.6864, lng: 75.3296, sequence: 3 },
      { name: 'Pune Swargate', arrivalTime: '09:40', departureTime: null, lat: 18.5018, lng: 73.8636, sequence: 4 }
    ],
    pathCoordinates: [
      [17.6868, 75.9060],[17.9000, 75.7000],[18.0000, 75.5500],
      [18.2312, 75.6939],[18.3000, 75.3000],[18.4000, 74.5000],
      [18.5018, 73.8636]
    ]
  },
  {
    _id: '60c72b2f9b1d8b22a8a8e505',
    routeName: 'Kolhapur – Sangli Link',
    routeNumber: '505',
    startPoint: 'Kolhapur',
    endPoint: 'Sangli',
    source: 'Kolhapur',
    destination: 'Sangli',
    busNumbers: ['MH09-3311'],
    stops: [
      { name: 'Kolhapur Central ST', arrivalTime: '08:10', departureTime: '08:20', lat: 16.7050, lng: 74.2433, sequence: 1 },
      { name: 'Miraj Junction', arrivalTime: '09:05', departureTime: '09:15', lat: 16.8256, lng: 74.6593, sequence: 2 },
      { name: 'Sangli Main ST', arrivalTime: '09:35', departureTime: null, lat: 16.8524, lng: 74.5815, sequence: 3 }
    ],
    pathCoordinates: [
      [16.7050, 74.2433],[16.7600, 74.4000],
      [16.8256, 74.6593],[16.8524, 74.5815]
    ]
  },
  {
    _id: '60c72b2f9b1d8b22a8a8e606',
    routeName: 'Sangli – Kolhapur Rapid',
    routeNumber: '606',
    startPoint: 'Sangli',
    endPoint: 'Kolhapur',
    source: 'Sangli',
    destination: 'Kolhapur',
    busNumbers: ['MH10-8899'],
    stops: [
      { name: 'Sangli Main ST', arrivalTime: '10:40', departureTime: '10:50', lat: 16.8524, lng: 74.5815, sequence: 1 },
      { name: 'Vishrambag', arrivalTime: '10:58', departureTime: '11:00', lat: 16.8437, lng: 74.6021, sequence: 2 },
      { name: 'Ankali Phata', arrivalTime: '11:10', departureTime: '11:12', lat: 16.8201, lng: 74.6135, sequence: 3 },
      { name: 'Miraj ST Stand', arrivalTime: '11:22', departureTime: '11:27', lat: 16.8256, lng: 74.6593, sequence: 4 },
      { name: 'Jaysingpur', arrivalTime: '11:42', departureTime: '11:47', lat: 16.7865, lng: 74.5583, sequence: 5 },
      { name: 'Hatkanangale', arrivalTime: '12:02', departureTime: '12:07', lat: 16.7483, lng: 74.4447, sequence: 6 },
      { name: 'Shiroli Phata', arrivalTime: '12:25', departureTime: '12:27', lat: 16.7214, lng: 74.2982, sequence: 7 },
      { name: 'Uchgaon', arrivalTime: '12:35', departureTime: '12:37', lat: 16.7088, lng: 74.2694, sequence: 8 },
      { name: 'Kolhapur Central ST', arrivalTime: '12:48', departureTime: null, lat: 16.7050, lng: 74.2433, sequence: 9 }
    ],
    pathCoordinates: [
      [16.8524, 74.5815],
      [16.8437, 74.6021],
      [16.8201, 74.6135],
      [16.8256, 74.6593],
      [16.7865, 74.5583],
      [16.7483, 74.4447],
      [16.7214, 74.2982],
      [16.7088, 74.2694],
      [16.7050, 74.2433]
    ]
  }
];

// Seeded local mock buses for offline/demo fallback — 4 test buses
export const MOCK_BUSES = [
  {
    _id: 'mock-bus-303a',
    busNumber: 'MH12-9401',
    routeName: 'Pune – Sangli Express',
    capacity: 52,
    assignedDriver: { _id: 'mock-driver-111', name: 'Ravi Patil', employeeId: 'driver@trackbus.com' },
    status: 'active',
    latitude: 18.5204,
    longitude: 73.8567,
    speed: 62,
    heading: 200,
    currentCrowd: 2,
    lastUpdated: new Date()
  },
  {
    _id: 'mock-bus-404a',
    busNumber: 'MH13-7702',
    routeName: 'Solapur – Pune Fast',
    capacity: 45,
    assignedDriver: null,
    status: 'inactive',
    latitude: 17.6868,
    longitude: 75.9060,
    speed: 0,
    heading: 270,
    currentCrowd: 1,
    lastUpdated: new Date()
  },
  {
    _id: 'mock-bus-505a',
    busNumber: 'MH09-3311',
    routeName: 'Kolhapur – Sangli Link',
    capacity: 48,
    assignedDriver: null,
    status: 'inactive',
    latitude: 16.7050,
    longitude: 74.2433,
    speed: 0,
    heading: 90,
    currentCrowd: 1,
    lastUpdated: new Date()
  },
  {
    _id: 'mock-bus-606a',
    busNumber: 'MH10-8899',
    routeName: 'Sangli – Kolhapur Rapid',
    capacity: 50,
    assignedDriver: { _id: 'mock-driver-111', name: 'Ravi Patil', employeeId: 'driver@trackbus.com' },
    status: 'active',
    latitude: 16.8524,
    longitude: 74.5815,
    speed: 55,
    heading: 240,
    currentCrowd: 2,
    lastUpdated: new Date()
  }
];

export const seedRoutesIfEmpty = async () => {
  try {
    const count = await Route.countDocuments();
    if (count === 0) {
      console.log('Seeding Indian transit routes...');
      await Route.insertMany(SEED_ROUTES);
      console.log('Routes seeded: Pune-Sangli, Solapur-Pune, Kolhapur-Sangli, Sangli-Kolhapur');
      return;
    }

    const seedMap = new Map(SEED_ROUTES.map(r => [r.routeNumber, r]));
    const routes = await Route.find({ routeNumber: { $in: Array.from(seedMap.keys()) } });
    const existingNumbers = new Set(routes.map(r => r.routeNumber));
    await Promise.all(routes.map(async (route) => {
      const seed = seedMap.get(route.routeNumber);
      if (!seed) return;
      
      route.routeName = seed.routeName;
      route.startPoint = seed.startPoint;
      route.endPoint = seed.endPoint;
      route.source = seed.source;
      route.destination = seed.destination;
      route.busNumbers = seed.busNumbers;
      route.stops = seed.stops;
      route.pathCoordinates = seed.pathCoordinates;
      await route.save();
    }));

    const missingRoutes = SEED_ROUTES.filter(r => !existingNumbers.has(r.routeNumber));
    if (missingRoutes.length) {
      await Route.insertMany(missingRoutes);
    }
  } catch (error) {
    console.error('Failed to seed routes:', error.message);
  }
};

export const seedBusesIfEmpty = async () => {
  try {
    const seedBuses = [
      { busNumber: 'MH12-9401', routeName: 'Pune – Sangli Express', capacity: 52, status: 'inactive', latitude: 18.5204, longitude: 73.8567 },
      { busNumber: 'MH13-7702', routeName: 'Solapur – Pune Fast', capacity: 45, status: 'inactive', latitude: 17.6868, longitude: 75.9060 },
      { busNumber: 'MH09-3311', routeName: 'Kolhapur – Sangli Link', capacity: 48, status: 'inactive', latitude: 16.7050, longitude: 74.2433 },
      { busNumber: 'MH10-8899', routeName: 'Sangli – Kolhapur Rapid', capacity: 50, status: 'active', latitude: 16.8524, longitude: 74.5815 }
    ];

    const count = await Bus.countDocuments();
    if (count === 0) {
      console.log('Seeding 4 test buses...');
      await Promise.all(seedBuses.map(async (b) => {
        const matchedRoute = await Route.findOne({ routeName: new RegExp(`^${b.routeName}$`, 'i') });
        await Bus.create({ ...b, route: matchedRoute?._id || null });
      }));
      console.log('Test buses seeded.');
      return;
    }

    const seedBusMap = new Map(seedBuses.map(b => [b.busNumber, b]));
    const existing = await Bus.find({ busNumber: { $in: Array.from(seedBusMap.keys()) } });
    const existingNumbers = new Set(existing.map(b => b.busNumber));
    
    await Promise.all(existing.map(async (bus) => {
      const seed = seedBusMap.get(bus.busNumber);
      if (seed) {
        bus.status = seed.status;
        bus.routeName = seed.routeName;
        const matchedRoute = await Route.findOne({ routeName: new RegExp(`^${seed.routeName}$`, 'i') });
        bus.route = matchedRoute?._id || null;
        await bus.save();
      }
    }));

    const missing = seedBuses.filter(b => !existingNumbers.has(b.busNumber));
    if (missing.length) {
      await Promise.all(missing.map(async (b) => {
        const matchedRoute = await Route.findOne({ routeName: new RegExp(`^${b.routeName}$`, 'i') });
        await Bus.create({ ...b, route: matchedRoute?._id || null });
      }));
    }
  } catch (error) {
    console.error('Failed to seed buses:', error.message);
  }
};

export const createBus = async (busData, isDbConnected) => {
  const { busNumber, routeName, capacity, status } = busData;
  if (isDbConnected) {
    const busExists = await Bus.findOne({ busNumber });
    if (busExists) throw new AppError('A bus with this number already exists', 400);
    const matchedRoute = await Route.findOne({ routeName: new RegExp(`^${routeName}$`, 'i') });
    return await Bus.create({ busNumber, routeName, route: matchedRoute?._id || null, capacity, status: status || 'inactive' });
  } else {
    if (MOCK_BUSES.find(b => b.busNumber.toUpperCase() === busNumber.toUpperCase())) throw new AppError('Bus already exists', 400);
    const routeObj = SEED_ROUTES.find(r => r.routeName.toLowerCase() === routeName.toLowerCase()) || SEED_ROUTES[0];
    const newBus = { _id: `mock-bus-${Date.now()}`, busNumber, routeName, route: routeObj, capacity: Number(capacity), assignedDriver: null, status: status || 'inactive', latitude: 0, longitude: 0, speed: 0, heading: 0, currentCrowd: 1, lastUpdated: new Date() };
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
  const { busNumber, routeName, capacity, status } = updateData;
  if (isDbConnected) {
    const matchedRoute = await Route.findOne({ routeName: new RegExp(`^${routeName}$`, 'i') });
    const updated = await Bus.findByIdAndUpdate(busId, { busNumber: busNumber.toUpperCase(), routeName, route: matchedRoute?._id || null, capacity: Number(capacity), status: status || 'inactive', currentStatus: status || 'inactive', lastUpdated: Date.now() }, { new: true }).populate('assignedDriver', 'name employeeId phone role');
    if (!updated) throw new AppError('Bus not found', 404);
    return updated;
  } else {
    const idx = MOCK_BUSES.findIndex(b => b._id === busId);
    if (idx === -1) throw new AppError('Bus not found', 404);
    const routeObj = SEED_ROUTES.find(r => r.routeName.toLowerCase() === routeName.toLowerCase()) || SEED_ROUTES[0];
    Object.assign(MOCK_BUSES[idx], { busNumber: busNumber.toUpperCase(), routeName, route: routeObj, capacity: Number(capacity), status: status || 'inactive', lastUpdated: new Date() });
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
