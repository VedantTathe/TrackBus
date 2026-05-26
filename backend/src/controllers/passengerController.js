/**
 * Passenger Controller
 * Handles all passenger-specific operations like nearby buses, route search, favorites, etc.
 */
import Bus from '../models/Bus.js';
import Route from '../models/Route.js';
import Trip from '../models/Trip.js';
import User from '../models/User.js';
import {
  calculateDistance,
  formatDistance,
  findNearbyBuses,
  searchRoutes as searchRoutesUtil,
  filterBusesByRoute,
  calculateETA,
  formatCrowdLevel,
  getStatusDisplay,
} from '../utils/geolocation.js';

/**
 * GET /api/passenger/nearby-buses
 * Get buses near user's location
 */
export const getNearbyBuses = async (req, res) => {
  try {
    const { latitude, longitude, radiusKm = 5 } = req.query;

    // Validate coordinates
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'User latitude and longitude are required',
      });
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    const radius = parseFloat(radiusKm) || 5;

    // Validate coordinate ranges
    if (isNaN(userLat) || isNaN(userLon) || userLat < -90 || userLat > 90 || userLon < -180 || userLon > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude',
      });
    }

    // Get active buses with route information
    const buses = await Bus.find({ currentStatus: 'active' }).populate('route').lean();

    // Find nearby buses and enrich with data
    const nearby = findNearbyBuses(buses, userLat, userLon, radius).map((bus) => ({
      id: bus._id,
      busNumber: bus.busNumber,
      routeName: bus.routeName,
      routeNumber: bus.route?.routeNumber || 'N/A',
      distance: formatDistance(bus.distance),
      distanceKm: bus.distance,
      latitude: bus.latitude,
      longitude: bus.longitude,
      speed: bus.speed,
      heading: bus.heading,
      status: getStatusDisplay(bus.currentStatus),
      crowd: formatCrowdLevel(bus.currentCrowd),
      eta: calculateETA(bus.distance, bus.speed),
      lastUpdated: bus.lastUpdated,
      capacity: bus.capacity,
      currentCrowd: bus.currentCrowd,
    }));

    res.status(200).json({
      success: true,
      count: nearby.length,
      data: nearby,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch nearby buses',
      error: error.message,
    });
  }
};

/**
 * GET /api/passenger/active-buses
 * Get all active buses on map
 */
export const getActiveBuses = async (req, res) => {
  try {
    const buses = await Bus.find({ currentStatus: 'active' }).populate('route').lean();

    const activeBuses = buses.map((bus) => ({
      id: bus._id,
      busNumber: bus.busNumber,
      routeName: bus.routeName,
      routeNumber: bus.route?.routeNumber || 'N/A',
      latitude: bus.latitude,
      longitude: bus.longitude,
      speed: bus.speed,
      heading: bus.heading,
      status: getStatusDisplay(bus.currentStatus),
      crowd: formatCrowdLevel(bus.currentCrowd),
      lastUpdated: bus.lastUpdated,
      capacity: bus.capacity,
      currentCrowd: bus.currentCrowd,
    }));

    res.status(200).json({
      success: true,
      count: activeBuses.length,
      data: activeBuses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active buses',
      error: error.message,
    });
  }
};

/**
 * GET /api/passenger/routes/search
 * Search routes by name, number, or stops
 */
export const searchRoutes = async (req, res) => {
  try {
    const { query = '' } = req.query;

    const allRoutes = await Route.find().lean();
    const results = searchRoutesUtil(allRoutes, query);

    const formattedResults = results.map((route) => ({
      id: route._id,
      routeName: route.routeName,
      routeNumber: route.routeNumber,
      startStop: route.startStop,
      endStop: route.endStop,
      distance: route.distance,
      estimatedDuration: route.estimatedDuration,
      stopsCount: route.stops?.length || 0,
      stops: route.stops || [],
    }));

    res.status(200).json({
      success: true,
      count: formattedResults.length,
      data: formattedResults,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to search routes',
      error: error.message,
    });
  }
};

/**
 * GET /api/passenger/routes/:id
 * Get detailed route information
 */
export const getRouteDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const route = await Route.findById(id).lean();

    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Route not found',
      });
    }

    // Get buses on this route
    const buses = await Bus.find({ route: id, currentStatus: 'active' }).lean();

    const routeDetails = {
      id: route._id,
      routeName: route.routeName,
      routeNumber: route.routeNumber,
      startStop: route.startStop,
      endStop: route.endStop,
      distance: route.distance,
      estimatedDuration: route.estimatedDuration,
      stops: route.stops || [],
      stopsCount: route.stops?.length || 0,
      activeBuses: buses.length,
      buses: buses.map((bus) => ({
        id: bus._id,
        busNumber: bus.busNumber,
        status: getStatusDisplay(bus.currentStatus),
        crowd: formatCrowdLevel(bus.currentCrowd),
        speed: bus.speed,
        latitude: bus.latitude,
        longitude: bus.longitude,
      })),
    };

    res.status(200).json({
      success: true,
      data: routeDetails,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch route details',
      error: error.message,
    });
  }
};

/**
 * GET /api/passenger/bus/:id
 * Get detailed bus information with trip details
 */
export const getBusDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const bus = await Bus.findById(id).populate('route').populate('currentDriver').lean();

    if (!bus) {
      return res.status(404).json({
        success: false,
        message: 'Bus not found',
      });
    }

    // Get current active trip
    const activeTrip = await Trip.findOne({
      busId: id,
      tripStatus: 'active',
    }).lean();

    const busDetails = {
      id: bus._id,
      busNumber: bus.busNumber,
      routeName: bus.routeName,
      routeNumber: bus.route?.routeNumber || 'N/A',
      capacity: bus.capacity,
      status: getStatusDisplay(bus.currentStatus),
      crowd: formatCrowdLevel(bus.currentCrowd),
      speed: bus.speed,
      heading: bus.heading,
      latitude: bus.latitude,
      longitude: bus.longitude,
      lastUpdated: bus.lastUpdated,
      route: {
        id: bus.route?._id,
        name: bus.route?.routeName,
        number: bus.route?.routeNumber,
        startStop: bus.route?.startStop,
        endStop: bus.route?.endStop,
        stops: bus.route?.stops || [],
      },
      driver: bus.currentDriver ? {
        id: bus.currentDriver._id,
        name: bus.currentDriver.fullName,
        phone: bus.currentDriver.phone,
        rating: bus.currentDriver.rating,
      } : null,
      activeTrip: activeTrip ? {
        id: activeTrip._id,
        startTime: activeTrip.startTime,
        status: activeTrip.tripStatus,
        location: activeTrip.liveLocation,
      } : null,
    };

    res.status(200).json({
      success: true,
      data: busDetails,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bus details',
      error: error.message,
    });
  }
};

/**
 * GET /api/passenger/active-trips
 * Get currently active/running trips
 */
export const getActiveTrips = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    const trips = await Trip.find({ tripStatus: 'active' })
      .populate('busId')
      .populate('routeId')
      .lean();

    const activeTrips = trips.map((trip) => {
      let distance = null;
      let distanceFormatted = 'N/A';

      if (latitude && longitude) {
        distance = calculateDistance(
          parseFloat(latitude),
          parseFloat(longitude),
          trip.busId.latitude,
          trip.busId.longitude
        );
        distanceFormatted = formatDistance(distance);
      }

      return {
        id: trip._id,
        busNumber: trip.busId.busNumber,
        busId: trip.busId._id,
        routeName: trip.routeId?.routeName,
        routeId: trip.routeId?._id,
        startTime: trip.startTime,
        status: trip.tripStatus,
        distance: distanceFormatted,
        distanceKm: distance,
        eta: distance ? calculateETA(distance, trip.busId.speed) : null,
        location: {
          latitude: trip.busId.latitude,
          longitude: trip.busId.longitude,
          speed: trip.busId.speed,
          heading: trip.busId.heading,
        },
      };
    });

    res.status(200).json({
      success: true,
      count: activeTrips.length,
      data: activeTrips,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active trips',
      error: error.message,
    });
  }
};

/**
 * GET /api/passenger/routes
 * Get all available routes
 */
export const getAllRoutes = async (req, res) => {
  try {
    const routes = await Route.find().lean();

    const formattedRoutes = routes.map((route) => ({
      id: route._id,
      routeName: route.routeName,
      routeNumber: route.routeNumber,
      startStop: route.startStop,
      endStop: route.endStop,
      distance: route.distance,
      estimatedDuration: route.estimatedDuration,
      stopsCount: route.stops?.length || 0,
    }));

    res.status(200).json({
      success: true,
      count: formattedRoutes.length,
      data: formattedRoutes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch routes',
      error: error.message,
    });
  }
};

export default {
  getNearbyBuses,
  getActiveBuses,
  searchRoutes,
  getRouteDetails,
  getBusDetails,
  getActiveTrips,
  getAllRoutes,
};
