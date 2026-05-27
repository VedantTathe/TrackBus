import mongoose from 'mongoose';

const liveTripSchema = new mongoose.Schema({
  tripId: {
    type: String,
    required: [true, 'Trip ID is required'],
    unique: true,
  },
  source: {
    type: String,
    required: [true, 'Source is required'],
    trim: true,
  },
  destination: {
    type: String,
    required: [true, 'Destination is required'],
    trim: true,
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Driver ID is required'],
  },
  physicalBusId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bus',
    default: null,
  },
  selectedRouteTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    default: null,
  },
  routeSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  currentLocation: {
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },
  },
  pathHistory: [
    {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      timestamp: { type: Date, default: Date.now },
    },
  ],
  occupancyLevel: {
    type: Number,
    enum: [1, 2, 3, 4], // 1: Empty, 2: Seats Available, 3: Standing Room Only, 4: Crowded/Full
    default: 1,
  },
  driverSetOccupancy: {
    type: Number,
    enum: [1, 2, 3, 4],
    default: null,
  },
  driverLastOccupancyUpdate: {
    type: Date,
    default: null,
  },
  passengerOccupancyVotes: [
    {
      passengerId: { type: String, required: true },
      vote: { type: Number, enum: [1, 2, 3, 4], required: true },
      timestamp: { type: Date, default: Date.now },
    }
  ],
  checkedInPassengers: [
    {
      passengerId: { type: String, required: true },
      timestamp: { type: Date, default: Date.now }
    }
  ],
  lastDriverLocationUpdate: {
    type: Date,
    default: Date.now,
  },
  speed: {
    type: Number,
    default: 0, // in km/h
  },
  heading: {
    type: Number,
    default: 0, // in degrees
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  routeConfidence: {
    type: Number,
    default: 100, // percentage 0-100 of expected route alignment
  },
  currentStatus: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active',
  },
});

const LiveTrip = mongoose.model('LiveTrip', liveTripSchema);
export default LiveTrip;
