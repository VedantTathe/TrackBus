import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n';
import { Bus, Mail, ArrowRight, Eye, EyeOff, Loader, User, Phone, CheckCircle, Key } from 'lucide-react';

// Compact language toggle pill shown in top-right of form side
function LangToggle() {
  const { lang, toggleLanguage, t } = useLanguage();
  return (
    <button
      type="button"
      onClick={toggleLanguage}
      style={{
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '5px 14px',
        fontSize: '0.76rem',
        fontWeight: 700,
        cursor: 'pointer',
        color: 'var(--text-secondary)',
        letterSpacing: '0.02em',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        transition: 'all 0.18s ease'
      }}
      title={lang === 'mr' ? 'Switch to English' : 'मराठीत बदला'}
    >
      <span style={{ fontSize: '0.9rem' }}>🌐</span>
      {t('lang.toggle')}
    </button>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useLanguage();

  const [mode, setMode] = useState('passenger'); // passenger | driver-login | driver-register
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Symmetrical OTP Verification states
  const [otpStep, setOtpStep] = useState(false);
  const [otpVal, setOtpVal] = useState(''); // Completely empty by default
  const [otpTargetEmail, setOtpTargetEmail] = useState('');
  const [otpTargetRole, setOtpTargetRole] = useState('passenger');
  const [driverLoginType, setDriverLoginType] = useState('password'); // password | otp

  const handlePassengerLogin = async (e) => {
    e.preventDefault();
    if (!employeeId.trim()) return;
    setError(''); setSuccessMsg(''); setLoading(true);
    const emailStr = employeeId.trim().toLowerCase();
    try {
      const res = await axios.post('/api/auth/register', { 
        employeeId: emailStr, 
        role: 'passenger' 
      });
      if (res.data.requiresOtp) {
        setOtpTargetEmail(emailStr);
        setOtpTargetRole('passenger');
        setOtpStep(true);
        setOtpVal('');
        setSuccessMsg('OTP code sent successfully.');
      } else if (res.data.token) {
        login(res.data.user || res.data, res.data.token);
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start passenger session');
    } finally {
      setLoading(false);
    }
  };

  const handleDriverLogin = async (e) => {
    e.preventDefault();
    if (!employeeId.trim()) return;
    const emailStr = employeeId.trim().toLowerCase();

    if (driverLoginType === 'password') {
      if (!password.trim()) return;
      setError(''); setSuccessMsg(''); setLoading(true);
      try {
        const res = await axios.post('/api/auth/login', { 
          employeeId: emailStr, 
          password 
        });
        if (res.data.token) {
          login(res.data.user || res.data, res.data.token);
          navigate('/');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Authentication failed');
      } finally {
        setLoading(false);
      }
    } else {
      setError(''); setSuccessMsg(''); setLoading(true);
      try {
        const res = await axios.post('/api/auth/resend-otp', { employeeId: emailStr });
        if (res.data.success) {
          setOtpTargetEmail(emailStr);
          setOtpTargetRole('driver');
          setOtpStep(true);
          setOtpVal('');
          setSuccessMsg('OTP code transmitted.');
        }
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to initialize driver OTP authentication');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDriverRegister = async (e) => {
    e.preventDefault();
    if (!employeeId.trim() || !password.trim() || !name.trim()) return;
    setError(''); setSuccessMsg(''); setLoading(true);
    const emailStr = employeeId.trim().toLowerCase();
    try {
      const res = await axios.post('/api/auth/register', {
        name: name.trim(),
        employeeId: emailStr,
        phone: phone.trim() || 'N/A',
        password: password.trim(),
        role: 'driver'
      });
      if (res.data.requiresOtp) {
        setOtpTargetEmail(emailStr);
        setOtpTargetRole('driver-register');
        setOtpStep(true);
        setOtpVal('');
        setSuccessMsg('Verification OTP dispatched.');
      } else if (res.data.success) {
        setSuccessMsg(res.data.message || 'Driver account registered successfully. Pending admin approval.');
        setName(''); setEmployeeId(''); setPhone(''); setPassword('');
        setMode('driver-login');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to register driver');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpVal.trim() || !otpTargetEmail) return;
    setError(''); setSuccessMsg(''); setLoading(true);
    try {
      const res = await axios.post('/api/auth/verify-otp', {
        employeeId: otpTargetEmail,
        otp: otpVal.trim()
      });
      
      if (otpTargetRole === 'driver-register') {
        setSuccessMsg('Driver email address verified successfully! Pending admin approval.');
        setName(''); setEmployeeId(''); setPhone(''); setPassword('');
        setOtpStep(false);
        setMode('driver-login');
      } else {
        if (res.data.token) {
          login(res.data.user || res.data, res.data.token);
          navigate('/');
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      {/* Visual Side Banner (Visible on Desktop) */}
      <div 
        className="login-visual-side" 
        style={{
          background: 'linear-gradient(135deg, #d32f2f 0%, #991b1b 100%)',
          color: 'white',
          position: 'relative'
        }}
      >
        <div className="login-visual-pattern" />
        <div className="login-visual-glow" />
        
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* Panoramic Lalpari Bus Cover Photo (Uncropped & Fully Visible) */}
          <img 
            src="/lalpari.png" 
            alt="MSRTC Lalpari Bus"
            style={{ 
              width: '100%', 
              height: 240, 
              borderRadius: 16, 
              objectFit: 'cover',
              objectPosition: 'center 75%',
              marginBottom: 24,
              border: '3px solid rgba(255,255,255,0.2)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
            }} 
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
              <Bus size={20} />
            </div>
            <span style={{ fontSize: '0.82rem', color: '#ffcdd2', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 }}>
              {t('app.tagline')}
            </span>
          </div>

          <h1 className="login-visual-title" style={{ fontSize: '2.1rem', fontWeight: 900, lineHeight: 1.2, marginBottom: 14 }}>
            {t('login.visual.title')}
          </h1>
          <p className="login-visual-desc" style={{ fontSize: '0.94rem', opacity: 0.9, lineHeight: 1.6, marginBottom: 32 }}>
            {t('login.visual.desc')}
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="login-feature-card" style={{ background: 'rgba(255, 255, 255, 0.06)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: 14, borderRadius: 12 }}>
              <div className="login-feature-icon" style={{ background: '#b71c1c' }}>🚍</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.94rem' }}>{t('login.feature.broadcast')}</div>
                <div style={{ fontSize: '0.78rem', color: '#ffcdd2', marginTop: 2 }}>{t('login.feature.broadcast_desc')}</div>
              </div>
            </div>
            
            <div className="login-feature-card" style={{ background: 'rgba(255, 255, 255, 0.06)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: 14, borderRadius: 12 }}>
              <div className="login-feature-icon" style={{ background: '#b71c1c' }}>👥</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.94rem' }}>{t('login.feature.crowd')}</div>
                <div style={{ fontSize: '0.78rem', color: '#ffcdd2', marginTop: 2 }}>{t('login.feature.crowd_desc')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Side */}
      <div className="login-form-side" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        {/* Navbar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '16px 24px 0', gap: 8 }}>
          <LangToggle />
          {mode === 'passenger' ? (
            <button 
              type="button" 
              className="btn btn-secondary btn-sm" 
              onClick={() => { setMode('driver-login'); setError(''); setSuccessMsg(''); }}
              style={{ borderRadius: 20, padding: '6px 16px', fontSize: '0.78rem', fontWeight: 700 }}
            >
              {t('login.driver_portal')}
            </button>
          ) : (
            <button 
              type="button" 
              className="btn btn-secondary btn-sm" 
              onClick={() => { setMode('passenger'); setError(''); setSuccessMsg(''); }}
              style={{ borderRadius: 20, padding: '6px 16px', fontSize: '0.78rem', fontWeight: 700 }}
            >
              {t('login.commuter_tracker')}
            </button>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 40px 48px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
          
          {/* Lalpari Bus Cover Photo (Visible only on Mobile as header, Uncropped & Fully Visible) */}
          <img 
            src="/lalpari.png" 
            alt="MSRTC Lalpari Bus"
            className="mobile-only" 
            style={{ 
              width: '100%', 
              height: 140, 
              borderRadius: 16, 
              objectFit: 'cover',
              objectPosition: 'center 75%',
              marginBottom: 16,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              border: '2px solid var(--border)'
            }} 
          />

          {/* Header */}
          <div style={{ padding: '0 0 28px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, background: 'var(--accent)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'white', boxShadow: '0 4px 14px rgba(211, 47, 47, 0.25)' }}>
              <Bus size={28} />
            </div>
            
            {otpStep ? (
              <>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 4 }}>{t('login.title.otp')}</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{t('login.subtitle.otp')} <strong style={{ color: 'var(--text-primary)' }}>{otpTargetEmail}</strong></p>
              </>
            ) : mode === 'passenger' ? (
              <>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 4 }}>{t('login.title.passenger')}</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{t('login.subtitle.passenger')}</p>
              </>
            ) : mode === 'driver-login' ? (
              <>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 4 }}>{t('login.title.driver')}</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{t('login.subtitle.driver')}</p>
              </>
            ) : (
              <>
                <h1 style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.03em', marginBottom: 4 }}>{t('login.title.register')}</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>{t('login.subtitle.register')}</p>
              </>
            )}
          </div>

          {/* Success / Error Alerts */}
          {error && <div className="alert alert-error mb-2">{error}</div>}
          {successMsg && (
            <div className="alert alert-success mb-2" style={{ display: 'flex', alignItems: 'start', gap: 6 }}>
              <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{successMsg}</div>
            </div>
          )}

          {/* OTP Verification Flow */}
          {otpStep && (
            <form onSubmit={handleVerifyOtp}>
              <div className="input-group">
                <label className="input-label" style={{ fontWeight: 600 }}>{t('login.otp.label')}</label>
                <div className="input-icon-wrapper">
                  <Key size={15} className="input-icon" />
                  <input 
                    className="input" 
                    style={{ paddingLeft: 38, letterSpacing: '0.5em', fontSize: '1.2rem', fontWeight: 800, textAlign: 'center' }} 
                    type="text" 
                    maxLength={6}
                    value={otpVal} 
                    onChange={e => setOtpVal(e.target.value)} 
                    placeholder={t('login.otp.placeholder')} 
                    required 
                    autoFocus 
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? <Loader size={16} className="animate-spin" /> : <><span>{t('login.btn.otp_verify')}</span><ArrowRight size={16} /></>}
              </button>

              <button 
                type="button" 
                className="btn btn-secondary btn-full" 
                style={{ marginTop: 12 }} 
                onClick={() => { setOtpStep(false); setError(''); setSuccessMsg(''); }}
              >
                {t('login.btn.back')}
              </button>
            </form>
          )}

          {/* Passenger Flow */}
          {!otpStep && mode === 'passenger' && (
            <form onSubmit={handlePassengerLogin}>
              <div className="input-group">
                <label className="input-label" style={{ fontWeight: 600 }}>{t('login.label.passenger_email')}</label>
                <div className="input-icon-wrapper">
                  <Mail size={15} className="input-icon" />
                  <input 
                    className="input" 
                    style={{ paddingLeft: 38 }} 
                    type="email" 
                    value={employeeId} 
                    onChange={e => setEmployeeId(e.target.value)} 
                    placeholder={t('login.placeholder.passenger_email')} 
                    required 
                    autoFocus 
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {loading ? <Loader size={16} className="animate-spin" /> : <><span>{t('login.btn.start_tracking')}</span><ArrowRight size={16} /></>}
              </button>
            </form>
          )}

          {/* Driver Login Flow */}
          {!otpStep && mode === 'driver-login' && (
            <form onSubmit={handleDriverLogin}>
              {/* Driver Login Method Switcher */}
              <div 
                style={{ 
                  display: 'flex', 
                  background: 'var(--bg-subtle)', 
                  padding: 4, 
                  borderRadius: 10, 
                  marginBottom: 16, 
                  border: '1px solid var(--border)' 
                }}
              >
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    borderRadius: 8,
                    background: driverLoginType === 'password' ? 'var(--accent)' : 'none',
                    color: driverLoginType === 'password' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => { setDriverLoginType('password'); setError(''); setSuccessMsg(''); }}
                >
                  {t('login.btn.password_login')}
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    borderRadius: 8,
                    background: driverLoginType === 'otp' ? 'var(--accent)' : 'none',
                    color: driverLoginType === 'otp' ? 'white' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => { setDriverLoginType('otp'); setError(''); setSuccessMsg(''); }}
                >
                  {t('login.btn.otp_login')}
                </button>
              </div>

              <div className="input-group">
                <label className="input-label" style={{ fontWeight: 600 }}>{t('login.label.driver_email')}</label>
                <div className="input-icon-wrapper">
                  <Mail size={15} className="input-icon" />
                  <input 
                    className="input" 
                    style={{ paddingLeft: 38 }} 
                    type="email" 
                    value={employeeId} 
                    onChange={e => setEmployeeId(e.target.value)} 
                    placeholder={t('login.placeholder.driver_email')} 
                    required 
                    autoFocus 
                  />
                </div>
              </div>

              {driverLoginType === 'password' && (
                <div className="input-group">
                  <label className="input-label" style={{ fontWeight: 600 }}>{t('login.label.password')}</label>
                  <div className="input-icon-wrapper">
                    <input 
                      className="input" 
                      type={showPass ? 'text' : 'password'} 
                      value={password} 
                      onChange={e => setPassword(e.target.value)} 
                      placeholder={t('login.placeholder.password')} 
                      required 
                      style={{ paddingRight: 40 }} 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPass(!showPass)} 
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                      {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: 6 }}>
                {loading ? <Loader size={16} className="animate-spin" /> : (driverLoginType === 'password' ? t('login.btn.driver_signin') : t('login.btn.send_otp'))}
              </button>

              <div style={{ marginTop: 16, textAlign: 'center', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('login.new_driver')} </span>
                <button 
                  type="button" 
                  onClick={() => { setMode('driver-register'); setError(''); setSuccessMsg(''); }} 
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  {t('login.register_here')}
                </button>
              </div>
            </form>
          )}

          {/* Driver Registration Flow */}
          {!otpStep && mode === 'driver-register' && (
            <form onSubmit={handleDriverRegister}>
              <div className="input-group">
                <label className="input-label" style={{ fontWeight: 600 }}>{t('login.label.full_name')}</label>
                <div className="input-icon-wrapper">
                  <User size={15} className="input-icon" />
                  <input 
                    className="input" 
                    style={{ paddingLeft: 38 }} 
                    type="text" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder={t('login.placeholder.full_name')} 
                    required 
                    autoFocus 
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" style={{ fontWeight: 600 }}>{t('login.label.driver_email')}</label>
                <div className="input-icon-wrapper">
                  <Mail size={15} className="input-icon" />
                  <input 
                    className="input" 
                    style={{ paddingLeft: 38 }} 
                    type="email" 
                    value={employeeId} 
                    onChange={e => setEmployeeId(e.target.value)} 
                    placeholder={t('login.placeholder.driver_email_reg')} 
                    required 
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" style={{ fontWeight: 600 }}>{t('login.label.mobile')}</label>
                <div className="input-icon-wrapper">
                  <Phone size={15} className="input-icon" />
                  <input 
                    className="input" 
                    style={{ paddingLeft: 38 }} 
                    type="tel" 
                    value={phone} 
                    onChange={e => setPhone(e.target.value)} 
                    placeholder={t('login.placeholder.mobile')} 
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label" style={{ fontWeight: 600 }}>{t('login.label.password')}</label>
                <div className="input-icon-wrapper">
                  <input 
                    className="input" 
                    type={showPass ? 'text' : 'password'} 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="Create password" 
                    required 
                    style={{ paddingRight: 40 }} 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPass(!showPass)} 
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: 6 }}>
                {loading ? <Loader size={16} className="animate-spin" /> : t('login.btn.register')}
              </button>

              <div style={{ marginTop: 16, textAlign: 'center', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{t('login.already_registered')} </span>
                <button 
                  type="button" 
                  onClick={() => { setMode('driver-login'); setError(''); setSuccessMsg(''); }} 
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                >
                  {t('login.btn.driver_signin')}
                </button>
              </div>
            </form>
          )}

          {/* MSRTC Lalpari Services Grid (Visible below forms on both desktop/mobile views) */}
          <div style={{ marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <div style={{ marginBottom: 12, fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {t('login.msrtc_title')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 12, padding: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '1.25rem' }}>🚩</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('login.service.standard')}</span>
                <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{t('login.service.standard_desc')}</span>
              </div>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 12, padding: '12px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: '1.25rem' }}>⚡</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('login.service.shivshahi')}</span>
                <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{t('login.service.shivshahi_desc')}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
