import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Bus, ChevronRight, Clock, MapPin } from 'lucide-react';

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

function addRecentBus(bus) {
  if (!bus?.busNumber) return;
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

function CrowdBar({ level = 1 }) {
  return (
    <div className="crowd-bar">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className={`crowd-segment ${i <= level ? `filled-${level}` : ''}`} />
      ))}
    </div>
  );
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

export default function SearchResults() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const searchMode = params.get('mode') || 'route';
  const query = params.get('q') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';

  const [allBuses, setAllBuses] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  const buildBusesFromRoutes = (routes = []) => {
    const map = new Map();
    routes.forEach((route) => {
      const startStop = (route.stops || [])[0];
      const endStop = (route.stops || [])[route.stops?.length - 1];
      (route.busNumbers || []).forEach((busNumber) => {
        if (!map.has(busNumber)) {
          map.set(busNumber, {
            routeId: route._id,
            busNumber,
            routeName: route.routeName,
            status: 'inactive',
            speed: 0,
            currentCrowd: 1,
            lastUpdated: route.updatedAt || null,
            startTime: startStop?.departureTime || startStop?.arrivalTime || null,
            endTime: endStop?.arrivalTime || endStop?.departureTime || null
          });
        }
      });
    });
    return Array.from(map.values());
  };

  const mergeActiveBuses = (baseBuses, activeBuses) => {
    const map = new Map(baseBuses.map(b => [b.busNumber, b]));
    (activeBuses || []).forEach((bus) => {
      map.set(bus.busNumber, { ...map.get(bus.busNumber), ...bus, status: 'active' });
    });
    return Array.from(map.values());
  };

  const loadBaseBuses = async () => {
    const [activeRes, routesRes] = await Promise.all([
      axios.get('/api/buses/active'),
      axios.get('/api/buses/routes')
    ]);
    const baseBuses = buildBusesFromRoutes(routesRes.data);
    return mergeActiveBuses(baseBuses, activeRes.data);
  };

  const runSearch = async (mode, q, f, t) => {
    try {
      const hasCriteria = mode === 'route' ? Boolean(f || t) : Boolean(q && q.trim());
      if (!hasCriteria) {
        setResults([]);
        return;
      }

      const url = '/api/buses/routes';
      const apiParams = {};
      if (mode === 'route' && (f || t)) apiParams.q = `${f} to ${t}`;
      if (mode === 'bus' && q.trim()) apiParams.q = q.trim();

      const res = await axios.get(url, { params: apiParams });
      const routes = res.data;
      const busNums = routes.flatMap(r => r.busNumbers || []);
      const matched = allBuses.filter(b => busNums.includes(b.busNumber) || routes.some(r => r.routeName === b.routeName));

      if (matched.length > 0) {
        setResults(matched);
        return;
      }

      if (mode === 'bus') {
        const fallback = allBuses.filter(b =>
          q ? b.busNumber?.toLowerCase().includes(q.toLowerCase()) || b.routeName?.toLowerCase().includes(q.toLowerCase()) : false
        );
        setResults(fallback);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const buses = await loadBaseBuses();
        setAllBuses(buses);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (allBuses.length === 0) return;
    runSearch(searchMode, query, from, to);
  }, [allBuses, searchMode, query, from, to]);

  const handleTrack = (bus) => {
    addRecentBus(bus);
    navigate(`/journey/${bus.busNumber}`);
  };

  const summary = useMemo(() => {
    if (searchMode === 'route') return `${from || 'From'} → ${to || 'To'}`;
    return query || 'Search';
  }, [searchMode, from, to, query]);

  return (
    <div className="page">
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate('/passenger')} style={{ padding: 8 }}>
          <ArrowLeft size={18} />
        </button>
        <span className="topbar-title">Search Results</span>
        <div style={{ width: 32 }} />
      </div>

      <div className="page-content">
        <div style={{ padding: '12px 0 4px' }}>
          <h2 style={{ fontSize: '1rem' }}>Search results for: {summary}</h2>
          <p>{results.length} bus{results.length !== 1 ? 'es' : ''} found</p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 12 }} />)}
          </div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Bus size={24} /></div>
            <h3>No buses found</h3>
            <p>Try a different search term</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
            {results.map(bus => (
              <BusCard key={bus._id || bus.busNumber} bus={bus} onTrack={handleTrack} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
