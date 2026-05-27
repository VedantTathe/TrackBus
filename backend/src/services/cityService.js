import City from '../models/City.js';
import { CITY_COORDINATES } from '../data/cityCoordinates.js';

const capitalizeName = (str) => {
  return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

export const loadCitiesFromCsv = () => {
  const names = Object.keys(CITY_COORDINATES).map(key => capitalizeName(key));
  return names.sort((a, b) => a.localeCompare(b));
};

export const seedCitiesIfEmpty = async () => {
  const existingCount = await City.countDocuments();
  // If we already have seeded the full set of 426+ cities, skip
  if (existingCount >= 400) {
    return;
  }

  // Clear legacy/partially seeded cities to ensure clean synchronization
  await City.deleteMany({});
  console.log('Cleared legacy cities collection.');

  const names = loadCitiesFromCsv();
  if (!names.length) {
    console.warn('No cities found in CITY_COORDINATES. Skipping city seed.');
    return;
  }

  const docs = names.map((name) => ({
    name,
    nameLower: name.toLowerCase(),
    state: 'Maharashtra',
  }));

  await City.insertMany(docs, { ordered: false });
  console.log(`Seeded exactly ${docs.length} Maharashtra cities from compiled geodataset.`);
};
