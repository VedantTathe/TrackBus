import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n';
import axios from 'axios';
import {
  Search, Bus, MapPin, Gauge, Clock, ArrowRight,
  Navigation, ChevronRight, X, User
} from 'lucide-react';

// Crowd labels/colors keyed by level, filled in at render using t()
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
  const { t } = useLanguage();
  const CROWD_LABELS = {
    1: t('crowd.empty'),
    2: t('crowd.seats'),
    3: t('crowd.standing'),
    4: t('crowd.full')
  };
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
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{CROWD_LABELS[bus.currentCrowd] || t('crowd.unknown')}</span>
              <span className={`badge badge-sm ${CROWD_COLORS[bus.currentCrowd] || 'badge-gray'}`} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                {CROWD_LABELS[bus.currentCrowd] || '—'}
              </span>
            </div>
            <CrowdBar level={bus.currentCrowd || 1} />
          </div>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600 }}>{t('passenger.tap_to_track')}</span>
            <ChevronRight size={14} style={{ color: 'var(--accent)' }} />
          </div>
        </>
      )}
    </div>
  );
}

export default function PassengerDashboard() {
  const navigate = useNavigate();
  const { user, logout, isInstallable, installApp } = useAuth();
  const { t, lang, toggleLanguage } = useLanguage();

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
      .catch(() => { });
  }, []);

  const handleSearch = async (e) => {
    e?.preventDefault();
    setErrorMsg('');

    const cleanFrom = from.trim();
    const cleanTo = to.trim();

    if (!cleanFrom || !cleanTo) {
      setErrorMsg(t('passenger.error.both_required'));
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
          <span className="topbar-logo-text">{t('topbar.passenger_dashboard')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Dev Live Buses */}
          <button
            onClick={() => navigate('/live-buses')}
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Bus size={12} /> Live Buses
          </button>
          
          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            style={{
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 20,
              padding: '4px 12px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            🌐 {t('lang.toggle')}
          </button>
          <button className="btn btn-ghost" onClick={() => navigate('/profile')} style={{ padding: 8 }}>
            <User size={16} />
          </button>
        </div>
      </div>

      <div className="page-content">
        {/* Greeting */}
        <div style={{ padding: '16px 0 4px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{t('passenger.greeting')} {user?.name?.split(' ')[0] || 'Traveller'} {t('passenger.greeting_suffix')}</h2>
          <p style={{ fontSize: '0.85rem', marginTop: 2, color: 'var(--text-secondary)' }}>{t('passenger.subtitle')}</p>
        </div>

        {/* PWA Mobile Install App Banner */}
        {isInstallable && (
          <div
            className="mobile-only alert alert-info"
            style={{
              marginTop: 6,
              marginBottom: 10,
              background: 'linear-gradient(135deg, var(--accent) 0%, #b71c1c 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 12px rgba(211, 47, 47, 0.2)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.2rem' }}>📱</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.82rem' }}>{t('passenger.install_title')}</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.9, marginTop: 1 }}>{t('passenger.install_desc')}</div>
              </div>
            </div>
            <button
              className="btn btn-sm btn-primary"
              onClick={installApp}
              style={{ background: 'white', color: 'var(--accent)', borderRadius: 20, padding: '4px 12px', fontSize: '0.74rem', fontWeight: 800 }}
            >
              {t('passenger.install_btn')}
            </button>
          </div>
        )}

        <div className="grid-desktop-2-1" style={{ marginTop: 12 }}>

          {/* Left Column: Search Corridor and Filters */}
          <div>
            <div className="card premium-glass-card" style={{ padding: '20px 18px', border: '1px solid var(--border)' }}>
              <div style={{ marginBottom: 16, fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('passenger.search_title')}
              </div>
              <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label className="input-label" style={{ marginBottom: 4, display: 'block' }}>{t('passenger.label.origin')}</label>
                      <input
                        className="input"
                        value={from}
                        onChange={e => {
                          setFrom(e.target.value);
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder={t('passenger.placeholder.from')}
                        list="city-list"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="input-label" style={{ marginBottom: 4, display: 'block' }}>{t('passenger.label.destination')}</label>
                      <input
                        className="input"
                        value={to}
                        onChange={e => {
                          setTo(e.target.value);
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder={t('passenger.placeholder.to')}
                        list="city-list"
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary btn-full btn-lg" style={{ marginTop: 4 }}>
                    <Search size={16} /> {t('passenger.btn.search')}
                  </button>
                </div>
              </form>

              {errorMsg && (
                <div className="alert alert-danger" style={{ fontSize: '0.78rem', padding: '8px 12px', marginTop: 12, borderRadius: 8 }}>
                  {errorMsg}
                </div>
              )}

              <datalist id="city-list">
                {cities.map(city => (
                  <option key={city} value={city} />
                ))}
              </datalist>

              {/* Quick routes */}
              <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                  {t('passenger.popular_corridors')}
                </div>
                <div className="chip-list">
                  {QUICK_ROUTES.map(qr => (
                    <button key={qr.label} className="chip" onClick={() => handleQuickRoute(qr)}>
                      <Navigation size={11} />{qr.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Recent Transits List */}
          <div>
            <div className="section-header" style={{ paddingTop: 0 }}>
              <span className="section-title">{t('passenger.recent_transits')}</span>
            </div>

            {displayBuses.length === 0 ? (
              <div className="empty-state card premium-glass-card" style={{ padding: '36px 24px', border: '1px solid var(--border)' }}>
                <div className="empty-icon"><Bus size={24} /></div>
                <h3>{t('passenger.no_recent')}</h3>
                <p>{t('passenger.no_recent_desc')}</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {displayBuses.map(bus => (
                  <BusCard key={bus._id || bus.busNumber} bus={bus} onTrack={handleTrack} />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
