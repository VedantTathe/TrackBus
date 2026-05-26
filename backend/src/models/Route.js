import mongoose from 'mongoose';

const stopSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  arrivalTime: {
    type: String,
    default: null,
  },
  departureTime: {
    type: String,
    default: null,
  },
  lat: {
    type: Number,
    required: true,
  },
  lng: {
    type: Number,
    required: true,
  },
  sequence: {
    type: Number,
    required: true,
  },
});

const routeSchema = new mongoose.Schema({
  routeName: {
    type: String,
    required: [true, 'Route name is required'],
    trim: true,
  },
  routeNumber: {
    type: String,
    required: [true, 'Route number is required'],
    unique: true,
    trim: true,
  },
  startPoint: {
    type: String,
    required: true,
  },
  endPoint: {
    type: String,
    required: true,
  },
  source: {
    type: String,
    trim: true,
  },
  destination: {
    type: String,
    trim: true,
  },
  busNumbers: {
    type: [String],
    default: [],
  },
  stops: [stopSchema],
  // Array of coordinates [[lat, lng], [lat, lng], ...] representing the full driving path polyline
  pathCoordinates: {
    type: [[Number]],
    default: [],
  },
  estimatedDuration: {
    type: Number,
    default: 120,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Route = mongoose.model('Route', routeSchema);
export default Route;
