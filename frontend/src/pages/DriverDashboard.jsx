import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  Bus, Play, Square, Bluetooth, BluetoothOff, MapPin, Gauge, Users,
  CheckCircle2, AlertTriangle, Search, ChevronDown, LogOut, RefreshCw,
  Navigation, Radio, Wifi
} from 'lucide-react';

const CROWD_OPTIONS = [
  { val: 1, label: 'Empty', color: 'var(--green)' },
  { val: 2, label: 'Seats Available', color: '#2563eb' },
  { val: 3, label: 'Standing Room', color: 'var(--amber)' },
  { val: 4, label: 'Full', color: 'var(--red)' },
];

export default function DriverDashboard() {
  const { user, logout } = useAuth();

  // State machine: idle → scanning → confirm → online
  const [phase, setPhase] = useState('idle'); // idle | scanning | found | manual | online
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [busNumber, setBusNumber] = useState('');
  const [crowdLevel, setCrowdLevel] = useState(1);

  // BLE scan state
  const [scanLog, setScanLog] = useState([]);
  const [bleResult, setBleResult] = useState(null); // { busNumber, routeId, rssi, distance }
  const [showManual, setShowManual] = useState(false);
  const [manualSearch, setManualSearch] = useState('');

  // Live tracking state
  const [position, setPosition] = useState(null);
  const [speed, setSpeed] = useState(0);
  const [heading, setHeading] = useState(0);
  const [driveSeconds, setDriveSeconds] = useState(0);
  const [broadcastCount, setBroadcastCount] = useState(0);

  const connected = phase === 'online';

  const geoWatchRef = useRef(null);
  const timerRef = useRef(null);
  const prevPos = useRef(null);

  useEffect(() => {
    axios.get('/api/buses/routes').then(res => {
      setRoutes(res.data);
    }).catch(() => {});
  }, []);

  // BLE Scan simulation
  const startScan = () => {
    setPhase('scanning');
    setScanLog(['Initializing BLE scanner...', 'Sweeping 2.4 GHz channels...']);

    const logs = [
      'Scanning for TrackBus transponders...',
      'Checking channel 37/38/39...',
      'Signal detected: −72 dBm',
      'Verifying device signature...',
    ];

    logs.forEach((msg, i) => {
      setTimeout(() => setScanLog(prev => [...prev, msg]), (i + 1) * 600);
    });

    setTimeout(() => {
      // Always simulate not finding any Bluetooth devices to force manual search testing
      setScanLog(prev => [
        ...prev, 
        '✗ No Bluetooth transponder device found.', 
        'Please select your bus manually to start the trip.'
      ]);
      setPhase('manual');
      setShowManual(true);
    }, 3500);
  };

  const confirmBleResult = () => {
    setSelectedRoute(bleResult.route);
    setBusNumber(bleResult.busNumber);
    startTrip(bleResult.busNumber, bleResult.route);
  };

  const startManual = () => {
    if (!selectedRoute || !busNumber) return;
    startTrip(busNumber, selectedRoute);
  };

  const startTrip = async (busNum, route) => {
    try {
      await axios.post('/api/buses/toggle', {
        busNumber: busNum,
        routeId: route._id,
        status: 'active'
      });
    } catch (e) {
      console.warn('Toggle tracking failed, continuing:', e.message);
    }

    // Start GPS
    if ('geolocation' in navigator) {
      geoWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, speed: gpsSpeed, heading: gpsHeading } = pos.coords;
          setPosition({ lat: latitude, lng: longitude });

          // Calculate speed from consecutive positions if GPS speed unavailable
          let spd = gpsSpeed ? Math.round(gpsSpeed * 3.6) : 0;
          if (!spd && prevPos.current) {
            const dlat = latitude - prevPos.current.lat;
            const dlng = longitude - prevPos.current.lng;
            const dist = Math.sqrt(dlat * dlat + dlng * dlng) * 111000;
            const dt = (Date.now() - prevPos.current.time) / 1000;
            spd = dt > 0 ? Math.round((dist / dt) * 3.6) : 0;
          }
          prevPos.current = { lat: latitude, lng: longitude, time: Date.now() };
          setSpeed(spd);
          if (gpsHeading) setHeading(Math.round(gpsHeading));

          axios.post('/api/location/update', {
            busNumber: busNum,
            routeId: route._id,
            latitude,
            longitude,
            speed: spd,
            heading: gpsHeading || 0,
            currentCrowd: crowdLevel
          }).catch(() => {});
          setBroadcastCount(c => c + 1);
        },
        (err) => console.warn('GPS error:', err.message),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    }

    timerRef.current = setInterval(() => setDriveSeconds(s => s + 1), 1000);
    setPhase('online');
  };

  const stopTrip = async () => {
    if (geoWatchRef.current) navigator.geolocation.clearWatch(geoWatchRef.current);
    clearInterval(timerRef.current);
    try {
      await axios.post('/api/buses/toggle', { busNumber, routeId: selectedRoute?._id, status: 'inactive' });
    } catch {}
    setPhase('idle');
    setDriveSeconds(0);
    setBroadcastCount(0);
    setPosition(null);
    setBleResult(null);
    setScanLog([]);
    setShowManual(false);
  };

  const updateCrowd = async (level) => {
    setCrowdLevel(level);
    if (phase === 'online') {
      try { await axios.post('/api/buses/crowd', { busNumber, currentCrowd: level }); } catch {}
      if (position) {
        axios.post('/api/location/update', {
          busNumber,
          routeId: selectedRoute?._id,
          latitude: position.lat,
          longitude: position.lng,
          speed,
          heading,
          currentCrowd: level
        }).catch(() => {});
      }
    }
  };

  const fmtTime = (s) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const filteredRoutes = routes.filter(r =>
    !manualSearch || r.routeName?.toLowerCase().includes(manualSearch.toLowerCase()) ||
    r.routeNumber?.includes(manualSearch) ||
    r.busNumbers?.some(b => b.toLowerCase().includes(manualSearch.toLowerCase())) ||
    r.source?.toLowerCase().includes(manualSearch.toLowerCase()) ||
    r.destination?.toLowerCase().includes(manualSearch.toLowerCase())
  );

  return (
    <div className="page">
      <div className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon"><Bus size={15} /></div>
          <span className="topbar-logo-text">Driver</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge ${connected ? 'badge-green' : 'badge-red'}`}>
            {connected ? <><Wifi size={10} />Connected</> : 'Offline'}
          </span>
          <button className="btn btn-ghost" onClick={logout} style={{ padding: 8 }}><LogOut size={15} /></button>
        </div>
      </div>

      <div className="page-content">
        <div style={{ padding: '14px 0 4px' }}>
          <h2>Welcome, {user?.name || 'Driver'}</h2>
          <p style={{ fontSize: '0.82rem', marginTop: 2 }}>ID: {user?.employeeId}</p>
        </div>

        {/* PHASE: IDLE */}
        {phase === 'idle' && (
          <div style={{ marginTop: 16 }}>
            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ width: 64, height: 64, background: 'var(--accent-light)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--accent)' }}>
                <Bluetooth size={28} />
              </div>
              <h3 style={{ marginBottom: 8 }}>Ready to Drive?</h3>
              <p style={{ marginBottom: 24, fontSize: '0.85rem' }}>Tap to scan for your bus via Bluetooth. Stand near the bus transponder.</p>
              <button className="btn btn-primary btn-full btn-lg" onClick={startScan}>
                <Radio size={16} /> Scan for My Bus
              </button>
              <button className="btn btn-ghost btn-full mt-2" onClick={() => { setPhase('manual'); setShowManual(true); }}>
                Enter manually instead
              </button>
            </div>
          </div>
        )}

        {/* PHASE: SCANNING */}
        {phase === 'scanning' && (
          <div style={{ marginTop: 16 }}>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 40, height: 40, background: 'var(--accent-light)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }} className="animate-pulse-scan">
                  <Bluetooth size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Scanning…</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Looking for TrackBus transponder</div>
                </div>
              </div>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)', maxHeight: 120, overflowY: 'auto' }}>
                {scanLog.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          </div>
        )}

        {/* PHASE: FOUND — confirm with driver */}
        {phase === 'found' && bleResult && (
          <div style={{ marginTop: 16 }}>
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 12px', background: 'var(--green-light)', borderRadius: 8 }}>
                <CheckCircle2 size={18} style={{ color: 'var(--green)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--green)', fontSize: '0.9rem' }}>Bus Found!</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--green)' }}>Signal: {bleResult.rssi} dBm · ~{bleResult.distance}m away</div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Detected</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{bleResult.busNumber}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{bleResult.route?.routeName}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{bleResult.route?.source || bleResult.route?.startPoint} → {bleResult.route?.destination || bleResult.route?.endPoint}</div>
              </div>

              <p style={{ fontSize: '0.85rem', marginBottom: 14, fontWeight: 500 }}>Is this your bus?</p>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary btn-full" onClick={() => { setPhase('manual'); setShowManual(true); }}>
                  Not mine
                </button>
                <button className="btn btn-success btn-full" onClick={confirmBleResult}>
                  <CheckCircle2 size={15} /> Yes, Start
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PHASE: MANUAL SEARCH */}
        {(phase === 'manual' || showManual) && phase !== 'online' && (
          <div style={{ marginTop: 16 }}>
            <div className="card">
              <h3 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Search size={16} style={{ color: 'var(--accent)' }} />
                Select Your Bus
              </h3>
              <div className="input-icon-wrapper" style={{ marginBottom: 12 }}>
                <Search size={14} className="input-icon" />
                <input className="input" style={{ paddingLeft: 36 }} value={manualSearch} onChange={e => setManualSearch(e.target.value)} placeholder="Search route or bus number…" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {filteredRoutes.map(route => (
                  route.busNumbers?.map(bn => (
                    <button key={bn} onClick={() => { setSelectedRoute(route); setBusNumber(bn); }} style={{ padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${selectedRoute?._id === route._id && busNumber === bn ? 'var(--accent)' : 'var(--border)'}`, background: selectedRoute?._id === route._id && busNumber === bn ? 'var(--accent-light)' : 'var(--bg)', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{bn}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{route.routeName}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{route.source || route.startPoint} → {route.destination || route.endPoint}</div>
                      </div>
                      {selectedRoute?._id === route._id && busNumber === bn && <CheckCircle2 size={16} style={{ color: 'var(--accent)' }} />}
                    </button>
                  ))
                ))}
                {filteredRoutes.length === 0 && <p style={{ textAlign: 'center', padding: 16 }}>No routes found</p>}
              </div>

              <button className="btn btn-primary btn-full mt-2" disabled={!selectedRoute || !busNumber} onClick={startManual} style={{ marginTop: 14 }}>
                <Play size={15} /> Start Trip
              </button>
            </div>
          </div>
        )}

        {/* PHASE: ONLINE */}
        {phase === 'online' && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Status banner */}
            <div className="in-bus-banner">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="live-dot" style={{ background: 'white' }} />
                  <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>LIVE — Broadcasting</span>
                </div>
                <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{fmtTime(driveSeconds)}</span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '0.02em' }}>{busNumber}</div>
              <div style={{ fontSize: '0.82rem', opacity: 0.8, marginTop: 2 }}>{selectedRoute?.routeName}</div>
            </div>

            {/* Metrics */}
            <div className="card">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ textAlign: 'center' }}>
                  <div className="speed-value" style={{ fontSize: '1.6rem' }}>{speed}</div>
                  <div className="speed-unit">km/h</div>
                </div>
                <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                  <div className="speed-value" style={{ fontSize: '1.6rem' }}>{broadcastCount}</div>
                  <div className="speed-unit">pings</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className="speed-value" style={{ fontSize: '1.6rem' }}>{heading}°</div>
                  <div className="speed-unit">heading</div>
                </div>
              </div>
              {position && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  <MapPin size={11} style={{ display: 'inline', marginRight: 4 }} />
                  {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
                </div>
              )}
            </div>

            {/* Crowd selector */}
            <div className="card">
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Passenger Load</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {CROWD_OPTIONS.map(opt => (
                  <button key={opt.val} onClick={() => updateCrowd(opt.val)} style={{ padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${crowdLevel === opt.val ? opt.color : 'var(--border)'}`, background: crowdLevel === opt.val ? `${opt.color}15` : 'var(--bg)', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', color: crowdLevel === opt.val ? opt.color : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn-danger btn-full btn-lg" onClick={stopTrip}>
              <Square size={15} /> End Trip
            </button>
          </div>
        )}
      </div>

      <div className="bottom-nav">
        <button className="nav-item active">
          <Bus size={20} />
          <span className="nav-item-label">Trip</span>
        </button>
        <button className="nav-item" onClick={logout}>
          <LogOut size={20} />
          <span className="nav-item-label">Logout</span>
        </button>
      </div>
    </div>
  );
}
