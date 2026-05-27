import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useLanguage } from '../i18n';
import { ArrowLeft, Bus, MapPin, Gauge, Clock, ChevronRight } from 'lucide-react';

const CROWD_COLORS = { 1: 'badge-green', 2: 'badge-blue', 3: 'badge-amber', 4: 'badge-red' };

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

export default function LiveBuses() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);

  const CROWD_LABELS = {
    1: t('crowd.empty') || 'Empty',
    2: t('crowd.seats') || 'Seats Available',
    3: t('crowd.standing') || 'Standing',
    4: t('crowd.full') || 'Full'
  };

  useEffect(() => {
    fetchLiveBuses();
    const interval = setInterval(fetchLiveBuses, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchLiveBuses = async () => {
    try {
      const res = await axios.get('/api/trips/active');
      if (res.data?.data) {
        setBuses(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch live buses', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = (bus) => {
    // Navigate to live tracking for this trip or journey
    if (bus.physicalBusId?.busNumber) {
      navigate(`/journey/${bus.physicalBusId.busNumber}`);
    } else if (bus.tripId) {
      navigate(`/track/${bus.tripId}`);
    }
  };

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 4 }}>
          <ArrowLeft size={20} />
        </button>
        <div className="topbar-logo" style={{ marginLeft: 8 }}>
          <span className="topbar-logo-text">Live Buses (Dev)</span>
        </div>
        <div style={{ flex: 1 }} />
      </div>

      <div className="page-content">
        <div style={{ padding: '16px 0 4px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>All Active Trips</h2>
          <p style={{ fontSize: '0.85rem', marginTop: 2, color: 'var(--text-secondary)' }}>Monitoring all currently running buses.</p>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
            <p>Loading active buses...</p>
          </div>
        ) : buses.length === 0 ? (
          <div className="empty-state card premium-glass-card" style={{ padding: '36px 24px', border: '1px solid var(--border)' }}>
            <div className="empty-icon"><Bus size={24} /></div>
            <h3>No Live Buses</h3>
            <p>There are no active trips running right now.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            {buses.map(trip => (
              <div key={trip._id} className="bus-card" onClick={() => handleTrack(trip)}>
                <div className="bus-card-header">
                  <div>
                    <div className="bus-number">{trip.physicalBusId?.busNumber || trip.tripId}</div>
                    <div className="route-name">{trip.routeSnapshot?.routeName || `${trip.source} to ${trip.destination}`}</div>
                  </div>
                </div>

                <div className="bus-card-meta">
                  <span className="meta-item"><Gauge size={12} />{Math.round(trip.speed || 0)} km/h</span>
                  <span className="meta-item"><Clock size={12} /><TimeSince date={trip.lastUpdatedAt} /></span>
                  <span className="meta-item"><MapPin size={12} />{trip.currentLocation?.lat?.toFixed(4)}, {trip.currentLocation?.lng?.toFixed(4)}</span>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{CROWD_LABELS[trip.occupancyLevel] || 'Unknown'}</span>
                    <span className={`badge badge-sm ${CROWD_COLORS[trip.occupancyLevel] || 'badge-gray'}`} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                      {CROWD_LABELS[trip.occupancyLevel] || '—'}
                    </span>
                  </div>
                  <CrowdBar level={trip.occupancyLevel || 1} />
                </div>
                
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600 }}>Tap to track</span>
                  <ChevronRight size={14} style={{ color: 'var(--accent)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
