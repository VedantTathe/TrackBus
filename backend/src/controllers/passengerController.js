/**
 * Passenger Controller
 * Handles all passenger-specific operations like nearby buses, route search, favorites, etc.
 */
import Bus from '../models/Bus.js';
import City from '../models/City.js';
import Route from '../models/Route.js';
import Trip from '../models/Trip.js';
import User from '../models/User.js';
import LiveTrip from '../models/LiveTrip.js';
import { SEED_ROUTES } from '../services/busService.js';
import { MOCK_LIVETRIPS, submitPassengerOccupancyVote, checkInPassenger, checkOutPassenger } from '../services/tripService.js';
import { loadCitiesFromCsv } from '../services/cityService.js';
import { CITY_COORDINATES } from '../data/cityCoordinates.js';
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

/**
 * GET /api/passenger/search
 * Search corridor journeys including live trips and route templates
 */
export const searchCorridors = async (req, res) => {
  try {
    const isDbConnected = req.app.get('isDbConnected');
    const { from = '', to = '', q = '' } = req.query;

    let routeTemplates = [];
    let activeTrips = [];

    const fromClean = from.trim();
    const toClean = to.trim();
    const qClean = q.trim();

    // 1. Search Route Templates
    if (fromClean && toClean) {
      if (isDbConnected) {
        routeTemplates = await Route.find({
          $or: [
            { source: new RegExp(fromClean, 'i'), destination: new RegExp(toClean, 'i') },
            { startPoint: new RegExp(fromClean, 'i'), endPoint: new RegExp(toClean, 'i') }
          ]
        }).lean();
      } else {
        routeTemplates = SEED_ROUTES.filter(r =>
          (new RegExp(fromClean, 'i').test(r.source || r.startPoint)) &&
          (new RegExp(toClean, 'i').test(r.destination || r.endPoint))
        );
      }
    } else if (qClean) {
      if (isDbConnected) {
        routeTemplates = await Route.find({
          $or: [
            { routeName: new RegExp(qClean, 'i') },
            { routeNumber: new RegExp(qClean, 'i') },
            { source: new RegExp(qClean, 'i') },
            { destination: new RegExp(qClean, 'i') },
            { startPoint: new RegExp(qClean, 'i') },
            { endPoint: new RegExp(qClean, 'i') },
            { 'stops.name': new RegExp(qClean, 'i') }
          ]
        }).lean();
      } else {
        routeTemplates = SEED_ROUTES.filter(r =>
          new RegExp(qClean, 'i').test(r.routeName) ||
          new RegExp(qClean, 'i').test(r.routeNumber) ||
          new RegExp(qClean, 'i').test(r.source || r.startPoint) ||
          new RegExp(qClean, 'i').test(r.destination || r.endPoint) ||
          (r.stops && r.stops.some(s => new RegExp(qClean, 'i').test(s.name)))
        );
      }
    } else {
      if (isDbConnected) {
        routeTemplates = await Route.find().lean();
      } else {
        routeTemplates = SEED_ROUTES;
      }
    }

    // 2. Fetch Active Live Trips
    let allActiveTrips = [];
    if (isDbConnected) {
      allActiveTrips = await LiveTrip.find({ isActive: true })
        .populate('driverId', 'name employeeId phone')
        .populate('physicalBusId')
        .populate('selectedRouteTemplateId')
        .lean();
    } else {
      allActiveTrips = MOCK_LIVETRIPS.filter(t => t.isActive);
    }

    // 3. Filter Active Trips by Corridor / Search Criteria and calculate ETA/Distance
    if (fromClean && toClean) {
      activeTrips = allActiveTrips.filter(trip => {
        const matchesDirectly = (new RegExp(fromClean, 'i').test(trip.source) && new RegExp(toClean, 'i').test(trip.destination));
        
        // Dynamic corridor range match: check if both searched hubs exist in guidance stops sequence
        const stops = trip.selectedRouteTemplateId?.stops || [];
        const fromStopIndex = stops.findIndex(s => new RegExp(fromClean, 'i').test(s.name));
        const toStopIndex = stops.findIndex(s => new RegExp(toClean, 'i').test(s.name));
        const matchesCorridorRange = fromStopIndex !== -1 && toStopIndex !== -1 && fromStopIndex < toStopIndex;

        return matchesDirectly || matchesCorridorRange;
      }).map(trip => {
        // Find coordinates of target destination stop
        let destLat = null;
        let destLng = null;

        const stops = trip.selectedRouteTemplateId?.stops || [];
        const toStop = stops.find(s => new RegExp(toClean, 'i').test(s.name));
        
        if (toStop) {
          destLat = toStop.lat;
          destLng = toStop.lng;
        } else if (stops.length > 0) {
          const lastStop = stops[stops.length - 1];
          destLat = lastStop.lat;
          destLng = lastStop.lng;
        }

        let etaMinutes = null;
        let distanceText = 'N/A';
        let distanceVal = null;

        const tripLat = trip.currentLocation?.lat || trip.latitude;
        const tripLng = trip.currentLocation?.lng || trip.longitude;

        if (destLat && destLng && tripLat && tripLng) {
          distanceVal = calculateDistance(tripLat, tripLng, destLat, destLng);
          distanceText = formatDistance(distanceVal);
          
          // Use current speed if > 10 km/h, otherwise fallback to standard average transit speed (40 km/h)
          const speedVal = trip.speed > 10 ? trip.speed : 40;
          etaMinutes = Math.round((distanceVal / speedVal) * 60);
        }

        return {
          ...trip,
          etaMinutes,
          distanceText,
          distanceKm: distanceVal
        };
      });
    } else if (qClean) {
      activeTrips = allActiveTrips.filter(trip => {
        const busNum = trip.physicalBusId?.busNumber || '';
        const routeName = trip.selectedRouteTemplateId?.routeName || '';
        return (
          new RegExp(qClean, 'i').test(trip.source) ||
          new RegExp(qClean, 'i').test(trip.destination) ||
          new RegExp(qClean, 'i').test(busNum) ||
          new RegExp(qClean, 'i').test(routeName) ||
          (trip.selectedRouteTemplateId && routeTemplates.some(rt => rt._id.toString() === (trip.selectedRouteTemplateId._id || trip.selectedRouteTemplateId).toString()))
        );
      });
    } else {
      activeTrips = allActiveTrips;
    }

    res.status(200).json({
      success: true,
      activeTrips,
      routeTemplates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to search corridor journeys',
      error: error.message
    });
  }
};

/**
 * GET /api/passenger/cities
 * Get all unique city/station names currently present in seeded routes and stops
 */
export const getUniqueCities = async (req, res) => {
  try {
    const isDbConnected = req.app.get('isDbConnected');
    let sortedCities = [];

    if (isDbConnected) {
      const cities = await City.find().sort({ nameLower: 1 }).lean();
      sortedCities = cities.map((city) => city.name);
    } else {
      sortedCities = loadCitiesFromCsv();
    }

    res.status(200).json({
      success: true,
      count: sortedCities.length,
      cities: sortedCities
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unique cities',
      error: error.message
    });
  }
};

export const getCityCoords = async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ success: false, message: 'City name is required' });
    }
    const clean = name.trim().toLowerCase();
    const coords = CITY_COORDINATES[clean];
    if (!coords) {
      return res.status(404).json({ success: false, message: `Coordinates for "${name}" not found.` });
    }
    res.status(200).json({
      success: true,
      name,
      coordinates: { lat: coords[0], lng: coords[1] }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch coordinates', error: error.message });
  }
};

export const submitOccupancyVote = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { passengerId, vote } = req.body;
    const isDbConnected = req.app.get('isDbConnected');

    if (!passengerId || !vote) {
      return res.status(400).json({
        success: false,
        message: 'passengerId and vote are required parameters.'
      });
    }

    const trip = await submitPassengerOccupancyVote(tripId, passengerId, vote, isDbConnected);

    // Broadcast occupancy update via Socket.IO if active
    const io = req.app.get('io');
    if (io) {
      io.emit('trip-occupancy-changed', {
        tripId: trip.tripId,
        occupancyLevel: trip.occupancyLevel
      });
      if (trip.physicalBusId) {
        const busId = trip.physicalBusId._id || trip.physicalBusId;
        io.to(`bus:${busId}`).emit('crowd-update', {
          busId,
          crowdLevel: trip.occupancyLevel
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Occupancy vote recorded successfully.',
      occupancyLevel: trip.occupancyLevel
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to record occupancy vote.',
      error: error.message
    });
  }
};

export const submitPassengerCheckIn = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { passengerId } = req.body;
    const isDbConnected = req.app.get('isDbConnected');

    if (!passengerId) {
      return res.status(400).json({
        success: false,
        message: 'passengerId is required.'
      });
    }

    const trip = await checkInPassenger(tripId, passengerId, isDbConnected);

    // Broadcast passenger check-in to listeners if needed
    const io = req.app.get('io');
    if (io) {
      io.emit('passenger-checked-in', {
        tripId: trip.tripId,
        passengerId,
        checkedInCount: trip.checkedInPassengers ? trip.checkedInPassengers.length : 0
      });
    }

    res.status(200).json({
      success: true,
      message: 'Passenger checked in successfully at DB level.',
      checkedInPassengers: trip.checkedInPassengers || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to register passenger check-in.',
      error: error.message
    });
  }
};

export const submitPassengerCheckOut = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { passengerId } = req.body;
    const isDbConnected = req.app.get('isDbConnected');

    if (!passengerId) {
      return res.status(400).json({
        success: false,
        message: 'passengerId is required.'
      });
    }

    const trip = await checkOutPassenger(tripId, passengerId, isDbConnected);

    // Broadcast passenger check-out to listeners if needed
    const io = req.app.get('io');
    if (io) {
      io.emit('passenger-checked-out', {
        tripId: trip.tripId,
        passengerId,
        checkedInCount: trip.checkedInPassengers ? trip.checkedInPassengers.length : 0
      });
    }

    res.status(200).json({
      success: true,
      message: 'Passenger checked out successfully at DB level.',
      checkedInPassengers: trip.checkedInPassengers || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to register passenger check-out.',
      error: error.message
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
  searchCorridors,
  getUniqueCities,
  getCityCoords,
  submitOccupancyVote,
  submitPassengerCheckIn,
  submitPassengerCheckOut,
};
