import mongoose from 'mongoose';

const citySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'City name is required'],
    trim: true,
  },
  nameLower: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  state: {
    type: String,
    default: 'Maharashtra',
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const City = mongoose.model('City', citySchema);
export default City;
