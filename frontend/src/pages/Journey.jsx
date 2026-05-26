import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Bus, MapPin } from 'lucide-react';

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

export default function Journey() {
  const { busNumber } = useParams();
  const navigate = useNavigate();
  const [bus, setBus] = useState(null);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [activeRes, routesRes] = await Promise.all([
          axios.get('/api/buses/active'),
          axios.get('/api/buses/routes')
        ]);

        const active = activeRes.data || [];
        const routes = routesRes.data || [];
        const foundBus = active.find(b => b.busNumber === busNumber) || { busNumber };

        const foundRoute = routes.find(r =>
          (r.busNumbers || []).includes(busNumber) || r.routeName === foundBus.routeName
        );

        setBus(foundBus);
        setRoute(foundRoute || null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [busNumber]);

  useEffect(() => {
    let timer;
    const fetchLatest = async () => {
      try {
        const res = await axios.get(`/api/location/${busNumber}`);
        const loc = res.data;
        setBus(prev => ({
          ...prev,
          latitude: loc.latitude,
          longitude: loc.longitude,
          lastUpdated: loc.timestamp
        }));
      } catch {}
    };
    fetchLatest();
    timer = setInterval(fetchLatest, 15000);
    return () => clearInterval(timer);
  }, [busNumber]);

  const schedule = useMemo(() => {
    if (!route?.stops?.length) return null;
    const stops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const stopTimes = stops.map((s) => {
      const time = s.arrivalTime || s.departureTime;
      return { ...s, timeMinutes: parseTimeToMinutes(time) };
    });

    let currentIndex = 0;
    let currentDistanceKm = null;
    if (bus?.latitude && bus?.longitude) {
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      stopTimes.forEach((stop, idx) => {
        const dist = distanceKm({ lat: bus.latitude, lng: bus.longitude }, { lat: stop.lat, lng: stop.lng });
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
  }, [route, bus]);

  const headerText = route ? `${route.source || route.startPoint} → ${route.destination || route.endPoint}` : 'Journey';

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

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}>
          <ArrowLeft size={18} />
        </button>
        <span className="topbar-title">Journey</span>
        <div style={{ width: 32 }} />
      </div>

      <div className="page-content">
        <div style={{ padding: '12px 0 6px' }}>
          <h2 style={{ fontSize: '1.05rem' }}>{headerText}</h2>
          <p style={{ marginTop: 2 }}>{bus?.busNumber || busNumber}</p>
        </div>

        <div className="section-header">
          <span className="section-title">Journey Timeline</span>
        </div>

        {!schedule?.stops?.length ? (
          <div className="empty-state">
            <div className="empty-icon"><MapPin size={22} /></div>
            <p>No stops available for this route.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 12, position: 'relative' }}>
            <div style={{ position: 'absolute', left: '50%', top: 6, bottom: 6, width: 2, background: 'var(--border)' }} />
            {schedule.stops.map((stop, idx) => {
              const isCurrent = idx === schedule.currentIndex;
              const arrive = stop.arrivalTime || '—';
              const depart = stop.departureTime || '—';
              const atStop = schedule.currentDistanceKm !== null && schedule.currentDistanceKm <= 0.5 && isCurrent;
              const actualArrive = atStop ? formatClock(bus?.lastUpdated) : '—';
              const actualDepart = atStop ? formatClock(bus?.lastUpdated) : '—';
              const scheduledArriveMinutes = parseTimeToMinutes(arrive);
              const scheduledDepartMinutes = parseTimeToMinutes(depart);
              const actualMinutes = bus?.lastUpdated ? new Date(bus.lastUpdated).getHours() * 60 + new Date(bus.lastUpdated).getMinutes() : null;
              const delayArrive = atStop && actualMinutes !== null && scheduledArriveMinutes !== null && actualMinutes - scheduledArriveMinutes > 5;
              const delayDepart = atStop && actualMinutes !== null && scheduledDepartMinutes !== null && actualMinutes - scheduledDepartMinutes > 5;

              return (
                <div key={`${stop.name}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', alignItems: 'center', gap: 10 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Arrive</div>
                    <div style={{ fontWeight: 600 }}>{formatTime(arrive)}</div>
                    <div style={{ fontSize: '0.7rem', color: delayArrive ? 'var(--red)' : 'var(--green)' }}>
                      Actual {formatTime(actualArrive)}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 13, background: isCurrent ? 'var(--accent)' : 'var(--bg)', border: `2px solid ${isCurrent ? 'var(--accent)' : 'var(--border-strong)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isCurrent ? 'white' : 'var(--text-muted)' }}>
                      {isCurrent ? <Bus size={14} /> : <div style={{ width: 6, height: 6, borderRadius: 3, background: 'currentColor' }} />}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Depart</div>
                    <div style={{ fontWeight: 600 }}>{formatTime(depart)}</div>
                    <div style={{ fontSize: '0.7rem', color: delayDepart ? 'var(--red)' : 'var(--green)' }}>
                      Actual {formatTime(actualDepart)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>{stop.name}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
