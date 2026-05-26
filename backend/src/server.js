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
import { seedRoutesIfEmpty, seedBusesIfEmpty, MOCK_BUSES, SEED_ROUTES } from './controllers/busController.js';
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

// Set up server state variables
app.set('isDbConnected', false);

// Initialize DB and Seeding
const initializeBackend = async () => {
  const isConnected = await connectDB();
  app.set('isDbConnected', isConnected);
  
  if (isConnected) {
    // Seed Database with standard route vectors
    await seedRoutesIfEmpty();
    await seedBusesIfEmpty();
  }
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
    mode: app.get('isDbConnected') ? 'production-database' : 'local-in-memory-mock',
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
server.listen(PORT, () => {
  console.log('🚀 ====================================================');
  console.log(`🚀 TrackBus Server Running on Port ${PORT}`);
  console.log(`🚀 API Base URL: http://localhost:${PORT}/api`);
  console.log('🚀 ====================================================');
});
