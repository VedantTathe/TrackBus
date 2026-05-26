import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Bus, Users, Plus, Edit, Trash2, LogOut, RefreshCw, CheckCircle2, X, ChevronRight, MapPin } from 'lucide-react';

const TABS = ['Buses', 'Routes', 'Drivers'];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('Buses');
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { type: 'bus' | 'route' | 'assignDriver', data? }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [busRes, routeRes, driverRes] = await Promise.all([
        axios.get('/api/buses'),
        axios.get('/api/buses/routes'),
        axios.get('/api/buses/drivers')
      ]);
      setBuses(busRes.data);
      setRoutes(routeRes.data);
      setDrivers(driverRes.data);
    } catch (e) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const openModal = (type, data = {}) => { setModal({ type, data }); setForm(data); setError(''); };
  const closeModal = () => { setModal(null); setForm({}); setError(''); };

  const handleSaveBus = async () => {
    if (!form.busNumber || !form.routeName || !form.capacity) return setError('Fill all fields');
    setSaving(true);
    try {
      if (modal.data._id) {
        await axios.put(`/api/buses/${modal.data._id}`, form);
      } else {
        await axios.post('/api/buses', form);
      }
      setSuccess(modal.data._id ? 'Bus updated' : 'Bus created');
      await loadAll();
      closeModal();
    } catch (e) {
      setError(e.response?.data?.message || 'Error saving bus');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleDeleteBus = async (id) => {
    if (!window.confirm('Delete this bus?')) return;
    try {
      await axios.delete(`/api/buses/${id}`);
      await loadAll();
    } catch (e) {
      setError('Failed to delete');
    }
  };

  const handleAssignDriver = async () => {
    if (!form.busNumber || !form.employeeId) return setError('Fill all fields');
    setSaving(true);
    try {
      await axios.put('/api/buses/assign-driver', { busNumber: form.busNumber, employeeId: form.employeeId });
      setSuccess('Driver assigned');
      await loadAll();
      closeModal();
    } catch (e) {
      setError(e.response?.data?.message || 'Error assigning driver');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleSaveRoute = async () => {
    if (!form.routeName || !form.routeNumber || !form.startPoint || !form.endPoint) return setError('Fill all required fields');
    setSaving(true);
    try {
      if (modal.data._id) {
        await axios.put(`/api/routes/${modal.data._id}`, form);
      } else {
        await axios.post('/api/routes', form);
      }
      setSuccess(modal.data._id ? 'Route updated' : 'Route created');
      await loadAll();
      closeModal();
    } catch (e) {
      setError(e.response?.data?.message || 'Error saving route');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const CROWD_LABELS = { 1: 'Empty', 2: 'Seats Avail.', 3: 'Standing', 4: 'Full' };

  return (
    <div className="page">
      <div className="topbar">
        <div className="topbar-logo">
          <div className="topbar-logo-icon"><Bus size={15} /></div>
          <span className="topbar-logo-text">Admin</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={loadAll} style={{ padding: 8 }}><RefreshCw size={15} /></button>
          <button className="btn btn-ghost" onClick={logout} style={{ padding: 8 }}><LogOut size={15} /></button>
        </div>
      </div>

      <div className="page-content">
        {success && <div className="alert alert-success mt-2" style={{ marginTop: 12 }}><CheckCircle2 size={14} />{success}</div>}
        {error && !modal && <div className="alert alert-error mt-2" style={{ marginTop: 12 }}>{error}</div>}

        <div style={{ padding: '14px 0 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2>Fleet Manager</h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{user?.employeeId}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>{buses.length}</strong> buses</span>
            <span style={{ color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--green)' }}>{buses.filter(b => b.status === 'active').length}</strong> live</span>
            <span style={{ color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>{routes.length}</strong> routes</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 12 }}>
          {TABS.map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 10 }} />)}
          </div>
        ) : (
          <>
            {/* BUSES TAB */}
            {tab === 'Buses' && (
              <>
                <button className="btn btn-primary btn-full mb-2" onClick={() => openModal('bus', {})} style={{ marginBottom: 10 }}>
                  <Plus size={15} /> Add Bus
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {buses.map(bus => (
                    <div key={bus._id} className="card" style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <span style={{ fontWeight: 700 }}>{bus.busNumber}</span>
                            <span className={`badge ${bus.status === 'active' ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: '0.68rem' }}>
                              {bus.status === 'active' ? 'Live' : 'Inactive'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{bus.routeName}</div>
                          {bus.assignedDriver && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              Driver: {bus.assignedDriver.name || bus.assignedDriver.employeeId}
                            </div>
                          )}
                          {bus.status === 'active' && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              {bus.speed || 0} km/h · {CROWD_LABELS[bus.currentCrowd] || '—'}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openModal('assignDriver', { busNumber: bus.busNumber })} title="Assign Driver">
                            <Users size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openModal('bus', { _id: bus._id, busNumber: bus.busNumber, routeName: bus.routeName, capacity: bus.capacity, status: bus.status })}>
                            <Edit size={13} />
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteBus(bus._id)} style={{ color: 'var(--red)' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {buses.length === 0 && <div className="empty-state"><div className="empty-icon"><Bus size={22} /></div><p>No buses yet</p></div>}
                </div>
              </>
            )}

            {/* ROUTES TAB */}
            {tab === 'Routes' && (
              <>
                <button className="btn btn-primary btn-full mb-2" onClick={() => openModal('route', {})} style={{ marginBottom: 10 }}>
                  <Plus size={15} /> Add Route
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {routes.map(route => (
                    <div key={route._id} className="card" style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{route.routeName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1 }}>#{route.routeNumber}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            <span>{route.source || route.startPoint}</span>
                            <ChevronRight size={11} />
                            <span>{route.destination || route.endPoint}</span>
                          </div>
                          {route.busNumbers?.length > 0 && (
                            <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {route.busNumbers.map(b => <span key={b} className="badge badge-blue" style={{ fontSize: '0.65rem' }}>{b}</span>)}
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openModal('route', { ...route })}>
                            <Edit size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {routes.length === 0 && <div className="empty-state"><div className="empty-icon"><MapPin size={22} /></div><p>No routes yet</p></div>}
                </div>
              </>
            )}

            {/* DRIVERS TAB */}
            {tab === 'Drivers' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {drivers.map(d => (
                  <div key={d._id} className="card" style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{d.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.employeeId}</div>
                    </div>
                    <span className="badge badge-blue">{d.role}</span>
                  </div>
                ))}
                {drivers.length === 0 && <div className="empty-state"><div className="empty-icon"><Users size={22} /></div><p>No drivers registered</p></div>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="modal-title" style={{ margin: 0 }}>
                {modal.type === 'bus' ? (modal.data._id ? 'Edit Bus' : 'New Bus')
                  : modal.type === 'route' ? (modal.data._id ? 'Edit Route' : 'New Route')
                  : 'Assign Driver'}
              </h3>
              <button className="btn btn-ghost" onClick={closeModal} style={{ padding: 4 }}><X size={16} /></button>
            </div>

            {error && <div className="alert alert-error mb-2" style={{ marginBottom: 12 }}>{error}</div>}

            {modal.type === 'bus' && (
              <>
                <div className="input-group"><label className="input-label">Bus Number *</label><input className="input" value={form.busNumber || ''} onChange={e => setForm({ ...form, busNumber: e.target.value })} placeholder="e.g. MH12-9401" /></div>
                <div className="input-group"><label className="input-label">Route Name *</label>
                  <select className="input" value={form.routeName || ''} onChange={e => setForm({ ...form, routeName: e.target.value })}>
                    <option value="">Select route</option>
                    {routes.map(r => <option key={r._id} value={r.routeName}>{r.routeName}</option>)}
                  </select>
                </div>
                <div className="input-group"><label className="input-label">Capacity *</label><input className="input" type="number" value={form.capacity || ''} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="e.g. 52" /></div>
                <button className="btn btn-primary btn-full" onClick={handleSaveBus} disabled={saving}>
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : 'Save Bus'}
                </button>
              </>
            )}

            {modal.type === 'route' && (
              <>
                <div className="input-group"><label className="input-label">Route Name *</label><input className="input" value={form.routeName || ''} onChange={e => setForm({ ...form, routeName: e.target.value })} placeholder="e.g. Pune – Sangli Express" /></div>
                <div className="input-group"><label className="input-label">Route Number *</label><input className="input" value={form.routeNumber || ''} onChange={e => setForm({ ...form, routeNumber: e.target.value })} placeholder="e.g. 303" /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="input-group"><label className="input-label">From *</label><input className="input" value={form.startPoint || ''} onChange={e => setForm({ ...form, startPoint: e.target.value, source: e.target.value })} placeholder="Pune" /></div>
                  <div className="input-group"><label className="input-label">To *</label><input className="input" value={form.endPoint || ''} onChange={e => setForm({ ...form, endPoint: e.target.value, destination: e.target.value })} placeholder="Sangli" /></div>
                </div>
                <button className="btn btn-primary btn-full" onClick={handleSaveRoute} disabled={saving}>
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : 'Save Route'}
                </button>
              </>
            )}

            {modal.type === 'assignDriver' && (
              <>
                <div className="input-group"><label className="input-label">Bus Number</label><input className="input" value={form.busNumber || ''} readOnly style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }} /></div>
                <div className="input-group"><label className="input-label">Driver Employee ID</label>
                  <select className="input" value={form.employeeId || ''} onChange={e => setForm({ ...form, employeeId: e.target.value })}>
                    <option value="">Select driver</option>
                    {drivers.map(d => <option key={d._id} value={d.employeeId}>{d.name} ({d.employeeId})</option>)}
                  </select>
                </div>
                <button className="btn btn-primary btn-full" onClick={handleAssignDriver} disabled={saving}>
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : 'Assign Driver'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="bottom-nav">
        {TABS.map(t => (
          <button key={t} className={`nav-item ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'Buses' && <Bus size={20} />}
            {t === 'Routes' && <MapPin size={20} />}
            {t === 'Drivers' && <Users size={20} />}
            <span className="nav-item-label">{t}</span>
          </button>
        ))}
        <button className="nav-item" onClick={logout}><LogOut size={20} /><span className="nav-item-label">Logout</span></button>
      </div>
    </div>
  );
}
