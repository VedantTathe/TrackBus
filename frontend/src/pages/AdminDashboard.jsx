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

  const handleApproveDriver = async (employeeId) => {
    if (!window.confirm(`Approve driver account for Employee ID: ${employeeId}?`)) return;
    setSaving(true);
    setError('');
    try {
      const res = await axios.put('/api/auth/approve-driver', { employeeId });
      setSuccess(res.data.message || 'Driver approved successfully');
      await loadAll();
    } catch (e) {
      setError(e.response?.data?.message || 'Error approving driver');
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
            <h2>Fleet Manager Command Center</h2>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>ID: {user?.employeeId}</span>
          </div>
          
          {/* Responsive Fleet Command Metrics Cards */}
          <div className="grid-desktop-3" style={{ marginTop: 16, marginBottom: 12 }}>
            <div className="card premium-glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Registered Fleet</span>
              <strong style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{buses.length} Buses</strong>
            </div>
            <div className="card premium-glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 6, borderLeft: '4px solid var(--green)', borderTop: '1px solid var(--border)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Broadcasts</span>
              <strong style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--green)' }}>{buses.filter(b => b.status === 'active').length} Live</strong>
            </div>
            <div className="card premium-glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Configured Corridors</span>
              <strong style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent)' }}>{routes.length} Routes</strong>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 16 }}>
          {TABS.map(t => (
            <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)} style={{ padding: '10px 8px', fontSize: '0.85rem' }}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div className="grid-desktop-3" style={{ gap: 12 }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 100, borderRadius: 10 }} />)}
          </div>
        ) : (
          <>
            {/* BUSES TAB */}
            {tab === 'Buses' && (
              <>
                <button className="btn btn-primary btn-full mb-2" onClick={() => openModal('bus', {})} style={{ marginBottom: 12, padding: '12px' }}>
                  <Plus size={16} /> Add New Bus to Fleet
                </button>
                <div className="grid-desktop-3" style={{ gap: 12 }}>
                  {buses.map(bus => (
                    <div key={bus._id} className="card premium-glass-card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 140, border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{bus.busNumber}</span>
                            <span className={`badge ${bus.status === 'active' ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: '0.68rem' }}>
                              {bus.status === 'active' ? 'Live' : 'Inactive'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{bus.routeName}</div>
                          {bus.assignedDriver && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                              Driver: <strong style={{ color: 'var(--text-secondary)' }}>{bus.assignedDriver.name || bus.assignedDriver.employeeId}</strong>
                            </div>
                          )}
                          {bus.status === 'active' && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600, marginTop: 4 }}>
                              Speed: {bus.speed || 0} km/h · {CROWD_LABELS[bus.currentCrowd] || '—'}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: 6, borderTop: '1px dashed var(--border)', paddingTop: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openModal('assignDriver', { busNumber: bus.busNumber })} title="Assign Driver" style={{ padding: '6px 10px' }}>
                          <Users size={13} />
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openModal('bus', { _id: bus._id, busNumber: bus.busNumber, routeName: bus.routeName, capacity: bus.capacity, status: bus.status })} style={{ padding: '6px 10px' }}>
                          <Edit size={13} />
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleDeleteBus(bus._id)} style={{ color: 'var(--red)', padding: '6px 10px', background: 'var(--red-light)', borderColor: 'rgba(220, 38, 38, 0.15)' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {buses.length === 0 && <div className="empty-state" style={{ gridColumn: 'span 3' }}><div className="empty-icon"><Bus size={22} /></div><p>No buses yet</p></div>}
                </div>
              </>
            )}

            {/* ROUTES TAB */}
            {tab === 'Routes' && (
              <>
                <button className="btn btn-primary btn-full mb-2" onClick={() => openModal('route', {})} style={{ marginBottom: 12, padding: '12px' }}>
                  <Plus size={16} /> Create New Transit Route
                </button>
                <div className="grid-desktop-3" style={{ gap: 12 }}>
                  {routes.map(route => (
                    <div key={route._id} className="card premium-glass-card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 140, border: '1px solid var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 4 }}>
                          <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{route.routeName}</div>
                          <span className="badge badge-gray" style={{ fontSize: '0.68rem', fontWeight: 700 }}>#{route.routeNumber}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          <strong>{route.source || route.startPoint}</strong>
                          <ChevronRight size={11} />
                          <strong>{route.destination || route.endPoint}</strong>
                        </div>
                        {route.busNumbers?.length > 0 && (
                          <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {route.busNumbers.map(b => <span key={b} className="badge badge-blue" style={{ fontSize: '0.65rem' }}>{b}</span>)}
                          </div>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', justifycontent: 'flex-end', borderTop: '1px dashed var(--border)', paddingTop: 10, marginTop: 10, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openModal('route', { ...route })} style={{ padding: '6px 12px' }}>
                          <Edit size={13} /> Edit Route
                        </button>
                      </div>
                    </div>
                  ))}
                  {routes.length === 0 && <div className="empty-state" style={{ gridColumn: 'span 3' }}><div className="empty-icon"><MapPin size={22} /></div><p>No routes yet</p></div>}
                </div>
              </>
            )}

            {/* DRIVERS TAB */}
            {tab === 'Drivers' && (
              <div className="grid-desktop-3" style={{ gap: 12 }}>
                {drivers.map(d => (
                  <div 
                    key={d._id} 
                    className="card premium-glass-card" 
                    style={{ 
                      padding: '16px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'space-between', 
                      minHeight: 120, 
                      border: '1px solid var(--border)',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.96rem', color: 'var(--text-primary)' }}>{d.name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>Emp ID: {d.employeeId}</div>
                        {d.phone && d.phone !== 'N/A' && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Phone: {d.phone}</div>
                        )}
                      </div>
                      <span 
                        className={`badge ${d.isApproved ? 'badge-green' : 'badge-amber'}`} 
                        style={{ fontSize: '0.7rem', padding: '3px 8px', fontWeight: 800 }}
                      >
                        {d.isApproved ? 'Approved' : 'Pending'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', borderTop: '1px dashed var(--border)', paddingTop: 10, marginTop: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
                      {!d.isApproved ? (
                        <button 
                          className="btn btn-primary btn-sm" 
                          onClick={() => handleApproveDriver(d.employeeId)}
                          style={{ 
                            padding: '6px 12px', 
                            fontSize: '0.78rem', 
                            fontWeight: 700, 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 6,
                            background: 'var(--green)',
                            borderColor: 'var(--green)'
                          }}
                        >
                          <CheckCircle2 size={13} /> Approve Driver
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.74rem', color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={13} /> Verification Verified
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {drivers.length === 0 && <div className="empty-state" style={{ gridColumn: 'span 3' }}><div className="empty-icon"><Users size={22} /></div><p>No drivers registered</p></div>}
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
