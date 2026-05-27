import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import {
  Search, Bus, MapPin, Gauge, Clock, ArrowRight,
  Navigation, ChevronRight, X, User
} from 'lucide-react';

const CROWD_LABELS = { 1: 'Empty', 2: 'Seats avail.', 3: 'Standing', 4: 'Full' };
const CROWD_COLORS = { 1: 'badge-green', 2: 'badge-blue', 3: 'badge-amber', 4: 'badge-red' };
const RECENT_KEY = 'trackbus_recent_buses';

const loadRecent = () => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveRecent = (buses) => {
  localStorage.setItem(RECENT_KEY, JSON.stringify(buses));
};

const addRecentBus = (bus) => {
  if (!bus?.busNumber) return [];
  const clean = {
    _id: bus._id,
    busNumber: bus.busNumber,
    routeName: bus.routeName,
    status: bus.status || 'inactive',
    speed: bus.speed || 0,
    latitude: bus.latitude,
    longitude: bus.longitude,
    currentCrowd: bus.currentCrowd || 1,
    lastUpdated: bus.lastUpdated || null,
    startTime: bus.startTime || null,
    endTime: bus.endTime || null
  };
  const existing = loadRecent().filter(b => b.busNumber !== clean.busNumber);
  const next = [clean, ...existing].slice(0, 5);
  saveRecent(next);
  return next;
};

function CrowdBar({ level = 1 }) {
  return (
    <div className="crowd-bar">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`crowd-segment ${i <= level ? `filled-${level}` : ''}`} />
      ))}
    </div>
  );
}

function TimeSince({ date }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const calc = () => {
      if (!date) return setLabel('—');
      const secs = Math.floor((Date.now() - new Date(date)) / 1000);
      if (secs < 10) setLabel('just now');
      else if (secs < 60) setLabel(`${secs}s ago`);
      else setLabel(`${Math.floor(secs / 60)}m ago`);
    };
    calc();
    const t = setInterval(calc, 5000);
    return () => clearInterval(t);
  }, [date]);
  return <span>{label}</span>;
}

function BusCard({ bus, onTrack }) {
  const isActive = bus.status === 'active';
  return (
    <div className="bus-card" onClick={() => onTrack(bus)}>
      <div className="bus-card-header">
        <div>
          <div className="bus-number">{bus.busNumber}</div>
          <div className="route-name">{bus.routeName || '—'}</div>
        </div>
      </div>

      {(bus.startTime || bus.endTime) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <span>Start {bus.startTime || '—'}</span>
          <span>End {bus.endTime || '—'}</span>
        </div>
      )}

      {isActive && (
        <>
          <div className="bus-card-meta">
            <span className="meta-item"><Gauge size={12} />{Math.round(bus.speed || 0)} km/h</span>
            <span className="meta-item"><Clock size={12} /><TimeSince date={bus.lastUpdated} /></span>
            <span className="meta-item"><MapPin size={12} />{bus.latitude?.toFixed(4)}, {bus.longitude?.toFixed(4)}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{CROWD_LABELS[bus.currentCrowd] || 'Unknown'}</span>
              <span className={`badge badge-sm ${CROWD_COLORS[bus.currentCrowd] || 'badge-gray'}`} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                {CROWD_LABELS[bus.currentCrowd] || '—'}
              </span>
            </div>
            <CrowdBar level={bus.currentCrowd || 1} />
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600 }}>Tap to track</span>
            <ChevronRight size={14} style={{ color: 'var(--accent)' }} />
          </div>
        </>
      )}
    </div>
  );
}

export default function PassengerDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cities, setCities] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const [recentBuses, setRecentBuses] = useState([]);

  const QUICK_ROUTES = [
    { label: 'Pune → Sangli', from: 'Pune', to: 'Sangli' },
    { label: 'Solapur → Pune', from: 'Solapur', to: 'Pune' },
    { label: 'Sangli → Kolhapur', from: 'Sangli', to: 'Kolhapur' },
    { label: 'Kolhapur → Sangli', from: 'Kolhapur', to: 'Sangli' },
  ];

  useEffect(() => {
    setRecentBuses(loadRecent());
  }, []);

  useEffect(() => {
    axios.get('/api/passenger/cities')
      .then(res => {
        if (res.data?.cities) setCities(res.data.cities);
      })
      .catch(() => {});
  }, []);

  const handleSearch = async (e) => {
    e?.preventDefault();
    setErrorMsg('');

    const cleanFrom = from.trim();
    const cleanTo = to.trim();

    if (!cleanFrom || !cleanTo) {
      setErrorMsg('Please enter both Origin and Destination.');
      return;
    }

    const fromMatch = cities.find(c => c.toLowerCase() === cleanFrom.toLowerCase());
    const toMatch = cities.find(c => c.toLowerCase() === cleanTo.toLowerCase());

    if (!fromMatch) {
      setErrorMsg(`Origin "${cleanFrom}" is not in the allowed cities list.`);
      return;
    }
    if (!toMatch) {
      setErrorMsg(`Destination "${cleanTo}" is not in the allowed cities list.`);
      return;
    }

    // Update state to correct casing
    setFrom(fromMatch);
    setTo(toMatch);

    const params = new URLSearchParams();
    params.set('mode', 'route');
    params.set('from', fromMatch);
    params.set('to', toMatch);
    navigate(`/search?${params.toString()}`);
  };

  const handleQuickRoute = (qr) => {
    setFrom(qr.from);
    setTo(qr.to);
    setErrorMsg('');
    setTimeout(() => {
      const params = new URLSearchParams();
      params.set('mode', 'route');
      params.set('from', qr.from);
      params.set('to', qr.to);
      navigate(`/search?${params.toString()}`);
    }, 50);
  };

  const handleTrack = (bus) => {
    const next = addRecentBus(bus);
    setRecentBuses(next);
    navigate(`/journey/${bus.busNumber}`);
  };

  const displayBuses = recentBuses;

  return (
    <div className="page">
      {/* Top Bar */}
      <div className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon"><Bus size={15} /></div>
          <span className="topbar-logo-text">TrackBus</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/profile')} style={{ padding: 8 }}>
            <User size={16} />
          </button>
        </div>
      </div>

      <div className="page-content">
        {/* Greeting */}
        <div style={{ padding: '16px 0 4px' }}>
          <h2 style={{ fontSize: '1.1rem' }}>Hello, {user?.name?.split(' ')[0] || 'Traveller'} 👋</h2>
          <p style={{ fontSize: '0.82rem', marginTop: 2 }}>Where are you headed today?</p>
        </div>

        {/* Search — Corridor Search */}
        <div className="sticky-search">
          <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}>
                <input
                  className="input"
                  value={from}
                  onChange={e => {
                    setFrom(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="From (e.g. Pune)"
                  list="city-list"
                />
              </div>
              <div style={{ flex: 1 }}>
                <input
                  className="input"
                  value={to}
                  onChange={e => {
                    setTo(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="To (e.g. Sangli)"
                  list="city-list"
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ padding: '11px 14px' }}>
                <Search size={14} />
              </button>
            </div>
          </form>

          {errorMsg && (
            <div className="alert alert-danger" style={{ fontSize: '0.78rem', padding: '8px 12px', marginTop: 8, borderRadius: 8 }}>
              {errorMsg}
            </div>
          )}

          <datalist id="city-list">
            {cities.map(city => (
              <option key={city} value={city} />
            ))}
          </datalist>

          {/* Quick routes */}
          <div className="chip-list" style={{ marginTop: 8 }}>
            {QUICK_ROUTES.map(qr => (
              <button key={qr.label} className="chip" onClick={() => handleQuickRoute(qr)}>
                <Navigation size={11} />{qr.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results / List */}
        <div className="section-header">
          <span className="section-title">Recent Transits</span>
        </div>

        {displayBuses.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Bus size={24} /></div>
            <h3>No recent transits yet</h3>
            <p>Search for a corridor or track one to see it here</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
            {displayBuses.map(bus => (
              <BusCard key={bus._id || bus.busNumber} bus={bus} onTrack={handleTrack} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
