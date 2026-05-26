import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Bus, Mail, ArrowRight, Eye, EyeOff, Loader } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep] = useState('email'); // email | otp | password
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState('passenger');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const BYPASS = ['driver@trackbus.com', 'passenger@trackbus.com', 'admin@trackbus.com'];

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!employeeId.trim()) return;
    setError(''); setLoading(true);
    try {
      const res = await axios.post('/api/auth/register', { employeeId: employeeId.trim().toLowerCase(), role });
      if (res.data.token) {
        login(res.data.user || res.data, res.data.token);
        navigate('/');
      } else {
        setInfo(`OTP sent to ${employeeId}`);
        setStep('otp');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (!otp.trim()) return;
    setError(''); setLoading(true);
    try {
      const res = await axios.post('/api/auth/verify-otp', { employeeId: employeeId.trim().toLowerCase(), otpCode: otp.trim() });
      login(res.data.user || res.data, res.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;
    setError(''); setLoading(true);
    try {
      const res = await axios.post('/api/auth/login', { employeeId: employeeId.trim().toLowerCase(), password });
      login(res.data.user || res.data, res.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const quickFill = (id, r) => { setEmployeeId(id); setRole(r); };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', maxWidth: 480, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ padding: '48px 24px 32px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, background: 'var(--accent)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'white' }}>
          <Bus size={28} />
        </div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>TrackBus</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Real-time bus tracking</p>
      </div>

      {/* Form */}
      <div style={{ flex: 1, padding: '0 24px 32px' }}>

        {step === 'email' && (
          <form onSubmit={handleEmailSubmit}>
            <div className="input-group">
              <label className="input-label">Email / Employee ID</label>
              <div className="input-icon-wrapper">
                <Mail size={15} className="input-icon" />
                <input className="input" style={{ paddingLeft: 38 }} type="email" value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="you@example.com" required autoFocus />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">Role</label>
              <select className="input" value={role} onChange={e => setRole(e.target.value)}>
                <option value="passenger">Passenger</option>
                <option value="driver">Driver</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {error && <div className="alert alert-error mb-2">{error}</div>}

            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: 4 }}>
              {loading ? <Loader size={16} className="animate-spin" /> : <><span>Continue</span><ArrowRight size={16} /></>}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleOtpSubmit}>
            {info && <div className="alert alert-info" style={{ marginBottom: 16 }}><Mail size={14} />{info}</div>}
            <div className="input-group">
              <label className="input-label">Enter OTP</label>
              <input className="input" type="text" value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit code" maxLength={6} required autoFocus style={{ fontSize: '1.4rem', letterSpacing: '0.2em', textAlign: 'center' }} />
            </div>
            {error && <div className="alert alert-error mb-2">{error}</div>}
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
              {loading ? <Loader size={16} className="animate-spin" /> : 'Verify & Login'}
            </button>
            <button type="button" className="btn btn-ghost btn-full mt-2" onClick={() => { setStep('email'); setError(''); }}>← Change email</button>
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handlePasswordLogin}>
            <div className="input-group">
              <label className="input-label">Password</label>
              <div className="input-icon-wrapper">
                <input className="input" type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required autoFocus style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {error && <div className="alert alert-error mb-2">{error}</div>}
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
              {loading ? <Loader size={16} className="animate-spin" /> : 'Sign In'}
            </button>
            <button type="button" className="btn btn-ghost btn-full mt-2" onClick={() => { setStep('email'); setError(''); }}>← Back</button>
          </form>
        )}

        {/* Quick access */}
        <div style={{ marginTop: 40, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick Access (Demo)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Driver', id: 'driver@trackbus.com', r: 'driver', desc: 'Start a trip, share location' },
              { label: 'Passenger', id: 'passenger@trackbus.com', r: 'passenger', desc: 'Search & track buses' },
              { label: 'Admin', id: 'admin@trackbus.com', r: 'admin', desc: 'Manage fleet & routes' },
            ].map(q => (
              <button key={q.r} type="button" onClick={() => quickFill(q.id, q.r)} className="btn btn-secondary" style={{ justifyContent: 'space-between', padding: '10px 14px' }}>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{q.label}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{q.desc}</span>
                </span>
                <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />
              </button>
            ))}
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>Password: <code style={{ background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>password123</code></p>
        </div>
      </div>
    </div>
  );
}
