import LiveTrip from '../models/LiveTrip.js';
import Bus from '../models/Bus.js';
import Route from '../models/Route.js';
import User from '../models/User.js';
import { createHash } from 'crypto';
import { AppError } from '../utils/errors.js';
import { SEED_ROUTES } from './busService.js';

const MOCK_BUSES = [];
const MOCK_USERS = [];
import { fetchOsrmRoutes, fetchOsrmRouteThroughVia } from './osrmService.js';
import { calculateDistance } from '../utils/geolocation.js';
import { CITY_COORDINATES } from '../data/cityCoordinates.js';

// Live trip in-memory list for mock mode fallback — cleared for Real-Mode Database Activation
export const MOCK_LIVETRIPS = [];

// For backward compatibility
export const MOCK_TRIPS = MOCK_LIVETRIPS;

/**
 * Calculate intermediate stops dynamically from OSRM path coordinates
 */
export const calculateIntermediateStops = (pathCoordinates, sourceName, destinationName, estimatedDuration) => {
  if (!Array.isArray(pathCoordinates) || pathCoordinates.length === 0) {
    return [];
  }

  const srcLower = (sourceName || '').toLowerCase().trim();
  const destLower = (destinationName || '').toLowerCase().trim();
  const matchedStops = [];

  // For each city in the geo-dictionary
  for (const [cityName, [cityLat, cityLng]] of Object.entries(CITY_COORDINATES)) {
    // Skip source and destination cities themselves
    if (cityName === srcLower || cityName === destLower) {
      continue;
    }

    // Find the minimum distance and the index of the closest point along the route path
    let minDistance = Infinity;
    let closestIndex = -1;

    for (let i = 0; i < pathCoordinates.length; i++) {
      const [lat, lng] = pathCoordinates[i];
      const dist = calculateDistance(cityLat, cityLng, lat, lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = i;
      }
    }

    // If the city is within 12.0 km of the highway/route path (covers highway bypasses and tollways)
    if (minDistance < 12.0) {
      matchedStops.push({
        name: cityName.charAt(0).toUpperCase() + cityName.slice(1), // Capitalize
        lat: cityLat,
        lng: cityLng,
        closestIndex,
        minDistance
      });
    }
  }

  // Sort matched stops by the index they appear along the path
  matchedStops.sort((a, b) => a.closestIndex - b.closestIndex);

  // Map to the stops schema and estimate arrival times
  return matchedStops.map((stop, index) => {
    // Estimate arrival time offset relative to the route sequence
    const pathFraction = stop.closestIndex / Math.max(1, pathCoordinates.length - 1);
    const durationOffset = Math.round(pathFraction * (estimatedDuration || 120));
    
    const baseHour = 8;
    const baseMinute = 0;
    const totalMinutes = baseHour * 60 + baseMinute + durationOffset;
    const hrs = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    const arrivalTime = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;

    return {
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
      sequence: index + 2, // Source is 1, so intermediate stops start at 2
      arrivalTime,
      departureTime: arrivalTime,
      isConfirmed: false
    };
  });
};

const formatMinutesToHHMM = (totalMinutes) => {
  const hrs = Math.floor(totalMinutes / 60) % 24;
  const mins = Math.floor(totalMinutes % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const ensureTripStopSchedule = (stops = [], tripStart = new Date(), estimatedDuration = 120) => {
  if (!Array.isArray(stops) || stops.length === 0) return [];
  const sorted = [...stops].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  const startMinutes = tripStart.getHours() * 60 + tripStart.getMinutes();
  const stepMinutes = Math.max(2, Math.round((estimatedDuration || 120) / Math.max(1, sorted.length - 1)));
  let rollingMinutes = startMinutes;

  return sorted.map((stop, idx) => {
    if (idx > 0) rollingMinutes += stepMinutes;
    const fallbackArrival = formatMinutesToHHMM(rollingMinutes);
    const haltMinutes = stop?.isConfirmed === false ? 2 : 3;
    const fallbackDeparture = idx === sorted.length - 1 ? null : formatMinutesToHHMM(rollingMinutes + haltMinutes);
    return {
      ...stop,
      sequence: idx + 1,
      arrivalTime: stop?.arrivalTime || fallbackArrival,
      departureTime: stop?.departureTime || fallbackDeparture
    };
  });
};

const buildRouteSnapshot = (routeObj, source, destination, tripStart) => {
  if (!routeObj) return null;
  const scheduledStops = ensureTripStopSchedule(routeObj.stops || [], tripStart, routeObj.estimatedDuration);
  return {
    routeName: routeObj.routeName || `${source} – ${destination} Express`,
    routeNumber: routeObj.routeNumber || null,
    source: routeObj.source || routeObj.startPoint || source,
    destination: routeObj.destination || routeObj.endPoint || destination,
    estimatedDuration: routeObj.estimatedDuration || 120,
    distanceKm: routeObj.distanceKm || 0,
    pathCoordinates: Array.isArray(routeObj.pathCoordinates) ? routeObj.pathCoordinates : [],
    stops: scheduledStops
  };
};


/**
 * Suggest route templates based on source and destination
 */
export const suggestRouteTemplates = async (source, destination, isDbConnected) => {
  const srcClean = (source || '').trim();
  const destClean = (destination || '').trim();

  if (!srcClean || !destClean) {
    return [];
  }

  const cachedRoutes = isDbConnected
    ? await Route.find({
      $or: [
        {
          source: new RegExp(`^${srcClean}$`, 'i'),
          destination: new RegExp(`^${destClean}$`, 'i')
        },
        {
          startPoint: new RegExp(`^${srcClean}$`, 'i'),
          endPoint: new RegExp(`^${destClean}$`, 'i')
        }
      ]
    })
    : SEED_ROUTES.filter(r =>
      (new RegExp(`^${srcClean}$`, 'i').test(r.source || r.startPoint)) &&
      (new RegExp(`^${destClean}$`, 'i').test(r.destination || r.endPoint))
    );

  let osrmRoutes = [];
  try {
    const alternatives = await fetchOsrmRoutes(srcClean, destClean);
    osrmRoutes = alternatives.map((route) => {
      const hash = createHash('sha1')
        .update(`${srcClean}|${destClean}|${route.distanceMeters}|${route.durationSeconds}|${route.index}`)
        .digest('hex')
        .slice(0, 10);

      const routeNumber = `AUTO-${hash}`;
      const pathCoordinates = Array.isArray(route.geometry?.coordinates)
        ? route.geometry.coordinates.map(([lng, lat]) => [lat, lng])
        : [];

      const durationMin = Math.max(1, Math.round(route.durationSeconds / 60));
      const distanceKm = Number((route.distanceMeters / 1000).toFixed(2));
      
      const intermediateStops = calculateIntermediateStops(pathCoordinates, srcClean, destClean, durationMin);

      const stops = [
        {
          name: srcClean.charAt(0).toUpperCase() + srcClean.slice(1) + ' CBS',
          lat: pathCoordinates[0]?.[0] || 0,
          lng: pathCoordinates[0]?.[1] || 0,
          sequence: 1,
          arrivalTime: '08:00',
          departureTime: '08:05',
          isConfirmed: true
        },
        ...intermediateStops,
        {
          name: destClean.charAt(0).toUpperCase() + destClean.slice(1) + ' CBS',
          lat: pathCoordinates[pathCoordinates.length - 1]?.[0] || 0,
          lng: pathCoordinates[pathCoordinates.length - 1]?.[1] || 0,
          sequence: intermediateStops.length + 2,
          arrivalTime: (() => {
            const baseHour = 8;
            const baseMinute = 0;
            const totalMinutes = baseHour * 60 + baseMinute + durationMin;
            const hrs = Math.floor(totalMinutes / 60) % 24;
            const mins = totalMinutes % 60;
            return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
          })(),
          departureTime: null,
          isConfirmed: true
        }
      ];

      return {
        _id: `dynamic-${routeNumber}`,
        routeName: `${srcClean} – ${destClean} Express`,
        routeNumber,
        startPoint: srcClean,
        endPoint: destClean,
        source: srcClean,
        destination: destClean,
        busNumbers: [],
        stops,
        pathCoordinates,
        distanceKm,
        estimatedDuration: durationMin,
        dataSource: 'osrm'
      };
    });

    // Check if we can dynamically find and generate a diverse via-point detour route!
    if (osrmRoutes.length > 0) {
      const primaryRoute = osrmRoutes[0];
      const primaryCoords = primaryRoute.pathCoordinates;

      const startCoord = primaryCoords[0];
      const endCoord = primaryCoords[primaryCoords.length - 1];

      if (startCoord && endCoord) {
        const directDistance = calculateDistance(startCoord[0], startCoord[1], endCoord[0], endCoord[1]);

        // Find potential via point cities
        const viableVias = [];
        for (const [cityName, [cityLat, cityLng]] of Object.entries(CITY_COORDINATES)) {
          if (cityName === srcClean.toLowerCase() || cityName === destClean.toLowerCase()) {
            continue;
          }

          const distToStart = calculateDistance(cityLat, cityLng, startCoord[0], startCoord[1]);
          const distToEnd = calculateDistance(cityLat, cityLng, endCoord[0], endCoord[1]);
          const totalDetour = distToStart + distToEnd;

          // Must be a reasonable detour ratio
          if (totalDetour >= directDistance * 1.05 && totalDetour <= directDistance * 1.5) {
            // Must not be too close to the primary direct route path
            let minDistanceToPath = Infinity;
            for (let i = 0; i < primaryCoords.length; i++) {
              const d = calculateDistance(cityLat, cityLng, primaryCoords[i][0], primaryCoords[i][1]);
              if (d < minDistanceToPath) minDistanceToPath = d;
            }

            if (minDistanceToPath > 12.0) {
              viableVias.push({
                name: cityName.charAt(0).toUpperCase() + cityName.slice(1),
                lat: cityLat,
                lng: cityLng,
                detourRatio: totalDetour / directDistance
              });
            }
          }
        }

        viableVias.sort((a, b) => a.detourRatio - b.detourRatio);
        const bestVia = viableVias[0];

        if (bestVia) {
          try {
            console.log(`Generating forced alternative route for ${srcClean} -> ${destClean} via ${bestVia.name}`);
            const viaRoute = await fetchOsrmRouteThroughVia(srcClean, bestVia.name, destClean);

            const pathCoordinates = Array.isArray(viaRoute.geometry?.coordinates)
              ? viaRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng])
              : [];

            const durationMin = Math.max(1, Math.round(viaRoute.durationSeconds / 60));
            const distanceKm = Number((viaRoute.distanceMeters / 1000).toFixed(2));
            const intermediateStops = calculateIntermediateStops(pathCoordinates, srcClean, destClean, durationMin);

            const stops = [
              {
                name: srcClean.charAt(0).toUpperCase() + srcClean.slice(1) + ' CBS',
                lat: pathCoordinates[0]?.[0] || 0,
                lng: pathCoordinates[0]?.[1] || 0,
                sequence: 1,
                arrivalTime: '08:00',
                departureTime: '08:05',
                isConfirmed: true
              },
              ...intermediateStops,
              {
                name: destClean.charAt(0).toUpperCase() + destClean.slice(1) + ' CBS',
                lat: pathCoordinates[pathCoordinates.length - 1]?.[0] || 0,
                lng: pathCoordinates[pathCoordinates.length - 1]?.[1] || 0,
                sequence: intermediateStops.length + 2,
                arrivalTime: (() => {
                  const baseHour = 8;
                  const baseMinute = 0;
                  const totalMinutes = baseHour * 60 + baseMinute + durationMin;
                  const hrs = Math.floor(totalMinutes / 60) % 24;
                  const mins = totalMinutes % 60;
                  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
                })(),
                departureTime: null,
                isConfirmed: true
              }
            ];

            const hash = createHash('sha1')
              .update(`${srcClean}|${destClean}|${viaRoute.distanceMeters}|${viaRoute.durationSeconds}|via-${bestVia.name}`)
              .digest('hex')
              .slice(0, 10);

            const routeNumber = `AUTO-${hash}`;

            osrmRoutes.push({
              _id: `dynamic-${routeNumber}`,
              routeName: `${srcClean} – ${destClean} (via ${bestVia.name}) Express`,
              routeNumber,
              startPoint: srcClean,
              endPoint: destClean,
              source: srcClean,
              destination: destClean,
              busNumbers: [],
              stops,
              pathCoordinates,
              distanceKm,
              estimatedDuration: durationMin,
              dataSource: 'osrm'
            });
          } catch (err) {
            console.warn(`Failed to fetch OSRM detour route via ${bestVia.name}:`, err.message);
          }
        }
      }
    }
  } catch (err) {
    console.warn('OSRM route fetch failed:', err.message || err);
  }

  const existingNumbers = new Set(cachedRoutes.map(r => r.routeNumber));
  const uniqueOsrmRoutes = osrmRoutes.filter(r => !existingNumbers.has(r.routeNumber));

  return [...cachedRoutes, ...uniqueOsrmRoutes];
};

/**
 * Start a dynamic live trip session
 */
export const startLiveTrip = async (tripData, isDbConnected) => {
  const { source, destination, driverId, busId, physicalBusId, selectedRouteTemplateId, customRouteDetails } = tripData;

  if (!source || !destination || !driverId) {
    throw new AppError('Please provide source, destination, and driver identification', 400);
  }

  const generatedTripId = `trip-${Date.now()}`;
  const targetBusId = busId || physicalBusId;
  let templateId = null;
  const tripStart = new Date();

  if (customRouteDetails) {
    // Generate a unique route number for this custom-edited route
    const hash = createHash('sha1')
      .update(`${source}|${destination}|${JSON.stringify(customRouteDetails.stops)}|${Date.now()}`)
      .digest('hex')
      .slice(0, 10);
    const routeNumber = `CUSTOM-${hash}`;

    if (isDbConnected) {
      const newRoute = await Route.create({
        routeName: customRouteDetails.routeName || `${source} – ${destination} Custom Express`,
        routeNumber,
        startPoint: source,
        endPoint: destination,
        source,
        destination,
        stops: customRouteDetails.stops,
        pathCoordinates: customRouteDetails.pathCoordinates || [],
        distanceKm: customRouteDetails.distanceKm || 0,
        estimatedDuration: customRouteDetails.estimatedDuration || 120,
        dataSource: 'manual'
      });
      templateId = newRoute._id;
      console.log(`Saved newly custom-edited route to MongoDB: ${newRoute.routeName} (${newRoute.routeNumber})`);
    } else {
      // Mock Mode fallback
      const mockRoute = {
        _id: `custom-${routeNumber}`,
        routeName: customRouteDetails.routeName || `${source} – ${destination} Custom Express`,
        routeNumber,
        startPoint: source,
        endPoint: destination,
        source,
        destination,
        stops: customRouteDetails.stops,
        pathCoordinates: customRouteDetails.pathCoordinates || [],
        distanceKm: customRouteDetails.distanceKm || 0,
        estimatedDuration: customRouteDetails.estimatedDuration || 120,
        dataSource: 'manual'
      };
      SEED_ROUTES.push(mockRoute);
      templateId = mockRoute._id;
      console.log(`Mock: Saved custom-edited route: ${mockRoute.routeName}`);
    }
  }

  if (isDbConnected) {
    let busDoc = null;
    if (targetBusId) {
      busDoc = await Bus.findById(targetBusId).populate('route');
      if (!busDoc) throw new AppError('Timetabled virtual bus not found', 404);
    }

    let routeSnapshot = null;
    if (!templateId) {
      templateId = selectedRouteTemplateId || busDoc?.route?._id || busDoc?.route || null;

      // Check if the selected template is a dynamic route (e.g. dynamic-AUTO-hash)
      if (templateId && typeof templateId === 'string' && templateId.startsWith('dynamic-')) {
        const routeNumber = templateId.replace('dynamic-', '');
        // Check if it already got inserted into the database by another driver
        let existingRoute = await Route.findOne({ routeNumber });
        if (!existingRoute) {
          // Re-generate OSRM routes for this source -> destination to find the matching one
          const alternatives = await suggestRouteTemplates(source, destination, true);
          const matched = alternatives.find(r => r.routeNumber === routeNumber);
          if (matched) {
            // Remove the temporary 'dynamic-' prefix _id so MongoDB assigns a real ObjectId
            const routeToSave = { ...matched };
            delete routeToSave._id;
            
            existingRoute = await Route.create(routeToSave);
            console.log(`Saved dynamic OSRM route to MongoDB: ${existingRoute.routeName} (${existingRoute.routeNumber})`);
          }
        }
        if (existingRoute) {
          templateId = existingRoute._id;
        } else {
          templateId = null;
        }
      }
    }

    let initialLat = 18.5204;
    let initialLng = 73.8567;

    // Resolve initial coords from selectedRouteTemplateId stops if provided
    if (templateId) {
      const routeDoc = await Route.findById(templateId);
      if (routeDoc) {
        routeSnapshot = buildRouteSnapshot(routeDoc.toObject(), source, destination, tripStart);
      }
      if (routeDoc?.stops?.length > 0) {
        const sortedStops = [...routeDoc.stops].sort((a, b) => a.sequence - b.sequence);
        const firstStop = sortedStops[0];
        if (firstStop?.lat && firstStop?.lng && firstStop.lat !== 0 && firstStop.lng !== 0) {
          initialLat = firstStop.lat;
          initialLng = firstStop.lng;
        }
      } else if (routeDoc?.pathCoordinates?.length > 0) {
        const [lat, lng] = routeDoc.pathCoordinates[0];
        if (lat && lng) {
          initialLat = lat;
          initialLng = lng;
        }
      }
    }

    // 2. Create LiveTrip record
    const trip = await LiveTrip.create({
      tripId: generatedTripId,
      source,
      destination,
      driverId,
      physicalBusId: busDoc?._id || null,
      selectedRouteTemplateId: templateId,
      routeSnapshot,
      currentLocation: { lat: initialLat, lng: initialLng },
      pathHistory: [{ lat: initialLat, lng: initialLng, timestamp: new Date() }],
      isActive: true,
      currentStatus: 'active',
      startedAt: tripStart,
      lastUpdatedAt: tripStart
    });

    // 3. Mark virtual timetabled bus status as active
    if (busDoc) {
      busDoc.status = 'active';
      busDoc.currentStatus = 'active';
      busDoc.assignedDriver = driverId;
      busDoc.currentDriver = driverId;
      busDoc.lastUpdated = new Date();
      await busDoc.save();
    }

    return await LiveTrip.findById(trip._id)
      .populate('driverId', 'name employeeId phone')
      .populate('physicalBusId')
      .populate('selectedRouteTemplateId');
  } else {
    // Mock Mode fallback
    const mockDriver = MOCK_USERS.find(u => u._id === driverId) || MOCK_USERS.find(u => u.role === 'driver') || { _id: driverId, name: 'Active Driver' };
    const mockBus = targetBusId ? (MOCK_BUSES.find(b => b._id === targetBusId) || MOCK_BUSES[0]) : null;
    
    let mockRoute = SEED_ROUTES[0];
    if (templateId) {
      mockRoute = SEED_ROUTES.find(r => r._id === templateId) || SEED_ROUTES[0];
    } else if (selectedRouteTemplateId) {
      if (typeof selectedRouteTemplateId === 'string' && selectedRouteTemplateId.startsWith('dynamic-')) {
        const routeNumber = selectedRouteTemplateId.replace('dynamic-', '');
        const alternatives = await suggestRouteTemplates(source, destination, false);
        const matched = alternatives.find(r => r.routeNumber === routeNumber);
        if (matched) {
          mockRoute = matched;
        }
      } else {
        mockRoute = SEED_ROUTES.find(r => r._id === selectedRouteTemplateId) || SEED_ROUTES[0];
      }
    } else if (mockBus?.route) {
      mockRoute = mockBus.route;
    }

    const initialLat = mockRoute?.stops?.[0]?.lat || 18.5204;
    const initialLng = mockRoute?.stops?.[0]?.lng || 73.8567;
    const routeSnapshot = buildRouteSnapshot(mockRoute, source, destination, tripStart);

    const newMockTrip = {
      _id: `mock-ltrip-${Date.now()}`,
      tripId: generatedTripId,
      source,
      destination,
      driverId: mockDriver,
      physicalBusId: mockBus,
      selectedRouteTemplateId: mockRoute,
      routeSnapshot,
      currentLocation: { lat: initialLat, lng: initialLng },
      pathHistory: [
        { lat: initialLat, lng: initialLng, timestamp: new Date() }
      ],
      occupancyLevel: 1,
      speed: 0,
      heading: 0,
      startedAt: tripStart,
      lastUpdatedAt: tripStart,
      isActive: true,
      routeConfidence: 100,
      currentStatus: 'active'
    };

    if (mockBus) {
      mockBus.status = 'active';
      mockBus.currentStatus = 'active';
      mockBus.assignedDriver = mockDriver;
      mockBus.latitude = initialLat;
      mockBus.longitude = initialLng;
      mockBus.lastUpdated = new Date();
    }

    MOCK_LIVETRIPS.push(newMockTrip);
    return newMockTrip;
  }
};

/**
 * End a live trip session
 */
export const endLiveTrip = async (tripId, isDbConnected) => {
  if (isDbConnected) {
    const trip = await LiveTrip.findOne({ tripId, isActive: true });
    if (!trip) {
      // Fallback: check if we can query by Mongoose ObjectId
      const tripByObjId = await LiveTrip.findById(tripId);
      if (!tripByObjId) throw new AppError('Active live trip session not found', 404);
      tripByObjId.isActive = false;
      tripByObjId.currentStatus = 'completed';
      tripByObjId.lastUpdatedAt = new Date();
      await tripByObjId.save();

      // Release bus
      if (tripByObjId.physicalBusId) {
        const bus = await Bus.findById(tripByObjId.physicalBusId);
        if (bus) {
          bus.status = 'inactive';
          bus.currentStatus = 'inactive';
          await bus.save();
        }
      }
      return tripByObjId;
    }

    trip.isActive = false;
    trip.currentStatus = 'completed';
    trip.lastUpdatedAt = new Date();
    await trip.save();

    // Revert associated bus status back to inactive
    if (trip.physicalBusId) {
      const bus = await Bus.findById(trip.physicalBusId);
      if (bus) {
        bus.status = 'inactive';
        bus.currentStatus = 'inactive';
        await bus.save();
      }
    }

    return trip;
  } else {
    // Mock Mode fallback
    const idx = MOCK_LIVETRIPS.findIndex(t => (t.tripId === tripId || t._id === tripId) && t.isActive);
    if (idx === -1) throw new AppError('Active live trip session not found (Mock)', 404);

    MOCK_LIVETRIPS[idx].isActive = false;
    MOCK_LIVETRIPS[idx].currentStatus = 'completed';
    MOCK_LIVETRIPS[idx].lastUpdatedAt = new Date();

    if (MOCK_LIVETRIPS[idx].physicalBusId) {
      const busNum = MOCK_LIVETRIPS[idx].physicalBusId.busNumber;
      const mockBus = MOCK_BUSES.find(b => b.busNumber === busNum);
      if (mockBus) {
        mockBus.status = 'inactive';
        mockBus.currentStatus = 'inactive';
        mockBus.speed = 0;
        mockBus.lastUpdated = new Date();
      }
    }

    return MOCK_LIVETRIPS[idx];
  }
};

/**
 * Update occupancy level for a trip (DRIVER action — always takes immediate priority)
 */
export const updateOccupancy = async (tripId, occupancyLevel, isDbConnected) => {
  const occ = Number(occupancyLevel);
  if (isNaN(occ) || occ < 1 || occ > 4) {
    throw new AppError('Invalid occupancy level. Must be between 1 and 4.', 400);
  }

  const now = new Date();

  if (isDbConnected) {
    const trip = await LiveTrip.findOne({ tripId, isActive: true });
    if (!trip) throw new AppError('Active live trip session not found', 404);

    // Driver always overrides immediately — record occupancy and update priority timestamp
    trip.occupancyLevel = occ;
    trip.driverSetOccupancy = occ;
    trip.driverLastOccupancyUpdate = now;
    trip.lastUpdatedAt = now;
    await trip.save();

    // Also update currentCrowd on physical bus for backward compatibility
    if (trip.physicalBusId) {
      await Bus.findByIdAndUpdate(trip.physicalBusId, {
        currentCrowd: occ,
        lastUpdated: now
      });
    }

    return trip;
  } else {
    const idx = MOCK_LIVETRIPS.findIndex(t => t.tripId === tripId && t.isActive);
    if (idx === -1) throw new AppError('Active live trip session not found (Mock)', 404);

    // Driver always overrides immediately in mock mode too
    MOCK_LIVETRIPS[idx].occupancyLevel = occ;
    MOCK_LIVETRIPS[idx].driverSetOccupancy = occ;
    MOCK_LIVETRIPS[idx].driverLastOccupancyUpdate = now;
    MOCK_LIVETRIPS[idx].lastUpdatedAt = now;

    if (MOCK_LIVETRIPS[idx].physicalBusId) {
      const busNum = MOCK_LIVETRIPS[idx].physicalBusId.busNumber;
      const mockBus = MOCK_BUSES.find(b => b.busNumber === busNum);
      if (mockBus) {
        mockBus.currentCrowd = occ;
        mockBus.lastUpdated = now;
      }
    }

    return MOCK_LIVETRIPS[idx];
  }
};

/**
 * Fetch all active live trips
 */
export const getActiveTrips = async (isDbConnected) => {
  if (isDbConnected) {
    return await LiveTrip.find({ isActive: true })
      .populate('driverId', 'name employeeId phone')
      .populate('physicalBusId')
      .populate('selectedRouteTemplateId');
  } else {
    return MOCK_LIVETRIPS.filter(t => t.isActive);
  }
};

/**
 * Fetch completed trip audit logs
 */
export const getTripHistory = async (isDbConnected) => {
  if (isDbConnected) {
    return await LiveTrip.find({ isActive: false })
      .populate('driverId', 'name employeeId phone')
      .populate('physicalBusId')
      .populate('selectedRouteTemplateId')
      .sort({ lastUpdatedAt: -1 });
  } else {
    return MOCK_LIVETRIPS.filter(t => !t.isActive);
  }
};

/**
 * Get active trip for driver
 */
export const getActiveDriverTrip = async (driverId, isDbConnected) => {
  if (isDbConnected) {
    return await LiveTrip.findOne({ driverId, isActive: true })
      .populate('driverId', 'name employeeId phone')
      .populate('physicalBusId')
      .populate('selectedRouteTemplateId');
  } else {
    return MOCK_LIVETRIPS.find(t => t.driverId._id === driverId && t.isActive) || null;
  }
};

// Priority window: driver's value is authoritative for 10 minutes after they set it
const DRIVER_PRIORITY_WINDOW_MS = 10 * 60 * 1000;

/**
 * Helper: given an array of recent passenger votes, find a level that
 * at least 2 unique passengers agree on. Returns that level or null.
 */
const findPassengerConsensus = (votes) => {
  if (!votes || votes.length < 2) return null;
  // Count votes per level
  const tally = {};
  for (const v of votes) {
    tally[v.vote] = (tally[v.vote] || 0) + 1;
  }
  // Find any level with 2+ agreements
  for (const [level, count] of Object.entries(tally)) {
    if (count >= 2) return Number(level);
  }
  return null;
};

/**
 * Submit or update a passenger occupancy vote for a trip
 * Priority rules:
 *   1. If driver updated within last 10 min → save vote but do NOT change occupancyLevel
 *   2. If driver has been silent for 10+ min:
 *      a. 2+ passengers agree on same level → override occupancyLevel
 *      b. Only 1 passenger voted → keep driver's last known value (driverSetOccupancy)
 */
export const submitPassengerOccupancyVote = async (tripId, passengerId, vote, isDbConnected) => {
  const occ = Number(vote);
  if (isNaN(occ) || occ < 1 || occ > 4) {
    throw new AppError('Invalid occupancy level. Must be between 1 and 4.', 400);
  }

  const voteTimestamp = new Date();
  const now = voteTimestamp.getTime();
  const cutoffTime = new Date(now - 15 * 60 * 1000); // 15-minute vote window

  if (isDbConnected) {
    const trip = await LiveTrip.findOne({ tripId, isActive: true });
    if (!trip) throw new AppError('Active live trip session not found', 404);

    // --- STEP 1: Record the vote (always, regardless of priority) ---
    // Remove this passenger's previous vote and stale votes
    trip.passengerOccupancyVotes = (trip.passengerOccupancyVotes || []).filter(
      v => v.passengerId !== passengerId && v.timestamp >= cutoffTime
    );
    trip.passengerOccupancyVotes.push({ passengerId, vote: occ, timestamp: voteTimestamp });

    // Clean up any remaining stale votes
    trip.passengerOccupancyVotes = trip.passengerOccupancyVotes.filter(
      v => v.timestamp >= cutoffTime
    );

    // --- STEP 2: Determine whether passenger vote can override ---
    const driverUpdatedAt = trip.driverLastOccupancyUpdate ? new Date(trip.driverLastOccupancyUpdate).getTime() : null;
    const driverIsRecent = driverUpdatedAt && (now - driverUpdatedAt) < DRIVER_PRIORITY_WINDOW_MS;

    if (driverIsRecent) {
      // Driver updated recently — preserve driver's value, just save the vote record
      console.log(`[CrowdPriority] Driver updated ${Math.round((now - driverUpdatedAt) / 1000)}s ago — passenger vote recorded but not applied.`);
    } else {
      // Driver has been silent for 10+ minutes — check passenger consensus
      const consensus = findPassengerConsensus(trip.passengerOccupancyVotes);
      if (consensus !== null) {
        // 2+ passengers agree → override
        trip.occupancyLevel = consensus;
        console.log(`[CrowdPriority] 2+ passenger consensus on level ${consensus} — overriding occupancyLevel.`);
      } else {
        // Only 1 vote (or no majority) → keep driver's last known value
        const fallback = trip.driverSetOccupancy || trip.occupancyLevel;
        trip.occupancyLevel = fallback;
        console.log(`[CrowdPriority] No passenger consensus (1 vote) — keeping driver's last value: ${fallback}.`);
      }
    }

    trip.lastUpdatedAt = new Date();
    await trip.save();

    // Update currentCrowd on physical bus for backward compatibility
    if (trip.physicalBusId) {
      await Bus.findByIdAndUpdate(trip.physicalBusId, {
        currentCrowd: trip.occupancyLevel,
        lastUpdated: new Date()
      });
    }

    return trip;
  } else {
    // Mock Mode
    const idx = MOCK_LIVETRIPS.findIndex(t => (t.tripId === tripId || t._id === tripId) && t.isActive);
    if (idx === -1) throw new AppError('Active live trip session not found (Mock)', 404);

    const trip = MOCK_LIVETRIPS[idx];
    if (!trip.passengerOccupancyVotes) trip.passengerOccupancyVotes = [];

    // --- STEP 1: Record the vote ---
    trip.passengerOccupancyVotes = trip.passengerOccupancyVotes.filter(
      v => v.passengerId !== passengerId && new Date(v.timestamp) >= cutoffTime
    );
    trip.passengerOccupancyVotes.push({ passengerId, vote: occ, timestamp: voteTimestamp });
    trip.passengerOccupancyVotes = trip.passengerOccupancyVotes.filter(
      v => new Date(v.timestamp) >= cutoffTime
    );

    // --- STEP 2: Apply priority logic ---
    const driverUpdatedAt = trip.driverLastOccupancyUpdate ? new Date(trip.driverLastOccupancyUpdate).getTime() : null;
    const driverIsRecent = driverUpdatedAt && (now - driverUpdatedAt) < DRIVER_PRIORITY_WINDOW_MS;

    if (!driverIsRecent) {
      const consensus = findPassengerConsensus(trip.passengerOccupancyVotes);
      if (consensus !== null) {
        trip.occupancyLevel = consensus;
      } else {
        trip.occupancyLevel = trip.driverSetOccupancy || trip.occupancyLevel;
      }
    }

    trip.lastUpdatedAt = new Date();

    if (trip.physicalBusId) {
      const busNum = trip.physicalBusId.busNumber;
      const mockBus = MOCK_BUSES.find(b => b.busNumber === busNum);
      if (mockBus) {
        mockBus.currentCrowd = trip.occupancyLevel;
        mockBus.lastUpdated = new Date();
      }
    }

    return trip;
  }
};

/**
 * Register a passenger check-in for a live trip session (DB level tracking)
 */
export const checkInPassenger = async (tripId, passengerId, isDbConnected) => {
  const timestamp = new Date();

  if (isDbConnected) {
    const trip = await LiveTrip.findOne({ tripId, isActive: true });
    if (!trip) throw new AppError('Active live trip session not found', 404);

    // Initialize checkedInPassengers array if not exists
    if (!trip.checkedInPassengers) {
      trip.checkedInPassengers = [];
    }

    // Check if passenger already checked in
    const exists = trip.checkedInPassengers.some(p => p.passengerId === passengerId);
    if (!exists) {
      trip.checkedInPassengers.push({ passengerId, timestamp });
      trip.lastUpdatedAt = new Date();
      await trip.save();
    }
    return trip;
  } else {
    // Mock Mode
    const idx = MOCK_LIVETRIPS.findIndex(t => (t.tripId === tripId || t._id === tripId) && t.isActive);
    if (idx === -1) throw new AppError('Active live trip session not found (Mock)', 404);

    const trip = MOCK_LIVETRIPS[idx];
    if (!trip.checkedInPassengers) {
      trip.checkedInPassengers = [];
    }

    const exists = trip.checkedInPassengers.some(p => p.passengerId === passengerId);
    if (!exists) {
      trip.checkedInPassengers.push({ passengerId, timestamp });
      trip.lastUpdatedAt = new Date();
    }
    return trip;
  }
};

/**
 * Remove a passenger check-in (check-out / stop tracking)
 */
export const checkOutPassenger = async (tripId, passengerId, isDbConnected) => {
  if (isDbConnected) {
    const trip = await LiveTrip.findOne({ tripId, isActive: true });
    if (!trip) throw new AppError('Active live trip session not found', 404);

    if (trip.checkedInPassengers) {
      trip.checkedInPassengers = trip.checkedInPassengers.filter(p => p.passengerId !== passengerId);
      trip.lastUpdatedAt = new Date();
      await trip.save();
    }
    return trip;
  } else {
    // Mock Mode
    const idx = MOCK_LIVETRIPS.findIndex(t => (t.tripId === tripId || t._id === tripId) && t.isActive);
    if (idx === -1) throw new AppError('Active live trip session not found (Mock)', 404);

    const trip = MOCK_LIVETRIPS[idx];
    if (trip.checkedInPassengers) {
      trip.checkedInPassengers = trip.checkedInPassengers.filter(p => p.passengerId !== passengerId);
      trip.lastUpdatedAt = new Date();
    }
    return trip;
  }
};

// For backward compatibility legacy references
export const startTrip = startLiveTrip;
export const endTrip = endLiveTrip;
