import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Users,
  MessageSquare,
  Activity,
  Search,
  RefreshCw,
  Lock,
  Unlock,
  Trash2,
  UserCheck,
  Server,
  AlertTriangle,
  Radio,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { adminApi } from '../../api/adminApi';
import Avatar from '../common/Avatar';
import '../../styles/admin.css';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'users' | 'conversations' | 'monitor'
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // 1. Stats State
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    bannedUsers: 0,
    totalConversations: 0,
    totalGroups: 0,
    totalDirect: 0,
    totalMessages: 0,
    onlineUsers: 0,
  });

  // 2. Users Management State
  const [users, setUsers] = useState([]);
  const [usersPage, setUsersPage] = useState(0);
  const [usersTotalPages, setUsersTotalPages] = useState(0);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersStatus, setUsersStatus] = useState('ALL');
  const [usersRole, setUsersRole] = useState('ALL');

  // 3. Conversations Management State
  const [conversations, setConversations] = useState([]);
  const [convsPage, setConvsPage] = useState(0);
  const [convsTotalPages, setConvsTotalPages] = useState(0);
  const [convsSearch, setConvsSearch] = useState('');
  const [convsType, setConvsType] = useState('ALL');

  // 4. Modal States
  const [banModal, setBanModal] = useState({ open: false, user: null, reason: '' });
  const [roleModal, setRoleModal] = useState({ open: false, user: null, newRole: 'USER' });
  const [deleteConvModal, setDeleteConvModal] = useState({ open: false, conv: null });

  // ────────────────────────────────────────────────────────────
  // API Fetchers
  // ────────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    try {
      const data = await adminApi.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load admin stats:', err);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await adminApi.getUsers({
        search: usersSearch,
        status: usersStatus,
        role: usersRole,
        page: usersPage,
        size: 10,
      });
      setUsers(res.content || []);
      setUsersTotalPages(res.totalPages || 0);
    } catch (err) {
      setErrorMsg(err.message || 'Lỗi tải danh sách người dùng');
    } finally {
      setLoading(false);
    }
  }, [usersSearch, usersStatus, usersRole, usersPage]);

  const loadConversations = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await adminApi.getConversations({
        search: convsSearch,
        type: convsType,
        page: convsPage,
        size: 10,
      });
      setConversations(res.content || []);
      setConvsTotalPages(res.totalPages || 0);
    } catch (err) {
      setErrorMsg(err.message || 'Lỗi tải danh sách cuộc trò chuyện');
    } finally {
      setLoading(false);
    }
  }, [convsSearch, convsType, convsPage]);

  // Load initial stats & tab data
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    if (activeTab === 'users') {
      loadUsers();
    } else if (activeTab === 'conversations') {
      loadConversations();
    } else if (activeTab === 'overview') {
      loadStats();
    }
  }, [activeTab, loadUsers, loadConversations, loadStats]);

  const handleRefreshAll = () => {
    loadStats();
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'conversations') loadConversations();
  };

  // ────────────────────────────────────────────────────────────
  // Handlers for User Actions (Ban, Unban, Role)
  // ────────────────────────────────────────────────────────────

  const handleToggleBan = async () => {
    if (!banModal.user) return;
    try {
      const isCurrentlyBanned = banModal.user.status === 'BANNED';
      const newStatus = isCurrentlyBanned ? 'ACTIVE' : 'BANNED';
      await adminApi.updateUserStatus(banModal.user.id, newStatus, banModal.reason);
      setBanModal({ open: false, user: null, reason: '' });
      loadUsers();
      loadStats();
    } catch (err) {
      alert(err.message || 'Không thể cập nhật trạng thái');
    }
  };

  const handleRoleChange = async () => {
    if (!roleModal.user) return;
    try {
      await adminApi.updateUserRole(roleModal.user.id, roleModal.newRole);
      setRoleModal({ open: false, user: null, newRole: 'USER' });
      loadUsers();
      loadStats();
    } catch (err) {
      alert(err.message || 'Không thể cập nhật quyền');
    }
  };

  const handleDeleteConversation = async () => {
    if (!deleteConvModal.conv) return;
    try {
      await adminApi.deleteConversation(deleteConvModal.conv.id);
      setDeleteConvModal({ open: false, conv: null });
      loadConversations();
      loadStats();
    } catch (err) {
      alert(err.message || 'Không thể xóa cuộc trò chuyện');
    }
  };

  // ────────────────────────────────────────────────────────────
  // RENDER TABS
  // ────────────────────────────────────────────────────────────

  return (
    <div className="admin-portal">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-title-group">
          <h1>
            <ShieldCheck size={26} color="#f59e0b" />
            Bảng Quản Trị Hệ Thống (Admin Portal)
          </h1>
          <p>Quản lý người dùng, phòng chat và theo dõi vận hành hệ thống</p>
        </div>

        <div className="admin-header-actions">
          <button type="button" className="btn-refresh" onClick={handleRefreshAll} title="Làm mới dữ liệu">
            <RefreshCw size={15} />
            <span>Làm mới</span>
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="admin-nav-tabs">
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Activity size={17} />
          <span>Thống kê tổng quan</span>
        </button>

        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <Users size={17} />
          <span>Quản lý Người dùng</span>
        </button>

        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'conversations' ? 'active' : ''}`}
          onClick={() => setActiveTab('conversations')}
        >
          <MessageSquare size={17} />
          <span>Quản lý Phòng chat & Nhóm</span>
        </button>

        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'monitor' ? 'active' : ''}`}
          onClick={() => setActiveTab('monitor')}
        >
          <Server size={17} />
          <span>Giám sát Kỹ thuật (Live Monitor)</span>
        </button>
      </div>

      {/* Content */}
      <main className="admin-content">
        {errorMsg && (
          <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 8, marginBottom: 16 }}>
            {errorMsg}
          </div>
        )}

        {/* ── TAB 1: OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div>
            <div className="admin-stats-grid">
              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-card-title">Tổng người dùng</span>
                  <div className="stat-icon-wrapper" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                    <Users size={20} />
                  </div>
                </div>
                <div className="stat-value">{stats.totalUsers.toLocaleString()}</div>
                <div className="stat-subtext">
                  <span>{stats.activeUsers} hoạt động</span> • <span style={{ color: '#ef4444' }}>{stats.bannedUsers} bị khóa</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-card-title">Đang trực tuyến</span>
                  <div className="stat-icon-wrapper" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' }}>
                    <Radio size={20} />
                  </div>
                </div>
                <div className="stat-value" style={{ color: '#22c55e' }}>
                  {stats.onlineUsers.toLocaleString()}
                </div>
                <div className="stat-subtext">Kết nối WebSocket / Redis Heartbeat</div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-card-title">Cuộc trò chuyện</span>
                  <div className="stat-icon-wrapper" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc' }}>
                    <MessageSquare size={20} />
                  </div>
                </div>
                <div className="stat-value">{stats.totalConversations.toLocaleString()}</div>
                <div className="stat-subtext">
                  <span>{stats.totalGroups} Nhóm</span> • <span>{stats.totalDirect} Chat 1-1</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-card-title">Tổng tin nhắn</span>
                  <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                    <Activity size={20} />
                  </div>
                </div>
                <div className="stat-value">{stats.totalMessages.toLocaleString()}</div>
                <div className="stat-subtext">Đã ghi nhận trong cơ sở dữ liệu</div>
              </div>
            </div>

            {/* Quick Infrastructure Status */}
            <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: 22 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: 'var(--text-primary)' }}>
                Trạng thái hạ tầng cốt lõi
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'var(--bg-surface)', borderRadius: 8 }}>
                  <CheckCircle2 size={18} color="#22c55e" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>PostgreSQL Database</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Transaction Outbox: ACTIVE</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'var(--bg-surface)', borderRadius: 8 }}>
                  <CheckCircle2 size={18} color="#22c55e" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Redis 7.4 Pub/Sub</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Multi-Instance Broker: OK</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'var(--bg-surface)', borderRadius: 8 }}>
                  <CheckCircle2 size={18} color="#22c55e" />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>STOMP WebSocket</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Endpoint: /ws (Active)</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: USERS MANAGEMENT ── */}
        {activeTab === 'users' && (
          <div>
            <div className="admin-filter-bar">
              <div className="admin-search-box">
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  className="admin-search-input"
                  placeholder="Tìm theo username, tên hiển thị, email..."
                  value={usersSearch}
                  onChange={(e) => {
                    setUsersSearch(e.target.value);
                    setUsersPage(0);
                  }}
                />
              </div>

              <div className="admin-filter-group">
                <select
                  className="admin-select"
                  value={usersStatus}
                  onChange={(e) => {
                    setUsersStatus(e.target.value);
                    setUsersPage(0);
                  }}
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ACTIVE">Hoạt động (ACTIVE)</option>
                  <option value="BANNED">Bị khóa (BANNED)</option>
                </select>

                <select
                  className="admin-select"
                  value={usersRole}
                  onChange={(e) => {
                    setUsersRole(e.target.value);
                    setUsersPage(0);
                  }}
                >
                  <option value="ALL">Tất cả vai trò</option>
                  <option value="USER">User thường</option>
                  <option value="ADMIN">Quản trị viên (ADMIN)</option>
                </select>
              </div>
            </div>

            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Email</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Ngày tạo</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        {loading ? 'Đang tải dữ liệu...' : 'Không tìm thấy người dùng nào phù hợp.'}
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="user-cell">
                            <Avatar name={u.displayName || u.username} src={u.avatarUrl} size="sm" />
                            <div className="user-info-text">
                              <span className="user-display-name">{u.displayName || u.username}</span>
                              <span className="user-username">@{u.username} • ID: {u.id}</span>
                            </div>
                          </div>
                        </td>
                        <td>{u.email || '--'}</td>
                        <td>
                          <span className={`badge ${u.role === 'ADMIN' ? 'badge-admin' : 'badge-user'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${u.status === 'ACTIVE' ? 'badge-active' : 'badge-banned'}`}>
                            {u.status}
                          </span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {u.createdAt ? new Date(u.createdAt).toLocaleDateString('vi-VN') : '--'}
                        </td>
                        <td>
                          <div className="action-btn-group">
                            {/* Ban / Unban Button */}
                            {u.status === 'ACTIVE' ? (
                              <button
                                type="button"
                                className="btn-action btn-ban"
                                onClick={() => setBanModal({ open: true, user: u, reason: '' })}
                                title="Khóa tài khoản"
                              >
                                <Lock size={12} />
                                <span>Khóa</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-action btn-unban"
                                onClick={() => setBanModal({ open: true, user: u, reason: '' })}
                                title="Mở khóa tài khoản"
                              >
                                <Unlock size={12} />
                                <span>Mở</span>
                              </button>
                            )}

                            {/* Promote / Demote Role Button */}
                            <button
                              type="button"
                              className="btn-action btn-role"
                              onClick={() =>
                                setRoleModal({
                                  open: true,
                                  user: u,
                                  newRole: u.role === 'ADMIN' ? 'USER' : 'ADMIN',
                                })
                              }
                              title="Thay đổi quyền"
                            >
                              <UserCheck size={12} />
                              <span>{u.role === 'ADMIN' ? 'Hạ quyền' : 'Lên Admin'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="admin-pagination">
                <span>
                  Trang {usersPage + 1} / {Math.max(1, usersTotalPages)}
                </span>
                <div className="pagination-btn-group">
                  <button
                    type="button"
                    className="btn-page"
                    disabled={usersPage <= 0}
                    onClick={() => setUsersPage((p) => Math.max(0, p - 1))}
                  >
                    Trang trước
                  </button>
                  <button
                    type="button"
                    className="btn-page"
                    disabled={usersPage >= usersTotalPages - 1}
                    onClick={() => setUsersPage((p) => p + 1)}
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 3: CONVERSATIONS MANAGEMENT ── */}
        {activeTab === 'conversations' && (
          <div>
            <div className="admin-filter-bar">
              <div className="admin-search-box">
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  className="admin-search-input"
                  placeholder="Tìm theo tên cuộc trò chuyện..."
                  value={convsSearch}
                  onChange={(e) => {
                    setConvsSearch(e.target.value);
                    setConvsPage(0);
                  }}
                />
              </div>

              <div className="admin-filter-group">
                <select
                  className="admin-select"
                  value={convsType}
                  onChange={(e) => {
                    setConvsType(e.target.value);
                    setConvsPage(0);
                  }}
                >
                  <option value="ALL">Tất cả loại phòng</option>
                  <option value="GROUP">Nhóm chat (GROUP)</option>
                  <option value="DIRECT">Chat 1-1 (DIRECT)</option>
                </select>
              </div>
            </div>

            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Tên cuộc trò chuyện</th>
                    <th>Loại</th>
                    <th>Người tạo</th>
                    <th>Thành viên</th>
                    <th>Ngày tạo</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {conversations.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                        {loading ? 'Đang tải dữ liệu...' : 'Không tìm thấy cuộc trò chuyện nào.'}
                      </td>
                    </tr>
                  ) : (
                    conversations.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>#{c.id}</td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</td>
                        <td>
                          <span className={`badge ${c.type === 'GROUP' ? 'badge-group' : 'badge-direct'}`}>
                            {c.type}
                          </span>
                        </td>
                        <td>{c.createdByName || 'System'}</td>
                        <td>{c.memberCount} thành viên</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {c.createdAt ? new Date(c.createdAt).toLocaleDateString('vi-VN') : '--'}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-action btn-delete"
                            onClick={() => setDeleteConvModal({ open: true, conv: c })}
                            title="Xóa cuộc trò chuyện này"
                          >
                            <Trash2 size={12} />
                            <span>Xóa</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="admin-pagination">
                <span>
                  Trang {convsPage + 1} / {Math.max(1, convsTotalPages)}
                </span>
                <div className="pagination-btn-group">
                  <button
                    type="button"
                    className="btn-page"
                    disabled={convsPage <= 0}
                    onClick={() => setConvsPage((p) => Math.max(0, p - 1))}
                  >
                    Trang trước
                  </button>
                  <button
                    type="button"
                    className="btn-page"
                    disabled={convsPage >= convsTotalPages - 1}
                    onClick={() => setConvsPage((p) => p + 1)}
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: SYSTEM MONITOR ── */}
        {activeTab === 'monitor' && (
          <div className="monitor-container">
            <iframe
              src="/dashboard.html"
              title="Realtime System Monitor"
              className="monitor-iframe"
            />
          </div>
        )}
      </main>

      {/* ── MODALS ── */}

      {/* 1. Ban/Unban Modal */}
      {banModal.open && banModal.user && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-title">
              {banModal.user.status === 'ACTIVE' ? 'Xác nhận khóa tài khoản' : 'Xác nhận mở khóa tài khoản'}
            </div>
            <p className="admin-modal-desc">
              Bạn có chắc chắn muốn {banModal.user.status === 'ACTIVE' ? 'KHÓA' : 'MỞ KHÓA'} tài khoản{' '}
              <strong>@{banModal.user.username}</strong> ({banModal.user.displayName})?
            </p>

            {banModal.user.status === 'ACTIVE' && (
              <input
                type="text"
                className="admin-modal-input"
                placeholder="Nhập lý do khóa (ví dụ: Vi phạm quy tắc, spam...)"
                value={banModal.reason}
                onChange={(e) => setBanModal((prev) => ({ ...prev, reason: e.target.value }))}
              />
            )}

            <div className="admin-modal-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setBanModal({ open: false, user: null, reason: '' })}
              >
                Hủy
              </button>
              <button
                type="button"
                className={`btn-modal-confirm ${banModal.user.status === 'BANNED' ? 'primary' : ''}`}
                onClick={handleToggleBan}
              >
                {banModal.user.status === 'ACTIVE' ? 'Khóa ngay' : 'Mở khóa ngay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Change Role Modal */}
      {roleModal.open && roleModal.user && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-title">Thay đổi quyền tài khoản</div>
            <p className="admin-modal-desc">
              Chuyển vai trò của <strong>@{roleModal.user.username}</strong> thành{' '}
              <strong style={{ color: roleModal.newRole === 'ADMIN' ? '#c084fc' : '#38bdf8' }}>
                {roleModal.newRole}
              </strong>
              ?
            </p>

            <div className="admin-modal-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setRoleModal({ open: false, user: null, newRole: 'USER' })}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn-modal-confirm primary"
                onClick={handleRoleChange}
              >
                Xác nhận đổi quyền
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Delete Conversation Modal */}
      {deleteConvModal.open && deleteConvModal.conv && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <div className="admin-modal-title" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={20} />
              Xóa vĩnh viễn cuộc trò chuyện
            </div>
            <p className="admin-modal-desc">
              Hành động này sẽ xóa vĩnh viễn cuộc trò chuyện <strong>"{deleteConvModal.conv.name}"</strong> (ID: #{deleteConvModal.conv.id}) cùng toàn bộ tin nhắn và lịch sử trò chuyện.
            </p>

            <div className="admin-modal-actions">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setDeleteConvModal({ open: false, conv: null })}
              >
                Hủy
              </button>
              <button
                type="button"
                className="btn-modal-confirm"
                onClick={handleDeleteConversation}
              >
                Xác nhận xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
