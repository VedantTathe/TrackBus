import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const navigate = useNavigate();
  const { user, updateProfile, logout } = useAuth();
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
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}>
          <ArrowLeft size={18} />
        </button>
        <span className="topbar-title">Profile</span>
        <div style={{ width: 32 }} />
      </div>

      <div className="page-content">
        <div style={{ padding: '16px 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <User size={20} />
          </div>
          <div>
            <h2 style={{ marginBottom: 2 }}>{user?.name || 'Passenger'}</h2>
            <p>{user?.employeeId || '—'}</p>
          </div>
        </div>

        {saved && (
          <div className="alert alert-success" style={{ marginTop: 12 }}>
            Profile updated
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <div className="input-group">
            <label className="input-label">Full Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </div>
          <div className="input-group">
            <label className="input-label">Phone</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Your phone" />
          </div>
          <div className="input-group">
            <label className="input-label">Employee ID</label>
            <input className="input" value={user?.employeeId || ''} readOnly style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }} />
          </div>
          <div className="input-group">
            <label className="input-label">Role</label>
            <input className="input" value={user?.role || ''} readOnly style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }} />
          </div>

          <button className="btn btn-primary btn-full" onClick={handleSave}>
            Save Changes
          </button>

          <button className="btn btn-ghost btn-full" onClick={logout} style={{ marginTop: 10 }}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </div>
    </div>
  );
}
