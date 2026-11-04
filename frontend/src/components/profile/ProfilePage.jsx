import React, { useState, useEffect, useRef } from 'react';
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
  Camera,
  KeyRound,
  IdCard,
  Radio,
  X,
  UploadCloud,
} from 'lucide-react';
import Avatar from '../common/Avatar';
import Modal from '../common/Modal';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../api/authApi';
import { mediaApi } from '../../api/mediaApi';

export default function ProfilePage() {
  const { currentUser, updateProfile, logout } = useAuth();

  // State thông tin cơ bản
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  // Loading & Thông báo chung
  const [globalMessage, setGlobalMessage] = useState({ type: '', text: '' });
  const fileInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Form Edit Profile State
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  // Form Change Password State
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');

  // Logout All state
  const [logoutAllLoading, setLogoutAllLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setDisplayName(currentUser.displayName || currentUser.username || '');
      setAvatarUrl(currentUser.avatarUrl || '');
      setEditDisplayName(currentUser.displayName || currentUser.username || '');
      setEditAvatarUrl(currentUser.avatarUrl || '');
    }
  }, [currentUser]);

  const showToast = (type, text) => {
    setGlobalMessage({ type, text });
    setTimeout(() => setGlobalMessage({ type: '', text: '' }), 4000);
  };

  // Xử lý upload ảnh đại diện trực tiếp từ máy tính lên Cloudinary
  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('error', 'Vui lòng chọn tệp hình ảnh (.jpg, .png, .webp...)');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('error', 'Kích thước ảnh tối đa là 5 MB');
      return;
    }

    setAvatarUploading(true);
    try {
      // 1. Lấy Cloudinary signature
      const sigData = await mediaApi.getUploadSignature(file);
      // 2. Upload file trực tiếp lên Cloudinary
      const res = await mediaApi.uploadToCloudinary(file, sigData);
      const newAvatarUrl = res.secure_url;

      // 3. Cập nhật profile
      await updateProfile(displayName || currentUser?.username, newAvatarUrl);
      setAvatarUrl(newAvatarUrl);
      setEditAvatarUrl(newAvatarUrl);
      showToast('success', 'Đã cập nhật ảnh đại diện thành công!');
    } catch (err) {
      console.error('Lỗi tải ảnh đại diện:', err);
      showToast('error', err.message || 'Tải ảnh đại diện thất bại');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  // Mở modal chỉnh sửa thông tin
  const handleOpenEditModal = () => {
    setEditDisplayName(displayName || currentUser?.username || '');
    setEditAvatarUrl(avatarUrl || '');
    setEditError('');
    setIsEditModalOpen(true);
  };

  // Lưu chỉnh sửa thông tin
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!editDisplayName.trim()) {
      setEditError('Tên hiển thị không được để trống');
      return;
    }
    setEditLoading(true);
    setEditError('');
    try {
      await updateProfile(editDisplayName.trim(), editAvatarUrl.trim() || null);
      setDisplayName(editDisplayName.trim());
      setAvatarUrl(editAvatarUrl.trim() || null);
      setIsEditModalOpen(false);
      showToast('success', 'Cập nhật thông tin thành công!');
    } catch (err) {
      setEditError(err.message || 'Cập nhật thất bại');
    } finally {
      setEditLoading(false);
    }
  };

  // Mở modal đổi mật khẩu
  const handleOpenPasswordModal = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwdError('');
    setIsPasswordModalOpen(true);
  };

  // Lưu đổi mật khẩu
  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (!oldPassword) {
      setPwdError('Vui lòng nhập mật khẩu hiện tại');
      return;
    }
    if (newPassword.length < 6) {
      setPwdError('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('Mật khẩu xác nhận không khớp');
      return;
    }

    setPwdLoading(true);
    setPwdError('');
    try {
      await authApi.changePassword(oldPassword, newPassword);
      setIsPasswordModalOpen(false);
      showToast('success', 'Đổi mật khẩu thành công!');
    } catch (err) {
      setPwdError(err.message || 'Đổi mật khẩu thất bại');
    } finally {
      setPwdLoading(false);
    }
  };

  // Đăng xuất tài khoản
  const handleLogout = () => {
    if (window.confirm('Bạn có chắc chắn muốn đăng xuất?')) {
      logout();
    }
  };

  // Đăng xuất tất cả thiết bị
  const handleLogoutAll = async () => {
    if (!window.confirm('Đăng xuất khỏi TẤT CẢ các thiết bị đang đăng nhập?')) return;
    setLogoutAllLoading(true);
    try {
      await authApi.logoutAll();
      logout();
    } catch (err) {
      showToast('error', 'Không thể thu hồi phiên: ' + err.message);
      setLogoutAllLoading(false);
    }
  };

  return (
    <div className="profile-page-container">
      {/* Toast thông báo nhanh */}
      {globalMessage.text && (
        <div className={`profile-toast-banner ${globalMessage.type === 'error' ? 'toast-error' : 'toast-success'}`}>
          {globalMessage.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{globalMessage.text}</span>
        </div>
      )}

      {/* Profile Card rút gọn, hiện đại */}
      <div className="profile-compact-wrapper">
        <div className="profile-main-card">
          {/* Header background trang trí */}
          <div className="profile-cover-strip"></div>

          {/* Avatar với nút upload ảnh */}
          <div className="profile-avatar-wrapper">
            <div className="profile-avatar-container">
              <Avatar
                name={displayName || currentUser?.username}
                src={avatarUrl}
                size="xl"
                isOnline={true}
                showStatus={false}
              />
              {/* Nút chọn ảnh từ máy */}
              <button
                type="button"
                className="btn-avatar-camera"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                title="Thay đổi ảnh đại diện"
              >
                {avatarUploading ? (
                  <Loader2 size={16} className="spin-anim" />
                ) : (
                  <Camera size={16} />
                )}
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarFileChange}
            />
          </div>

          {/* User info */}
          <div className="profile-info-center">
            <h2 className="profile-display-name">{displayName || currentUser?.username}</h2>
            <div className="profile-username-tag">@{currentUser?.username}</div>

            <div className="profile-badges-row">
              <span className={`role-pill ${currentUser?.role === 'ROLE_ADMIN' ? 'role-admin-pill' : ''}`}>
                <Shield size={12} />
                <span>{currentUser?.role === 'ROLE_ADMIN' ? 'Admin' : 'User'}</span>
              </span>
              <span className="online-status-pill">
                <span className="online-indicator-dot" /> Đang hoạt động
              </span>
            </div>
          </div>

          {/* Details list */}
          <div className="profile-meta-list">
            <div className="profile-meta-item">
              <div className="meta-icon"><Mail size={16} /></div>
              <div className="meta-content">
                <span className="meta-label">Email</span>
                <span className="meta-value">{currentUser?.email || 'Chưa cập nhật'}</span>
              </div>
            </div>

            <div className="profile-meta-item">
              <div className="meta-icon"><IdCard size={16} /></div>
              <div className="meta-content">
                <span className="meta-label">ID Người dùng</span>
                <span className="meta-value">#{currentUser?.id || '—'}</span>
              </div>
            </div>

            <div className="profile-meta-item">
              <div className="meta-icon"><Radio size={16} /></div>
              <div className="meta-content">
                <span className="meta-label">Trạng thái</span>
                <span className="meta-value" style={{ color: 'var(--online)', fontWeight: 600 }}>
                  {currentUser?.status || 'ACTIVE'}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons (Rút gọn các tính năng thành nút bấm) */}
          <div className="profile-actions-stack">
            <button
              type="button"
              className="btn-profile-action action-primary"
              onClick={handleOpenEditModal}
            >
              <User size={16} />
              <span>Chỉnh sửa thông tin</span>
            </button>

            <button
              type="button"
              className="btn-profile-action action-secondary"
              onClick={handleOpenPasswordModal}
            >
              <KeyRound size={16} />
              <span>Đổi mật khẩu</span>
            </button>

            <button
              type="button"
              className="btn-profile-action action-logout"
              onClick={handleLogout}
            >
              <LogOut size={16} />
              <span>Đăng xuất</span>
            </button>
          </div>

          {/* Nút đăng xuất tất cả thiết bị */}
          <div className="profile-danger-footer">
            <button
              type="button"
              className="btn-logout-all"
              onClick={handleLogoutAll}
              disabled={logoutAllLoading}
            >
              {logoutAllLoading ? (
                <><Loader2 size={13} className="spin-anim" /> Đang thu hồi phiên...</>
              ) : (
                'Đăng xuất khỏi tất cả thiết bị'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── MODAL CHỈNH SỬA THÔNG TIN ── */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Chỉnh sửa thông tin cá nhân"
        maxWidth="440px"
      >
        <form onSubmit={handleSaveProfile} className="profile-modal-form">
          {editError && (
            <div className="modal-error-banner">
              <AlertCircle size={15} /> <span>{editError}</span>
            </div>
          )}

          <div className="form-group-item">
            <label>Tên hiển thị</label>
            <input
              type="text"
              className="profile-modal-input"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              placeholder="Nhập tên hiển thị mới"
              maxLength={100}
              required
            />
          </div>

          <div className="form-group-item">
            <label>URL Ảnh đại diện</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="url"
                className="profile-modal-input"
                value={editAvatarUrl}
                onChange={(e) => setEditAvatarUrl(e.target.value)}
                placeholder="https://... hoặc tải ảnh từ máy"
              />
              <button
                type="button"
                className="btn-upload-file-trigger"
                onClick={() => fileInputRef.current?.click()}
                title="Tải ảnh từ máy"
              >
                <UploadCloud size={16} />
              </button>
            </div>
            <span className="field-hint">Bạn có thể chọn ảnh từ máy bằng biểu tượng camera ở ngoài.</span>
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn-profile-cancel"
              onClick={() => setIsEditModalOpen(false)}
              disabled={editLoading}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn-profile-save"
              disabled={editLoading}
            >
              {editLoading ? (
                <><Loader2 size={15} className="spin-anim" /> Đang lưu...</>
              ) : (
                <><Save size={15} /> Lưu thay đổi</>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL ĐỔI MẬT KHẨU ── */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Đổi mật khẩu tài khoản"
        maxWidth="440px"
      >
        <form onSubmit={handleSavePassword} className="profile-modal-form">
          {pwdError && (
            <div className="modal-error-banner">
              <AlertCircle size={15} /> <span>{pwdError}</span>
            </div>
          )}

          <div className="form-group-item">
            <label>Mật khẩu hiện tại</label>
            <input
              type="password"
              className="profile-modal-input"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Nhập mật khẩu hiện tại"
              required
            />
          </div>

          <div className="form-group-item">
            <label>Mật khẩu mới</label>
            <input
              type="password"
              className="profile-modal-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Ít nhất 6 ký tự"
              required
            />
          </div>

          <div className="form-group-item">
            <label>Xác nhận mật khẩu mới</label>
            <input
              type="password"
              className="profile-modal-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              required
            />
          </div>

          <div className="modal-actions-row">
            <button
              type="button"
              className="btn-profile-cancel"
              onClick={() => setIsPasswordModalOpen(false)}
              disabled={pwdLoading}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn-profile-save"
              disabled={pwdLoading || !oldPassword || !newPassword}
            >
              {pwdLoading ? (
                <><Loader2 size={15} className="spin-anim" /> Đang cập nhật...</>
              ) : (
                <><Lock size={15} /> Cập nhật</>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
