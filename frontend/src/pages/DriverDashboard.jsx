import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  Bus, Play, Square, MapPin, Gauge,
  LogOut, Navigation, Radio, Wifi, ArrowRight, RefreshCw
} from 'lucide-react';

const CROWD_OPTIONS = [
  { val: 1, label: 'Empty', color: 'var(--green)' },
  { val: 2, label: 'Seats Available', color: '#2563eb' },
  { val: 3, label: 'Standing Room Only', color: 'var(--amber)' },
  { val: 4, label: 'Full', color: 'var(--red)' },
];

const distanceKm = (pt1, pt2) => {
  if (!pt1 || !pt2) return 0;
  const R = 6371; // Earth radius in km
  const dLat = ((pt2.lat - pt1.lat) * Math.PI) / 180;
  const dLon = ((pt2.lng - pt1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pt1.lat * Math.PI) / 180) *
      Math.cos((pt2.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export default function DriverDashboard() {
  const { user, logout } = useAuth();

  const getIntermediateStops = (route) => {
    if (!route.stops || route.stops.length <= 2) return [];
    const sorted = [...route.stops].sort((a, b) => a.sequence - b.sequence);
    return sorted.slice(1, -1);
  };

  // State machine: creation | online
  const [phase, setPhase] = useState('creation'); // creation | online
  
  // Trip creation states
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [cities, setCities] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routesError, setRoutesError] = useState('');

  // Stop customization states
  const [editedStops, setEditedStops] = useState([]);
  const [isCustomized, setIsCustomized] = useState(false);
  const [customPathCoordinates, setCustomPathCoordinates] = useState([]);
  const [customDistanceKm, setCustomDistanceKm] = useState(null);
  const [customDurationMin, setCustomDurationMin] = useState(null);
  const [newStopCity, setNewStopCity] = useState('');
  const [recalculatingPath, setRecalculatingPath] = useState(false);

  useEffect(() => {
    const selectedRoute = routes.find(r => r._id === selectedRouteId);
    if (selectedRoute) {
      const sortedStops = selectedRoute.stops ? [...selectedRoute.stops].sort((a, b) => a.sequence - b.sequence) : [];
      setEditedStops(sortedStops);
      setIsCustomized(false);
      setCustomPathCoordinates(selectedRoute.pathCoordinates || []);
      setCustomDistanceKm(selectedRoute.distanceKm);
      setCustomDurationMin(selectedRoute.estimatedDuration);
    } else {
      setEditedStops([]);
      setIsCustomized(false);
      setCustomPathCoordinates([]);
      setCustomDistanceKm(null);
      setCustomDurationMin(null);
    }
  }, [selectedRouteId, routes]);

  const triggerPathRecalculation = async (stopsToRoute) => {
    if (stopsToRoute.length < 2) return;
    
    try {
      setRecalculatingPath(true);
      setErrorMsg('');
      
      const coordsString = stopsToRoute.map(s => `${s.lng},${s.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson&steps=false`;
      
      const res = await axios.get(url);
      if (res.data && res.data.code === 'Ok' && Array.isArray(res.data.routes) && res.data.routes.length > 0) {
        const route = res.data.routes[0];
        const distanceKm = parseFloat((route.distance / 1000).toFixed(1));
        const durationMin = Math.round(route.duration / 60);
        
        const pathCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);
        
        setCustomPathCoordinates(pathCoords);
        setCustomDistanceKm(distanceKm);
        setCustomDurationMin(durationMin);
      } else {
        console.warn('OSRM returned non-OK code or empty routes', res.data);
      }
    } catch (err) {
      console.error('Failed to recalculate path via OSRM:', err);
      setErrorMsg('Failed to fetch OSRM highway coordinates. Path might snap directly.');
    } finally {
      setRecalculatingPath(false);
    }
  };

  const handleAddStop = async () => {
    if (!newStopCity || !newStopCity.trim()) return;
    const cleanName = newStopCity.trim();
    
    if (editedStops.some(s => s.name.toLowerCase() === cleanName.toLowerCase())) {
      setErrorMsg(`"${cleanName}" is already in the stop list.`);
      return;
    }
    
    try {
      setRecalculatingPath(true);
      setErrorMsg('');
      const res = await axios.get('/api/passenger/cities/coords', {
        params: { name: cleanName }
      });
      
      if (res.data && res.data.success && res.data.coordinates) {
        const { lat, lng } = res.data.coordinates;
        const newStop = {
          name: cleanName,
          lat,
          lng,
          arrivalTime: '',
          departureTime: '',
          sequence: editedStops.length > 0 ? editedStops.length : 1,
          isConfirmed: true
        };
        
        let updatedStops = [...editedStops];
        if (updatedStops.length >= 2) {
          updatedStops.splice(updatedStops.length - 1, 0, newStop);
        } else {
          updatedStops.push(newStop);
        }
        
        updatedStops = updatedStops.map((s, idx) => ({
          ...s,
          sequence: idx + 1
        }));
        
        setEditedStops(updatedStops);
        setIsCustomized(true);
        setNewStopCity('');
        
        await triggerPathRecalculation(updatedStops);
      } else {
        setErrorMsg(`Failed to get coordinates for "${cleanName}".`);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(`Failed to fetch coordinates for "${cleanName}".`);
    } finally {
      setRecalculatingPath(false);
    }
  };

  const handleDeleteStop = async (index) => {
    if (index === 0 || index === editedStops.length - 1) return;
    
    let updatedStops = editedStops.filter((_, idx) => idx !== index);
    updatedStops = updatedStops.map((s, idx) => ({
      ...s,
      sequence: idx + 1
    }));
    
    setEditedStops(updatedStops);
    setIsCustomized(true);
    
    await triggerPathRecalculation(updatedStops);
  };

  const handleMoveStop = async (index, direction) => {
    if (direction === 'up' && index <= 1) return;
    if (direction === 'down' && index >= editedStops.length - 2) return;
    
    const targetIndex = index + (direction === 'up' ? -1 : 1);
    
    const updatedStops = [...editedStops];
    const temp = updatedStops[index];
    updatedStops[index] = updatedStops[targetIndex];
    updatedStops[targetIndex] = temp;
    
    const resequencedStops = updatedStops.map((s, idx) => ({
      ...s,
      sequence: idx + 1
    }));
    
    setEditedStops(resequencedStops);
    setIsCustomized(true);
    
    await triggerPathRecalculation(resequencedStops);
  };

  const handleTimeChange = (index, field, value) => {
    const updatedStops = editedStops.map((s, idx) => {
      if (idx === index) {
        return { ...s, [field]: value };
      }
      return s;
    });
    setEditedStops(updatedStops);
    setIsCustomized(true);
  };

  // Active trip states
  const [activeTrip, setActiveTrip] = useState(null);
  const [crowdLevel, setCrowdLevel] = useState(1);
  const [startingTrip, setStartingTrip] = useState(false);
  const [endingTrip, setEndingTrip] = useState(false);
  const [position, setPosition] = useState(null);
  const [speed, setSpeed] = useState(0);
  const [heading, setHeading] = useState(0);
  const [driveSeconds, setDriveSeconds] = useState(0);
  const [broadcastCount, setBroadcastCount] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState(1);
  const simSpeedMultiplierRef = useRef(1);
  const simIndexRef = useRef(0);

  useEffect(() => {
    simSpeedMultiplierRef.current = simSpeedMultiplier;
  }, [simSpeedMultiplier]);

  const geoWatchRef = useRef(null);
  const timerRef = useRef(null);
  const telemetryIntervalRef = useRef(null);
  const latestPositionRef = useRef(null);
  const latestSpeedRef = useRef(null);
  const latestHeadingRef = useRef(null);
  const simResetHistoryFlagRef = useRef(false);

  // Fetch initial driver data
  useEffect(() => {
    // Check if driver has an existing active trip first to resume
    axios.get('/api/trips/driver/active')
      .then(res => {
        if (res.data) {
          resumeActiveTrip(res.data);
        }
      })
      .catch(() => {});

    axios.get('/api/passenger/cities')
      .then(res => {
        if (res.data?.cities) setCities(res.data.cities);
      })
      .catch(() => {});

    return () => {
      if (geoWatchRef.current) navigator.geolocation.clearWatch(geoWatchRef.current);
      if (telemetryIntervalRef.current) clearInterval(telemetryIntervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    setRoutes([]);
    setSelectedRouteId('');
    setRoutesError('');
  }, [source, destination]);

  const handleFetchRoutes = async () => {
    if (!source.trim() || !destination.trim()) {
      setRoutesError('Please enter both origin and destination.');
      return;
    }

    const cleanSource = source.trim();
    const cleanDest = destination.trim();

    const sourceMatch = cities.find(c => c.toLowerCase() === cleanSource.toLowerCase());
    const destMatch = cities.find(c => c.toLowerCase() === cleanDest.toLowerCase());

    if (!sourceMatch) {
      setRoutesError(`Origin "${cleanSource}" is not in the allowed cities list.`);
      return;
    }
    if (!destMatch) {
      setRoutesError(`Destination "${cleanDest}" is not in the allowed cities list.`);
      return;
    }

    // Auto-update to correct cased names
    setSource(sourceMatch);
    setDestination(destMatch);

    setRoutesError('');
    setRoutesLoading(true);
    setRoutes([]);
    setSelectedRouteId('');

    try {
      const res = await axios.get('/api/trips/suggest-routes', {
        params: { source: sourceMatch, destination: destMatch }
      });
      const list = Array.isArray(res.data) ? res.data : [];
      setRoutes(list);
      if (list[0]?._id) {
        setSelectedRouteId(list[0]._id);
      }
    } catch (err) {
      setRoutesError('Failed to load route options.');
    } finally {
      setRoutesLoading(false);
    }
  };

  // Resume active trip session if refreshed
  const resumeActiveTrip = (trip) => {
    setActiveTrip(trip);
    setSource(trip.source);
    setDestination(trip.destination);
    setCrowdLevel(trip.occupancyLevel || 1);
    setPhase('online');
    
    // Calculate drive seconds already passed since start
    const start = new Date(trip.startedAt).getTime();
    const passed = Math.floor((Date.now() - start) / 1000);
    setDriveSeconds(passed > 0 ? passed : 0);

    startGPSStreaming(trip);
  };

  const toggleSimulator = () => {
    const nextSimMode = !isSimulating;
    setIsSimulating(nextSimMode);
    simIndexRef.current = 0;

    if (geoWatchRef.current) navigator.geolocation.clearWatch(geoWatchRef.current);
    if (telemetryIntervalRef.current) clearInterval(telemetryIntervalRef.current);

    if (activeTrip) {
      simResetHistoryFlagRef.current = nextSimMode;
      startGPSStreaming(activeTrip, nextSimMode);
    }
  };

  // Start GPS geolocation watch & 5-second interval reporter
  const startGPSStreaming = (trip, forcedSimMode = null) => {
    const useSim = forcedSimMode !== null ? forcedSimMode : isSimulating;

    const pathCoords = trip.selectedRouteTemplateId?.pathCoordinates || [];
    const originLat = pathCoords[0]?.[0] || 18.5204;
    const originLng = pathCoords[0]?.[1] || 73.8567;
    const originPos = { lat: originLat, lng: originLng };

    if (geoWatchRef.current) navigator.geolocation.clearWatch(geoWatchRef.current);
    if (telemetryIntervalRef.current) clearInterval(telemetryIntervalRef.current);

    // Initialize latest telemetry position strictly at route origin to prevent blank snaps
    if (!latestPositionRef.current) {
      latestPositionRef.current = originPos;
      setPosition(originPos);
    }

    if (!useSim) {
      // 1. High Accuracy WatchPosition to update latest telemetry in state
      if ('geolocation' in navigator) {
        geoWatchRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude, speed: gpsSpeed, heading: gpsHeading } = pos.coords;

            // Check distance from route origin. If >15km, ignore real coordinates to prevent snapping/corrupting the map!
            const distFromOrigin = distanceKm({ lat: latitude, lng: longitude }, originPos);
            if (distFromOrigin > 15.0) {
              console.log(`⚠️ Real GPS (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) is ${distFromOrigin.toFixed(1)} km from trip origin. Ignoring to prevent map snapping.`);
              return;
            }

            const currentPos = { lat: latitude, lng: longitude };
            setPosition(currentPos);
            latestPositionRef.current = currentPos;

            // Convert m/s to km/h
            const spd = gpsSpeed ? Math.round(gpsSpeed * 3.6) : 0;
            setSpeed(spd);
            latestSpeedRef.current = spd;

            const hdg = gpsHeading ? Math.round(gpsHeading) : 0;
            setHeading(hdg);
            latestHeadingRef.current = hdg;
          },
          (err) => console.warn('GPS High Accuracy error:', err.message),
          { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
        );
      }
    } else {
      // 2. Dev-Mode Route GPS Simulator (Simulate active route coords)
      console.log('🏁 Dev Mode: GPS Route Simulator Activated!');
      if (pathCoords.length > 0) {
        const first = pathCoords[0];
        const firstPos = { lat: first[0], lng: first[1] };
        setPosition(firstPos);
        latestPositionRef.current = firstPos;
        setSpeed(65);
        latestSpeedRef.current = 65;
        setHeading(90);
        latestHeadingRef.current = 90;
      }
    }

    // 3. Start exact 5-second telemetry interval streamer
    telemetryIntervalRef.current = setInterval(() => {
      let pos = latestPositionRef.current || originPos;
      let spd = latestSpeedRef.current || 0;
      let hdg = latestHeadingRef.current || 0;

      if (useSim) {
        if (pathCoords.length > 0) {
          // Advance the simulated bus position along coordinates list
          const multiplier = simSpeedMultiplierRef.current || 1;
          const nextIndex = simIndexRef.current + (4 * multiplier);
          let reachedEnd = false;

          if (nextIndex >= pathCoords.length) {
            simIndexRef.current = pathCoords.length - 1;
            reachedEnd = true;
          } else {
            simIndexRef.current = nextIndex;
          }

          const currentPoint = pathCoords[simIndexRef.current];
          pos = { lat: currentPoint[0], lng: currentPoint[1] };

          // Calculate heading to next point
          const nextIdx = (simIndexRef.current + 1) % pathCoords.length;
          const nextPoint = pathCoords[nextIdx];
          if (nextPoint) {
            const dy = nextPoint[0] - currentPoint[0];
            const dx = nextPoint[1] - currentPoint[1];
            let angle = Math.round((Math.atan2(dx, dy) * 180) / Math.PI);
            if (angle < 0) angle += 360;
            hdg = angle;
          }

          // Simulate speed changes (slow down near starts and arrivals)
          let baseSpd = (simIndexRef.current < 10 || simIndexRef.current > pathCoords.length - 10) ? 25 : 65;
          spd = reachedEnd ? 0 : baseSpd * multiplier;

          setPosition(pos);
          latestPositionRef.current = pos;
          setSpeed(spd);
          latestSpeedRef.current = spd;
          setHeading(hdg);
          latestHeadingRef.current = hdg;

          if (reachedEnd) {
            console.log('🚗 Simulator reached destination! Programmatically stopping simulator.');
            setIsSimulating(false);
            if (telemetryIntervalRef.current) clearInterval(telemetryIntervalRef.current);
            startGPSStreaming(trip, false);
            return;
          }
        }
      }

      const payload = {
        tripId: trip.tripId,
        latitude: pos.lat,
        longitude: pos.lng,
        speed: spd,
        heading: hdg,
        currentCrowd: crowdLevel
      };

      if (simResetHistoryFlagRef.current) {
        payload.resetHistory = true;
        simResetHistoryFlagRef.current = false;
      }

      axios.post('/api/location/update', payload)
      .then(() => {
        setBroadcastCount(c => c + 1);
      })
      .catch((err) => {
        console.warn('Telemetry ping error:', err.message);
      });
    }, 5000);

    // 4. Drive timer ticker
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setDriveSeconds(s => s + 1), 1000);
  };

  // Start Live Trip handler
  const handleStartTrip = async (e) => {
    e.preventDefault();
    if (!source.trim() || !destination.trim() || !selectedRouteId) {
      setErrorMsg('Please select an origin, destination, and route.');
      return;
    }

    const cleanSource = source.trim();
    const cleanDest = destination.trim();

    const sourceMatch = cities.find(c => c.toLowerCase() === cleanSource.toLowerCase());
    const destMatch = cities.find(c => c.toLowerCase() === cleanDest.toLowerCase());

    if (!sourceMatch) {
      setErrorMsg(`Origin "${cleanSource}" is not in the allowed cities list.`);
      return;
    }
    if (!destMatch) {
      setErrorMsg(`Destination "${cleanDest}" is not in the allowed cities list.`);
      return;
    }

    // Auto-update correctly cased name
    setSource(sourceMatch);
    setDestination(destMatch);

    setErrorMsg('');
    setStartingTrip(true);
    try {
      const payload = {
        source: sourceMatch,
        destination: destMatch,
        selectedRouteTemplateId: selectedRouteId
      };

      if (isCustomized) {
        payload.customRouteDetails = {
          routeName: `${sourceMatch} – ${destMatch} Custom Express`,
          stops: editedStops,
          pathCoordinates: customPathCoordinates,
          distanceKm: customDistanceKm,
          estimatedDuration: customDurationMin
        };
      }

      const res = await axios.post('/api/trips/start', payload);

      const newTrip = res.data;
      setActiveTrip(newTrip);
      setCrowdLevel(newTrip.occupancyLevel || 1);
      setDriveSeconds(0);
      setBroadcastCount(0);
      setPhase('online');

      startGPSStreaming(newTrip);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to start Live Trip session. Please try again.');
    } finally {
      setStartingTrip(false);
    }
  };

  // End active live trip handler
  const handleEndTrip = async () => {
    setEndingTrip(true);
    if (geoWatchRef.current) navigator.geolocation.clearWatch(geoWatchRef.current);
    if (telemetryIntervalRef.current) clearInterval(telemetryIntervalRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      if (activeTrip) {
        await axios.post('/api/trips/end', { tripId: activeTrip.tripId });
      }
    } catch (err) {
      console.warn('Failed to end trip clean on server:', err.message);
    } finally {
      setEndingTrip(false);
    }

    setPhase('creation');
    setActiveTrip(null);
    setDriveSeconds(0);
    setBroadcastCount(0);
    setPosition(null);
    setSpeed(0);
    setHeading(0);
    latestPositionRef.current = null;
    latestSpeedRef.current = null;
    latestHeadingRef.current = null;
    setIsSimulating(false);
    simIndexRef.current = 0;
  };

  // Update crowd/occupancy updates
  const updateCrowd = async (level) => {
    setCrowdLevel(level);
    if (phase === 'online' && activeTrip) {
      try {
        await axios.post('/api/trips/occupancy', {
          tripId: activeTrip.tripId,
          occupancyLevel: level
        });
      } catch (err) {
        console.warn('Failed to update occupancy load:', err.message);
      }
    }
  };

  // Timer formatter
  const fmtTime = (s) => {
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="page">
      {/* Topbar navigation banner */}
      <div className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon"><Bus size={15} /></div>
          <span className="topbar-logo-text">Driver Dashboard</span>
        </div>
        
        {/* Desktop Navigation Links */}
        <div className="desktop-nav-links">
          <button className="desktop-nav-link active" onClick={() => navigate('/driver')}>Live Session</button>
          <button className="desktop-nav-link" onClick={logout}>Logout</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge ${phase === 'online' ? 'badge-green' : 'badge-red'}`}>
            {phase === 'online' ? <><Wifi size={10} />Broadcasting</> : 'Offline'}
          </span>
          <button className="btn btn-ghost" onClick={logout} style={{ padding: 8 }}>
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* Primary Dashboard Content Area */}
      <div className="page-content">
        <div style={{ padding: '14px 0 4px' }}>
          <h2>Welcome back, {user?.name || 'Driver'}</h2>
          <p style={{ fontSize: '0.8rem', marginTop: 2, color: 'var(--text-muted)' }}>Employee ID: {user?.employeeId}</p>
        </div>

        {/* PHASE: TRIP CREATION UI */}
        {phase === 'creation' && (
          <div style={{ marginTop: 12 }}>
            <form onSubmit={handleStartTrip} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '20px 18px' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <Radio size={18} style={{ color: 'var(--accent)' }} />
                New Live Trip Session
              </h3>

              {errorMsg && (
                <div className="alert alert-danger" style={{ fontSize: '0.8rem', padding: '10px 12px' }}>
                  {errorMsg}
                </div>
              )}

              <div className="grid-desktop-2" style={{ gap: 20 }}>
                {/* Left Column: Origin, Destination and Routes list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Source Node */}
              <div>
                <label className="label" style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: 4 }}>Trip Origin</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    value={source}
                    onChange={e => {
                      setSource(e.target.value);
                      if (errorMsg) setErrorMsg('');
                      if (routesError) setRoutesError('');
                    }}
                    placeholder="Origin (e.g. Pune)"
                    list="city-list"
                    required
                  />
                </div>
              </div>

              {/* Destination Node */}
              <div>
                <label className="label" style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: 4 }}>Trip Destination</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    value={destination}
                    onChange={e => {
                      setDestination(e.target.value);
                      if (errorMsg) setErrorMsg('');
                      if (routesError) setRoutesError('');
                    }}
                    placeholder="Destination (e.g. Sangli)"
                    list="city-list"
                    required
                  />
                </div>
              </div>

              <datalist id="city-list">
                {cities.map(city => (
                  <option key={city} value={city} />
                ))}
              </datalist>

              {source && destination && (
                <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
                  <label className="label" style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Route Options
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-full"
                    style={{ marginTop: 6 }}
                    onClick={handleFetchRoutes}
                    disabled={routesLoading}
                  >
                    {routesLoading ? 'Fetching routes...' : 'Find Routes'}
                  </button>

                  {routesError && (
                    <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 10, marginTop: 8 }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                        {routesError}
                      </p>
                    </div>
                  )}

                  {!routesLoading && !routesError && routes.length === 0 && (
                    <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: 10, marginTop: 8 }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                        No saved routes yet. Click “Find Routes” to fetch options.
                      </p>
                    </div>
                  )}

                  {routes.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                      {routes.map(route => (
                        <button
                          type="button"
                          key={route._id || route.routeNumber}
                          onClick={() => route._id && setSelectedRouteId(route._id)}
                          disabled={!route._id}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 10,
                            border: `1.5px solid ${selectedRouteId === route._id ? 'var(--accent)' : 'var(--border)'}`,
                            background: selectedRouteId === route._id ? 'var(--accent-light)' : 'var(--bg)',
                            cursor: route._id ? 'pointer' : 'not-allowed',
                            textAlign: 'left',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                              {route.routeName || `${source} → ${destination}`}
                            </div>
                            {route._id && selectedRouteId === route._id && (
                              <span className="badge badge-blue" style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                                Selected
                              </span>
                            )}
                          </div>
                          
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {route.distanceKm ? `${route.distanceKm} km` : '—'} · {route.estimatedDuration ? `${route.estimatedDuration} min` : '—'}
                          </div>

                          {route.stops && route.stops.length > 0 ? (
                            <div style={{
                              marginTop: 6,
                              paddingTop: 8,
                              borderTop: '1px dashed var(--border)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                              width: '100%'
                            }}>
                              <div style={{
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                color: 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}>
                                <MapPin size={11} style={{ color: 'var(--accent)' }} />
                                Complete Transit Sequence ({route.stops.length} stations)
                              </div>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 4,
                                marginTop: 2,
                                fontSize: '0.74rem',
                                color: 'var(--text-primary)',
                                fontWeight: 500,
                                lineHeight: '1.4'
                              }}>
                                {[...route.stops].sort((a,b) => a.sequence - b.sequence).map((stop, idx, arr) => (
                                  <React.Fragment key={idx}>
                                    <span style={{ 
                                      color: idx === 0 ? 'var(--green)' : idx === arr.length - 1 ? 'var(--red)' : 'var(--text-primary)',
                                      fontWeight: (idx === 0 || idx === arr.length - 1) ? 700 : 500
                                    }}>
                                      {stop.name}
                                    </span>
                                    {idx < arr.length - 1 && <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>→</span>}
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div style={{
                              marginTop: 6,
                              paddingTop: 8,
                              borderTop: '1px dashed var(--border)',
                              fontSize: '0.68rem',
                              color: 'var(--text-muted)',
                              fontStyle: 'italic',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              width: '100%'
                            }}>
                              <MapPin size={11} style={{ color: 'var(--text-muted)' }} />
                              Direct route (no intermediate stops)
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div> {/* Close Left Column */}

            {/* Right Column: Configure Stations Timeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(() => {
                    const selectedRoute = routes.find(r => r._id === selectedRouteId);
                    if (!selectedRoute) {
                      return (
                        <div className="card premium-glass-card" style={{ height: '100%', minHeight: 280, border: '1.5px dashed var(--border-strong)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 10, padding: 24, background: 'var(--bg-subtle)', borderRadius: 12 }}>
                          <MapPin size={32} style={{ color: 'var(--text-muted)' }} />
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-secondary)' }}>Configure Stations Timeline</span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Select a route option on the left to customize sequence and timings.</span>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="card" style={{ position: 'relative', border: '1.5px solid var(--accent)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 14px' }}>
                    {recalculatingPath && (
                      <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(255, 255, 255, 0.7)',
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 10,
                        backdropFilter: 'blur(2px)'
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'white',
                          padding: '10px 16px',
                          borderRadius: 20,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          border: '1px solid var(--border)'
                        }}>
                          <span className="live-dot" style={{ background: 'var(--accent)', width: 8, height: 8 }} />
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Recalculating highway route...</span>
                        </div>
                      </div>
                    )}

                    <h4 style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6, margin: 0, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                      <Navigation size={13} />
                      Confirm & Customize Route Stations
                    </h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', paddingLeft: 18, margin: '6px 0 12px' }}>
                      {/* Vertical line connecting timeline dots */}
                      <div style={{
                        position: 'absolute',
                        left: 5,
                        top: 8,
                        bottom: 8,
                        width: 2,
                        background: 'var(--border)',
                        zIndex: 0
                      }} />
                      
                      {editedStops.map((stop, index) => {
                        const isStart = index === 0;
                        const isEnd = index === editedStops.length - 1;
                        return (
                          <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: index === editedStops.length - 1 ? 0 : 12, position: 'relative', zIndex: 1 }}>
                            {/* Timeline Dot */}
                            <div style={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              background: isStart ? 'var(--green)' : isEnd ? 'var(--red)' : 'var(--accent)',
                              border: '2.5px solid var(--bg)',
                              boxShadow: '0 0 0 1px var(--border)',
                              marginTop: 6,
                              marginLeft: -19
                            }} />
                            
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 4 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: (isStart || isEnd) ? 700 : 500, color: 'var(--text-primary)' }}>
                                  {stop.name}
                                </span>
                                
                                {/* Reordering and Delete controls for intermediate stops */}
                                {!isStart && !isEnd && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveStop(index, 'up')}
                                      disabled={index <= 1}
                                      style={{
                                        padding: '2px 4px',
                                        fontSize: '0.65rem',
                                        border: '1px solid var(--border)',
                                        borderRadius: 4,
                                        background: 'var(--bg)',
                                        color: index <= 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                                        cursor: index <= 1 ? 'not-allowed' : 'pointer'
                                      }}
                                      title="Move Up"
                                    >
                                      ▲
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleMoveStop(index, 'down')}
                                      disabled={index >= editedStops.length - 2}
                                      style={{
                                        padding: '2px 4px',
                                        fontSize: '0.65rem',
                                        border: '1px solid var(--border)',
                                        borderRadius: 4,
                                        background: 'var(--bg)',
                                        color: index >= editedStops.length - 2 ? 'var(--text-muted)' : 'var(--text-primary)',
                                        cursor: index >= editedStops.length - 2 ? 'not-allowed' : 'pointer'
                                      }}
                                      title="Move Down"
                                    >
                                      ▼
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteStop(index)}
                                      style={{
                                        padding: '2px 6px',
                                        fontSize: '0.65rem',
                                        border: '1px solid var(--red)',
                                        borderRadius: 4,
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        color: 'var(--red)',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                      }}
                                      title="Remove Stop"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                )}
                              </div>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                  {isStart ? 'Origin' : isEnd ? 'Destination CBS' : 'Intermediate Hub'}
                                </span>
                                
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ETA:</label>
                                  <input
                                    type="text"
                                    value={stop.arrivalTime || ''}
                                    placeholder="e.g. 10:30"
                                    onChange={(e) => handleTimeChange(index, 'arrivalTime', e.target.value)}
                                    style={{
                                      width: 65,
                                      padding: '2px 4px',
                                      fontSize: '0.7rem',
                                      border: '1px solid var(--border)',
                                      borderRadius: 4,
                                      background: 'var(--bg)',
                                      color: 'var(--text-primary)'
                                    }}
                                  />
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>DEP:</label>
                                  <input
                                    type="text"
                                    value={stop.departureTime || ''}
                                    placeholder="e.g. 10:35"
                                    onChange={(e) => handleTimeChange(index, 'departureTime', e.target.value)}
                                    style={{
                                      width: 65,
                                      padding: '2px 4px',
                                      fontSize: '0.7rem',
                                      border: '1px solid var(--border)',
                                      borderRadius: 4,
                                      background: 'var(--bg)',
                                      color: 'var(--text-primary)'
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add Stop Widget */}
                    <div style={{ 
                      padding: '10px 0', 
                      borderTop: '1px dashed var(--border)',
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 8 
                    }}>
                      <div style={{ flex: 1, position: 'relative' }}>
                        <input
                          type="text"
                          className="input"
                          placeholder="Select/type intermediate city..."
                          value={newStopCity}
                          onChange={(e) => setNewStopCity(e.target.value)}
                          list="city-list"
                          style={{
                            padding: '6px 10px',
                            fontSize: '0.8rem',
                            height: 'auto'
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddStop}
                        className="btn btn-secondary"
                        style={{
                          padding: '6px 12px',
                          fontSize: '0.78rem',
                          borderRadius: 8,
                          height: '32px',
                          whiteSpace: 'nowrap',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        + Add Stop
                      </button>
                    </div>

                    {isCustomized && (
                      <div style={{
                        background: 'var(--accent-light)',
                        border: '1px solid var(--accent)',
                        borderRadius: 8,
                        padding: '10px 12px',
                        fontSize: '0.78rem',
                        color: 'var(--accent)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2
                      }}>
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Gauge size={14} />
                          Customized Highway Route Active
                        </div>
                        <div style={{ opacity: 0.9 }}>
                          Recalculated OSRM Path: <strong>{customDistanceKm} km</strong> · Approx. <strong>{customDurationMin} mins</strong>
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="btn btn-primary btn-full btn-lg mt-1"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                      disabled={!source.trim() || !destination.trim() || !selectedRouteId || recalculatingPath || startingTrip}
                    >
                      {startingTrip ? (
                        <>
                          <RefreshCw size={16} className="animate-spin" /> Starting Trip...
                        </>
                      ) : (
                        <>
                          <Play size={16} /> Confirm & Start Live Trip
                        </>
                      )}
                    </button>
                  </div>
                );
              })()}
                </div> {/* Close Right Column */}
              </div> {/* Close grid-desktop-2 */}
            </form>
          </div>
        )}

        {/* PHASE: ONLINE ACTIVE TRIP SCREEN */}
        {phase === 'online' && activeTrip && (
          <div className="grid-desktop-2" style={{ marginTop: 12, gap: 20 }}>
            
            {/* Left Column: Live Telemetry, speedometer, and simulators */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            
            {/* Status Live banner */}
            <div className="in-bus-banner" style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #1d4ed8 100%)', boxShadow: '0 4px 15px rgba(29,78,216,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="live-dot" style={{ background: 'white' }} />
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Broadcasting Live</span>
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{fmtTime(driveSeconds)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>{source}</span>
                <ArrowRight size={16} />
                <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>{destination}</span>
              </div>
              {activeTrip.selectedRouteTemplateId && (
                <div style={{ fontSize: '0.78rem', opacity: 0.9, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Navigation size={12} />
                  Guidance Template: {activeTrip.selectedRouteTemplateId.routeName || `${source} → ${destination}`}
                </div>
              )}
            </div>

            {/* Metrics cards grid */}
            <div className="card">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="speed-value" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{speed}</div>
                  <div className="speed-unit" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>km/h</div>
                </div>
                <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                  <div className="speed-value" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{broadcastCount}</div>
                  <div className="speed-unit" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>pings</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="speed-value" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{heading}°</div>
                  <div className="speed-unit" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>heading</div>
                </div>
              </div>

              {position && (
                <div style={{ marginTop: 12, padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <MapPin size={12} style={{ color: 'var(--accent)' }} />
                  GPS Coordinate: {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                </div>
              )}
            </div>

            {/* Dev Mode GPS Route Simulator */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1.5px dashed var(--accent)', background: 'var(--accent-light)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--accent)' }}>Dev Mode: GPS Route Simulator</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                    {isSimulating ? `🚗 Auto-driving at ${simSpeedMultiplier}x speed...` : '⏱️ Standby: toggle to simulate live map driving'}
                  </span>
                </div>
                <button 
                  type="button"
                  className={`btn ${isSimulating ? 'btn-danger' : 'btn-primary'}`} 
                  onClick={toggleSimulator}
                  style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: 8, fontWeight: 600, minWidth: 80 }}
                >
                  {isSimulating ? 'Stop Sim' : 'Start Sim'}
                </button>
              </div>

              {isSimulating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px dashed rgba(29, 78, 216, 0.15)', paddingTop: 10 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Multiplier:</span>
                  <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                    {[1, 3, 5, 10].map(speedVal => (
                      <button
                        key={speedVal}
                        type="button"
                        onClick={() => setSimSpeedMultiplier(speedVal)}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          borderRadius: 6,
                          border: `1.5px solid ${simSpeedMultiplier === speedVal ? 'var(--accent)' : 'var(--border)'}`,
                          background: simSpeedMultiplier === speedVal ? 'var(--accent)' : 'var(--bg)',
                          color: simSpeedMultiplier === speedVal ? 'white' : 'var(--text-secondary)',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s'
                        }}
                      >
                        {speedVal}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div> {/* Close Left Column */}

          {/* Right Column: Stations Timeline adherence and occupancy selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Full Trip Stations Sequence Timeline */}
            {activeTrip.selectedRouteTemplateId?.stops && activeTrip.selectedRouteTemplateId.stops.length > 0 && (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 10,
                  marginBottom: 4
                }}>
                  <MapPin size={14} style={{ color: 'var(--accent)' }} />
                  Full Transit Timeline ({activeTrip.selectedRouteTemplateId.stops.length} Stations)
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', paddingLeft: 18, margin: '6px 0' }}>
                  {/* Vertical line connecting timeline dots */}
                  <div style={{
                    position: 'absolute',
                    left: 5,
                    top: 8,
                    bottom: 8,
                    width: 2,
                    background: 'var(--border)',
                    zIndex: 0
                  }} />

                  {[...activeTrip.selectedRouteTemplateId.stops]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((stop, index, arr) => {
                      const isStart = index === 0;
                      const isEnd = index === arr.length - 1;
                      
                      // Calculate proximity highlight: check if vehicle is currently near this stop
                      let isVehicleHere = false;
                      if (position) {
                        const dist = distanceKm(position, { lat: stop.lat, lng: stop.lng });
                        isVehicleHere = dist <= 0.8; // within 800m
                      }

                      return (
                        <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: isEnd ? 0 : 12, position: 'relative', zIndex: 1 }}>
                          {/* Timeline Dot */}
                          <div style={{
                            width: isVehicleHere ? 14 : 10,
                            height: isVehicleHere ? 14 : 10,
                            borderRadius: '50%',
                            background: isVehicleHere ? 'var(--accent)' : isStart ? 'var(--green)' : isEnd ? 'var(--red)' : 'var(--border-strong)',
                            border: '2px solid var(--bg)',
                            boxShadow: isVehicleHere ? '0 0 0 3px rgba(29, 78, 216, 0.2)' : '0 0 0 1px var(--border)',
                            marginTop: isVehicleHere ? 4 : 5,
                            marginLeft: isVehicleHere ? -20 : -18,
                            transition: 'all 0.3s ease-in-out'
                          }}>
                            {isVehicleHere && (
                              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white', margin: '2px auto' }} />
                            )}
                          </div>

                          <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ 
                                fontSize: '0.82rem', 
                                fontWeight: (isStart || isEnd || isVehicleHere) ? 700 : 500, 
                                color: isVehicleHere ? 'var(--accent)' : 'var(--text-primary)' 
                              }}>
                                {stop.name}
                                {isVehicleHere && (
                                  <span className="badge badge-blue" style={{ fontSize: '0.6rem', padding: '1px 4px', marginLeft: 6, verticalAlign: 'middle' }}>
                                    Current
                                  </span>
                                )}
                              </span>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                                {isStart ? 'Origin CBS' : isEnd ? 'Destination Terminus' : 'Intermediate Hub'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                              {stop.arrivalTime && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                                  Arr: <span style={{ color: 'var(--accent)' }}>{stop.arrivalTime}</span>
                                </div>
                              )}
                              {stop.departureTime && (
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                  Dep: {stop.departureTime}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Occupancy Selector */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Update Passenger Load (Occupancy)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {CROWD_OPTIONS.map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => updateCrowd(opt.val)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: `1.5px solid ${crowdLevel === opt.val ? opt.color : 'var(--border)'}`,
                      background: crowdLevel === opt.val ? `${opt.color}15` : 'var(--bg)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      color: crowdLevel === opt.val ? opt.color : 'var(--text-secondary)',
                      transition: 'all 0.15s'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button 
              className="btn btn-danger btn-full btn-lg mt-2" 
              onClick={handleEndTrip}
              disabled={endingTrip}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {endingTrip ? (
                <>
                  <RefreshCw size={14} className="animate-spin" /> Ending Trip...
                </>
              ) : (
                <>
                  <Square size={14} /> End Live Trip
                </>
              )}
            </button>
          </div>
        </div>
      )}
      </div>

      <div className="bottom-nav">
        <button className="nav-item active">
          <Radio size={20} />
          <span className="nav-item-label">Live Session</span>
        </button>
        <button className="nav-item" onClick={logout}>
          <LogOut size={20} />
          <span className="nav-item-label">Logout</span>
        </button>
      </div>
    </div>
  );
}
