import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
  busId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bus',
    required: [true, 'Bus reference ID is required'],
  },
  latitude: {
    type: Number,
    required: [true, 'Latitude is required'],
  },
  longitude: {
    type: Number,
    required: [true, 'Longitude is required'],
  },
  speed: {
    type: Number,
    required: [true, 'Speed is required'],
    default: 0,
  },
  heading: {
    type: Number,
    required: [true, 'Heading in degrees is required'],
    default: 0,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
  },
});

const Location = mongoose.model('Location', locationSchema);
export default Location;
