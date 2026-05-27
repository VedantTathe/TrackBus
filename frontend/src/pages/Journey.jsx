import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Bus, MapPin, Gauge, Clock, ShieldAlert, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

export default function Journey() {
  const { busNumber } = useParams(); // tripId or busNumber
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { logout } = useAuth();
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [expandedGaps, setExpandedGaps] = useState({});
  const routeTemplate = trip?.routeSnapshot || trip?.selectedRouteTemplateId;

  // Fetch active LiveTrip or fallback to legacy Bus session
  const loadTripData = async () => {
    try {
      const res = await axios.get('/api/trips/active');
      const activeList = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      const foundTrip = activeList.find(t => t.tripId === busNumber || t._id === busNumber || (t.physicalBusId && t.physicalBusId.busNumber === busNumber));

      if (foundTrip) {
        setTrip(foundTrip);
        setLastUpdate(new Date(foundTrip.lastUpdatedAt || Date.now()));
        setLoading(false);
        return;
      }

      // Legacy fallback
      const fallbackRes = await axios.get('/api/buses/active');
      const activeBuses = Array.isArray(fallbackRes.data?.data) ? fallbackRes.data.data : (Array.isArray(fallbackRes.data) ? fallbackRes.data : []);
      const foundBus = activeBuses.find(b => b._id === busNumber || b.busNumber === busNumber);

      if (foundBus) {
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
        setLastUpdate(new Date(foundBus.lastUpdated || Date.now()));
      }
    } catch (err) {
      console.warn('Failed to load journey timeline data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTripData();
  }, [busNumber]);

  // Dynamic telemetry coordinates poll every 6 seconds
  useEffect(() => {
    let timer;
    const fetchLatestTelemetry = async () => {
      if (!trip) return;
      try {
        // Query active trips to get live coordinate changes
        const res = await axios.get('/api/trips/active');
        const activeList = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
        const foundTrip = activeList.find(t => t.tripId === trip.tripId);

        if (foundTrip) {
          setTrip(foundTrip);
          setLastUpdate(new Date(foundTrip.lastUpdatedAt || Date.now()));
          return;
        }

        // Location endpoint fallback
        const locRes = await axios.get(`/api/location/${busNumber}`);
        const loc = locRes.data;
        if (loc) {
          setTrip(prev => ({
            ...prev,
            currentLocation: { lat: loc.latitude, lng: loc.longitude },
            speed: loc.speed || 0,
            heading: loc.heading || 0,
            lastUpdatedAt: loc.timestamp
          }));
          setLastUpdate(new Date(loc.timestamp || Date.now()));
        }
      } catch { }
    };

    timer = setInterval(fetchLatestTelemetry, 6000);
    return () => clearInterval(timer);
  }, [trip?.tripId, busNumber]);

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

  if (loading) {
    return (
      <div className="page">
        <div className="topbar">
          <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title">Journey</span>
          <div style={{ width: 32 }} />
        </div>
        <div className="page-content" style={{ padding: '24px 16px' }}>
          <div className="skeleton" style={{ height: 120, borderRadius: 12, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 240, borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
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
            <div className="empty-icon"><ShieldAlert size={26} /></div>
            <h3>Journey timeline unavailable</h3>
            <p>Active Live Trip session has either ended or is no longer tracking.</p>
            <button className="btn btn-primary mt-3" onClick={() => navigate(-1)}>Go Back</button>
          </div>
        </div>
      </div>
    );
  }

  const headerText = `${trip.source} → ${displayDestination}`;

  return (
    <div className="page">
      {/* Topbar navigation banner */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title" style={{ fontSize: '1rem', fontWeight: 700 }}>Journey Timeline</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="btn btn-primary btn-sm"
            style={{ padding: '6px 12px', fontSize: '0.75rem' }}
            onClick={() => navigate(`/track/${trip.tripId}?${searchParams.toString()}`)}
          >
            Track Live Map
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/profile')} style={{ padding: 8 }}>
            <User size={16} />
          </button>
        </div>
      </div>

      {/* Primary timeline list */}
      <div className="page-content" style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
        <div style={{ padding: '12px 0 6px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>{headerText}</h2>
          <p style={{ marginTop: 2, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Trip ID: {trip.tripId}
          </p>
        </div>

        <div className="section-header">
          <span className="section-title" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
            Journey stop schedule adherence
          </span>
        </div>

        {!schedule?.stops?.length ? (
          <div className="empty-state">
            <div className="empty-icon"><MapPin size={22} /></div>
            <p style={{ fontSize: '0.82rem' }}>
              No expected stop templates registered for this corridor trip guidance. View live map coordinates directly.
            </p>
            <button className="btn btn-primary btn-full mt-3" onClick={() => navigate(`/track/${trip.tripId}?${searchParams.toString()}`)}>
              Open Live Tracking Map
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 14, position: 'relative', marginTop: 10 }}>
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
                              border: `2px solid ${isArrived ? 'var(--green)' : isCurrent ? 'var(--accent)' : 'var(--border-strong)'}`,
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
  );
}
