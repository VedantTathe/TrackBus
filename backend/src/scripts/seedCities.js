import mongoose from 'mongoose';
import dotenv from 'dotenv';
import City from '../models/City.js';
import { loadCitiesFromCsv } from '../services/cityService.js';

dotenv.config({ path: '.env' });

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in backend/.env');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const names = loadCitiesFromCsv();
  if (!names.length) {
    throw new Error('No city names found in CSV.');
  }

  await City.deleteMany({});
  await City.insertMany(
    names.map((name) => ({
      name,
      nameLower: name.toLowerCase(),
      state: 'Maharashtra',
    })),
    { ordered: false }
  );

  console.log(`Inserted ${names.length} cities.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
