import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Lock,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  Save,
  Image as ImageIcon,
} from 'lucide-react';
import Avatar from '../common/Avatar';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/authApi';

export default function ProfilePage() {
  const { currentUser, updateProfile, logout } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdError, setPwdError] = useState('');

  const [logoutAllLoading, setLogoutAllLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.displayName || currentUser.username || '');
      setAvatarUrl(currentUser.avatarUrl || '');
    }
  }, [currentUser]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setProfileError('Tên hiển thị không được để trống');
      return;
    }
    setProfileLoading(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      await updateProfile(displayName.trim(), avatarUrl.trim() || null);
      setProfileSuccess('Cập nhật hồ sơ thành công!');
      setTimeout(() => setProfileSuccess(''), 4000);
    } catch (err) {
      setProfileError(err.message || 'Cập nhật thất bại');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwdError('Mật khẩu xác nhận không khớp');
      return;
    }
    if (newPassword.length < 6) {
      setPwdError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    setPwdLoading(true);
    setPwdError('');
    setPwdSuccess('');
    try {
      await authApi.changePassword(oldPassword, newPassword);
      setPwdSuccess('Đổi mật khẩu thành công!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwdSuccess(''), 4000);
    } catch (err) {
      setPwdError(err.message || 'Đổi mật khẩu thất bại');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm('Đăng xuất khỏi TẤT CẢ thiết bị?')) return;
    setLogoutAllLoading(true);
    try {
      await authApi.logoutAll();
      logout();
    } catch (err) {
      alert('Không thể thu hồi phiên: ' + err.message);
      setLogoutAllLoading(false);
    }
  };

  const inputStyle = {
    background: 'var(--bg-input)',
    border: '1.5px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    padding: '10px 12px',
    fontSize: '0.9rem',
    color: 'var(--text-primary)',
    width: '100%',
    outline: 'none',
    transition: 'border-color 0.15s ease',
  };

  const labelStyle = {
    fontSize: '0.78rem',
    fontWeight: '600',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '6px',
    display: 'block',
  };

  const formGroupStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    marginBottom: '14px',
  };

  return (
    <div className="profile-page-container">
      <div className="profile-page-header">
        <h2>Hồ sơ cá nhân</h2>
        <p>Quản lý thông tin tài khoản và bảo mật</p>
      </div>

      <div className="profile-layout-grid">
        {/* Left: Profile Card */}
        <div className="profile-card">
          <div className="profile-avatar-block">
            <Avatar
              name={displayName || currentUser?.username}
              src={avatarUrl}
              size="xl"
              isOnline={true}
              showStatus={true}
            />
            <div className="profile-name-text">{displayName || currentUser?.username}</div>
            <div className="profile-handle-text">@{currentUser?.username}</div>
            <div className={`role-pill ${currentUser?.role === 'ROLE_ADMIN' ? 'role-admin-pill' : ''}`}>
              <Shield size={12} />
              <span>{currentUser?.role === 'ROLE_ADMIN' ? 'Admin' : 'User'}</span>
            </div>
          </div>

          <div className="profile-stats-row">
            <div className="stat-block">
              <div className="stat-value">{currentUser?.id || '—'}</div>
              <div className="stat-label">User ID</div>
            </div>
            <div className="stat-block">
              <div className="stat-value" style={{ color: 'var(--online)' }}>●</div>
              <div className="stat-label">Online</div>
            </div>
          </div>

          {/* Quick Info */}
          <div style={{ width: '100%', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
            {currentUser?.email && (
              <div className="info-row">
                <div className="info-label"><Mail size={12} style={{ display: 'inline', marginRight: '4px' }} />Email</div>
                <div className="info-value">{currentUser.email}</div>
              </div>
            )}
            <div className="info-row">
              <div className="info-label"><User size={12} style={{ display: 'inline', marginRight: '4px' }} />Trạng thái</div>
              <div className="info-value" style={{ color: 'var(--online)', fontWeight: '600' }}>
                {currentUser?.status || 'ACTIVE'}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Forms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Edit Profile */}
          <div className="profile-info-section">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} /> Chỉnh sửa thông tin
            </div>

            {profileSuccess && (
              <div className="profile-success-banner" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={15} /> {profileSuccess}
              </div>
            )}
            {profileError && (
              <div className="profile-error-banner" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={15} /> {profileError}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Tên hiển thị</label>
                <input
                  type="text"
                  style={inputStyle}
                  placeholder="Nhập tên hiển thị"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>
                  <ImageIcon size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  URL ảnh đại diện
                </label>
                <input
                  type="url"
                  style={inputStyle}
                  placeholder="https://... (để trống để dùng avatar mặc định)"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                />
              </div>

              <div className="profile-form-actions">
                <button type="submit" className="btn-profile-save" disabled={profileLoading}>
                  {profileLoading ? (
                    <><Loader2 size={15} className="spin-anim" /> Đang lưu...</>
                  ) : (
                    <><Save size={15} /> Lưu thay đổi</>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password */}
          <div className="profile-info-section">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={16} /> Đổi mật khẩu
            </div>

            {pwdSuccess && (
              <div className="profile-success-banner" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={15} /> {pwdSuccess}
              </div>
            )}
            {pwdError && (
              <div className="profile-error-banner" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertCircle size={15} /> {pwdError}
              </div>
            )}

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Mật khẩu hiện tại</label>
                <input
                  type="password"
                  style={inputStyle}
                  placeholder="••••••••"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Mật khẩu mới</label>
                  <input
                    type="password"
                    style={inputStyle}
                    placeholder="Ít nhất 6 ký tự"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Xác nhận</label>
                  <input
                    type="password"
                    style={inputStyle}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
              <div className="profile-form-actions">
                <button
                  type="submit"
                  className="btn-profile-save"
                  disabled={pwdLoading || !oldPassword || !newPassword}
                >
                  {pwdLoading ? (
                    <><Loader2 size={15} className="spin-anim" /> Đang cập nhật...</>
                  ) : 'Cập nhật mật khẩu'}
                </button>
              </div>
            </form>
          </div>

          {/* Danger Zone */}
          <div className="danger-zone">
            <div className="danger-zone-title">
              <LogOut size={15} style={{ display: 'inline', marginRight: '6px' }} />
              Quản lý phiên đăng nhập
            </div>
            <p>Đăng xuất khỏi tất cả thiết bị nếu bạn nghi ngờ tài khoản bị xâm phạm.</p>
            <button
              type="button"
              className="btn-danger"
              onClick={handleLogoutAll}
              disabled={logoutAllLoading}
            >
              {logoutAllLoading ? (
                <><Loader2 size={14} className="spin-anim" /> Đang thu hồi...</>
              ) : (
                <><LogOut size={14} /> Đăng xuất tất cả thiết bị</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
