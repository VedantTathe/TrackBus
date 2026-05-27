import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Bus, ChevronRight, Clock, MapPin, Gauge, Shield, AlertTriangle, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const CROWD_LABELS = { 1: 'Empty', 2: 'Seats Available', 3: 'Standing Room Only', 4: 'Full' };
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

export default function SearchResults() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { logout } = useAuth();

  const searchMode = params.get('mode') || 'route';
  const query = params.get('q') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';

  const [activeTrips, setActiveTrips] = useState([]);
  const [routeTemplates, setRouteTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch results from unified Passenger Corridor Search
  const fetchSearchResults = async () => {
    setLoading(true);
    setError('');
    try {
      const apiParams = {};
      if (searchMode === 'route') {
        apiParams.from = from;
        apiParams.to = to;
      } else {
        apiParams.q = query;
      }

      const res = await axios.get('/api/passenger/search', { params: apiParams });
      
      if (res.data && res.data.success) {
        setActiveTrips(res.data.activeTrips || []);
        setRouteTemplates(res.data.routeTemplates || []);
      } else {
        setError('Failed to fetch matching transits.');
      }
    } catch (err) {
      setError('Connection error fetching corridor updates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSearchResults();
  }, [searchMode, query, from, to]);

  const summary = useMemo(() => {
    if (searchMode === 'route') return `${from || 'From'} → ${to || 'To'}`;
    return query || 'Search';
  }, [searchMode, from, to, query]);

  return (
    <div className="page">
      {/* Topbar navigation banner */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/passenger')} style={{ padding: 8 }}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title" style={{ fontSize: '1rem', fontWeight: 700 }}>Search Results</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/profile')} style={{ padding: 8 }}>
            <User size={16} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="page-content">
        <div style={{ padding: '12px 0 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Search results for: <span style={{ color: 'var(--accent)' }}>{summary}</span></h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              Found {activeTrips.length} active live trip{activeTrips.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/passenger')}>
            Modify Search
          </button>
        </div>

        {loading ? (
          <div className="grid-desktop-2" style={{ gap: 20, marginTop: 20 }}>
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 160, borderRadius: 12 }} />)}
          </div>
        ) : error ? (
          <div className="alert alert-danger" style={{ marginTop: 20 }}>
            <AlertTriangle size={16} /> {error}
          </div>
        ) : activeTrips.length === 0 ? (
          <div className="empty-state card premium-glass-card" style={{ marginTop: 20, border: '1px solid var(--border)', padding: '48px' }}>
            <div className="empty-icon"><Bus size={24} /></div>
            <h3>No active journeys match your search</h3>
            <p>Try searching another corridor or check again later.</p>
            <button className="btn btn-primary mt-3" onClick={() => navigate('/passenger')}>
              Change Search Corridor
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 20, paddingBottom: 24 }}>
            
            {/* PRIORITIZED REAL-TIME LIVE TRIPS SECTION */}
            {activeTrips.length > 0 && (
              <div>
                <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span className="live-dot" style={{ margin: 0, animationDuration: '1s' }} />
                  <span className="section-title" style={{ color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Live Active Journeys
                  </span>
                </div>
                
                {/* Desktop Responsive Card Grid! */}
                <div className="grid-desktop-2">
                  {activeTrips.map(trip => {
                    const routeName = trip.selectedRouteTemplateId?.routeName || `${trip.source} – ${trip.destination}`;
                    
                    return (
                      <div
                        key={trip._id}
                        className="bus-card premium-glass-card"
                        style={{
                          borderColor: 'var(--accent)',
                          background: 'rgba(29, 78, 216, 0.02)',
                          cursor: 'pointer',
                          boxShadow: '0 4px 16px rgba(29, 78, 216, 0.04)',
                          borderRadius: '16px',
                          borderWidth: '1.5px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          height: '100%',
                          minHeight: 220
                        }}
                        onClick={() => navigate(`/track/${trip.tripId}${from && to ? `?from=${from}&to=${to}` : ''}`)}
                      >
                        <div>
                          <div className="bus-card-header">
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="badge badge-green" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                                  <span className="live-dot" style={{ width: 5, height: 5, background: 'white' }} /> Live Now
                                </span>
                              </div>
                              <div className="route-name" style={{ marginTop: 6, fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                                {trip.source} → {trip.destination}
                              </div>
                              {trip.selectedRouteTemplateId && (
                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                  {routeName}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="bus-card-meta" style={{ marginTop: 12 }}>
                            <span className="meta-item"><Gauge size={12} />{Math.round(trip.speed || 0)} km/h</span>
                            <span className="meta-item"><Clock size={12} /><TimeSince date={trip.lastUpdatedAt} /></span>
                            {trip.etaMinutes !== null && (
                              <span className="meta-item" style={{ color: 'var(--green)', fontWeight: 600 }}>
                                <Clock size={12} />ETA: {trip.etaMinutes} mins ({trip.distanceText})
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <div style={{ marginTop: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Passenger Load</span>
                              <span className={`badge badge-sm ${CROWD_COLORS[trip.occupancyLevel] || 'badge-gray'}`} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                                {CROWD_LABELS[trip.occupancyLevel] || 'Seats Available'}
                              </span>
                            </div>
                            <CrowdBar level={trip.occupancyLevel || 1} />
                          </div>

                          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Track Realtime Map
                            </span>
                            <ChevronRight size={16} style={{ color: 'var(--accent)' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
          </div>
        )}
      </div>
    </div>
  );
}
