import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserPlus, Shield, Crown, UserX, Loader2,
  LogOut, RefreshCw, ChevronDown, ChevronUp, X, Search,
  Link as LinkIcon, Check, MessageSquare,
} from 'lucide-react';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import { conversationApi } from '../../api/conversationApi';
import { friendApi } from '../../api/friendApi';
import { useAuth } from '../../context/AuthContext';

/**
 * API shape của một member:
 * {
 *   memberId: number,
 *   user: { id, username, displayName, avatarUrl, isOnline, ... },
 *   role: 'OWNER' | 'ADMIN' | 'MEMBER',
 *   joinedAt: string,
 * }
 *
 * Helpers để đọc field nhất quán:
 */
const mId          = (m) => m?.user?.id;
const mName        = (m) => m?.user?.displayName || m?.user?.username || '?';
const mUsername    = (m) => m?.user?.username || '';
const mAvatarUrl   = (m) => m?.user?.avatarUrl;
const mIsOnline    = (m) => !!m?.user?.isOnline;

export default function GroupMembersModal({
  isOpen,
  onClose,
  conversationId,
  conversationTitle,
  onLeaveGroup,
  onOpenDirectChat,
}) {
  const { currentUser } = useAuth();

  const handleStartDirectChat = (targetUserId) => {
    if (!targetUserId || targetUserId === currentUser?.id) return;
    if (onOpenDirectChat) {
      onOpenDirectChat(targetUserId);
      onClose();
    }
  };

  const [members, setMembers]             = useState([]);
  const [friends, setFriends]             = useState([]);
  const [loading, setLoading]             = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]                 = useState('');
  const [searchQuery, setSearchQuery]     = useState('');
  const [inviteCopied, setInviteCopied]   = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  const [addingMember, setAddingMember]         = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState('');

  // Profile panel – section inline bên dưới list
  const [profileMember, setProfileMember]       = useState(null);

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveNewOwner, setLeaveNewOwner]       = useState('');

  const [showTransferPanel, setShowTransferPanel] = useState(false);
  const [transferTarget, setTransferTarget]       = useState('');

  // ── Load ────────────────────────────────────────────────────────────────

  const loadMembers = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const data = await conversationApi.getMembers(conversationId);
      console.log('[GroupMembers] raw API data:', JSON.stringify(data));
      // Normalize: backend có thể trả về flat (userId, username) hoặc nested (user: {...})
      const normalized = (Array.isArray(data) ? data : []).map((m) => {
        // Nếu đã có dạng { memberId, user: {...}, role, ... } → giữ nguyên
        if (m.user && m.user.id) return m;
        // Nếu backend cũ trả về flat { userId, username, displayName, ... } → wrap lại
        return {
          memberId: m.memberId ?? m.id,
          user: {
            id: m.userId ?? m.id,
            username: m.username ?? '',
            displayName: m.displayName ?? m.username ?? '',
            avatarUrl: m.avatarUrl ?? null,
            isOnline: m.isOnline ?? false,
          },
          role: m.role ?? 'MEMBER',
          joinedAt: m.joinedAt,
          lastReadMessageId: m.lastReadMessageId,
        };
      });
      setMembers(normalized);
    } catch {
      setError('Không thể tải thành viên nhóm');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const loadFriends = useCallback(async () => {
    try {
      const data = await friendApi.getFriends();
      setFriends(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (isOpen && conversationId) {
      loadMembers();
      loadFriends();
      setAddingMember(false);
      setSelectedFriendId('');
      setError('');
      setSearchQuery('');
      setProfileMember(null);
      setShowLeaveConfirm(false);
      setLeaveNewOwner('');
      setShowTransferPanel(false);
      setTransferTarget('');
    }
  }, [isOpen, conversationId, loadMembers, loadFriends]);

  // ── Derived ─────────────────────────────────────────────────────────────

  const myMember = members.find((m) => mId(m) === currentUser?.id);
  const isOwner  = myMember?.role === 'OWNER';
  const isManager = isOwner || myMember?.role === 'ADMIN';

  const existingUserIds  = new Set(members.map((m) => mId(m)));
  const availableFriends = friends.filter((f) => !existingUserIds.has(f.friendId));
  const otherMembers     = members.filter((m) => mId(m) !== currentUser?.id);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase().trim();
    return members.filter((m) => {
      const name = mName(m).toLowerCase();
      const username = mUsername(m).toLowerCase();
      return name.includes(q) || username.includes(q);
    });
  }, [members, searchQuery]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleCopyInviteLink = async () => {
    if (!conversationId) return;
    setInviteLoading(true);
    setError('');
    try {
      const data = await conversationApi.generateInviteLink(conversationId);
      if (data?.inviteUrl) {
        await navigator.clipboard.writeText(data.inviteUrl);
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2500);
      }
    } catch (err) {
      setError(err?.message || 'Không thể tạo link mời nhóm');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedFriendId) return;
    setActionLoading(true);
    setError('');
    try {
      await conversationApi.addMember(conversationId, Number(selectedFriendId));
      setSelectedFriendId('');
      setAddingMember(false);
      await loadMembers();
    } catch (err) {
      setError(err.message || 'Thêm thành viên thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const handleKickMember = async (member) => {
    const name = mName(member);
    if (!window.confirm(`Mời ${name} ra khỏi nhóm?`)) return;
    setActionLoading(true);
    setError('');
    try {
      await conversationApi.removeMember(conversationId, mId(member));
      if (profileMember && mId(profileMember) === mId(member)) setProfileMember(null);
      await loadMembers();
    } catch (err) {
      setError(err.message || 'Không thể xóa thành viên');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (isOwner && otherMembers.length > 0 && !leaveNewOwner) {
      setError('Bạn là Owner – hãy chỉ định thành viên kế tiếp.');
      return;
    }
    setActionLoading(true);
    setError('');
    try {
      await conversationApi.leaveGroup(
        conversationId,
        leaveNewOwner ? Number(leaveNewOwner) : null,
      );
      onClose();
      if (onLeaveGroup) onLeaveGroup(conversationId);
    } catch (err) {
      setError(err.message || 'Không thể rời nhóm');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!transferTarget) return;
    setActionLoading(true);
    setError('');
    try {
      await conversationApi.transferOwnership(conversationId, Number(transferTarget));
      setShowTransferPanel(false);
      setTransferTarget('');
      await loadMembers();
    } catch (err) {
      setError(err.message || 'Không thể chuyển quyền Owner');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleProfile = (member) => {
    setProfileMember((prev) => (prev && mId(prev) === mId(member) ? null : member));
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Thành viên nhóm" maxWidth="500px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Error banner */}
        {error && (
          <div className="modal-error-banner"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', lineHeight: 1 }}>
              <X size={13} />
            </button>
          </div>
        )}

        {/* Sub-header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {conversationTitle} · {members.length} thành viên
          </span>
          <button type="button" className="input-action-btn"
            onClick={() => { setProfileMember(null); loadMembers(); }}
            disabled={loading} title="Tải lại"
            style={{ width: '28px', height: '28px' }}>
            <RefreshCw size={13} className={loading ? 'spin-anim' : ''} />
          </button>
        </div>

        {/* ── ADD MEMBER & INVITE LINK ── */}
        {isManager && (
          <div>
            {!addingMember ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="modal-submit-btn"
                  style={{ flex: 1, background: 'var(--bg-surface)', color: 'var(--text-secondary)', boxShadow: 'none', height: '36px', fontSize: '0.85rem' }}
                  onClick={() => setAddingMember(true)}>
                  <UserPlus size={15} /> Thêm bạn bè
                </button>
                <button type="button" className="modal-submit-btn"
                  style={{ flex: 1, background: inviteCopied ? 'rgba(34,197,94,0.1)' : 'var(--bg-surface)', color: inviteCopied ? '#22c55e' : 'var(--text-primary)', border: '1px solid var(--border)', boxShadow: 'none', height: '36px', fontSize: '0.85rem' }}
                  onClick={handleCopyInviteLink} disabled={inviteLoading}>
                  {inviteLoading ? (
                    <Loader2 size={14} className="spin-anim" />
                  ) : inviteCopied ? (
                    <Check size={14} />
                  ) : (
                    <LinkIcon size={14} />
                  )}
                  {inviteCopied ? 'Đã sao chép link!' : 'Copy link mời'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select style={SELECT_STYLE} value={selectedFriendId}
                  onChange={(e) => setSelectedFriendId(e.target.value)}>
                  <option value="">-- Chọn bạn bè --</option>
                  {availableFriends.map((f) => (
                    <option key={f.friendId} value={f.friendId}>
                      {f.friendDisplayName || f.friendUsername} (@{f.friendUsername})
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-req-accept"
                  onClick={handleAddMember} disabled={!selectedFriendId || actionLoading}>
                  {actionLoading ? <Loader2 size={13} className="spin-anim" /> : 'Thêm'}
                </button>
                <button type="button" className="btn-req-cancel"
                  onClick={() => { setAddingMember(false); setSelectedFriendId(''); }}>
                  Hủy
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── SEARCH MEMBER ── */}
        {members.length > 2 && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Tìm kiếm thành viên..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 28px 7px 32px',
                fontSize: '0.84rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 0,
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* ── MEMBER LIST ── */}
        <div className="group-members-list">
          {loading ? (
            <div className="modal-center-loading">
              <Loader2 size={22} className="spin-anim" />
              <span>Đang tải...</span>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.84rem' }}>
              Không tìm thấy thành viên nào phù hợp
            </div>
          ) : (
            filteredMembers.map((member) => {
              const isMe    = mId(member) === currentUser?.id;
              // Admin/Owner kick được MEMBER; Owner kick được cả ADMIN
              const canKick = isManager && !isMe && member.role !== 'OWNER';
              const isSelected = profileMember && mId(profileMember) === mId(member);

              return (
                <div key={member.memberId ?? mId(member)}
                  className="member-row"
                  style={{
                    background: isSelected ? 'var(--bg-hover)' : undefined,
                    borderRadius: isSelected ? 'var(--r-sm)' : undefined,
                  }}>

                  {/* Click để mở profile panel */}
                  <button type="button" onClick={() => toggleProfile(member)}
                    title="Xem thông tin thành viên"
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', padding: 0, minWidth: 0 }}>
                    <Avatar
                      name={mName(member)}
                      src={mAvatarUrl(member)}
                      size="sm"
                      isOnline={mIsOnline(member)}
                      showStatus
                    />
                    <div className="member-info" style={{ minWidth: 0 }}>
                      <div className="member-name"
                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {mName(member)}
                        {isMe && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.73rem', marginLeft: '4px' }}>
                            (Bạn)
                          </span>
                        )}
                      </div>
                      <div className="member-handle">@{mUsername(member)}</div>
                    </div>
                  </button>

                  {/* Role badge + actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {member.role === 'OWNER' && (
                      <span className="member-role-badge badge-owner"
                        style={{ background: 'rgba(234, 179, 8, 0.12)', color: 'var(--text-primary)', border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                        <Crown size={11} color="#eab308" style={{ display: 'inline', marginRight: '3px' }} /> Owner
                      </span>
                    )}
                    {member.role === 'ADMIN' && (
                      <span className="member-role-badge">
                        <Shield size={10} style={{ display: 'inline' }} /> Admin
                      </span>
                    )}
                    {!isMe && onOpenDirectChat && (
                      <button
                        type="button"
                        className="member-message-icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartDirectChat(mId(member));
                        }}
                        title={`Nhắn tin với ${mName(member)}`}
                      >
                        <MessageSquare size={13} />
                      </button>
                    )}
                    {canKick && (
                      <button type="button" className="btn-card-danger"
                        style={{ width: '30px', height: '30px' }}
                        onClick={(e) => { e.stopPropagation(); handleKickMember(member); }}
                        title={`Kick ${mName(member)}`} disabled={actionLoading}>
                        <UserX size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── PROFILE PANEL (inline, hiện khi click member) ── */}
        {profileMember && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <Avatar
                name={mName(profileMember)}
                src={mAvatarUrl(profileMember)}
                size="lg"
                isOnline={mIsOnline(profileMember)}
                showStatus
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.97rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
                  {mName(profileMember)}
                </div>
                <div style={{ fontSize: '0.80rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  @{mUsername(profileMember)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', fontSize: '0.78rem' }}>
                  <span style={{ color: mIsOnline(profileMember) ? '#22c55e' : 'var(--text-muted)' }}>
                    {mIsOnline(profileMember) ? '🟢 Đang hoạt động' : '⚫ Ngoại tuyến'}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {profileMember.role === 'OWNER' ? '👑 Owner'
                      : profileMember.role === 'ADMIN' ? '🛡 Admin'
                      : '👤 Thành viên'}
                  </span>
                </div>
                {mId(profileMember) !== currentUser?.id && onOpenDirectChat && (
                  <button
                    type="button"
                    className="detail-add-member-trigger"
                    style={{
                      marginTop: '10px',
                      height: '30px',
                      display: 'inline-flex',
                      width: 'auto',
                      padding: '0 12px',
                    }}
                    onClick={() => handleStartDirectChat(mId(profileMember))}
                  >
                    <MessageSquare size={13} /> Nhắn tin trực tiếp
                  </button>
                )}
              </div>
              <button type="button" onClick={() => setProfileMember(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0, padding: '2px' }}
                title="Đóng">
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── OWNER: CHUYỂN QUYỀN ── */}
        {isOwner && otherMembers.length > 0 && (
          <div>
            {!showTransferPanel ? (
              <button type="button" className="modal-submit-btn"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', boxShadow: 'none', height: '36px', fontSize: '0.85rem' }}
                onClick={() => setShowTransferPanel(true)}>
                <Crown size={14} color="#eab308" /> Chuyển quyền Owner
                <ChevronDown size={13} style={{ marginLeft: 'auto' }} />
              </button>
            ) : (
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><Crown size={13} color="#eab308" style={{ display: 'inline', marginRight: '4px' }} />Chuyển quyền Owner</span>
                  <button type="button"
                    onClick={() => { setShowTransferPanel(false); setTransferTarget(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <ChevronUp size={13} />
                  </button>
                </div>
                <select style={SELECT_STYLE} value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}>
                  <option value="">-- Chọn thành viên --</option>
                  {otherMembers.map((m) => (
                    <option key={mId(m)} value={mId(m)}>
                      {mName(m)} (@{mUsername(m)}){m.role === 'ADMIN' ? ' [Admin]' : ''}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" className="btn-req-accept"
                    onClick={handleTransferOwnership} disabled={!transferTarget || actionLoading}>
                    {actionLoading ? <Loader2 size={13} className="spin-anim" /> : 'Xác nhận'}
                  </button>
                  <button type="button" className="btn-req-cancel"
                    onClick={() => { setShowTransferPanel(false); setTransferTarget(''); }}>
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LEAVE GROUP ── */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
          {!showLeaveConfirm ? (
            <button type="button" className="btn-card-danger"
              style={{ width: '100%', height: '38px', fontSize: '0.88rem', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              onClick={() => setShowLeaveConfirm(true)} disabled={actionLoading}>
              <LogOut size={16} /> Rời nhóm
            </button>
          ) : (
            <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 'var(--r-sm)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ef4444' }}>
                ⚠️ Xác nhận rời nhóm
              </div>

              {isOwner && otherMembers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    Bạn là Owner – chỉ định thành viên kế tiếp làm Owner:
                  </label>
                  <select style={SELECT_STYLE} value={leaveNewOwner}
                    onChange={(e) => setLeaveNewOwner(e.target.value)}>
                    <option value="">-- Chọn thành viên --</option>
                    {otherMembers.map((m) => (
                      <option key={mId(m)} value={mId(m)}>
                        {mName(m)} (@{mUsername(m)}){m.role === 'ADMIN' ? ' [Admin]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {otherMembers.length === 0 && (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Bạn là thành viên cuối cùng. Nhóm sẽ bị xoá sau khi rời.
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn-card-danger"
                  style={{ flex: 1, height: '34px', fontSize: '0.85rem' }}
                  onClick={handleLeaveGroup}
                  disabled={actionLoading || (isOwner && otherMembers.length > 0 && !leaveNewOwner)}>
                  {actionLoading ? <Loader2 size={13} className="spin-anim" /> : 'Rời nhóm'}
                </button>
                <button type="button" className="btn-req-cancel"
                  style={{ flex: 1, height: '34px' }}
                  onClick={() => { setShowLeaveConfirm(false); setLeaveNewOwner(''); setError(''); }}>
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────
const SELECT_STYLE = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1.5px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  padding: '7px 10px',
  fontSize: '0.85rem',
  color: 'var(--text-primary)',
  outline: 'none',
};
