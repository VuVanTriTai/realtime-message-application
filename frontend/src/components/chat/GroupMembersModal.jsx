import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, Crown, UserX, Loader2 } from 'lucide-react';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import { conversationApi } from '../../api/conversationApi';
import { friendApi } from '../../api/friendApi';
import { useAuth } from '../../context/AuthContext';

export default function GroupMembersModal({ isOpen, onClose, conversationId, conversationTitle }) {
  const { currentUser } = useAuth();
  const [members, setMembers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && conversationId) {
      loadMembers();
      loadFriends();
      setAddingMember(false);
      setSelectedFriendId('');
      setError('');
    }
  }, [isOpen, conversationId]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const data = await conversationApi.getMembers(conversationId);
      setMembers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError('Không thể tải thành viên nhóm');
    } finally {
      setLoading(false);
    }
  };

  const loadFriends = async () => {
    try {
      const data = await friendApi.getFriends();
      setFriends(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  };

  const myMemberInfo = members.find((m) => m.userId === currentUser?.id);
  const isManager = myMemberInfo?.role === 'OWNER' || myMemberInfo?.role === 'ADMIN';
  const existingUserIds = new Set(members.map((m) => m.userId));
  const availableFriends = friends.filter((f) => !existingUserIds.has(f.friendId));

  const handleAddMember = async () => {
    if (!selectedFriendId) return;
    setActionLoading(true);
    setError('');
    try {
      await conversationApi.addMember(conversationId, Number(selectedFriendId));
      setSelectedFriendId('');
      setAddingMember(false);
      loadMembers();
    } catch (err) {
      setError(err.message || 'Thêm thành viên thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveMember = async (userId, name) => {
    if (!window.confirm(`Mời ${name} ra khỏi nhóm?`)) return;
    setActionLoading(true);
    try {
      await conversationApi.removeMember(conversationId, userId);
      loadMembers();
    } catch (err) {
      setError(err.message || 'Không thể xóa thành viên');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Thành viên nhóm`}
      maxWidth="480px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {error && <div className="modal-error-banner">{error}</div>}

        {/* Subtitle */}
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {conversationTitle} · {members.length} thành viên
        </div>

        {/* Add member */}
        {isManager && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!addingMember ? (
              <button
                type="button"
                className="modal-submit-btn"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', boxShadow: 'none', height: '38px' }}
                onClick={() => setAddingMember(true)}
              >
                <UserPlus size={16} /> Thêm thành viên
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  style={{
                    flex: 1,
                    background: 'var(--bg-input)',
                    border: '1.5px solid var(--border)',
                    borderRadius: 'var(--r-sm)',
                    padding: '8px 12px',
                    fontSize: '0.88rem',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                  value={selectedFriendId}
                  onChange={(e) => setSelectedFriendId(e.target.value)}
                >
                  <option value="">-- Chọn bạn để thêm --</option>
                  {availableFriends.map((f) => (
                    <option key={f.friendId} value={f.friendId}>
                      {f.friendDisplayName || f.friendUsername} (@{f.friendUsername})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-req-accept"
                  onClick={handleAddMember}
                  disabled={!selectedFriendId || actionLoading}
                >
                  {actionLoading ? <Loader2 size={14} className="spin-anim" /> : 'Thêm'}
                </button>
                <button
                  type="button"
                  className="btn-req-cancel"
                  onClick={() => { setAddingMember(false); setSelectedFriendId(''); }}
                >
                  Hủy
                </button>
              </div>
            )}
          </div>
        )}

        {/* Members list */}
        <div className="group-members-list">
          {loading ? (
            <div className="modal-center-loading">
              <Loader2 size={22} className="spin-anim" />
              <span>Đang tải thành viên...</span>
            </div>
          ) : (
            members.map((member) => {
              const isMe = member.userId === currentUser?.id;
              const canKick = isManager && !isMe && member.role !== 'OWNER';

              return (
                <div key={member.userId} className="member-row">
                  <Avatar
                    name={member.displayName || member.username}
                    src={member.avatarUrl}
                    size="sm"
                    isOnline={member.isOnline}
                    showStatus={true}
                  />
                  <div className="member-info">
                    <div className="member-name">
                      {member.displayName || member.username}
                      {isMe && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '4px' }}>(Bạn)</span>}
                    </div>
                    <div className="member-handle">@{member.username}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {member.role === 'OWNER' && (
                      <span className="member-role-badge" style={{ background: 'rgba(168,85,247,0.15)', color: 'var(--brand-purple)' }}>
                        <Crown size={10} style={{ display: 'inline' }} /> Owner
                      </span>
                    )}
                    {member.role === 'ADMIN' && (
                      <span className="member-role-badge">
                        <Shield size={10} style={{ display: 'inline' }} /> Admin
                      </span>
                    )}

                    {canKick && (
                      <button
                        type="button"
                        className="btn-card-danger"
                        style={{ width: '30px', height: '30px' }}
                        onClick={() => handleRemoveMember(member.userId, member.displayName || member.username)}
                        title="Mời ra khỏi nhóm"
                        disabled={actionLoading}
                      >
                        <UserX size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
