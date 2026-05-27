import mongoose from 'mongoose';

const busSchema = new mongoose.Schema({
  busNumber: {
    type: String,
    required: [true, 'Bus number is required'],
    unique: true,
    trim: true,
  },
  routeName: {
    type: String,
    required: [true, 'Route name is required'],
    trim: true,
  },
  scheduledDepartureTime: {
    type: String,
    default: null, // e.g., "06:00" or "16:30"
  },
  route: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    default: null,
  },
  capacity: {
    type: Number,
    required: [true, 'Capacity is required'],
  },
  assignedDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  currentDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'inactive',
  },
  currentStatus: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'inactive',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // Telemetric and crowd status fields to ensure real-time tracking and socket integrations function perfectly
  latitude: {
    type: Number,
    default: 0,
  },
  longitude: {
    type: Number,
    default: 0,
  },
  speed: {
    type: Number,
    default: 0, // in km/h
  },
  heading: {
    type: Number,
    default: 0, // rotation in degrees
  },
  currentCrowd: {
    type: Number,
    enum: [1, 2, 3, 4], // 1: Empty, 2: Seats Available, 3: Standing Room Only, 4: Crowded/Full
    default: 1,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

const Bus = mongoose.model('Bus', busSchema);
export default Bus;
