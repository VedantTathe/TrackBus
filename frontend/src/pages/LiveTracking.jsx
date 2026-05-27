import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n';
import { ArrowLeft, Bus, Gauge, Clock, MapPin, RefreshCw, Navigation, AlertCircle, Check, Shield, Sparkles, Smile, Radio, Vote, User } from 'lucide-react';

const CROWD_COLORS = { 1: '#16a34a', 2: '#1d4ed8', 3: '#d97706', 4: '#dc2626' };

function CrowdBar({ level = 1 }) {
  return (
    <div className="crowd-bar">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`crowd-segment ${i <= level ? `filled-${level}` : ''}`} />
      ))}
    </div>
  );
}

const toRad = (deg) => (deg * Math.PI) / 180;
const distanceKm = (a, b) => {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const formatTime = (timeStr) => timeStr || '—';
const formatClock = (dateValue) => {
  if (!dateValue) return '—';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const findArrivalTime = (stop, pathHistory) => {
  if (!pathHistory || pathHistory.length === 0) return null;
  const closePoints = pathHistory
    .map(p => {
      const dist = distanceKm({ lat: p.lat, lng: p.lng }, { lat: stop.lat, lng: stop.lng });
      return { ...p, dist };
    })
    .filter(p => p.dist <= 0.8);
  if (closePoints.length === 0) return null;
  closePoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return closePoints[0].timestamp;
};

export default function LiveTracking() {
  const { busId } = useParams(); // acts as tripId or legacy busId
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user, logout } = useAuth();
  const { t, toggleLanguage } = useLanguage();

  // Translated crowd labels (reactive to language changes)
  const CROWD_LABELS = useMemo(() => ({
    1: t('tracking.crowd.empty'),
    2: t('tracking.crowd.seats'),
    3: t('tracking.crowd.standing'),
    4: t('tracking.crowd.full')
  }), [t]);
  
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const trailPolylineRef = useRef(null);
  const expectedPolylineRef = useRef(null);

  const [trip, setTrip] = useState(null);
  const [activeTripId, setActiveTripId] = useState(null); // stable ID to scope socket subscriptions
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const staleTimer = useRef(null);

  // Refs to track latest values without re-triggering socket effect
  const tripIdRef = useRef(null);
  const inBusRef = useRef(false);
  const stopsCoordsRef = useRef([]);
  const [expandedGaps, setExpandedGaps] = useState({});
  // Passenger check-in and voting states
  const [inBus, setInBus] = useState(false);
  const [onBoardWarning, setOnBoardWarning] = useState(false);
  const [verifyingOnboard, setVerifyingOnboard] = useState(false);
  const [passengerVote, setPassengerVote] = useState(null);
  const [passengerId, setPassengerId] = useState('');
  const [hasVoted, setHasVoted] = useState(false);
  const routeTemplate = trip?.routeSnapshot || trip?.selectedRouteTemplateId;



  // Contribution counter & Modal feedback states
  const [contributionCount, setContributionCount] = useState(0);
  const [showContributionModal, setShowContributionModal] = useState(false);

  // 1. Initialize passenger identifier and check-in status
  useEffect(() => {
    // Set passenger identifier
    const resolvedId = user?._id || user?.id || user?.email || (() => {
      let guestId = localStorage.getItem('trackbus_guest_id');
      if (!guestId) {
        guestId = `guest-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('trackbus_guest_id', guestId);
      }
      return guestId;
    })();
    setPassengerId(resolvedId);

    // Get contribution count
    const storedCount = Number(localStorage.getItem('trackbus_contributions_count') || '0');
    setContributionCount(storedCount);

    // Check if voter has active vote locked in the last 1 hour
    const lastVoteTime = localStorage.getItem(`voted_occupancy_${busId}_${resolvedId}`);
    if (lastVoteTime) {
      const diff = Date.now() - Number(lastVoteTime);
      if (diff < 60 * 60 * 1000) { // 1 hour lock
        setHasVoted(true);
        const savedVote = localStorage.getItem(`voted_level_${busId}_${resolvedId}`);
        if (savedVote) setPassengerVote(Number(savedVote));
      }
    }
  }, [busId, user]);

  const handleInBusConfirm = (ans) => {
    if (!ans) return;
    setVerifyingOnboard(true);
    setOnBoardWarning(false);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (positionCoords) => {
          const { latitude, longitude } = positionCoords.coords;

          // Bus coordinates
          const busLat = trip?.currentLocation?.lat || trip?.latitude || 0;
          const busLng = trip?.currentLocation?.lng || trip?.longitude || 0;

          if (busLat === 0 || busLng === 0) {
            setVerifyingOnboard(false);
            return;
          }

          // Calculate proximity distance to the bus
          const distToBus = distanceKm(
            { lat: latitude, lng: longitude },
            { lat: busLat, lng: busLng }
          );

          // Calculate proximity distance to the route stops & path
          let minDistToRoute = Number.POSITIVE_INFINITY;
          const stops = routeTemplate?.stops || [];
          stops.forEach(stop => {
            const d = distanceKm({ lat: latitude, lng: longitude }, { lat: stop.lat, lng: stop.lng });
            if (d < minDistToRoute) minDistToRoute = d;
          });

          const path = routeTemplate?.pathCoordinates || [];
          path.forEach(pt => {
            const dVal = distanceKm({ lat: latitude, lng: longitude }, { lat: pt[0], lng: pt[1] });
            if (dVal < minDistToRoute) minDistToRoute = dVal;
          });

          const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          const maxAllowedDist = isLocalhost ? 10.0 : 2.0;

          const isNearBus = distToBus <= maxAllowedDist;
          const isNearRoute = minDistToRoute === Number.POSITIVE_INFINITY || minDistToRoute <= maxAllowedDist;

          console.log("🔍 Manual Verification Debug Logs:", {
            passengerCoords: { lat: latitude, lng: longitude },
            busCoords: { lat: busLat, lng: busLng },
            distanceToBusKm: distToBus,
            minDistanceToRouteKm: minDistToRoute,
            isNearBus,
            isNearRoute,
            thresholdKm: maxAllowedDist,
            isLocalhostRelaxed: isLocalhost
          });

          if (isNearBus && isNearRoute) {
            setInBus(true);
            setOnBoardWarning(false);
            setVerifyingOnboard(false);
            localStorage.setItem(`in_bus_${busId}`, 'true');

            // Use current passenger's verified coordinates for map showing and speedometer directly
            setTrip(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                currentLocation: { lat: latitude, lng: longitude },
                speed: positionCoords.coords.speed !== null && positionCoords.coords.speed !== undefined ? positionCoords.coords.speed * 3.6 : prev.speed, // convert m/s to km/h
                heading: positionCoords.coords.heading !== null && positionCoords.coords.heading !== undefined ? positionCoords.coords.heading : prev.heading
              };
            });

            // Move the leaflet marker smoothly
            if (markerRef.current) {
              markerRef.current.setLatLng([latitude, longitude]);
              const rotatedIcon = L.divIcon({
                html: `
                  <div style="width:36px;height:36px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(29,78,216,0.4);border:2.5px solid white;transform:rotate(${positionCoords.coords.heading || 0}deg);transition:transform 0.3s ease-out">
                    <div style="color:white;font-size:16px">🚌</div>
                  </div>
                `,
                iconSize: [36, 36],
                iconAnchor: [18, 18],
                className: ''
              });
              markerRef.current.setIcon(rotatedIcon);
            }

            if (mapInstance.current) {
              mapInstance.current.panTo([latitude, longitude], { animate: true });
            }

            // DB-level check-in
            try {
              const activeTripId = trip?.tripId || busId;
              await axios.post(`/api/passenger/trips/${activeTripId}/check-in`, {
                passengerId
              });
            } catch (err) {
              console.warn('DB check-in failed:', err.message);
            }

            // Increment contribution count
            const newCount = contributionCount + 1;
            setContributionCount(newCount);
            localStorage.setItem('trackbus_contributions_count', String(newCount));
            
            // Show premium success feedback popup!
            setShowContributionModal(true);
          } else {
            setInBus(false);
            setVerifyingOnboard(false);
            localStorage.removeItem(`in_bus_${busId}`);
            setOnBoardWarning(true);
            setTimeout(() => {
              setOnBoardWarning(false);
            }, 6000);
          }
        },
        (err) => {
          console.warn('Geolocation failed during onboarding:', err.message);
          setInBus(false);
          setVerifyingOnboard(false);
          setOnBoardWarning(true);
          setTimeout(() => {
            setOnBoardWarning(false);
          }, 6000);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      setInBus(false);
      setVerifyingOnboard(false);
    }
  };

  // 2. Active background passenger geolocation verification & silent reporting
  useEffect(() => {
    if (!passengerId || !trip) return;

    let watchId = null;

    if ('geolocation' in navigator) {
      const handleGeoSuccess = async (position) => {
        const { latitude, longitude, speed, heading, accuracy } = position.coords;

        // Bus coordinates
        const busLat = trip?.currentLocation?.lat || trip?.latitude || 0;
        const busLng = trip?.currentLocation?.lng || trip?.longitude || 0;

        if (busLat === 0 || busLng === 0) return;

        // Calculate proximity distance to the bus
        const distToBus = distanceKm(
          { lat: latitude, lng: longitude },
          { lat: busLat, lng: busLng }
        );

        // Calculate proximity distance to the route stops & path
        let minDistToRoute = Number.POSITIVE_INFINITY;
        const stops = routeTemplate?.stops || [];
        stops.forEach(stop => {
          const d = distanceKm({ lat: latitude, lng: longitude }, { lat: stop.lat, lng: stop.lng });
          if (d < minDistToRoute) minDistToRoute = d;
        });

        const path = routeTemplate?.pathCoordinates || [];
        path.forEach(pt => {
          const d = distanceKm({ lat: latitude, lng: longitude }, { lat: pt[0], lng: pt[1] });
          if (d < minDistToRoute) minDistToRoute = d;
        });

        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const maxAllowedDist = isLocalhost ? 10.0 : 2.0;

        const isNearBus = distToBus <= maxAllowedDist;
        const isNearRoute = minDistToRoute === Number.POSITIVE_INFINITY || minDistToRoute <= maxAllowedDist;

        console.log("📡 Background Telemetry Proximity Verification:", {
          passengerCoords: { lat: latitude, lng: longitude },
          busCoords: { lat: busLat, lng: busLng },
          distanceToBusKm: distToBus,
          minDistanceToRouteKm: minDistToRoute,
          isNearBus,
          isNearRoute,
          thresholdKm: maxAllowedDist,
          isLocalhostRelaxed: isLocalhost
        });

        if (isNearBus && isNearRoute) {
          // Dynamically verified onboard!
          if (!inBus) {
            setInBus(true);
            localStorage.setItem(`in_bus_${busId}`, 'true');

            // Silent DB level check-in
            try {
              const activeTripId = trip?.tripId || busId;
              await axios.post(`/api/passenger/trips/${activeTripId}/check-in`, {
                passengerId
              });
            } catch (err) {
              console.warn('Auto DB check-in failed:', err.message);
            }
          }

          // Smoothly update the current passenger's map view with their own high-fidelity coordinates!
          setTrip(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              currentLocation: { lat: latitude, lng: longitude },
              speed: speed !== null && speed !== undefined ? speed * 3.6 : prev.speed, // convert m/s to km/h
              heading: heading !== null && heading !== undefined ? heading : prev.heading
            };
          });

          if (markerRef.current) {
            markerRef.current.setLatLng([latitude, longitude]);
            const rotatedIcon = L.divIcon({
              html: `
                <div style="width:36px;height:36px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(29,78,216,0.4);border:2.5px solid white;transform:rotate(${heading || 0}deg);transition:transform 0.3s ease-out">
                  <div style="color:white;font-size:16px">🚌</div>
                </div>
              `,
              iconSize: [36, 36],
              iconAnchor: [18, 18],
              className: ''
            });
            markerRef.current.setIcon(rotatedIcon);
          }

          if (mapInstance.current) {
            mapInstance.current.panTo([latitude, longitude], { animate: true });
          }

          // Emit location coordinates update to WebSockets
          if (socket) {
            socket.emit('passenger-location-update', {
              tripId: trip.tripId,
              passengerId,
              latitude,
              longitude,
              speed,
              heading,
              accuracy
            });
            console.log(`📡 Silent check-in GPS update reported: ${latitude}, ${longitude}`);
          }
        } else {
          // If passenger left the bus boundaries -> Auto checkout!
          if (inBus) {
            setInBus(false);
            localStorage.removeItem(`in_bus_${busId}`);

            // Silent DB level checkout
            try {
              const activeTripId = trip?.tripId || busId;
              await axios.post(`/api/passenger/trips/${activeTripId}/check-out`, {
                passengerId
              });
            } catch (err) {
              console.warn('Auto DB check-out failed:', err.message);
            }
          }
        }
      };

      const handleGeoError = (error) => {
        console.warn('Background geolocation silent watch failed:', error.message);
      };

      // Watch passenger position constantly as long as page is open!
      watchId = navigator.geolocation.watchPosition(handleGeoSuccess, handleGeoError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      });
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [trip, passengerId, socket, inBus, busId]);

  const handleCheckOut = async () => {
    try {
      const activeTripId = trip?.tripId || busId;
      await axios.post(`/api/passenger/trips/${activeTripId}/check-out`, {
        passengerId
      });
    } catch (err) {
      console.warn('Manual check-out failed:', err.message);
    }
    setInBus(false);
    localStorage.removeItem(`in_bus_${busId}`);
  };

  const handleVoteOccupancy = async (level) => {
    if (hasVoted) return; // Prevent double submit
    try {
      const activeTripId = trip?.tripId || busId;
      const res = await axios.post(`/api/passenger/trips/${activeTripId}/occupancy-vote`, {
        passengerId,
        vote: level
      });
      if (res.data?.success) {
        setPassengerVote(level);
        setHasVoted(true);
        localStorage.setItem(`voted_occupancy_${busId}_${passengerId}`, String(Date.now()));
        localStorage.setItem(`voted_level_${busId}_${passengerId}`, String(level));
        setTrip(prev => ({
          ...prev,
          occupancyLevel: res.data.occupancyLevel
        }));

        // Increment contribution count for successful occupancy polling!
        const newCount = contributionCount + 1;
        setContributionCount(newCount);
        localStorage.setItem('trackbus_contributions_count', String(newCount));
        setShowContributionModal(true);
      }
    } catch (err) {
      console.warn('Failed to submit occupancy vote:', err.message);
    }
  };

  // Compute Stop waypoints timeline sequence
  const schedule = useMemo(() => {
    if (!routeTemplate?.stops?.length) return null;
    
    let stops = [...routeTemplate.stops].sort((a, b) => a.sequence - b.sequence);

    // Personalize stops sequence: truncate up to passenger's searched destination stop
    const toParam = searchParams.get('to');
    if (toParam) {
      const cleanTo = toParam.trim().toLowerCase();
      const toIndex = stops.findIndex(s => s.name.toLowerCase().includes(cleanTo));
      if (toIndex !== -1) {
        stops = stops.slice(0, toIndex + 1);
      }
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const stopTimes = stops.map((s) => {
      const time = s.arrivalTime || s.departureTime;
      return { ...s, timeMinutes: parseTimeToMinutes(time) };
    });

    let currentIndex = 0;
    let currentDistanceKm = null;
    
    const currentLat = trip?.currentLocation?.lat || trip?.latitude;
    const currentLng = trip?.currentLocation?.lng || trip?.longitude;

    if (currentLat && currentLng) {
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      stopTimes.forEach((stop, idx) => {
        const dist = distanceKm({ lat: currentLat, lng: currentLng }, { lat: stop.lat, lng: stop.lng });
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });
      currentIndex = bestIdx;
      currentDistanceKm = bestDist;
    } else {
      stopTimes.forEach((s, idx) => {
        if (s.timeMinutes !== null && s.timeMinutes <= nowMinutes) currentIndex = idx;
      });
    }

    const nextIndex = currentIndex + 1 < stopTimes.length ? currentIndex + 1 : null;

    return {
      stops: stopTimes,
      start: stopTimes[0],
      last: currentIndex >= 0 ? stopTimes[currentIndex] : null,
      next: nextIndex !== null ? stopTimes[nextIndex] : null,
      destination: stopTimes[stopTimes.length - 1],
      currentIndex: currentIndex,
      currentDistanceKm: currentDistanceKm
    };
  }, [trip, searchParams]);

  // Memoized component-level stops coordinates based on personalized stops
  const stopsCoords = useMemo(() => {
    if (!schedule?.stops) return [];
    return schedule.stops
      .filter(s => s && s.lat !== 0 && s.lng !== 0 && s.lat && s.lng)
      .map(s => [s.lat, s.lng]);
  }, [schedule]);

  // Keep refs in sync so socket handlers always read latest values without triggering re-subscribe
  useEffect(() => { inBusRef.current = inBus; }, [inBus]);
  useEffect(() => { if (trip?.tripId) tripIdRef.current = trip.tripId; }, [trip?.tripId]);
  useEffect(() => { stopsCoordsRef.current = stopsCoords; }, [stopsCoords]);

  // Personalized display destination
  const displayDestination = useMemo(() => {
    const toParam = searchParams.get('to');
    if (toParam && schedule?.destination?.name) {
      return schedule.destination.name;
    }
    return trip?.destination || '';
  }, [trip, searchParams, schedule]);

  // Compute actual and dynamic estimated arrival/departure times for each stop node
  const stopEstimates = useMemo(() => {
    const estimates = {};
    if (!schedule?.stops) return estimates;

    const startedTime = trip?.startedAt ? new Date(trip.startedAt) : new Date();
    const speed = trip?.speed > 10 ? trip.speed : 40; // fallback to 40 km/h

    // Cumulative propagation from the start of the journey
    let prevPos = schedule.stops[0];
    let accumulatedTimeMs = startedTime.getTime();

    schedule.stops.forEach((stop, idx) => {
      // Distance from previous stop
      const dist = idx === 0 ? 0 : distanceKm(prevPos, stop);
      // Travel duration in ms
      const travelMs = (dist / speed) * 60 * 60 * 1000;
      accumulatedTimeMs += travelMs;

      const arrDate = new Date(accumulatedTimeMs);
      // default stop stay: 3 minutes for intermediate, 5 minutes for confirmed/major stops
      const stayMs = (stop.isConfirmed !== false ? 5 : 2) * 60 * 1000;
      const depDate = new Date(arrDate.getTime() + stayMs);

      // check if actually visited using pathHistory
      const actualArrivedTime = findArrivalTime(stop, trip.pathHistory);
      const isFirst = idx === 0;

      if (actualArrivedTime) {
        const actualArr = new Date(actualArrivedTime);
        const actualDep = new Date(actualArr.getTime() + stayMs);
        estimates[idx] = {
          status: 'arrived',
          time: actualArr,
          arriveLabel: formatClock(actualArr),
          departLabel: formatClock(actualDep),
          isActual: true
        };
      } else if (isFirst) {
        // First stop is always visited when the journey starts
        estimates[idx] = {
          status: 'arrived',
          time: startedTime,
          arriveLabel: formatClock(startedTime),
          departLabel: formatClock(new Date(startedTime.getTime() + stayMs)),
          isActual: true
        };
      } else {
        // Upcoming stop calculation
        estimates[idx] = {
          status: idx < schedule.currentIndex ? 'skipped' : 'upcoming',
          time: arrDate,
          arriveLabel: formatClock(arrDate),
          departLabel: formatClock(depDate),
          isActual: false,
          dist: idx >= schedule.currentIndex ? distanceKm(trip.currentLocation?.lat ? trip.currentLocation : prevPos, stop) : undefined
        };
      }

      // Sync accumulated time for dynamic upcoming estimates propagation
      if (actualArrivedTime) {
        accumulatedTimeMs = new Date(actualArrivedTime).getTime() + stayMs;
      } else if (isFirst) {
        accumulatedTimeMs = startedTime.getTime() + stayMs;
      } else {
        accumulatedTimeMs = depDate.getTime();
      }

      prevPos = stop;
    });

    return estimates;
  }, [schedule, trip]);

  // Group stops into confirmed main stations and expandable intermediate gaps
  const timelineBlocks = useMemo(() => {
    if (!schedule?.stops) return [];

    const blocks = [];
    let currentIntermediate = [];

    schedule.stops.forEach((stop, idx) => {
      const isConfirmed = stop.isConfirmed !== false; // default true if undefined
      
      if (isConfirmed) {
        if (currentIntermediate.length > 0) {
          blocks.push({
            type: 'intermediate_gap',
            stops: currentIntermediate,
            key: `gap-${idx - currentIntermediate.length}-${idx}`
          });
          currentIntermediate = [];
        }
        
        blocks.push({
          type: 'stop',
          stop,
          idx,
          key: `stop-${stop.name}-${idx}`
        });
      } else {
        currentIntermediate.push({ stop, idx });
      }
    });

    if (currentIntermediate.length > 0) {
      blocks.push({
        type: 'intermediate_gap',
        stops: currentIntermediate,
        key: `gap-end-${schedule.stops.length - currentIntermediate.length}`
      });
    }

    return blocks;
  }, [schedule]);

  // Fetch LiveTrip info (direct lookup first, then backward compatibility fallback)
  useEffect(() => {
    const addRecentTrip = (tripObj) => {
      if (!tripObj) return;
      const bus = tripObj.physicalBusId;
      const busNumber = bus?.busNumber || tripObj.tripId || tripObj._id;
      const routeName = (tripObj.routeSnapshot?.routeName || tripObj.selectedRouteTemplateId?.routeName) || `${tripObj.source} – ${tripObj.destination}`;
      
      const clean = {
        _id: bus?._id || tripObj._id || tripObj.tripId,
        busNumber: busNumber,
        routeName: routeName,
        status: tripObj.isActive ? 'active' : 'inactive',
        speed: tripObj.speed || 0,
        latitude: tripObj.currentLocation?.lat || bus?.latitude || 0,
        longitude: tripObj.currentLocation?.lng || bus?.longitude || 0,
        currentCrowd: tripObj.occupancyLevel || bus?.currentCrowd || 1,
        lastUpdated: tripObj.lastUpdatedAt || bus?.lastUpdated || null,
        startTime: tripObj.startedAt || null,
        endTime: null
      };

      const RECENT_KEY = 'trackbus_recent_buses';
      let recent = [];
      try {
        const raw = localStorage.getItem(RECENT_KEY);
        recent = raw ? JSON.parse(raw) : [];
      } catch {}

      const existing = recent.filter(b => b.busNumber !== clean.busNumber);
      const next = [clean, ...existing].slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    };

    const fetchTripDetails = async () => {
      try {
        const directRes = await axios.get(`/api/trips/${busId}`);
        const foundTrip = directRes.data?.data || directRes.data;

        if (foundTrip) {
          setTrip(foundTrip);
          setActiveTripId(foundTrip.tripId || foundTrip._id || busId);
          setLastUpdate(new Date(foundTrip.lastUpdatedAt || foundTrip.startedAt || Date.now()));
          setLoading(false);
          addRecentTrip(foundTrip);
          return;
        }
      } catch (err) {
        if (err?.response?.status !== 404) {
          console.warn('Direct trip lookup failed:', err.message);
        }
      }

      try {
        const res = await axios.get('/api/trips/active');
        const activeList = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
        const foundTrip = activeList.find(t =>
          t.tripId === busId ||
          t._id === busId ||
          t.physicalBusId?._id === busId ||
          t.physicalBusId?.busNumber === busId
        );
        
        if (foundTrip) {
          setTrip(foundTrip);
          setActiveTripId(foundTrip.tripId || foundTrip._id || busId);
          setLastUpdate(new Date(foundTrip.lastUpdatedAt || foundTrip.startedAt || Date.now()));
          setLoading(false);
          addRecentTrip(foundTrip);
          return;
        }

        // Legacy fallback: query by busNumber
        const fallbackRes = await axios.get('/api/buses/active');
        const activeBuses = Array.isArray(fallbackRes.data?.data) ? fallbackRes.data.data : (Array.isArray(fallbackRes.data) ? fallbackRes.data : []);
        const foundBus = activeBuses.find(b => b._id === busId || b.busNumber === busId);
        
        if (foundBus) {
          // Adapt legacy Bus object structure into LiveTrip shape
          const adapted = {
            tripId: foundBus.busNumber,
            source: foundBus.route?.source || foundBus.route?.startPoint || 'Pune',
            destination: foundBus.route?.destination || foundBus.route?.endPoint || 'Sangli',
            currentLocation: { lat: foundBus.latitude, lng: foundBus.longitude },
            pathHistory: [{ lat: foundBus.latitude, lng: foundBus.longitude, timestamp: new Date() }],
            speed: foundBus.speed,
            heading: foundBus.heading,
            occupancyLevel: foundBus.currentCrowd || 1,
            selectedRouteTemplateId: foundBus.route,
            routeSnapshot: foundBus.route,
            isActive: foundBus.status === 'active'
          };
          setTrip(adapted);
          setActiveTripId(adapted.tripId || busId);
          setLastUpdate(new Date(foundBus.lastUpdated || Date.now()));
          addRecentTrip(adapted);
        }
      } catch (err) {
        console.warn('Failed to load tracking item:', err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTripDetails();
  }, [busId]);

  // Initialize Leaflet Map components
  useEffect(() => {
    if (!trip || mapInstance.current) return;
    if (!mapRef.current) return;

    const latVal = (trip.currentLocation?.lat !== 0 && trip.currentLocation?.lat) || (trip.latitude !== 0 && trip.latitude) || 18.5204;
    const lngVal = (trip.currentLocation?.lng !== 0 && trip.currentLocation?.lng) || (trip.longitude !== 0 && trip.longitude) || 73.8567;

    // 1. Initialize Map
    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([latVal, lngVal], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // 2. Draw expected route template polyline (guidance only - off blue, dashed)
    let expectedCoords = (routeTemplate?.pathCoordinates && routeTemplate.pathCoordinates.length > 0)
      ? routeTemplate.pathCoordinates.filter(pt => pt && pt[0] !== 0 && pt[1] !== 0)
      : stopsCoords;

    // Truncate initial path coordinates at the passenger's searched destination stop
    if (stopsCoords.length > 0 && expectedCoords.length > 0) {
      const destStop = stopsCoords[stopsCoords.length - 1];
      let minDistance = Number.POSITIVE_INFINITY;
      let closestIdx = 0;
      for (let i = 0; i < expectedCoords.length; i++) {
        const pt = expectedCoords[i];
        const dist = distanceKm({ lat: pt[0], lng: pt[1] }, { lat: destStop[0], lng: destStop[1] });
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      }
      if (minDistance < 5) {
        expectedCoords = expectedCoords.slice(0, closestIdx + 1);
      }
    }

    if (expectedCoords.length > 0) {
      const expPoly = L.polyline(expectedCoords, {
        color: '#4fa8ff', // off blue
        weight: 4,
        dashArray: '8, 8', // dashed guidance path representation
        opacity: 0.8
      }).addTo(map);
      expectedPolylineRef.current = expPoly;
    }

    // 3. Draw traveled path history trail (actual coordinates - solid dark blue)
    const traveledCoords = (trip.pathHistory || [])
      .filter(p => {
        if (!p || p.lat === 0 || p.lng === 0) return false;
        if (stopsCoords.length === 0) return true;
        return stopsCoords.some(stop => {
          const dist = distanceKm({ lat: p.lat, lng: p.lng }, { lat: stop[0], lng: stop[1] });
          return dist <= 50;
        });
      })
      .map(p => [p.lat, p.lng]);
      
    // Trail fallback must start from first station, e.g. Sangli/Pune, never 0,0
    const startStop = routeTemplate?.stops?.[0];
    const fallbackCoord = (startStop && startStop.lat !== 0 && startStop.lng !== 0)
      ? [startStop.lat, startStop.lng]
      : [latVal, lngVal];

    const trail = L.polyline(traveledCoords.length > 0 ? traveledCoords : [fallbackCoord], {
      color: '#1e3a8a', // solid dark blue
      weight: 6,
      opacity: 0.95
    }).addTo(map);
    trailPolylineRef.current = trail;

    // 4. Draw moving GPS marker (heading rotated SVG)
    const busIcon = L.divIcon({
      html: `
        <div style="width:36px;height:36px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(29,78,216,0.4);border:2.5px solid white;transform:rotate(${trip.heading || 0}deg);transition:transform 0.3s ease-out">
          <div style="color:white;font-size:16px;transform:rotate(0deg)">🚌</div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      className: ''
    });

    const marker = L.marker([latVal, lngVal], { icon: busIcon }).addTo(map);
    marker.bindPopup(`
      <div style="font-family:sans-serif;font-size:0.8rem">
        <strong>${trip.tripId}</strong><br/>
        Corridor: ${trip.source} → ${displayDestination}
      </div>
    `).openPopup();
    markerRef.current = marker;

    // 5. Fit bounds to guidance route or set viewport
    if (expectedCoords.length > 0) {
      map.fitBounds(L.polyline(expectedCoords).getBounds(), { padding: [30, 30] });
    } else if (traveledCoords.length > 0) {
      map.fitBounds(trail.getBounds(), { padding: [30, 30] });
    }

    mapInstance.current = map;
  }, [trip, stopsCoords, displayDestination]);

  // Connect Socket.IO updates for active LiveTrip
  useEffect(() => {
    if (!socket || !activeTripId) return;

    // Join the specific room for this trip
    const trackingRoomId = activeTripId;
    // Update ref as well
    tripIdRef.current = activeTripId;
    socket.emit('track-bus', trackingRoomId);

    const handleTelemetryChange = (data) => {
      // Ensure update is for our active trip — use ref to avoid stale closure
      const currentTripId = tripIdRef.current;
      if (!currentTripId) return;
      if (data.tripId !== currentTripId && data.busNumber !== currentTripId) return;

      const newLat = data.currentLocation?.lat || data.latitude;
      const newLng = data.currentLocation?.lng || data.longitude;

      if (!newLat || !newLng || newLat === 0 || newLng === 0) return; // filter out equatorial anomalies

      // If the passenger is verified onboard, their own high-precision device GPS drives the map,
      // so we don't overwrite their location coordinates, speed, or heading, but we still sync metadata.
      if (inBusRef.current) {
        setTrip(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            pathHistory: data.pathHistory || prev.pathHistory || [],
            occupancyLevel: data.occupancyLevel || data.currentCrowd || prev.occupancyLevel,
            isActive: true
          };
        });
        setLastUpdate(new Date());
        setIsStale(false);
        clearTimeout(staleTimer.current);
        staleTimer.current = setTimeout(() => setIsStale(true), 15000);
        return;
      }

      // Update state
      setTrip(prev => ({
        ...prev,
        currentLocation: { lat: newLat, lng: newLng },
        pathHistory: data.pathHistory || prev.pathHistory || [],
        speed: data.speed,
        heading: data.heading,
        occupancyLevel: data.occupancyLevel || data.currentCrowd || prev.occupancyLevel,
        isActive: true
      }));

      setLastUpdate(new Date());
      setIsStale(false);

      // Reset stale warning timer
      clearTimeout(staleTimer.current);
      staleTimer.current = setTimeout(() => setIsStale(true), 15000); // 15 seconds stale warning

      // Update Leaflet marker coordinates and rotatable heading
      if (markerRef.current) {
        markerRef.current.setLatLng([newLat, newLng]);
        
        // Dynamic SVG Icon rebuild to update rotated direction
        const rotatedIcon = L.divIcon({
          html: `
            <div style="width:36px;height:36px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(29,78,216,0.4);border:2.5px solid white;transform:rotate(${data.heading || 0}deg);transition:transform 0.3s ease-out">
              <div style="color:white;font-size:16px">🚌</div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
          className: ''
        });
        markerRef.current.setIcon(rotatedIcon);
      }

      // Update solid traveled trail coordinates array — use ref for stopsCoords
      if (trailPolylineRef.current) {
        const currentStopsCoords = stopsCoordsRef.current;
        const historyCoords = (data.pathHistory || [])
          .filter(p => {
            if (!p || p.lat === 0 || p.lng === 0) return false;
            if (currentStopsCoords.length === 0) return true;
            return currentStopsCoords.some(stop => {
              const dist = distanceKm({ lat: p.lat, lng: p.lng }, { lat: stop[0], lng: stop[1] });
              return dist <= 50;
            });
          })
          .map(p => [p.lat, p.lng]);
          
        if (historyCoords.length > 0) {
          trailPolylineRef.current.setLatLngs(historyCoords);
        } else {
          trailPolylineRef.current.addLatLng([newLat, newLng]);
        }
      }

      // Soft center map view to follow the vehicle
      if (mapInstance.current) {
        mapInstance.current.panTo([newLat, newLng], { animate: true });
      }
    };

    const handleOccupancyChange = (data) => {
      const currentTripId = tripIdRef.current;
      if (!currentTripId || data.tripId !== currentTripId) return;
      setTrip(prev => ({
        ...prev,
        occupancyLevel: data.occupancyLevel
      }));
    };

    socket.on('trip-location-changed', handleTelemetryChange);
    socket.on('bus-location-update', handleTelemetryChange); // legacy fallback
    socket.on('global-bus-location-changed', handleTelemetryChange); // legacy fallback
    socket.on('trip-occupancy-changed', handleOccupancyChange);

    // HTTP polling — primary mechanism on Vercel (WebSocket not supported on serverless).
    // Runs immediately on mount, then every 4s for near-real-time feel.
    const doPoll = async () => {
      const currentTripId = tripIdRef.current;
      if (!currentTripId || inBusRef.current) return; // skip if onboard (own GPS) or no tripId
      try {
        const res = await axios.get(`/api/trips/${currentTripId}`);
        const freshTrip = res.data?.data || res.data;
        if (!freshTrip) return;

        const lat = freshTrip.currentLocation?.lat;
        const lng = freshTrip.currentLocation?.lng;
        if (!lat || !lng || lat === 0 || lng === 0) return;

        setTrip(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            currentLocation: freshTrip.currentLocation,
            pathHistory: freshTrip.pathHistory || prev.pathHistory || [],
            speed: freshTrip.speed ?? prev.speed,
            heading: freshTrip.heading ?? prev.heading,
            occupancyLevel: freshTrip.occupancyLevel ?? prev.occupancyLevel,
            isActive: freshTrip.isActive ?? prev.isActive
          };
        });
        setLastUpdate(new Date(freshTrip.lastUpdatedAt || Date.now()));
        setIsStale(false);
        clearTimeout(staleTimer.current);
        staleTimer.current = setTimeout(() => setIsStale(true), 15000);

        // Sync map marker
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          const rotatedIcon = L.divIcon({
            html: `
              <div style="width:36px;height:36px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(29,78,216,0.4);border:2.5px solid white;transform:rotate(${freshTrip.heading || 0}deg);transition:transform 0.3s ease-out">
                <div style="color:white;font-size:16px">🚌</div>
              </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
            className: ''
          });
          markerRef.current.setIcon(rotatedIcon);
        }
        if (trailPolylineRef.current && (freshTrip.pathHistory || []).length > 0) {
          const coords = freshTrip.pathHistory.filter(p => p.lat !== 0 && p.lng !== 0).map(p => [p.lat, p.lng]);
          if (coords.length > 0) trailPolylineRef.current.setLatLngs(coords);
        }
        if (mapInstance.current) {
          mapInstance.current.panTo([lat, lng], { animate: true });
        }
      } catch {
        // silently ignore poll failures
      }
    };

    // Run immediately so passenger sees latest position right away (no 4s wait)
    doPoll();
    const pollInterval = setInterval(doPoll, 4000);

    return () => {
      socket.emit('untrack-bus', trackingRoomId);
      socket.off('trip-location-changed', handleTelemetryChange);
      socket.off('bus-location-update', handleTelemetryChange);
      socket.off('global-bus-location-changed', handleTelemetryChange);
      socket.off('trip-occupancy-changed', handleOccupancyChange);
      clearInterval(pollInterval);
      clearTimeout(staleTimer.current);
    };
  }, [socket, activeTripId]); // Only re-run when socket connection or resolved tripId changes

  // Fetch exact road-wise driving path from OSRM between stops
  useEffect(() => {
    if (!trip || stopsCoords.length < 2) return;

    const fetchRoadPath = async () => {
      try {
        const coordString = stopsCoords.map(c => `${c[1]},${c[0]}`).join(';');
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`);
        const data = await res.json();
        
        if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
          const roadCoords = data.routes[0].geometry.coordinates.map(pt => [pt[1], pt[0]]);
          if (expectedPolylineRef.current && roadCoords.length > 0) {
            expectedPolylineRef.current.setLatLngs(roadCoords);
            if (mapInstance.current) {
              mapInstance.current.fitBounds(expectedPolylineRef.current.getBounds(), { padding: [30, 30] });
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch exact road path from OSRM:', err.message);
      }
    };

    fetchRoadPath();
  }, [stopsCoords]);

  // Time formatter
  const [timeSince, setTimeSince] = useState('');
  useEffect(() => {
    const calc = () => {
      if (!lastUpdate) return;
      const s = Math.floor((Date.now() - lastUpdate) / 1000);
      if (s < 5) setTimeSince('just now');
      else if (s < 60) setTimeSince(`${s}s ago`);
      else setTimeSince(`${Math.floor(s / 60)}m ago`);
    };
    calc();
    const t = setInterval(calc, 5000);
    return () => clearInterval(t);
  }, [lastUpdate]);

  if (loading) return (
    <div className="page">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}>
          <ArrowLeft size={18} />
        </button>
        <span className="topbar-title">Loading Journey…</span>
        <div />
      </div>
      <div className="page-content" style={{ padding: '24px 16px' }}>
        <div className="skeleton" style={{ height: 260, borderRadius: 12, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
      </div>
    </div>
  );

  if (!trip) return (
    <div className="page">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}>
          <ArrowLeft size={18} />
        </button>
        <span className="topbar-title">Not Found</span>
        <div />
      </div>
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-icon"><Bus size={24} /></div>
          <h3>Active Live Trip not found</h3>
          <p>The driver may have completed this trip session.</p>
          <button className="btn btn-primary mt-3" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    </div>
  );

  const isActive = trip.isActive !== false;

  return (
    <div className="page">
      {/* Topbar navigation banner */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}>
            <ArrowLeft size={18} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
              {trip.source} → {displayDestination}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              Session ID: {trip.tripId}
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge ${isActive ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: '0.72rem' }}>
            {isActive ? <><span className="live-dot" style={{ width: 5, height: 5 }} />Live Tracking</> : 'Completed'}
          </span>
          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 20,
              padding: '3px 10px',
              fontSize: '0.68rem',
              fontWeight: 700,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 3
            }}
          >
            🌐 {t('lang.toggle')}
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/profile')} style={{ padding: 8 }}>
            <User size={16} />
          </button>
        </div>
      </div>

      {/* Main Map tracking area */}
      <div className="page-content" style={{ padding: 0 }}>
        <div className="split-pane-container">
        
          {/* Map Canvas with overlays */}
          {isActive ? (
            <div className="map-pane">
              {/* Map Canvas */}
              <div ref={mapRef} className="map-container" style={{ height: '100%', borderRadius: 0 }} />

            {/* Floating "Inside Bus?" Toggle Switch (Top Right Overlay - Non-Compulsory Option) */}
            <div style={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 20,
              background: verifyingOnboard ? 'rgba(255, 255, 255, 0.95)' : (inBus ? 'rgba(22, 163, 74, 0.95)' : 'rgba(255, 255, 255, 0.95)'),
              backdropFilter: 'blur(10px)',
              border: verifyingOnboard ? '1.5px solid var(--accent)' : (inBus ? '1.5px solid #16a34a' : '1.5px solid var(--border)'),
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              transition: 'all 0.3s ease',
              cursor: verifyingOnboard ? 'default' : 'pointer',
              userSelect: 'none',
              opacity: verifyingOnboard ? 0.85 : 1
            }} onClick={() => {
              if (verifyingOnboard) return;
              if (inBus) {
                handleCheckOut();
              } else {
                handleInBusConfirm(true);
              }
            }}>
              {verifyingOnboard ? (
                <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
              ) : (
                <Bus size={14} style={{ color: inBus ? 'white' : 'var(--text-secondary)' }} />
              )}
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: verifyingOnboard ? 'var(--accent)' : (inBus ? 'white' : 'var(--text-primary)')
              }}>
                {verifyingOnboard ? t('tracking.btn.verify_onboard') : (inBus ? t('tracking.check_out') : t('tracking.check_in'))}
              </span>
              {!verifyingOnboard && (
                <div style={{
                  width: 28,
                  height: 16,
                  borderRadius: 10,
                  background: inBus ? 'rgba(255,255,255,0.3)' : 'var(--border-strong)',
                  position: 'relative',
                  transition: 'all 0.3s ease'
                }}>
                  <div style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: 2,
                    left: inBus ? 14 : 2,
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                  }} />
                </div>
              )}
            </div>

            {/* Floating Speedometer (Bottom Left Overlay) */}
            <div style={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              zIndex: 1000,
              width: 76,
              height: 76,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(10px)',
              border: '2.5px solid var(--accent)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--accent)', lineHeight: 1.05 }}>
                {Math.round(trip.speed || 0)}
              </div>
              <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', marginTop: 1, letterSpacing: '0.04em' }}>
                km/h
              </div>
            </div>

            {/* Floating Passenger Load (Bottom Right Overlay) */}
            <div style={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              zIndex: 1000,
              padding: '6px 12px',
              borderRadius: 14,
              background: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(10px)',
              border: '1.5px solid var(--border)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: CROWD_COLORS[trip.occupancyLevel] || '#16a34a',
                animation: trip.occupancyLevel >= 3 ? 'pulse 1.5s infinite' : 'none'
              }} />
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                {CROWD_LABELS[trip.occupancyLevel] || t('tracking.crowd.seats')}
              </div>
            </div>
          </div>
        ) : (
            <div className="map-pane" style={{ background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
              <MapPin size={32} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: '0.85rem' }}>Live Trip Session Completed</span>
            </div>
          )}

          <div className="scrollable-info-pane">
          
          {/* Proximity Failure Onboarding Warning Banner */}
          {!inBus && onBoardWarning && isActive && (
            <div className="alert alert-danger" style={{
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 14px',
              background: 'rgba(220, 38, 38, 0.08)',
              borderColor: 'rgba(220, 38, 38, 0.2)',
              borderRadius: 12,
              color: '#dc2626',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(220, 38, 38, 0.05)'
            }}>
              <AlertCircle size={16} style={{ color: '#dc2626' }} />
              <div style={{ flex: 1 }}>
                {t('tracking.onboard_warning')}
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setOnBoardWarning(false)} style={{ color: '#dc2626', textDecoration: 'underline', fontSize: '0.72rem', padding: 0 }}>
                {t('tracking.btn.close')}
              </button>
            </div>
          )}

          {/* Verified Rider Banner */}
          {inBus && isActive && (
            <div className="alert alert-success" style={{
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 14px',
              background: 'rgba(22, 163, 74, 0.08)',
              borderColor: 'rgba(22, 163, 74, 0.2)',
              borderRadius: 12,
              color: '#16a34a',
              fontWeight: 600,
              boxShadow: '0 2px 8px rgba(22, 163, 74, 0.05)'
            }}>
              <Radio size={16} className="animate-pulse" style={{ color: '#16a34a' }} />
              <div style={{ flex: 1 }}>
                Rider GPS Verified. You are sharing location in the background.
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => handleCheckOut()} style={{ color: '#16a34a', textDecoration: 'underline', fontSize: '0.72rem', padding: 0 }}>
                Stop
              </button>
            </div>
          )}

          {/* Geolocation Stale warnings */}
          {isStale && isActive && (
            <div className="alert alert-warn" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}>
              <RefreshCw size={13} className="animate-spin" /> GPS telemetry signal low. Coordinates may be outdated.
            </div>
          )}

          {/* Crowd-sourced Occupancy Voting Poll */}
          {isActive && (
            <div className="card" style={{ padding: '16px 14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={15} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Crowd Feedback Poll
                  </span>
                </div>
                {hasVoted && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--green)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Check size={12} /> Feedback Logged
                  </span>
                )}
              </div>
              
              {inBus ? (
                <>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {hasVoted ? t('tracking.contribution') : t('tracking.vote_subtitle')}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 4 }}>
                    {[1, 2, 3, 4].map(level => {
                      const label = CROWD_LABELS[level];
                      const isSelected = passengerVote === level;
                      return (
                        <button
                          key={level}
                          disabled={hasVoted}
                          onClick={() => handleVoteOccupancy(level)}
                          className={`btn ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                          style={{
                            padding: '8px 4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            borderRadius: 10,
                            border: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            background: isSelected ? 'var(--accent)' : 'var(--bg-subtle)',
                            color: isSelected ? 'white' : 'var(--text-secondary)',
                            boxShadow: isSelected ? '0 3px 8px rgba(29, 78, 216, 0.2)' : 'none',
                            opacity: (hasVoted && !isSelected) ? 0.5 : 1,
                            cursor: hasVoted ? 'default' : 'pointer'
                          }}
                        >
                          <span style={{ fontSize: '1.2rem' }}>
                            {{ 1: '🌱', 2: '💺', 3: '🧍', 4: '🔥' }[level]}
                          </span>
                          <span style={{ color: isSelected ? 'white' : 'inherit' }}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 10, border: '1px dashed var(--border)', display: 'flex', gap: 8, alignItems: 'start' }}>
                  <Shield size={16} style={{ color: 'var(--text-secondary)', marginTop: 1 }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    Occupancy polls are restricted to verified onboard riders. Please verify you are onboard above to participate.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Detailed Stops Timeline like "Where Is My Train" */}
          <div className="card" style={{ padding: '16px 14px', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bus size={15} style={{ color: 'var(--accent)' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('tracking.timeline_title')}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {t('tracking.last_updated')}: {timeSince}
              </div>
            </div>

            {!schedule?.stops?.length ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                No stops guidance template registered for this live corridor.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', marginTop: 10 }}>
                {/* Timeline center line */}
                <div style={{ position: 'absolute', left: '50%', top: 10, bottom: 10, width: 2, background: 'var(--border)' }} />
                
                {timelineBlocks.map((block) => {
                  if (block.type === 'stop') {
                    const { stop, idx } = block;
                    const isCurrent = idx === schedule.currentIndex;
                    const est = stopEstimates[idx];
                    const isArrived = est?.status === 'arrived';
                    const isUpcoming = est?.status === 'upcoming';
                    const isSkipped = est?.status === 'skipped';
                    
                    return (
                      <div key={block.key} style={{ display: 'grid', gridTemplateColumns: '1.5fr 40px 1.5fr', alignItems: 'start', gap: 12, padding: '8px 0' }}>
                        {/* Left Column: Actual/Estimated Arrival/Departure Card */}
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <div className="card" style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.85)', borderRadius: 8, fontSize: '0.72rem', display: 'inline-block', border: '1px solid var(--border)', boxShadow: '0 2px 6px rgba(0,0,0,0.02)', backdropFilter: 'blur(4px)', width: '92%' }}>
                            {isArrived ? (
                              <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>Arrived:</span>
                                  <span style={{ color: 'var(--green)', fontWeight: 800 }}>{est?.arriveLabel || '—'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>Departed:</span>
                                  <span style={{ color: 'var(--green)', fontWeight: 800 }}>{est?.departLabel || '—'}</span>
                                </div>
                              </>
                            ) : isSkipped ? (
                              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>
                                Bypassed Stop
                              </div>
                            ) : (
                              <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>Expected:</span>
                                  <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{est?.arriveLabel || '—'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>Exp Depart:</span>
                                  <span style={{ color: 'var(--accent)', fontWeight: 800 }}>{est?.departLabel || '—'}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Middle Column: Bullet dot */}
                        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                          <div style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: isArrived ? 'var(--green)' : isCurrent ? 'var(--accent)' : 'var(--bg)',
                            border: `2.5px solid ${isArrived ? 'var(--green)' : isCurrent ? 'var(--accent)' : 'var(--border-strong)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isArrived || isCurrent ? 'white' : 'var(--text-muted)',
                            zIndex: 2,
                            boxShadow: isCurrent ? '0 2px 8px rgba(29,78,216,0.3)' : 'none'
                          }}>
                            {isCurrent ? (
                              <Bus size={11} className="animate-bounce" />
                            ) : isArrived ? (
                              <span style={{ fontSize: '9px', fontWeight: 'bold' }}>✓</span>
                            ) : (
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                            )}
                          </div>
                        </div>

                        {/* Right Column: Stop Name & leg distance */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 800 }}>{stop.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {isUpcoming && est?.dist !== undefined && `~${est.dist.toFixed(1)} km away`}
                            {isArrived && <span style={{ color: 'var(--green)', fontWeight: 600 }}>✓ Visited</span>}
                            {isSkipped && <span style={{ color: 'var(--text-muted)' }}>Bypassed</span>}
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    // intermediate_gap
                    const isExpanded = expandedGaps[block.key];
                    return (
                      <div key={block.key} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        
                        {/* Gap Toggle Button */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 40px 1.5fr', alignItems: 'center', gap: 12, padding: '4px 0' }}>
                          <div />
                          <div style={{ display: 'flex', justifyContent: 'center', zIndex: 1 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border-strong)' }} />
                          </div>
                          <div>
                            <button
                              className="btn"
                              style={{
                                padding: '4px 12px',
                                fontSize: '0.72rem',
                                borderRadius: 20,
                                background: 'var(--bg-subtle)',
                                border: '1px dashed var(--border-strong)',
                                color: 'var(--text-secondary)',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                              onClick={() => setExpandedGaps(prev => ({ ...prev, [block.key]: !prev[block.key] }))}
                            >
                              {isExpanded ? 'Hide intermediate stops' : `+ Show ${block.stops.length} intermediate stops`}
                            </button>
                          </div>
                        </div>

                        {/* Render intermediate stops if expanded */}
                        {isExpanded && block.stops.map(({ stop, idx }) => {
                          const isCurrent = idx === schedule.currentIndex;
                          const est = stopEstimates[idx];
                          const isArrived = est?.status === 'arrived';
                          const isUpcoming = est?.status === 'upcoming';
                          const isSkipped = est?.status === 'skipped';
                          
                          return (
                            <div key={`stop-int-${stop.name}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1.5fr 40px 1.5fr', alignItems: 'start', gap: 12, padding: '6px 0', opacity: 0.95 }}>
                              {/* Left Column: Actual/Estimated Arrival/Departure Card */}
                              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <div className="card" style={{ padding: '6px 8px', background: 'rgba(248,250,252,0.9)', borderRadius: 8, fontSize: '0.68rem', display: 'inline-block', border: '1px solid var(--border)', width: '85%' }}>
                                  {isArrived ? (
                                    <>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginBottom: 2 }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Arrived:</span>
                                        <span style={{ color: 'var(--green)', fontWeight: 700 }}>{est?.arriveLabel || '—'}</span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Departed:</span>
                                        <span style={{ color: 'var(--green)', fontWeight: 700 }}>{est?.departLabel || '—'}</span>
                                      </div>
                                    </>
                                  ) : isSkipped ? (
                                    <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '2px 0' }}>
                                      Bypassed
                                    </div>
                                  ) : (
                                    <>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginBottom: 2 }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Expected:</span>
                                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{est?.arriveLabel || '—'}</span>
                                      </div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Exp Depart:</span>
                                        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{est?.departLabel || '—'}</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Middle Column: Bullet dot */}
                              <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                                <div style={{
                                  width: 18,
                                  height: 18,
                                  borderRadius: '50%',
                                  background: isArrived ? 'var(--green)' : isCurrent ? 'var(--accent)' : 'var(--bg)',
                                  border: `2.5px solid ${isArrived ? 'var(--green)' : isCurrent ? 'var(--accent)' : 'var(--border-strong)'}`,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: isArrived || isCurrent ? 'white' : 'var(--text-muted)',
                                  zIndex: 2
                                }}>
                                  {isCurrent ? (
                                    <Bus size={9} className="animate-bounce" />
                                  ) : isArrived ? (
                                    <span style={{ fontSize: '8px', fontWeight: 'bold' }}>✓</span>
                                  ) : (
                                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }} />
                                  )}
                                </div>
                              </div>

                              {/* Right Column: Stop Name & leg distance */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                                  {stop.name} <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 400 }}>(Int.)</span>
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                  {isUpcoming && est?.dist !== undefined && `~${est.dist.toFixed(1)} km away`}
                                  {isArrived && <span style={{ color: 'var(--green)' }}>Visited</span>}
                                  {isSkipped && 'Bypassed'}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                      </div>
                    );
                  }
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>


      {/* Dynamic Passenger Contribution Success Modal */}
      {showContributionModal && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setShowContributionModal(false)}>
          <div className="modal animate-slide-up" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, borderRadius: '24px' }}>
            <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', textAlign: 'center' }}>
              
              {/* Premium Sparkly Check Circle */}
              <div style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'rgba(22, 163, 74, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(22, 163, 74, 0.12)',
                position: 'relative'
              }}>
                <Check size={36} style={{ color: '#16a34a' }} />
                <div style={{ position: 'absolute', top: -4, right: -4, fontSize: '1.25rem' }}>✨</div>
              </div>

              <div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                  {t('tracking.contribution')}
                </h3>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {t('tracking.contribution_desc')}
                </p>
                
                {/* Occupancy verification report block */}
                <div style={{
                  marginTop: 14,
                  padding: '12px 14px',
                  background: 'var(--bg-subtle)',
                  borderRadius: 14,
                  fontSize: '0.76rem',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: 'var(--text-primary)' }}>
                    <Shield size={14} style={{ color: 'var(--accent)' }} />
                    <span>How your contribution is verified:</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                    We verify all crowd occupancy feedback against our secure telemetry rules:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <li>Proximity to the bus / driver current GPS location (<strong style={{ color: 'var(--green)' }}>&le; 2.0 km</strong>)</li>
                    <li>Proximity to the official transit route corridor stops & path (<strong style={{ color: 'var(--green)' }}>&le; 2.0 km</strong>)</li>
                  </ul>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2, lineHeight: 1.3 }}>
                    This double-proximity check blocks spam and keeps occupancy metrics highly reliable.
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary btn-full"
                style={{ padding: '12px', borderRadius: 12, cursor: 'pointer', fontWeight: 800, marginTop: 4 }}
                onClick={() => setShowContributionModal(false)}
              >
                {t('tracking.btn.close')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
