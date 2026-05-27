import Bus from '../models/Bus.js';
import LiveTrip from '../models/LiveTrip.js';
import { saveLocationLog } from '../services/locationService.js';
import { calculateDistance } from '../utils/geolocation.js';

/**
 * Initialize Socket.IO connection tree and register events.
 */
export const initSocket = (io, app) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // 1. Client requests to monitor a specific bus route room
    socket.on('join-route', (routeId) => {
      socket.join(`route:${routeId}`);
      console.log(`📡 Socket ${socket.id} joined room: route:${routeId}`);
    });

    // 2. Client requests to leave a specific bus route room
    socket.on('leave-route', (routeId) => {
      socket.leave(`route:${routeId}`);
      console.log(`📡 Socket ${socket.id} left room: route:${routeId}`);
    });

    // 3. Driver broadcasts their live telemetric position via WebSocket
    socket.on('driver-location-update', async (data) => {
      // Expected structure: { busNumber, routeId, latitude, longitude, speed, heading, currentCrowd }
      const { busNumber, routeId, latitude, longitude, speed, heading, currentCrowd } = data;
      const timestamp = new Date();

      const payload = {
        busNumber,
        routeId,
        latitude: Number(latitude),
        longitude: Number(longitude),
        speed: Number(speed || 0),
        heading: Number(heading || 0),
        currentCrowd: Number(currentCrowd || 1),
        lastUpdated: timestamp
      };

      try {
        // Locate the bus in database
        let bus = await Bus.findOne({ busNumber });
        if (bus) {
          // Commit coordinates to logs and update core Bus coordinates
          await saveLocationLog(bus._id, {
            latitude,
            longitude,
            speed,
            heading,
            timestamp
          });
          
          // Sync current crowd status
          if (currentCrowd !== undefined) {
            bus.currentCrowd = currentCrowd;
            await bus.save();
          }

          // Sync driver location check-in with LiveTrip
          const activeTrip = await LiveTrip.findOne({ physicalBusId: bus._id, isActive: true });
          if (activeTrip) {
            activeTrip.lastDriverLocationUpdate = timestamp;
            activeTrip.currentLocation = { lat: Number(latitude), lng: Number(longitude) };
            activeTrip.speed = Number(speed || 0);
            activeTrip.heading = Number(heading || 0);
            activeTrip.lastUpdatedAt = timestamp;
            activeTrip.pathHistory.push({ lat: Number(latitude), lng: Number(longitude), timestamp });
            await activeTrip.save();
          }
        }
      } catch (err) {
        console.error('Failed to sync socket telemetry location to DB:', err.message);
      }

      // Broadcast update to all clients listening to this route room
      io.to(`route:${routeId}`).emit('bus-location-changed', payload);
      
      // Also broadcast globally for general map overlays
      io.emit('global-bus-location-changed', payload);
    });

    // ============= PASSENGER EVENTS =============
    
    // Join tracking room for a specific bus
    socket.on('track-bus', (busId) => {
      socket.join(`bus:${busId}`);
      socket.join(`trip:${busId}`);
      console.log(`📍 Socket ${socket.id} is now tracking bus/trip: ${busId}`);
      
      // Send acknowledgment
      socket.emit('tracking-started', { busId, timestamp: new Date() });
    });

    // Passenger reports their live position (Crowd-sourced location sharing)
    socket.on('passenger-location-update', async (data) => {
      // Expected structure: { tripId, passengerId, latitude, longitude, speed, heading, accuracy }
      const { tripId, passengerId, latitude, longitude, speed = 0, heading = 0, accuracy } = data;
      const timestamp = new Date();

      const lat = Number(latitude);
      const lng = Number(longitude);

      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return; // filter bad telemetry

      try {
        let activeTrip = await LiveTrip.findOne({ tripId, isActive: true }).populate('physicalBusId');

        if (!activeTrip) return;

        // Verify coordinate proximity to last known coordinates or stops to filter spam
        const lastKnownLat = activeTrip.currentLocation?.lat || activeTrip.latitude || 0;
        const lastKnownLng = activeTrip.currentLocation?.lng || activeTrip.longitude || 0;

        let isValidProximity = true;
        if (lastKnownLat !== 0 && lastKnownLng !== 0) {
          const dist = calculateDistance(lat, lng, lastKnownLat, lastKnownLng);
          if (dist > 5.0) { // filter coordinate updates further than 5 km away
            console.warn(`⚠️ Passenger coordinate update rejected: too far from last known bus location (${dist.toFixed(2)} km)`);
            isValidProximity = false;
          }
        }

        if (isValidProximity) {
          // Check if driver GPS telemetry is stale (no updates in > 20 seconds).
          // We only fallback if the driver has actually started sending updates (lastDriverLocationUpdate is defined)
          const hasDriverStarted = !!activeTrip.lastDriverLocationUpdate;
          let isDriverStale = false;

          if (hasDriverStarted) {
            const lastDriverUpdate = new Date(activeTrip.lastDriverLocationUpdate).getTime();
            isDriverStale = (Date.now() - lastDriverUpdate) > 20000;
          }

          if (isDriverStale) {
            console.log(`📡 Driver GPS signal stale for trip ${tripId}. Falling back to crowd-sourced passenger updates!`);

            // Inject coordinate update as core bus coordinates
            activeTrip.currentLocation = { lat, lng };
            activeTrip.speed = Number(speed || 0);
            activeTrip.heading = Number(heading || 0);
            activeTrip.lastUpdatedAt = timestamp;
            activeTrip.pathHistory.push({ lat, lng, timestamp });
            await activeTrip.save();

            if (activeTrip.physicalBusId) {
              await Bus.findByIdAndUpdate(activeTrip.physicalBusId._id, {
                latitude: lat,
                longitude: lng,
                speed: Number(speed || 0),
                heading: Number(heading || 0),
                lastUpdated: timestamp
              });
            }

            // Broadcast the location change to everyone tracking this trip!
            const payload = {
              tripId,
              busNumber: activeTrip.physicalBusId?.busNumber || tripId,
              latitude: lat,
              longitude: lng,
              speed: Number(speed || 0),
              heading: Number(heading || 0),
              lastUpdated: timestamp,
              pathHistory: activeTrip.pathHistory || []
            };

            io.to(`bus:${tripId}`).emit('trip-location-changed', payload);
            io.to(`bus:${payload.busNumber}`).emit('bus-location-update', payload); // legacy fallback
            io.emit('global-bus-location-changed', payload);
          }
        }
      } catch (err) {
        console.error('Failed to handle passenger location update:', err.message);
      }
    });

    // Stop tracking a specific bus
    socket.on('untrack-bus', (busId) => {
      socket.leave(`bus:${busId}`);
      console.log(`🛑 Socket ${socket.id} stopped tracking bus: ${busId}`);
    });

    // Join live update room for a specific route
    socket.on('subscribe-route-updates', (routeId) => {
      socket.join(`live-route:${routeId}`);
      console.log(`🎯 Socket ${socket.id} subscribed to route updates: ${routeId}`);
    });

    // Stop subscribing to route updates
    socket.on('unsubscribe-route-updates', (routeId) => {
      socket.leave(`live-route:${routeId}`);
      console.log(`🚫 Socket ${socket.id} unsubscribed from route: ${routeId}`);
    });

    // Subscribe to all nearby buses updates (within a certain radius)
    socket.on('subscribe-nearby-buses', (data) => {
      const { latitude, longitude, radiusKm = 5 } = data;
      const roomId = `nearby:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
      socket.join(roomId);
      socket.currentNearbyRoom = roomId;
      console.log(`🗺️ Socket ${socket.id} subscribed to nearby buses`);
    });

    // Unsubscribe from nearby buses
    socket.on('unsubscribe-nearby-buses', () => {
      if (socket.currentNearbyRoom) {
        socket.leave(socket.currentNearbyRoom);
        console.log(`🗺️ Socket ${socket.id} unsubscribed from nearby buses`);
        delete socket.currentNearbyRoom;
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
};

/**
 * Emit bus location update to all passengers tracking this bus
 * Called from driver location updates
 */
export const broadcastBusLocationToPassengers = (io, busId, locationData) => {
  io.to(`bus:${busId}`).emit('bus-location-update', {
    busId,
    ...locationData,
    timestamp: new Date()
  });
};

/**
 * Emit route-wide updates to all passengers on a route
 */
export const broadcastRouteUpdate = (io, routeId, updateData) => {
  io.to(`live-route:${routeId}`).emit('route-update', {
    routeId,
    ...updateData,
    timestamp: new Date()
  });
};

/**
 * Broadcast trip status changes
 */
export const broadcastTripStatusChange = (io, tripId, status) => {
  io.emit('trip-status-changed', {
    tripId,
    status,
    timestamp: new Date()
  });
};

/**
 * Broadcast crowd level updates
 */
export const broadcastCrowdUpdate = (io, busId, crowdLevel) => {
  io.to(`bus:${busId}`).emit('crowd-update', {
    busId,
    crowdLevel,
    timestamp: new Date()
  });
};

export default initSocket;
