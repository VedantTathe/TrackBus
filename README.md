# TrackBus — Real-Time Bus Tracking

https://trackbusved.vercel.app/

Inspired by the clean simplicity of "Where Is My Train". Minimalist, fast, and functional.

## Architecture

```
trackbus/
├── backend/     Node.js + Express + Socket.IO + MongoDB
└── frontend/    React + Vite + Leaflet Maps
```

## Admin Credentials

- Admin Email: `vedanttathe30@gmail.com`
- Admin Password: `TrackBus@2026`
- Note: This admin user is auto-created one time on backend startup when MongoDB is connected.

## Test Buses (seeded automatically)

| Bus Number  | Route                    |
|-------------|--------------------------|
| MH12-9401   | Pune – Sangli Express    |
| MH13-7702   | Solapur – Pune Fast      |
| MH09-3311   | Kolhapur – Sangli Link   |

## Setup

### Backend
```bash
cd backend
npm install
# Edit .env — set MONGODB_URI (or leave blank for in-memory mock mode)
npm start
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Key Features

### Driver Flow
1. Login as driver
2. Tap **Scan for My Bus** — Bluetooth scan finds transponder
3. Confirm the bus detected is yours → trips starts
4. If BLE fails → manual search fallback
5. Location broadcasts via WebSocket every GPS update
6. Set passenger load (Empty / Seats / Standing / Full)
7. End trip when done

### Passenger Flow
1. Login as passenger
2. Search by **bus number** or **From → To**
3. Quick route chips for common routes
4. Tap a Live bus → "Are you on this bus?" modal (improves GPS verification)
5. Live tracking map with route stops, speed, crowd level
6. Stale alert if no update in 30 seconds

### Admin Flow
1. Manage buses (add/edit/delete)
2. Manage routes (add/edit)
3. Assign drivers to buses
4. View all drivers

## How "Are you on this bus?" Works

When a passenger taps a live bus:
- A modal asks "Are you on bus MH12-9401?"
- If **Yes** → navigates to tracking page with `?inBus=true`
- The app shows a confirmation banner + uses driver's GPS for verification
- Passengers do **not** need Bluetooth — location comes from driver
- This follows the "Where Is My Train" model: driver = source of truth

## Environment Variables (backend/.env)

```
PORT=5000
MONGODB_URI=mongodb+srv://...    # leave blank for mock mode
JWT_SECRET=your-secret-key
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM="TrackBus <your@gmail.com>"
```

## Mock Mode

If `MONGODB_URI` is not set or DB is unreachable, the app automatically falls back to in-memory mock data. All features work — data resets on server restart.

## Docker

```bash
docker-compose up --build
```
