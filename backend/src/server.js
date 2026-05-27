import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import { connectDB } from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import busRoutes from './routes/busRoutes.js';
import locationRoutes from './routes/locationRoutes.js';
import routeRoutes from './routes/routeRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import passengerRoutes from './routes/passengerRoutes.js';
import { seedCitiesIfEmpty } from './services/cityService.js';
import { ensureAdminUser } from './services/authService.js';
import Bus from './models/Bus.js';
import { globalErrorHandler } from './middleware/errorMiddleware.js';
import { initSocket } from './socket/socketHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// Enable Cross-Origin Resource Sharing and JSON Body Parsing
app.use(cors({
  origin: '*', // Allow all client connections
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json());

// Initialize DB and Seeding
const initializeBackend = async () => {
  await connectDB();
  await ensureAdminUser(true);
  // Do not auto-seed routes/buses; routes should come from real driver-created flows.
  await seedCitiesIfEmpty();
};

initializeBackend();

// Mounting API endpoints
app.use('/api/auth', authRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/passenger', passengerRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: 'production-database',
    timestamp: new Date()
  });
});

// Mount Centralized Global Error Handling Middleware (must be registered after all routes)
app.use(globalErrorHandler);

// Configure Socket.IO Real-Time Core
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Attach socket reference globally to express application
app.set('io', io);

// Initialize modular socket event channels
initSocket(io, app);

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
  server.listen(PORT, () => {
    console.log('🚀 ====================================================');
    console.log(`🚀 TrackBus Server Running on Port ${PORT}`);
    console.log(`🚀 API Base URL: http://localhost:${PORT}/api`);
    console.log('🚀 ====================================================');
  });
}

export default app;
