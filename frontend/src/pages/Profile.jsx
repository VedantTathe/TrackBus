import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const navigate = useNavigate();
  const { user, updateProfile, logout, isInstallable, installApp } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(user?.name || '');
    setPhone(user?.phone || '');
  }, [user]);

  const handleSave = () => {
    updateProfile({ name: name.trim(), phone: phone.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="page">
      {/* Topbar navigation banner */}
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}>
            <ArrowLeft size={18} />
          </button>
          <span className="topbar-title" style={{ fontSize: '1rem', fontWeight: 700 }}>Profile</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost active" onClick={() => navigate('/profile')} style={{ padding: 8, background: 'var(--accent-light)', color: 'var(--accent)' }}>
            <User size={16} />
          </button>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}>
        {saved && (
          <div className="alert alert-success" style={{ marginTop: 12, marginBottom: 12 }}>
            Profile updated successfully
          </div>
        )}

        <div className="grid-desktop-1-2" style={{ marginTop: 16 }}>
          
          {/* Left Column: Visual Profile Card */}
          <div>
            <div className="card premium-glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', border: '1px solid var(--border)' }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <User size={36} />
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>{user?.name || 'Passenger'}</h2>
              <span className="badge badge-blue" style={{ fontSize: '0.72rem', padding: '3px 10px', textTransform: 'uppercase', fontWeight: 700 }}>{user?.role || 'Passenger'}</span>
              
              <div style={{ marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16, width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Employee ID:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{user?.employeeId || '—'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                  <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Active Account</span>
                </div>
              </div>

              <button className="btn btn-ghost btn-full" onClick={logout} style={{ marginTop: 20, border: '1px dashed var(--border-strong)', color: 'var(--red)' }}>
                <LogOut size={14} /> Logout Account
              </button>
            </div>
          </div>

          {/* Right Column: Edit Profile Inputs */}
          <div>
            <div className="card premium-glass-card" style={{ padding: '24px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 4 }}>
                Account Settings
              </div>
              
              <div className="input-group">
                <label className="input-label">Full Name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </div>
              
              <div className="input-group">
                <label className="input-label">Phone Contact</label>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your phone number" />
              </div>
              
              <div className="grid-desktop-2" style={{ gap: 12 }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label">Employee ID</label>
                  <input className="input" value={user?.employeeId || ''} readOnly style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }} />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label className="input-label">Assigned Role</label>
                  <input className="input" value={user?.role || ''} readOnly style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }} />
                </div>
              </div>

              <button className="btn btn-primary btn-full btn-lg" onClick={handleSave} style={{ marginTop: 8 }}>
                Save Profile Changes
              </button>
            </div>
          </div>

          {/* PWA Settings Card */}
          {isInstallable && (
            <div className="card premium-glass-card" style={{ marginTop: 16, border: '1px solid var(--border)', padding: '20px 18px' }}>
              <div style={{ marginBottom: 12, fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Application Settings
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
                Get the MSRTC Lalpari Tracker directly on your device's home screen. Enjoy faster loading and a native app-like experience.
              </p>
              <button className="btn btn-primary btn-full btn-lg" onClick={installApp} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span>Install TrackBus App</span>
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
