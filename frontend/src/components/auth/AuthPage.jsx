import React, { useState, useEffect, useRef } from 'react';
import { 
  Sun, 
  Moon, 
  Mail, 
  Lock, 
  User, 
  ArrowRight, 
  Flashlight, 
  CheckCircle2, 
  AlertCircle, 
  Loader2 
} from 'lucide-react';
import MountainLandscape from '../MountainLandscape';
import OwlMascot from '../OwlMascot';
import FlashlightBeam from '../FlashlightBeam';
import { useAuth } from '../../context/AuthContext';

export default function AuthPage({ isDark, setIsDark }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  // Form inputs
  const [loginUsername, setLoginUsername] = useState('alice');
  const [loginPassword, setLoginPassword] = useState('password123');

  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  // Flashlight and Owl tracking states
  const [isFlashlightOn, setIsFlashlightOn] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Dynamic light beam coordinates
  const formPanelRef = useRef(null);
  const flashlightBtnRef = useRef(null);
  const owlRef = useRef(null);

  const [beamSource, setBeamSource] = useState(null);
  const [beamTarget, setBeamTarget] = useState(null);
  const [isOwlLit, setIsOwlLit] = useState(false);

  // Feedback states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [retryTimer, setRetryTimer] = useState(null);

  // Calculate default beam coordinates (from flashlight button to owl)
  const calculateDefaultPositions = () => {
    if (!formPanelRef.current) return;
    const panelRect = formPanelRef.current.getBoundingClientRect();

    let source = { x: panelRect.width - 70, y: panelRect.height - 210 };
    if (flashlightBtnRef.current) {
      const btnRect = flashlightBtnRef.current.getBoundingClientRect();
      source = {
        x: btnRect.left - panelRect.left + btnRect.width / 2,
        y: btnRect.top - panelRect.top + btnRect.height / 2,
      };
    }

    let target = { x: panelRect.width / 2, y: 70 };
    if (owlRef.current) {
      const owlRect = owlRef.current.getBoundingClientRect();
      target = {
        x: owlRect.left - panelRect.left + owlRect.width / 2,
        y: owlRect.top - panelRect.top + owlRect.height / 2,
      };
    }

    setBeamSource(source);
    setBeamTarget(target);
    setIsOwlLit(true);
  };

  useEffect(() => {
    calculateDefaultPositions();
    window.addEventListener('resize', calculateDefaultPositions);
    return () => window.removeEventListener('resize', calculateDefaultPositions);
  }, [mode, isDark]);

  const handleMouseMove = (e) => {
    if (!isFlashlightOn || !formPanelRef.current) return;
    const panelRect = formPanelRef.current.getBoundingClientRect();

    const mouseX = e.clientX - panelRect.left;
    const mouseY = e.clientY - panelRect.top;

    if (flashlightBtnRef.current) {
      const btnRect = flashlightBtnRef.current.getBoundingClientRect();
      setBeamSource({
        x: btnRect.left - panelRect.left + btnRect.width / 2,
        y: btnRect.top - panelRect.top + btnRect.height / 2,
      });
    }

    setBeamTarget({ x: mouseX, y: mouseY });

    if (owlRef.current) {
      const owlRect = owlRef.current.getBoundingClientRect();
      const owlCenterX = owlRect.left - panelRect.left + owlRect.width / 2;
      const owlCenterY = owlRect.top - panelRect.top + owlRect.height / 2;
      const distToOwl = Math.hypot(mouseX - owlCenterX, mouseY - owlCenterY);
      setIsOwlLit(distToOwl < 90);
    }
  };

  const handleMouseLeave = () => {
    calculateDefaultPositions();
  };

  const toggleFlashlight = () => {
    const nextState = !isFlashlightOn;
    setIsFlashlightOn(nextState);
    setShowPassword(nextState);
    if (nextState) {
      calculateDefaultPositions();
    }
  };

  // Rate Limiting countdown timer
  useEffect(() => {
    if (retryTimer && retryTimer > 0) {
      const interval = setInterval(() => {
        setRetryTimer((prev) => {
          if (prev <= 1) {
            setErrorMsg('');
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [retryTimer]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(loginUsername.trim(), loginPassword);
      } else {
        if (!regPassword || regPassword.length < 6) {
          throw new Error('Mật khẩu phải có từ 6 ký tự trở lên');
        }
        if (regPassword !== regConfirmPassword) {
          throw new Error('Mật khẩu xác nhận không trùng khớp');
        }

        await register(regUsername.trim(), regEmail.trim(), regPassword);
        setSuccessMsg('Đăng ký tài khoản thành công! Hãy đăng nhập ngay.');
        setLoginUsername(regUsername.trim());
        setLoginPassword(regPassword);
        setTimeout(() => {
          setMode('login');
          setSuccessMsg('');
        }, 1200);
      }
    } catch (err) {
      if (err.data && err.data.retryAfterSeconds) {
        setRetryTimer(err.data.retryAfterSeconds);
      }
      setErrorMsg(err.message || 'Thao tác không thành công');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`auth-page-container ${isDark ? 'theme-dark' : 'theme-light'}`}>
      {/* Ambient background glow */}
      <div className="ambient-blur ambient-1" />
      <div className="ambient-blur ambient-2" />

      {/* Main Dual-Panel Card */}
      <div className="auth-card">
        {/* Left Landscape Panel */}
        <MountainLandscape isDark={isDark} />

        {/* Right Form & Mascot Panel */}
        <div
          ref={formPanelRef}
          className="form-panel"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Dynamic Flashlight Beam SVG */}
          {isFlashlightOn && beamSource && beamTarget && (
            <FlashlightBeam source={beamSource} target={beamTarget} />
          )}

          {/* Theme Switcher Button */}
          <div className="panel-header-controls">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={() => setIsDark(!isDark)}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <>
                  <Sun size={15} className="theme-icon sun-icon" />
                  <span>Sáng</span>
                </>
              ) : (
                <>
                  <Moon size={15} className="theme-icon moon-icon" />
                  <span>Tối</span>
                </>
              )}
            </button>
          </div>

          {/* Mascot Section */}
          <div className="mascot-section">
            <div
              ref={owlRef}
              className={`owl-wrapper ${isOwlLit && isFlashlightOn ? 'illuminated' : ''}`}
            >
              <div className="owl-spotlight-halo" />
              <OwlMascot
                isCoveringEyes={isPasswordFocused && !showPassword}
                isLit={isOwlLit && isFlashlightOn}
                isDark={isDark}
              />
            </div>
            <h2 className="form-title">
              {mode === 'login' ? 'Đăng nhập EchoWave' : 'Tạo tài khoản mới'}
            </h2>
          </div>

          {/* Feedback Banners */}
          {successMsg && (
            <div className="alert-box success-alert">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="alert-box error-alert">
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
              {retryTimer && <span className="retry-badge">{retryTimer}s</span>}
            </div>
          )}

          {/* Main Form */}
          <form
            onSubmit={handleSubmit}
            className={`auth-form ${mode === 'register' ? 'mode-register' : ''}`}
          >
            {mode === 'login' ? (
              <>
                <div className="input-group">
                  <div className="input-field-wrapper">
                    <User size={18} className="input-icon" />
                    <input
                      type="text"
                      placeholder="Tên đăng nhập hoặc Email"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="input-group">
                  <div className="input-field-wrapper">
                    <Lock size={18} className="input-icon" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mật khẩu"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      onFocus={() => setIsPasswordFocused(true)}
                      onBlur={() => setIsPasswordFocused(false)}
                      required
                    />
                    <button
                      ref={flashlightBtnRef}
                      type="button"
                      className={`flashlight-toggle-btn ${isFlashlightOn ? 'active' : ''}`}
                      onClick={toggleFlashlight}
                      title={isFlashlightOn ? 'Tắt đèn soi' : 'Bật đèn pin soi'}
                    >
                      <Flashlight size={16} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="input-group">
                  <div className="input-field-wrapper">
                    <User size={18} className="input-icon" />
                    <input
                      type="text"
                      placeholder="Tên đăng nhập"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="input-group">
                  <div className="input-field-wrapper">
                    <Mail size={18} className="input-icon" />
                    <input
                      type="email"
                      placeholder="Email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="input-group">
                  <div className="input-field-wrapper">
                    <Lock size={18} className="input-icon" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mật khẩu (ít nhất 6 ký tự)"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      onFocus={() => setIsPasswordFocused(true)}
                      onBlur={() => setIsPasswordFocused(false)}
                      required
                    />
                    <button
                      ref={flashlightBtnRef}
                      type="button"
                      className={`flashlight-toggle-btn ${isFlashlightOn ? 'active' : ''}`}
                      onClick={toggleFlashlight}
                      title={isFlashlightOn ? 'Tắt đèn soi' : 'Bật đèn pin soi'}
                    >
                      <Flashlight size={16} />
                    </button>
                  </div>
                </div>

                <div className="input-group">
                  <div className="input-field-wrapper">
                    <Lock size={18} className="input-icon" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Xác nhận mật khẩu"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      onFocus={() => setIsPasswordFocused(true)}
                      onBlur={() => setIsPasswordFocused(false)}
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              className="submit-btn"
              disabled={loading || !!retryTimer}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="spin-icon" />
                  <span>Đang xử lý...</span>
                </>
              ) : retryTimer ? (
                <span>Vui lòng chờ ({retryTimer}s)</span>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Switch Mode Footer */}
          <div className="switch-mode-footer">
            {mode === 'login' ? (
              <p>
                Chưa có tài khoản?{' '}
                <button
                  type="button"
                  className="switch-mode-btn"
                  onClick={() => {
                    setMode('register');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                >
                  Đăng ký ngay
                </button>
              </p>
            ) : (
              <p>
                Đã có tài khoản?{' '}
                <button
                  type="button"
                  className="switch-mode-btn"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                >
                  Đăng nhập
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
