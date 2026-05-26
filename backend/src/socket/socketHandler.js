import Bus from '../models/Bus.js';
import { MOCK_BUSES, SEED_ROUTES } from '../services/busService.js';
import { saveLocationLog } from '../services/locationService.js';

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
      const isDbConnected = app.get('isDbConnected');
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
        if (isDbConnected) {
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
            }, true);
            
            // Sync current crowd status
            if (currentCrowd !== undefined) {
              bus.currentCrowd = currentCrowd;
              await bus.save();
            }
          }
        } else {
          // Sync mock state array coordinates
          const mockBus = MOCK_BUSES.find(b => b.busNumber === busNumber);
          if (mockBus) {
            await saveLocationLog(mockBus._id, {
              latitude,
              longitude,
              speed,
              heading,
              timestamp
            }, false);

            if (currentCrowd !== undefined) {
              mockBus.currentCrowd = currentCrowd;
            }
            mockBus.status = 'active';
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
      console.log(`📍 Socket ${socket.id} is now tracking bus: ${busId}`);
      
      // Send acknowledgment
      socket.emit('tracking-started', { busId, timestamp: new Date() });
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
