import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, '..', 'data', 'cityCoordinates.js');

const query = `
[out:json][timeout:90];
area["ISO3166-2"="IN-MH"]->.searchArea;
(
  node["place"~"city|town"](area.searchArea);
);
out body;
`;

const postData = `data=${encodeURIComponent(query)}`;

const options = {
  hostname: 'overpass-api.de',
  port: 443,
  path: '/api/interpreter',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData),
    'User-Agent': 'trackbus-geospatial-builder/1.0'
  }
};

console.log('🌐 Connecting to OpenStreetMap Overpass API using HTTPS...');
console.log('📥 Downloading all cities and towns in Maharashtra (IN-MH)...');

const req = https.request(options, (res) => {
  let rawData = '';
  
  res.on('data', (chunk) => {
    rawData += chunk;
  });
  
  res.on('end', () => {
    try {
      if (res.statusCode !== 200) {
        throw new Error(`Server returned status code: ${res.statusCode}`);
      }

      const data = JSON.parse(rawData);
      if (!data || !Array.isArray(data.elements)) {
        throw new Error('Invalid data format returned by Overpass API.');
      }

      console.log(`🎉 Downloaded ${data.elements.length} places from OpenStreetMap!`);
      
      const customHubs = {
        "jaysingpur": [16.7865, 74.5583],
        "hatkanangale": [16.7483, 74.4447],
        "karad": [17.2885, 74.1812],
        "kondhali": [21.1396, 78.7188],
        "karanja ghadge": [21.0183, 78.5833],
        "tiosa": [21.0505, 77.9866],
        "badnera": [20.8654, 77.7479],
        "vashi": [19.0745, 72.9978],
        "khalapur": [18.8322, 73.2847],
        "lonavala": [18.7557, 73.4091],
        "talegaon dabhade": [18.7287, 73.6806],
        "hadapsar": [18.4967, 73.9417],
        "loni kalbhor": [18.4839, 74.0224],
        "yavat": [18.4727, 74.2694],
        "bhigwan": [18.2831, 75.0865],
        "indapur": [18.1172, 75.0264],
        "mohol": [17.8202, 75.6475],
        "shirwal": [18.1402, 73.9822],
        "butibori": [20.9238, 79.0064],
        "seloo": [20.8351, 78.7061],
        "deoli": [20.6559, 78.4795],
        "kalamb": [20.4431, 78.3444],
        "chakan": [18.7533, 73.8507],
        "rajgurunagar": [18.8548, 73.8875],
        "manchar": [19.0028, 73.9372],
        "narayangaon": [19.1171, 73.9749],
        "alephata": [19.1834, 74.1165],
        "sangamner": [19.5714, 74.2096],
        "sinnar": [19.8465, 73.9991],
        "shahapur": [19.4503, 73.3308],
        "kasara": [19.6375, 73.4819],
        "igatpuri": [19.6924, 73.5557],
        "nandgaon peth": [20.9859, 77.8384],
        "talegaon": [20.8961, 78.3306],
        "bazargaon": [21.1374, 78.7885],
        "waddhamna": [21.1578, 78.9669],
        "bori": [20.9103, 78.9868],
        "sindhi": [20.8038, 78.8687],
        "babhulgaon": [20.4431, 78.1258],
        "loni": [20.8943, 77.9255],
        "pulgaon": [20.7275, 78.3283],
        "murtizapur": [20.7324, 77.3621],
        "kurha": [20.7303, 77.6749],
        "shegaon": [20.7936, 76.6925],
        "gargoti": [16.3150, 74.1378],
        "mahuli chor": [20.9834, 77.9064]
      };

      const finalCoordinates = { ...customHubs };

      data.elements.forEach(el => {
        if (el.tags && el.tags.name && el.lat && el.lon) {
          const rawName = el.tags.name.toLowerCase().trim();
          const cleanName = rawName.split('(')[0].split(',')[0].trim();
          
          if (cleanName && !finalCoordinates[cleanName]) {
            finalCoordinates[cleanName] = [Number(el.lat.toFixed(5)), Number(el.lon.toFixed(5))];
          }
        }
      });

      const totalCount = Object.keys(finalCoordinates).length;
      console.log(`📝 Compiling and writing ${totalCount} geocoded Maharashtra places to cityCoordinates.js...`);

      const fileContent = `// This file is auto-generated using OpenStreetMap Overpass API
// Contains ${totalCount} verified geocoded cities, municipal areas, and transit towns in Maharashtra.

export const CITY_COORDINATES = ${JSON.stringify(finalCoordinates, null, 2)};

export default CITY_COORDINATES;
`;

      fs.writeFileSync(outputPath, fileContent, 'utf8');
      console.log('✅ Success! cityCoordinates.js is now fully compiled and updated.');
    } catch (e) {
      console.error('❌ Parsing/writing error:', e.message);
    }
  });
});

req.on('error', (e) => {
  console.error(`❌ HTTP request failed: ${e.message}`);
});

req.write(postData);
req.end();
