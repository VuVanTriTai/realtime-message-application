import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, Search, UserPlus, Users, Image as ImageIcon, FileText,
  LogOut, Crown, Shield, UserX, Loader2, ChevronDown, ChevronRight,
  Download, ExternalLink, RefreshCw, MessageSquare, Link as LinkIcon, Copy, Check,
  Info, Bell, BellOff
} from 'lucide-react';
import Avatar from '../common/Avatar';
import GroupMembersModal from './GroupMembersModal';
import { conversationApi } from '../../api/conversationApi';
import { friendApi } from '../../api/friendApi';
import { messageApi } from '../../api/messageApi';
import { useAuth } from '../../context/AuthContext';
import { formatTime, formatFileSize, formatDateOrRelative } from '../../utils/formatters';

const mId = (m) => m?.user?.id;
const mName = (m) => m?.user?.displayName || m?.user?.username || '?';
const mUsername = (m) => m?.user?.username || '';
const mAvatarUrl = (m) => m?.user?.avatarUrl;
const mIsOnline = (m) => !!m?.user?.isOnline;

export default function GroupDetailPanel({
  conversation,
  onClose,
  onLeaveGroup,
  onJumpToMessage,
  onOpenDirectChat,
}) {
  const { currentUser } = useAuth();
  const conversationId = conversation?.id;
  const isGroup = conversation?.type === 'GROUP';

  // Accordion state (open/close) - mặc định mở 'chat_info' chuẩn Messenger
  const [openSection, setOpenSection] = useState('chat_info'); // 'chat_info' | 'members' | 'media' | 'privacy'

  // Search state
  const [showInlineSearch, setShowInlineSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  // Members state
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [friends, setFriends] = useState([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [showAllMembersModal, setShowAllMembersModal] = useState(false);

  // Owner transfer & leave group
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveNewOwner, setLeaveNewOwner] = useState('');
  const [showTransferPanel, setShowTransferPanel] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');

  // Invite link state
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false);

  // Notification mute state
  const [isMuted, setIsMuted] = useState(false);

  // Media & Files state
  const [mediaList, setMediaList] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaTab, setMediaTab] = useState('images'); // 'images' | 'files'

  const title = isGroup
    ? (conversation?.name || conversation?.title || 'Nhóm chat')
    : (conversation?.otherUserName || conversation?.title || 'Cuộc trò chuyện');

  // Load members
  const loadMembers = useCallback(async () => {
    if (!conversationId) return;
    setMembersLoading(true);
    try {
      const data = await conversationApi.getMembers(conversationId);
      const normalized = (Array.isArray(data) ? data : []).map((m) => {
        if (m.user && m.user.id) return m;
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
        };
      });
      setMembers(normalized);
    } catch {
      setMemberError('Không thể tải thành viên');
    } finally {
      setMembersLoading(false);
    }
  }, [conversationId]);

  // Load friends for invite
  const loadFriends = useCallback(async () => {
    try {
      const data = await friendApi.getFriends();
      setFriends(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }, []);

  // Load media & files
  const loadMedia = useCallback(async () => {
    if (!conversationId) return;
    setMediaLoading(true);
    try {
      const data = await messageApi.getMedia(conversationId);
      setMediaList(Array.isArray(data) ? data : []);
    } catch {
      /* silent */
    } finally {
      setMediaLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (conversationId) {
      loadMembers();
      loadFriends();
      loadMedia();
      setSearchQuery('');
      setSearchResults([]);
      setSearchDone(false);
      setShowAddMember(false);
      setShowLeaveConfirm(false);
      setMemberError('');
    }
  }, [conversationId, loadMembers, loadFriends, loadMedia]);

  // Search messages logic
  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchQuery.trim() || !conversationId) return;
    setSearchLoading(true);
    setSearchDone(false);
    try {
      const results = await messageApi.search(conversationId, searchQuery.trim());
      setSearchResults(Array.isArray(results) ? results : []);
      setSearchDone(true);
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // Toggle accordion
  const toggleSection = (section) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  // Derived members info
  const myMember = members.find((m) => mId(m) === currentUser?.id);
  const isOwner = myMember?.role === 'OWNER';
  const isManager = isOwner || myMember?.role === 'ADMIN';
  const existingUserIds = new Set(members.map((m) => mId(m)));
  const availableFriends = friends.filter((f) => !existingUserIds.has(f.friendId));
  const otherMembers = members.filter((m) => mId(m) !== currentUser?.id);

  // Filter media
  const imageMessages = useMemo(
    () => mediaList.filter((m) => m.type === 'IMAGE' && (m.mediaUrl || m.content)),
    [mediaList]
  );
  const fileMessages = useMemo(
    () => mediaList.filter((m) => m.type === 'FILE' && (m.mediaUrl || m.content)),
    [mediaList]
  );
  const linkMessages = useMemo(() => {
    const list = [];
    const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
    for (const msg of mediaList) {
      if (!msg.content || msg.deleted || msg.isDeleted) continue;

      // CHỈ quét liên kết từ tin nhắn văn bản thuần túy (TEXT).
      // Các tin nhắn loại IMAGE hoặc FILE là tệp tải lên (upload attachment), đã được hiển thị ở 2 tab Ảnh và File.
      if (msg.type === 'IMAGE' || msg.type === 'FILE' || msg.mediaUrl) {
        continue;
      }

      const urls = msg.content.match(URL_REGEX);
      if (urls) {
        for (const u of urls) {
          let host = '';
          try {
            host = new URL(u).hostname;
          } catch {
            host = u;
          }

          list.push({
            key: `${msg.id}_${u}`,
            messageId: msg.id,
            url: u,
            host,
            senderName: msg.sender?.displayName || msg.sender?.username || 'Thành viên',
            createdAt: msg.createdAt,
            isInvite: u.includes('/join/'),
          });
        }
      }
    }
    return list;
  }, [mediaList]);

  // Handlers for members
  const handleAddMember = async () => {
    if (!selectedFriendId) return;
    setActionLoading(true);
    setMemberError('');
    try {
      await conversationApi.addMember(conversationId, Number(selectedFriendId));
      setSelectedFriendId('');
      setShowAddMember(false);
      await loadMembers();
    } catch (err) {
      setMemberError(err.message || 'Thêm thành viên thất bại');
    } finally {
      setActionLoading(false);
    }
  };

  const handleKickMember = async (member) => {
    const name = mName(member);
    if (!window.confirm(`Mời ${name} ra khỏi nhóm?`)) return;
    setActionLoading(true);
    setMemberError('');
    try {
      await conversationApi.removeMember(conversationId, mId(member));
      await loadMembers();
    } catch (err) {
      setMemberError(err.message || 'Không thể xóa thành viên');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransferOwnership = async (targetId = null) => {
    const finalTargetId = targetId || transferTarget;
    if (!finalTargetId) return;
    const targetMember = members.find((m) => mId(m) === Number(finalTargetId));
    const targetName = targetMember ? mName(targetMember) : 'thành viên này';

    if (!window.confirm(`Xác nhận chuyển quyền Owner cho ${targetName}? Bạn sẽ trở thành Thành viên.`)) return;

    setActionLoading(true);
    setMemberError('');
    try {
      await conversationApi.transferOwnership(conversationId, Number(finalTargetId));
      setShowTransferPanel(false);
      setTransferTarget('');
      await loadMembers();
    } catch (err) {
      setMemberError(err.message || 'Không thể chuyển quyền Owner');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!conversationId) return;
    setInviteLinkLoading(true);
    setMemberError('');
    try {
      const data = await conversationApi.generateInviteLink(conversationId);
      if (data?.inviteUrl) {
        await navigator.clipboard.writeText(data.inviteUrl);
        setInviteLinkCopied(true);
        setTimeout(() => setInviteLinkCopied(false), 2500);
      }
    } catch (err) {
      setMemberError(err.message || 'Không thể tạo link mời. Vui lòng thử lại.');
    } finally {
      setInviteLinkLoading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (isOwner && otherMembers.length > 0 && !leaveNewOwner) {
      setMemberError('Bạn là Owner – hãy chỉ định thành viên kế tiếp.');
      return;
    }
    setActionLoading(true);
    setMemberError('');
    try {
      await conversationApi.leaveGroup(
        conversationId,
        leaveNewOwner ? Number(leaveNewOwner) : null
      );
      if (onLeaveGroup) onLeaveGroup(conversationId);
      onClose();
    } catch (err) {
      setMemberError(err.message || 'Không thể rời nhóm');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="group-detail-panel">
      {/* Panel Top Header */}
      <div className="detail-panel-header">
        <h3 className="detail-panel-title">Thông tin về đoạn chat</h3>
        <button
          type="button"
          className="detail-close-btn"
          onClick={onClose}
          title="Đóng thông tin"
        >
          <X size={18} />
        </button>
      </div>

      <div className="detail-panel-scroll">
        {/* Profile Card Header */}
        <div className="detail-profile-hero">
          <Avatar
            name={title}
            src={conversation?.avatarUrl}
            size="lg"
            className="detail-hero-avatar"
            showStatus={!isGroup}
            isOnline={conversation?.isOnline}
          />
          <h4 className="detail-hero-name">{title}</h4>
          <span className="detail-hero-subtitle">
            {isGroup
              ? `${members.length} thành viên`
              : (conversation?.isOnline ? 'Đang hoạt động' : 'Ngoại tuyến')}
          </span>

          {/* Quick Action Buttons Row (giống Messenger: Mời, Tắt thông báo, Tìm kiếm) */}
          <div className="detail-quick-actions">
            {isGroup && (
              <div className="quick-action-item">
                <button
                  type="button"
                  className="quick-action-circle"
                  onClick={() => {
                    setOpenSection('members');
                    setShowAddMember(true);
                  }}
                  title="Mời thành viên vào nhóm"
                >
                  <UserPlus size={18} />
                </button>
                <span className="quick-action-label">Mời</span>
              </div>
            )}

            <div className="quick-action-item">
              <button
                type="button"
                className="quick-action-circle"
                onClick={() => setIsMuted((prev) => !prev)}
                title={isMuted ? 'Bật thông báo cuộc trò chuyện' : 'Tắt thông báo cuộc trò chuyện'}
              >
                {isMuted ? <BellOff size={18} /> : <Bell size={18} />}
              </button>
              <span className="quick-action-label">
                {isMuted ? 'Bật t.báo' : 'Tắt thông báo'}
              </span>
            </div>

            <div className="quick-action-item">
              <button
                type="button"
                className="quick-action-circle"
                onClick={() => {
                  setOpenSection('chat_info');
                  setShowInlineSearch(true);
                }}
                title="Tìm kiếm tin nhắn"
              >
                <Search size={18} />
              </button>
              <span className="quick-action-label">Tìm kiếm</span>
            </div>
          </div>
        </div>

        {/* ── Accordion 1: THÔNG TIN VỀ ĐOẠN CHAT (Messenger layout) ── */}
        <div className="detail-accordion-item">
          <button
            type="button"
            className="detail-accordion-header"
            onClick={() => toggleSection('chat_info')}
          >
            <span className="accordion-title">
              <Info size={16} /> Thông tin về đoạn chat
            </span>
            {openSection === 'chat_info' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {openSection === 'chat_info' && (
            <div className="detail-accordion-content">
              {isGroup && (
                <div
                  className="detail-action-menu-row"
                  onClick={handleCopyInviteLink}
                  role="button"
                  tabIndex={0}
                  title="Sao chép link mời tham gia nhóm"
                >
                  <div className="action-menu-icon-circle">
                    {inviteLinkLoading ? (
                      <Loader2 size={16} className="spin-anim" />
                    ) : inviteLinkCopied ? (
                      <Check size={16} style={{ color: '#22c55e' }} />
                    ) : (
                      <LinkIcon size={16} />
                    )}
                  </div>
                  <div className="action-menu-text-wrap">
                    <span className="action-menu-main-text">Sao chép liên kết</span>
                    <span className="action-menu-sub-text">
                      {inviteLinkCopied ? 'Đã sao chép liên kết vào bộ nhớ tạm!' : 'Mời thành viên cộng đồng tham gia đoạn chat này'}
                    </span>
                  </div>
                </div>
              )}

              <div
                className="detail-action-menu-row"
                onClick={() => setShowInlineSearch((prev) => !prev)}
                role="button"
                tabIndex={0}
                title="Tìm kiếm tin nhắn trong cuộc trò chuyện"
              >
                <div className="action-menu-icon-circle">
                  <Search size={16} />
                </div>
                <div className="action-menu-text-wrap">
                  <span className="action-menu-main-text">Tìm kiếm trong cuộc trò chuyện</span>
                  <span className="action-menu-sub-text">Tìm kiếm tin nhắn và nội dung trao đổi</span>
                </div>
                {showInlineSearch ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
              </div>

              {showInlineSearch && (
                <div className="inline-search-container">
                  <form onSubmit={handleSearch} className="search-msg-form">
                    <div className="search-msg-input-wrap">
                      <Search size={15} className="search-msg-icon" />
                      <input
                        type="text"
                        className="search-msg-input"
                        placeholder="Tìm kiếm tin nhắn..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          className="search-msg-clear"
                          onClick={() => {
                            setSearchQuery('');
                            setSearchResults([]);
                            setSearchDone(false);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="search-msg-submit"
                      disabled={!searchQuery.trim() || searchLoading}
                    >
                      {searchLoading ? <Loader2 size={14} className="spin-anim" /> : 'Tìm'}
                    </button>
                  </form>

                  {/* Search results list */}
                  <div className="search-results-list">
                    {searchLoading ? (
                      <div className="detail-center-loading">
                        <Loader2 size={20} className="spin-anim" />
                        <span>Đang tìm kiếm...</span>
                      </div>
                    ) : searchDone && searchResults.length === 0 ? (
                      <div className="detail-empty-text">Không tìm thấy tin nhắn nào</div>
                    ) : (
                      searchResults.map((msg) => (
                        <div
                          key={msg.id}
                          className="search-result-row"
                          onClick={() => onJumpToMessage && onJumpToMessage(msg.id)}
                          title="Bấm để cuộn đến tin nhắn này"
                        >
                          <Avatar
                            name={msg.sender?.displayName || msg.sender?.username || 'U'}
                            src={msg.sender?.avatarUrl}
                            size="xs"
                          />
                          <div className="search-result-body">
                            <div className="search-result-meta">
                              <span className="search-result-sender">
                                {msg.sender?.displayName || msg.sender?.username}
                              </span>
                              <span className="search-result-time">
                                {formatDateOrRelative(msg.createdAt)}
                              </span>
                            </div>
                            <div className="search-result-text">{msg.content}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Accordion 2: THÀNH VIÊN TRONG ĐOẠN CHAT (GROUP ONLY) ── */}
        {isGroup && (
          <div className="detail-accordion-item">
            <button
              type="button"
              className="detail-accordion-header"
              onClick={() => toggleSection('members')}
            >
              <span className="accordion-title">
                <Users size={16} /> Thành viên trong đoạn chat ({members.length})
              </span>
              {openSection === 'members' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {openSection === 'members' && (
              <div className="detail-accordion-content">
                {memberError && (
                  <div className="modal-error-banner" style={{ margin: '0 0 10px 0' }}>
                    {memberError}
                  </div>
                )}

                {/* Add member button or select */}
                {isManager && (
                  <div style={{ marginBottom: '8px' }}>
                    {!showAddMember ? (
                      <button
                        type="button"
                        className="detail-add-member-trigger"
                        onClick={() => setShowAddMember(true)}
                      >
                        <UserPlus size={15} /> Thêm người vào nhóm
                      </button>
                    ) : (
                      <div className="add-member-inline-box">
                        <select
                          className="detail-select-input"
                          value={selectedFriendId}
                          onChange={(e) => setSelectedFriendId(e.target.value)}
                        >
                          <option value="">-- Chọn bạn bè --</option>
                          {availableFriends.map((f) => (
                            <option key={f.friendId} value={f.friendId}>
                              {f.friendDisplayName || f.friendUsername} (@{f.friendUsername})
                            </option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn-req-accept"
                            onClick={handleAddMember}
                            disabled={!selectedFriendId || actionLoading}
                          >
                            {actionLoading ? <Loader2 size={13} className="spin-anim" /> : 'Thêm'}
                          </button>
                          <button
                            type="button"
                            className="btn-req-cancel"
                            onClick={() => {
                              setShowAddMember(false);
                              setSelectedFriendId('');
                            }}
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Members List (preview 3-4 người đầu, có nút Xem tất cả chuẩn Messenger) */}
                <div className="detail-members-list">
                  {membersLoading ? (
                    <div className="detail-center-loading">
                      <Loader2 size={20} className="spin-anim" />
                      <span>Đang tải...</span>
                    </div>
                  ) : (
                    <>
                      {(members.length > 3 ? members.slice(0, 3) : members).map((m) => {
                        const isMe = mId(m) === currentUser?.id;
                        const canKick = isManager && !isMe && m.role !== 'OWNER';

                        return (
                          <div
                            key={m.memberId ?? mId(m)}
                            className={`detail-member-row ${!isMe ? 'clickable-member-row' : ''}`}
                            onClick={() => {
                              if (!isMe && onOpenDirectChat) {
                                onOpenDirectChat(mId(m));
                              }
                            }}
                            title={!isMe ? `Bấm để nhắn tin với ${mName(m)}` : undefined}
                          >
                            <Avatar
                              name={mName(m)}
                              src={mAvatarUrl(m)}
                              size="sm"
                              isOnline={mIsOnline(m)}
                              showStatus
                            />
                            <div className="detail-member-info">
                              <span className="detail-member-name">
                                {mName(m)} {isMe && '(Bạn)'}
                              </span>
                              <span className="detail-member-handle">@{mUsername(m)}</span>
                            </div>

                            <div className="detail-member-actions">
                              {m.role === 'OWNER' && (
                                <span className="member-role-badge badge-owner" title="Trưởng nhóm">
                                  <Crown size={11} color="#eab308" /> Owner
                                </span>
                              )}
                              {m.role === 'ADMIN' && (
                                <span className="member-role-badge badge-admin" title="Quản trị viên">
                                  <Shield size={11} /> Admin
                                </span>
                              )}
                              {/* Nút nhắn tin trực tiếp 1-1 */}
                              {!isMe && onOpenDirectChat && (
                                <button
                                  type="button"
                                  className="member-message-icon-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenDirectChat(mId(m));
                                  }}
                                  title={`Nhắn tin với ${mName(m)}`}
                                >
                                  <MessageSquare size={13} />
                                </button>
                              )}
                              {/* Nút chuyển quyền Owner nhanh cho thành viên này */}
                              {isOwner && !isMe && (
                                <button
                                  type="button"
                                  className="member-transfer-icon-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleTransferOwnership(mId(m));
                                  }}
                                  title={`Chuyển quyền Owner cho ${mName(m)}`}
                                  disabled={actionLoading}
                                >
                                  <Crown size={14} color="#eab308" />
                                </button>
                              )}
                              {canKick && (
                                <button
                                  type="button"
                                  className="member-kick-icon-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleKickMember(m);
                                  }}
                                  title={`Mời ${mName(m)} ra khỏi nhóm`}
                                  disabled={actionLoading}
                                >
                                  <UserX size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Nút Xem tất cả thành viên (chuẩn giao diện Messenger) */}
                      {members.length > 3 && (
                        <div
                          className="view-all-members-row"
                          onClick={() => setShowAllMembersModal(true)}
                          role="button"
                          tabIndex={0}
                          title="Xem toàn bộ thành viên"
                        >
                          <div className="view-all-icon-circle">
                            <Users size={16} />
                          </div>
                          <span className="view-all-text">Xem tất cả</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Owner: Transfer ownership panel */}
                {isOwner && otherMembers.length > 0 && (
                  <div className="owner-transfer-section">
                    {!showTransferPanel ? (
                      <button
                        type="button"
                        className="detail-transfer-owner-btn"
                        onClick={() => setShowTransferPanel(true)}
                      >
                        <Crown size={15} color="#eab308" /> Chuyển giao quyền Owner
                      </button>
                    ) : (
                      <div className="add-member-inline-box" style={{ marginTop: '4px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Crown size={14} color="#eab308" /> Chọn thành viên nhận quyền Owner:
                        </span>
                        <select
                          className="detail-select-input"
                          value={transferTarget}
                          onChange={(e) => setTransferTarget(e.target.value)}
                        >
                          <option value="">-- Chọn thành viên --</option>
                          {otherMembers.map((m) => (
                            <option key={mId(m)} value={mId(m)}>
                              {mName(m)} (@{mUsername(m)})
                            </option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn-req-accept"
                            style={{ flex: 1 }}
                            onClick={() => handleTransferOwnership()}
                            disabled={!transferTarget || actionLoading}
                          >
                            Xác nhận chuyển
                          </button>
                          <button
                            type="button"
                            className="btn-req-cancel"
                            onClick={() => {
                              setShowTransferPanel(false);
                              setTransferTarget('');
                            }}
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Accordion 3: FILE PHƯƠNG TIỆN, FILE VÀ LIÊN KẾT ── */}
        <div className="detail-accordion-item">
          <button
            type="button"
            className="detail-accordion-header"
            onClick={() => toggleSection('media')}
          >
            <span className="accordion-title">
              <ImageIcon size={16} /> File phương tiện, file và liên kết
            </span>
            {openSection === 'media' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {openSection === 'media' && (
            <div className="detail-accordion-content">
              {/* Sub tabs: Hình ảnh, File, Liên kết */}
              <div className="detail-sub-tabs">
                <button
                  type="button"
                  className={`sub-tab-btn ${mediaTab === 'images' ? 'active' : ''}`}
                  onClick={() => setMediaTab('images')}
                >
                  <ImageIcon size={13} /> Ảnh ({imageMessages.length})
                </button>
                <button
                  type="button"
                  className={`sub-tab-btn ${mediaTab === 'files' ? 'active' : ''}`}
                  onClick={() => setMediaTab('files')}
                >
                  <FileText size={13} /> File ({fileMessages.length})
                </button>
                <button
                  type="button"
                  className={`sub-tab-btn ${mediaTab === 'links' ? 'active' : ''}`}
                  onClick={() => setMediaTab('links')}
                >
                  <LinkIcon size={13} /> Link ({linkMessages.length})
                </button>
              </div>

              {mediaLoading ? (
                <div className="detail-center-loading">
                  <Loader2 size={20} className="spin-anim" />
                  <span>Đang tải...</span>
                </div>
              ) : mediaTab === 'images' ? (
                imageMessages.length === 0 ? (
                  <div className="detail-empty-text">Chưa có hình ảnh nào được gửi</div>
                ) : (
                  <div className="detail-image-grid">
                    {imageMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className="media-thumb-item"
                        onClick={() => window.open(msg.mediaUrl || msg.content, '_blank')}
                        title="Bấm để mở ảnh gốc"
                      >
                        <img
                          src={msg.thumbUrl || msg.mediaUrl || msg.content}
                          alt={msg.fileName || 'Ảnh'}
                          loading="lazy"
                        />
                      </div>
                    ))}
                  </div>
                )
              ) : mediaTab === 'files' ? (
                fileMessages.length === 0 ? (
                  <div className="detail-empty-text">Chưa có file nào được gửi</div>
                ) : (
                  <div className="detail-file-list">
                    {fileMessages.map((msg) => (
                      <a
                        key={msg.id}
                        href={msg.mediaUrl || msg.content}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={msg.fileName || 'file'}
                        className="detail-file-card"
                      >
                        <div className="detail-file-icon">
                          <FileText size={16} />
                        </div>
                        <div className="detail-file-info">
                          <span className="detail-file-name">{msg.fileName || 'Tệp đính kèm'}</span>
                          <span className="detail-file-sub">
                            {formatFileSize(msg.fileSize)} · {formatDateOrRelative(msg.createdAt)}
                          </span>
                        </div>
                        <Download size={14} className="detail-file-dl" />
                      </a>
                    ))}
                  </div>
                )
              ) : (
                /* Tab Liên kết */
                linkMessages.length === 0 ? (
                  <div className="detail-empty-text">Chưa có liên kết nào được chia sẻ</div>
                ) : (
                  <div className="detail-link-list">
                    {linkMessages.map((item) => (
                      <div key={item.key} className="detail-link-card">
                        <div className="detail-link-icon">
                          {item.isInvite ? <Users size={16} /> : <LinkIcon size={16} />}
                        </div>
                        <div className="detail-link-content">
                          <a
                            href={item.url}
                            target={item.isInvite ? '_self' : '_blank'}
                            rel="noopener noreferrer"
                            className="detail-link-title"
                            onClick={(e) => {
                              if (item.isInvite) {
                                e.preventDefault();
                                const m = item.url.match(/\/join\/([a-zA-Z0-9_-]+)/);
                                if (m) {
                                  window.history.pushState({}, '', `/join/${m[1]}`);
                                  window.dispatchEvent(new PopStateEvent('popstate'));
                                }
                              }
                            }}
                          >
                            {item.isInvite ? 'Lời mời tham gia nhóm' : item.host || item.url}
                          </a>
                          <span className="detail-link-url" title={item.url}>
                            {item.url}
                          </span>
                          <span className="detail-link-meta">
                            {item.senderName} · {formatDateOrRelative(item.createdAt)}
                          </span>
                        </div>
                        <div className="detail-link-actions">
                          <button
                            type="button"
                            className="detail-link-action-icon"
                            onClick={() => navigator.clipboard.writeText(item.url)}
                            title="Sao chép liên kết"
                          >
                            <Copy size={13} />
                          </button>
                          {onJumpToMessage && (
                            <button
                              type="button"
                              className="detail-link-action-icon"
                              onClick={() => onJumpToMessage(item.messageId)}
                              title="Đi đến tin nhắn"
                            >
                              <ExternalLink size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* ── Accordion 4: QUYỀN RIÊNG TƯ & TÙY CHỌN (GROUP ONLY) ── */}
        {isGroup && (
          <div className="detail-accordion-item">
            <button
              type="button"
              className="detail-accordion-header"
              onClick={() => toggleSection('options')}
            >
              <span className="accordion-title">
                <Shield size={16} /> Quyền riêng tư & hỗ trợ
              </span>
              {openSection === 'options' ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>

            {openSection === 'options' && (
              <div className="detail-accordion-content">
                {!showLeaveConfirm ? (
                  <button
                    type="button"
                    className="detail-leave-btn"
                    onClick={() => setShowLeaveConfirm(true)}
                  >
                    <LogOut size={16} /> Rời nhóm
                  </button>
                ) : (
                  <div className="leave-confirm-box">
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ef4444' }}>
                      ⚠️ Xác nhận rời nhóm?
                    </span>

                    {isOwner && otherMembers.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          Bạn là Owner – chọn thành viên kế tiếp làm Owner:
                        </label>
                        <select
                          className="detail-select-input"
                          value={leaveNewOwner}
                          onChange={(e) => setLeaveNewOwner(e.target.value)}
                        >
                          <option value="">-- Chọn thành viên --</option>
                          {otherMembers.map((m) => (
                            <option key={mId(m)} value={mId(m)}>
                              {mName(m)} (@{mUsername(m)})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                      <button
                        type="button"
                        className="btn-card-danger"
                        style={{ flex: 1, height: '32px', fontSize: '0.82rem' }}
                        onClick={handleLeaveGroup}
                        disabled={actionLoading || (isOwner && otherMembers.length > 0 && !leaveNewOwner)}
                      >
                        {actionLoading ? <Loader2 size={13} className="spin-anim" /> : 'Xác nhận rời'}
                      </button>
                      <button
                        type="button"
                        className="btn-req-cancel"
                        style={{ flex: 1, height: '32px' }}
                        onClick={() => {
                          setShowLeaveConfirm(false);
                          setLeaveNewOwner('');
                        }}
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal danh sách tất cả thành viên khi click "Xem tất cả" */}
      {isGroup && (
        <GroupMembersModal
          isOpen={showAllMembersModal}
          onClose={() => {
            setShowAllMembersModal(false);
            loadMembers();
          }}
          conversationId={conversationId}
          conversationTitle={title}
          onLeaveGroup={onLeaveGroup}
          onOpenDirectChat={onOpenDirectChat}
        />
      )}
    </div>
  );
}

