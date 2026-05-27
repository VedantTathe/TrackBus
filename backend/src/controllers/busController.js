import { catchAsync } from '../utils/errors.js';
import * as busService from '../services/busService.js';
import Route from '../models/Route.js';
import Bus from '../models/Bus.js';

// Re-export seed variables for server startup references
export { seedRoutesIfEmpty, seedBusesIfEmpty, SEED_ROUTES } from '../services/busService.js';

/**
 * @desc    Create a new bus
 * @route   POST /api/buses
 * @access  Private (Admin Only)
 */
export const createBus = catchAsync(async (req, res, next) => {
  const bus = await busService.createBus(req.body);
  
  res.status(201).json(bus);
});

/**
 * @desc    Get all buses
 * @route   GET /api/buses
 * @access  Private (Admin Only)
 */
export const getBuses = catchAsync(async (req, res, next) => {
  const buses = await busService.getAllBuses();
  
  res.status(200).json(buses);
});

/**
 * @desc    Assign a driver to a bus
 * @route   PUT /api/buses/assign-driver
 * @access  Private (Admin Only)
 */
export const assignDriver = catchAsync(async (req, res, next) => {
  const { busNumber, employeeId } = req.body;
  const updatedBus = await busService.assignDriverToBus(busNumber, employeeId);
  
  res.status(200).json(updatedBus);
});

/**
 * ============================================================================
 * LEGACY / BACKWARD-COMPATIBILITY ENDPOINTS (For existing Frontend/Clients)
 * ============================================================================
 */

/**
 * @desc    Get all routes
 * @route   GET /api/buses/routes
 * @access  Public
 */
export const getRoutes = catchAsync(async (req, res, next) => {
  const { q, search } = req.query;
  const searchVal = (q || search || '').trim();

  if (searchVal) {
    let filterResults = [];
    
    // Check if it's a Source -> Destination search, e.g. "Pune -> Sangli" or "Pune to Sangli"
    const isSourceDestSearch = searchVal.includes('→') || searchVal.toLowerCase().includes(' to ');
    
    if (isSourceDestSearch) {
      const parts = searchVal.includes('→') 
        ? searchVal.split('→') 
        : searchVal.toLowerCase().split(' to ');
        
      const src = parts[0].trim();
      const dest = parts[1].trim();

      filterResults = await Route.find({
        $or: [
          { source: new RegExp(src, 'i'), destination: new RegExp(dest, 'i') },
          { startPoint: new RegExp(src, 'i'), endPoint: new RegExp(dest, 'i') }
        ]
      });
    } else {
      // General unified query sweep: routeName, routeNumber, busNumbers, source, destination, stops
      filterResults = await Route.find({
        $or: [
          { routeName: new RegExp(searchVal, 'i') },
          { routeNumber: new RegExp(searchVal, 'i') },
          { source: new RegExp(searchVal, 'i') },
          { destination: new RegExp(searchVal, 'i') },
          { startPoint: new RegExp(searchVal, 'i') },
          { endPoint: new RegExp(searchVal, 'i') },
          { busNumbers: { $elemMatch: { $regex: new RegExp(searchVal, 'i') } } },
          { 'stops.name': new RegExp(searchVal, 'i') }
        ]
      });
    }
    
    return res.status(200).json(filterResults);
  }

  const routes = await Route.find({});
  res.status(200).json(routes);
});

/**
 * @desc    Get route by ID
 * @route   GET /api/buses/routes/:id
 * @access  Public
 */
export const getRouteById = catchAsync(async (req, res, next) => {
  const routeId = req.params.id;

  const route = await Route.findById(routeId);
  if (!route) {
    return res.status(404).json({ message: 'Route not found' });
  }
  res.status(200).json(route);
});

/**
 * @desc    Get active tracked buses
 * @route   GET /api/buses/active
 * @access  Public
 */
export const getActiveBuses = catchAsync(async (req, res, next) => {
  const buses = await Bus.find({ status: 'active' })
    .populate('route')
    .populate('assignedDriver', 'name');
  
  // Adapt payload to expected frontend format (mapping assignedDriver to driver)
  const adaptedBuses = buses.map(b => {
    const busObj = b.toObject();
    busObj.driver = busObj.assignedDriver || { name: 'Active Driver' };
    return busObj;
  });
  
  res.status(200).json(adaptedBuses);
});

/**
 * @desc    Post update to a bus (driver reporting online status / route binding)
 * @route   POST /api/buses/toggle
 * @access  Private (Driver Only)
 */
export const toggleBusTracking = catchAsync(async (req, res, next) => {
  const updatedBus = await busService.toggleBusTracking(req.user, req.body);
  
  res.status(200).json(updatedBus);
});

/**
 * @desc    Update bus crowd level
 * @route   POST /api/buses/crowd
 * @access  Private
 */
export const updateCrowdStatus = catchAsync(async (req, res, next) => {
  const { busNumber, currentCrowd } = req.body;
  const updatedBus = await busService.updateCrowdStatus(busNumber, currentCrowd);
  
  res.status(200).json(updatedBus);
});

/**
 * @desc    Edit an existing bus
 * @route   PUT /api/buses/:id
 * @access  Private (Admin Only)
 */
export const updateBus = catchAsync(async (req, res, next) => {
  const bus = await busService.editBus(req.params.id, req.body);
  res.status(200).json(bus);
});

/**
 * @desc    Delete a bus
 * @route   DELETE /api/buses/:id
 * @access  Private (Admin Only)
 */
export const removeBus = catchAsync(async (req, res, next) => {
  const deleted = await busService.deleteBus(req.params.id);
  res.status(200).json({ success: true, message: 'Bus removed successfully from fleet roster', deleted });
});

/**
 * @desc    Remove assigned driver from a bus
 * @route   PUT /api/buses/remove-driver
 * @access  Private (Admin Only)
 */
export const removeDriverAssignment = catchAsync(async (req, res, next) => {
  const { busNumber } = req.body;
  const bus = await busService.removeDriverFromBus(busNumber);
  res.status(200).json(bus);
});

/**
 * @desc    Get all active drivers
 * @route   GET /api/buses/active-drivers
 * @access  Private (Admin Only)
 */
export const getActiveDrivers = catchAsync(async (req, res, next) => {
  const list = await busService.getActiveDriversList();
  res.status(200).json(list);
});

/**
 * @desc    Create a new route
 * @route   POST /api/routes
 * @access  Private (Admin Only)
 */
export const addRoute = catchAsync(async (req, res, next) => {
  const route = await busService.createRoute(req.body);
  res.status(201).json(route);
});

/**
 * @desc    Edit a route
 * @route   PUT /api/routes/:id
 * @access  Private (Admin Only)
 */
export const modifyRoute = catchAsync(async (req, res, next) => {
  const route = await busService.editRoute(req.params.id, req.body);
  res.status(200).json(route);
});
