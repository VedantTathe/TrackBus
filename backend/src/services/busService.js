import Bus from '../models/Bus.js';
import User from '../models/User.js';
import Route from '../models/Route.js';
import { AppError } from '../utils/errors.js';

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

export const createBus = async (busData) => {
  const { busNumber, routeName, capacity, status, scheduledDepartureTime } = busData;
  const busExists = await Bus.findOne({ busNumber });
  if (busExists) throw new AppError('A bus with this number already exists', 400);
  const matchedRoute = await Route.findOne({ routeName: new RegExp(`^${routeName}$`, 'i') });
  return await Bus.create({ busNumber, routeName, route: matchedRoute?._id || null, capacity, status: status || 'inactive', scheduledDepartureTime });
};

export const getAllBuses = async () => {
  return await Bus.find({}).populate('assignedDriver', 'name employeeId phone role');
};

export const assignDriverToBus = async (busNumber, employeeId) => {
  const bus = await Bus.findOne({ busNumber });
  if (!bus) throw new AppError('Bus not found', 404);
  const driver = await User.findOne({ employeeId });
  if (!driver) throw new AppError('Driver not found', 404);
  if (driver.role !== 'driver') throw new AppError('Only drivers can be assigned', 400);
  bus.assignedDriver = driver._id;
  await bus.save();
  return await Bus.findById(bus._id).populate('assignedDriver', 'name employeeId phone role');
};

export const toggleBusTracking = async (reqUser, toggleData) => {
  const { busNumber, routeId, status } = toggleData;
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
};

export const updateCrowdStatus = async (busNumber, currentCrowd) => {
  const bus = await Bus.findOne({ busNumber });
  if (!bus) throw new AppError('Bus not found', 404);
  bus.currentCrowd = currentCrowd;
  bus.lastUpdated = Date.now();
  await bus.save();
  return bus;
};

export const editBus = async (busId, updateData) => {
  const { busNumber, routeName, capacity, status, scheduledDepartureTime } = updateData;
  const matchedRoute = await Route.findOne({ routeName: new RegExp(`^${routeName}$`, 'i') });
  const updated = await Bus.findByIdAndUpdate(busId, { busNumber: busNumber.toUpperCase(), routeName, route: matchedRoute?._id || null, capacity: Number(capacity), status: status || 'inactive', currentStatus: status || 'inactive', scheduledDepartureTime, lastUpdated: Date.now() }, { new: true }).populate('assignedDriver', 'name employeeId phone role');
  if (!updated) throw new AppError('Bus not found', 404);
  return updated;
};

export const deleteBus = async (busId) => {
  const deleted = await Bus.findByIdAndDelete(busId);
  if (!deleted) throw new AppError('Bus not found', 404);
  return deleted;
};

export const removeDriverFromBus = async (busNumber) => {
  const bus = await Bus.findOne({ busNumber: busNumber.toUpperCase() });
  if (!bus) throw new AppError('Bus not found', 404);
  bus.assignedDriver = null;
  bus.currentDriver = null;
  await bus.save();
  return bus;
};

export const getActiveDriversList = async () => {
  return await User.find({ role: 'driver' }).select('name employeeId phone role isApproved');
};

export const createRoute = async (routeData) => {
  const { routeName, routeNumber, startPoint, endPoint, estimatedDuration, stops, pathCoordinates } = routeData;
  const exists = await Route.findOne({ routeNumber });
  if (exists) throw new AppError('Route number already exists', 400);
  return await Route.create({ routeName, routeNumber, startPoint, endPoint, source: startPoint, destination: endPoint, stops: stops || [], pathCoordinates: pathCoordinates || [[18.5204, 73.8567], [16.8524, 74.5815]], estimatedDuration: Number(estimatedDuration || 120) });
};

export const editRoute = async (routeId, updateData) => {
  const { routeName, startPoint, endPoint, estimatedDuration, stops } = updateData;
  const updated = await Route.findByIdAndUpdate(routeId, { routeName, startPoint, endPoint, source: startPoint, destination: endPoint, stops: stops || [], estimatedDuration: Number(estimatedDuration || 120) }, { new: true });
  if (!updated) throw new AppError('Route not found', 404);
  return updated;
};
