import React, { useState, useEffect } from 'react';
import { Users, Loader2, LogIn, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { conversationApi } from '../../api/conversationApi';
import { useAuth } from '../../context/AuthContext';

/**
 * JoinGroupPage — Trang tham gia nhóm qua invite link.
 *
 * Props:
 *   token         (string)   – invite token từ URL /join/:token
 *   onJoined      (fn)       – callback khi tham gia thành công, nhận conversation object
 *   onGoToLogin   (fn)       – callback khi user chưa đăng nhập và cần login
 *   onBack        (fn)       – callback quay lại trang chính
 */
export default function JoinGroupPage({ token, onJoined, onGoToLogin, onBack }) {
  const { isAuthenticated, currentUser } = useAuth();

  const [preview, setPreview]   = useState(null);   // { conversationId, name, memberCount, createdByName }
  const [loading, setLoading]   = useState(true);
  const [joining, setJoining]   = useState(false);
  const [error, setError]       = useState('');
  const [joined, setJoined]     = useState(false);

  // Fetch preview khi mount (không cần auth)
  useEffect(() => {
    if (!token) {
      setError('Link mời không hợp lệ.');
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await conversationApi.getGroupPreview(token);
        setPreview(data);
      } catch (err) {
        setError(err?.message || 'Link mời không hợp lệ hoặc đã hết hạn.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleJoin = async () => {
    if (!isAuthenticated) {
      // Redirect sang login, sau login sẽ quay lại
      if (onGoToLogin) onGoToLogin();
      return;
    }
    setJoining(true);
    setError('');
    try {
      const conversation = await conversationApi.joinByToken(token);
      setJoined(true);
      setTimeout(() => {
        if (onJoined) onJoined(conversation);
      }, 1200);
    } catch (err) {
      setError(err?.message || 'Không thể tham gia nhóm. Vui lòng thử lại.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="join-group-page">
      {/* Back button */}
      {onBack && (
        <button type="button" className="join-back-btn" onClick={onBack}>
          <ArrowLeft size={16} /> Quay lại
        </button>
      )}

      <div className="join-group-card">
        {loading ? (
          <div className="join-loading">
            <Loader2 size={32} className="spin-anim" />
            <span>Đang tải thông tin nhóm...</span>
          </div>
        ) : error && !preview ? (
          /* Invalid link state */
          <div className="join-error-state">
            <AlertCircle size={48} className="join-error-icon" />
            <h2>Link không hợp lệ</h2>
            <p>{error}</p>
            {onBack && (
              <button type="button" className="join-action-btn join-btn-secondary" onClick={onBack}>
                Về trang chủ
              </button>
            )}
          </div>
        ) : joined ? (
          /* Success state */
          <div className="join-success-state">
            <CheckCircle size={48} className="join-success-icon" />
            <h2>Đã tham gia nhóm!</h2>
            <p>Đang chuyển hướng vào cuộc trò chuyện...</p>
            <Loader2 size={18} className="spin-anim" style={{ marginTop: '8px' }} />
          </div>
        ) : (
          /* Preview state */
          <>
            {/* Group avatar placeholder */}
            <div className="join-group-avatar">
              <Users size={40} />
            </div>

            {/* Group info */}
            <div className="join-group-info">
              <h1 className="join-group-name">{preview?.name || 'Nhóm chat'}</h1>
              <p className="join-group-meta">
                <Users size={14} />
                <span>{preview?.memberCount ?? '?'} thành viên</span>
              </p>
              {preview?.createdByName && (
                <p className="join-group-creator">
                  Tạo bởi <strong>{preview.createdByName}</strong>
                </p>
              )}
            </div>

            {/* Error banner (join failed) */}
            {error && (
              <div className="join-inline-error">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            {/* CTA */}
            <div className="join-actions">
              {isAuthenticated ? (
                <button
                  type="button"
                  className="join-action-btn join-btn-primary"
                  onClick={handleJoin}
                  disabled={joining}
                >
                  {joining
                    ? <><Loader2 size={16} className="spin-anim" /> Đang tham gia...</>
                    : <><Users size={16} /> Tham gia nhóm</>
                  }
                </button>
              ) : (
                <>
                  <p className="join-login-hint">
                    Bạn cần đăng nhập để tham gia nhóm này.
                  </p>
                  <button
                    type="button"
                    className="join-action-btn join-btn-primary"
                    onClick={handleJoin}
                  >
                    <LogIn size={16} /> Đăng nhập để tham gia
                  </button>
                </>
              )}
              {onBack && (
                <button
                  type="button"
                  className="join-action-btn join-btn-secondary"
                  onClick={onBack}
                >
                  Để sau
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

