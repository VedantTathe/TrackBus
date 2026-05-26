import mongoose from 'mongoose';

const tripSchema = new mongoose.Schema({
  busId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bus',
    required: [true, 'Bus reference is required'],
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Driver reference is required'],
  },
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: [true, 'Route reference is required'],
  },
  startTime: {
    type: Date,
    default: Date.now,
    required: true,
  },
  endTime: {
    type: Date,
    default: null,
  },
  tripStatus: {
    type: String,
    enum: ['scheduled', 'active', 'completed', 'cancelled'],
    default: 'active',
    required: true,
  },
  liveLocation: {
    latitude: { type: Number, default: 0 },
    longitude: { type: Number, default: 0 },
    speed: { type: Number, default: 0 },
    heading: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  }
});

const Trip = mongoose.model('Trip', tripSchema);
export default Trip;
