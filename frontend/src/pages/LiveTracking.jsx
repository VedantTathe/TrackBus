import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../context/SocketContext';
import { ArrowLeft, Bus, Gauge, Users, MapPin, RefreshCw, Clock, CheckCircle2, Navigation } from 'lucide-react';

const CROWD_LABELS = { 1: 'Empty', 2: 'Seats Available', 3: 'Standing Room', 4: 'Full' };
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

export default function LiveTracking() {
  const { busId } = useParams();
  const [searchParams] = useSearchParams();
  const inBus = searchParams.get('inBus') === 'true';
  const navigate = useNavigate();
  const { socket } = useSocket();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);

  const [bus, setBus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isStale, setIsStale] = useState(false);
  const staleTimer = useRef(null);

  // Fetch bus info
  useEffect(() => {
    const fetchBus = async () => {
      try {
        const res = await axios.get(`/api/buses/${busId}`);
        setBus(res.data);
        setLastUpdate(new Date());
      } catch (err) {
        // Try by busNumber
        try {
          const res2 = await axios.get('/api/buses/active');
          const found = res2.data.find(b => b._id === busId || b.busNumber === busId);
          if (found) { setBus(found); setLastUpdate(new Date()); }
        } catch {}
      } finally {
        setLoading(false);
      }
    };
    fetchBus();
  }, [busId]);

  // Init Leaflet map
  useEffect(() => {
    if (!bus || mapInstance.current) return;
    const L = window.L;
    if (!L || !mapRef.current) return;

    const lat = bus.latitude || bus.liveLocation?.latitude || 18.5204;
    const lng = bus.longitude || bus.liveLocation?.longitude || 73.8567;

    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([lat, lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    const busIcon = L.divIcon({
      html: `<div style="width:32px;height:32px;background:#1a56db;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(26,86,219,0.4)"><div style="transform:rotate(45deg);color:white;font-size:14px">🚌</div></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      className: ''
    });

    const marker = L.marker([lat, lng], { icon: busIcon }).addTo(map);
    marker.bindPopup(`<strong>${bus.busNumber}</strong><br/>${bus.routeName || ''}`).openPopup();

    mapInstance.current = map;
    markerRef.current = marker;
  }, [bus]);

  // Socket updates
  useEffect(() => {
    if (!socket) return;
    socket.emit('track-bus', busId);

    const handler = (data) => {
      if (data.busNumber !== bus?.busNumber && data.busId !== busId) return;

      setBus(prev => ({ ...prev, ...data, status: 'active' }));
      setLastUpdate(new Date());
      setIsStale(false);

      clearTimeout(staleTimer.current);
      staleTimer.current = setTimeout(() => setIsStale(true), 30000);

      // Update map marker
      if (mapInstance.current && markerRef.current && data.latitude && data.longitude) {
        markerRef.current.setLatLng([data.latitude, data.longitude]);
        mapInstance.current.panTo([data.latitude, data.longitude], { animate: true });
      }
    };

    socket.on('bus-location-update', handler);
    socket.on('global-bus-location-changed', handler);

    return () => {
      socket.emit('untrack-bus', busId);
      socket.off('bus-location-update', handler);
      socket.off('global-bus-location-changed', handler);
    };
  }, [socket, busId, bus?.busNumber]);

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
        <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}><ArrowLeft size={18} /></button>
        <span className="topbar-title">Loading…</span>
        <div />
      </div>
      <div className="page-content" style={{ padding: '24px 16px' }}>
        <div className="skeleton" style={{ height: 240, borderRadius: 12, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 100, borderRadius: 12 }} />
      </div>
    </div>
  );

  if (!bus) return (
    <div className="page">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}><ArrowLeft size={18} /></button>
        <span className="topbar-title">Bus Not Found</span>
        <div />
      </div>
      <div className="page-content">
        <div className="empty-state">
          <div className="empty-icon"><Bus size={24} /></div>
          <h3>Bus not found</h3>
          <p>This bus may no longer be active</p>
          <button className="btn btn-primary mt-3" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    </div>
  );

  const isActive = bus.status === 'active';

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}><ArrowLeft size={18} /></button>
        <div style={{ display: 'flex', flex: 1, justifyContent: 'center', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{bus.busNumber}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{bus.routeName}</div>
        </div>
        <span className={`badge ${isActive ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: '0.72rem' }}>
          {isActive ? <><span className="live-dot" style={{ width: 5, height: 5 }} />Live</> : 'Inactive'}
        </span>
      </div>

      <div className="page-content" style={{ padding: 0 }}>
        {/* In-bus confirmation banner */}
        {inBus && (
          <div style={{ padding: '8px 16px', background: 'var(--accent)', color: 'white', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
            <CheckCircle2 size={14} />
            <span>You're on this bus · Location verified</span>
          </div>
        )}

        {/* Map */}
        {isActive ? (
          <div ref={mapRef} className="map-container" style={{ height: 280, borderRadius: 0 }} />
        ) : (
          <div style={{ height: 200, background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
            <MapPin size={32} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: '0.85rem' }}>Bus not currently active</span>
          </div>
        )}

        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Stale warning */}
          {isStale && (
            <div className="alert alert-warn" style={{ fontSize: '0.8rem' }}>
              <RefreshCw size={13} /> Location may be outdated
            </div>
          )}

          {/* Route path */}
          <div className="card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Navigation size={14} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Route</span>
            </div>
            <div className="route-path" style={{ marginBottom: 0 }}>
              <span className="route-path-origin">{bus.route?.source || bus.route?.startPoint || '—'}</span>
              <div className="route-path-line">
                {isActive && <div className="route-path-dot" style={{ left: '30%' }} />}
              </div>
              <span className="route-path-dest">{bus.route?.destination || bus.route?.endPoint || '—'}</span>
            </div>
          </div>

          {/* Stats */}
          {isActive && (
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Speed</div>
                  <div className="speed-display">
                    <span className="speed-value" style={{ fontSize: '1.3rem' }}>{Math.round(bus.speed || 0)}</span>
                    <span className="speed-unit">km/h</span>
                  </div>
                </div>
                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Updated</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{timeSince || '—'}</div>
                </div>
                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Crowd</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: CROWD_COLORS[bus.currentCrowd] || 'var(--text-primary)' }}>
                    {CROWD_LABELS[bus.currentCrowd] || '—'}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <CrowdBar level={bus.currentCrowd || 1} />
              </div>
            </div>
          )}

          {/* Stops */}
          {bus.route?.stops?.length > 0 && (
            <div className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Stops</div>
              {bus.route.stops.map((stop, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: i < bus.route.stops.length - 1 ? 10 : 0, borderBottom: i < bus.route.stops.length - 1 ? '1px solid var(--border)' : 'none', marginBottom: i < bus.route.stops.length - 1 ? 10 : 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? 'var(--green)' : i === bus.route.stops.length - 1 ? 'var(--red)' : 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{stop.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
