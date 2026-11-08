import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Smile,
  Image as ImageIcon,
  Paperclip,
  X,
  FileText,
  CornerUpLeft,
  Loader2,
} from 'lucide-react';
import { mediaApi } from '../../api/mediaApi';
import { formatFileSize } from '../../utils/formatters';
import { compressImage } from '../../utils/imageCompressor';

const COMMON_EMOJIS = [
  '😊', '😂', '❤️', '👍', '🔥', '🎉', '👋', '😎',
  '🙌', '✨', '🤔', '💯', '😍', '🥰', '😁', '🤣',
  '💪', '🎯', '⚡', '🚀', '💬', '🎊', '🌟', '😭',
];

export default function MessageInput({
  onSendMessage,
  onTyping,
  disabled = false,
  replyingTo = null,
  onCancelReply,
}) {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [rawFile, setRawFile] = useState(null);
  const [compressedFile, setCompressedFile] = useState(null);
  const [isHD, setIsHD] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionInfo, setCompressionInfo] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const typingTimeoutRef = useRef(null);
  const isTypingActiveRef = useRef(false);
  const inputRef = useRef(null);
  const pickerRef = useRef(null);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Close emoji picker when clicking outside
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  // Clean up preview object URL on unmount or file change
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Focus input when replyingTo changes
  useEffect(() => {
    if (replyingTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyingTo]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setText(val);

    if (onTyping && val.trim().length > 0) {
      if (!isTypingActiveRef.current) {
        isTypingActiveRef.current = true;
        onTyping(true);
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isTypingActiveRef.current = false;
        onTyping(false);
      }, 2500);
    } else if (isTypingActiveRef.current && val.trim().length === 0) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      isTypingActiveRef.current = false;
      if (onTyping) onTyping(false);
    }
  };

  const handleFileSelect = async (e, isFromImagePicker = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      alert('Tệp quá lớn. Dung lượng tối đa được phép là 10 MB.');
      e.target.value = '';
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setRawFile(file);
    setIsHD(false);

    // Nếu chọn từ nút Ảnh hoặc là file ảnh thông thường -> Tự động nén tối ưu
    if (isFromImagePicker || file.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(file));
      setIsCompressing(true);
      try {
        const compResult = await compressImage(file);
        setCompressedFile(compResult.file);
        setSelectedFile(compResult.file);
        setCompressionInfo(compResult);
      } catch (err) {
        console.warn('Lỗi khi nén ảnh, sử dụng ảnh gốc:', err);
        setSelectedFile(file);
        setCompressedFile(file);
        setCompressionInfo(null);
      } finally {
        setIsCompressing(false);
      }
    } else {
      // Tệp tài liệu (PDF, Word, Zip...) -> Giữ nguyên 100% không nén
      setSelectedFile(file);
      setCompressedFile(null);
      setCompressionInfo(null);
      setPreviewUrl(null);
    }

    // Reset input so re-selecting same file triggers onChange
    e.target.value = '';
    if (inputRef.current) inputRef.current.focus();
  };

  const toggleHD = () => {
    if (!rawFile || isUploading || isCompressing) return;
    if (isHD) {
      // Chuyển lại chế độ Nén nhanh
      if (compressedFile) {
        setSelectedFile(compressedFile);
      }
      setIsHD(false);
    } else {
      // Chuyển sang chế độ Gốc HD
      setSelectedFile(rawFile);
      setIsHD(true);
    }
  };

  const handleRemoveFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setRawFile(null);
    setCompressedFile(null);
    setPreviewUrl(null);
    setUploadProgress(0);
    setIsHD(false);
    setCompressionInfo(null);
  };

  // Support pasting images directly (Ctrl+V)
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          if (file.size > 10 * 1024 * 1024) {
            alert('Ảnh trong clipboard quá lớn (tối đa 10 MB).');
            return;
          }
          if (previewUrl) URL.revokeObjectURL(previewUrl);

          setRawFile(file);
          setIsHD(false);
          setPreviewUrl(URL.createObjectURL(file));

          setIsCompressing(true);
          try {
            const compResult = await compressImage(file);
            setCompressedFile(compResult.file);
            setSelectedFile(compResult.file);
            setCompressionInfo(compResult);
          } catch (err) {
            console.warn('Lỗi khi nén ảnh clipboard:', err);
            setSelectedFile(file);
            setCompressedFile(file);
            setCompressionInfo(null);
          } finally {
            setIsCompressing(false);
          }
          break;
        }
      }
    }
  };

  const handleSend = useCallback(
    async (e) => {
      if (e) e.preventDefault();
      if (disabled || isUploading) return;

      const hasTextContent = text.trim().length > 0;
      if (!hasTextContent && !selectedFile) return;

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingActiveRef.current) {
        isTypingActiveRef.current = false;
        if (onTyping) onTyping(false);
      }

      // Case 1: Has selected file (Image or Document)
      if (selectedFile) {
        setIsUploading(true);
        setUploadProgress(10);
        try {
          // 1. Get Cloudinary signature from server
          const sig = await mediaApi.getUploadSignature(selectedFile);
          setUploadProgress(30);

          // 2. Direct upload to Cloudinary
          const uploadRes = await mediaApi.uploadToCloudinary(
            selectedFile,
            sig,
            (pct) => setUploadProgress(30 + Math.round(pct * 0.65))
          );
          setUploadProgress(100);

          const isImage = selectedFile.type.startsWith('image/') || selectedFile.type.startsWith('video/');
          const filePayload = {
            content: uploadRes.secure_url,
            type: isImage ? 'IMAGE' : 'FILE',
            mediaUrl: uploadRes.secure_url,
            mediaType: selectedFile.type || 'application/octet-stream',
            fileName: rawFile?.name || selectedFile.name,
            fileSize: selectedFile.size,
            thumbUrl: isImage ? uploadRes.secure_url : null,
            replyToId: replyingTo?.id || null,
          };

          await onSendMessage(filePayload);

          // If user also typed a message along with the file, send it too
          if (hasTextContent) {
            // [FIX ORDER] Chờ 120ms để server gán createdAt cho IMAGE trước TEXT,
            // tránh timestamp quá gần nhau gây lộn thứ tự sau khi sort
            await new Promise((res) => setTimeout(res, 120));
            // [FIX] Generate unique clientMessageId riêng để tránh trùng với tempId của file
            const captionClientId = `ws_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            await onSendMessage({
              content: text.trim(),
              type: 'TEXT',
              replyToId: null, // file already replied
              clientMessageId: captionClientId,
            });
          }

          // Cleanup
          handleRemoveFile();
          setText('');
          if (onCancelReply) onCancelReply();
        } catch (err) {
          console.error('Upload media failed:', err);
          alert('Gửi tệp thất bại: ' + (err.message || 'Lỗi không xác định'));
        } finally {
          setIsUploading(false);
          setUploadProgress(0);
          if (inputRef.current) inputRef.current.focus();
        }
        return;
      }

      // Case 2: Pure text message
      if (hasTextContent) {
        onSendMessage({
          content: text.trim(),
          type: 'TEXT',
          replyToId: replyingTo?.id || null,
        });
        setText('');
        setShowEmojiPicker(false);
        if (onCancelReply) onCancelReply();
        if (inputRef.current) inputRef.current.focus();
      }
    },
    [text, selectedFile, rawFile, isHD, disabled, isUploading, replyingTo, onSendMessage, onTyping, onCancelReply]
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addEmoji = (emoji) => {
    setText((prev) => prev + emoji);
    if (inputRef.current) inputRef.current.focus();
  };

  const hasContent = text.trim().length > 0 || !!selectedFile;

  return (
    <div className="message-input-container" translate="no">
      {/* Reply Banner */}
      {replyingTo && (
        <div className="input-reply-banner">
          <div className="reply-banner-left">
            <CornerUpLeft size={16} className="reply-banner-icon" />
            <div className="reply-banner-text">
              <span className="reply-banner-title">
                Đang trả lời <strong>{replyingTo.senderUsername || 'Người dùng'}</strong>
              </span>
              <span className="reply-banner-preview">{replyingTo.contentPreview}</span>
            </div>
          </div>
          <button
            type="button"
            className="reply-banner-close"
            onClick={onCancelReply}
            title="Hủy trả lời"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Selected File / Image Preview */}
      {selectedFile && (
        <div className="input-file-preview-bar">
          <div className="file-preview-left">
            {previewUrl ? (
              <img src={previewUrl} alt="Preview" className="file-preview-thumb" />
            ) : (
              <div className="file-preview-icon-box">
                <FileText size={22} />
              </div>
            )}
            <div className="file-preview-info">
              <span className="file-preview-name">{rawFile?.name || selectedFile.name}</span>
              <div className="file-preview-meta">
                <span className="file-preview-size">{formatFileSize(selectedFile.size)}</span>
                {isCompressing && (
                  <span className="file-preview-saved-badge">Đang tối ưu ảnh...</span>
                )}
                {!isCompressing && compressionInfo?.wasCompressed && !isHD && (
                  <span className="file-preview-saved-badge">
                    ⚡ Giảm {Math.round((1 - compressionInfo.compressedSize / compressionInfo.originalSize) * 100)}% (Gửi nhanh)
                  </span>
                )}
                {!isCompressing && isHD && rawFile?.type?.startsWith('image/') && (
                  <span className="file-preview-hd-badge">
                    ★ Chất lượng gốc HD
                  </span>
                )}
              </div>
              {isUploading && (
                <span className="file-preview-progress">
                  Đang tải lên... {uploadProgress}%
                </span>
              )}
            </div>
          </div>
          <div className="file-preview-right">
            {rawFile?.type?.startsWith('image/') && !isUploading && (
              <button
                type="button"
                className={`btn-hd-toggle ${isHD ? 'active' : ''}`}
                onClick={toggleHD}
                title={isHD ? 'Đang chọn gửi ảnh gốc HD (Click để chuyển sang nén nhanh)' : 'Click để chuyển sang gửi ảnh chất lượng gốc HD'}
                disabled={isCompressing}
              >
                <span>HD</span>
                <span>{isHD ? 'Gốc' : 'Nhanh'}</span>
              </button>
            )}
            {!isUploading && (
              <button
                type="button"
                className="file-preview-remove"
                onClick={handleRemoveFile}
                title="Xóa tệp đính kèm"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <div className="emoji-quick-picker" ref={pickerRef}>
          <div className="emoji-grid">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="emoji-btn"
                onClick={() => addEmoji(emoji)}
                aria-label={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={imageInputRef}
        accept="image/*,video/*"
        onChange={(e) => handleFileSelect(e, true)}
        style={{ display: 'none' }}
      />
      <input
        type="file"
        ref={fileInputRef}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
        onChange={(e) => handleFileSelect(e, false)}
        style={{ display: 'none' }}
      />

      {/* Input Row */}
      <form onSubmit={handleSend} className="message-input-form">
        {/* Emoji Button */}
        <button
          type="button"
          className={`input-action-btn ${showEmojiPicker ? 'active' : ''}`}
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          title="Biểu tượng cảm xúc"
          disabled={disabled || isUploading}
        >
          <Smile size={20} />
        </button>

        {/* Image Attachment Button */}
        <button
          type="button"
          className="input-action-btn"
          onClick={() => imageInputRef.current?.click()}
          title="Gửi hình ảnh / video"
          disabled={disabled || isUploading}
        >
          <ImageIcon size={20} />
        </button>

        {/* File/Doc Attachment Button */}
        <button
          type="button"
          className="input-action-btn"
          onClick={() => fileInputRef.current?.click()}
          title="Gửi tệp tin / tài liệu"
          disabled={disabled || isUploading}
        >
          <Paperclip size={20} />
        </button>

        {/* Text Input */}
        <input
          ref={inputRef}
          id="msg-input"
          type="text"
          className="chat-text-input"
          placeholder={
            selectedFile
              ? 'Thêm chú thích cho tệp (tùy chọn)...'
              : replyingTo
              ? 'Nhập nội dung trả lời...'
              : 'Nhập tin nhắn...'
          }
          value={text}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled || isUploading}
          autoComplete="off"
          spellCheck={false}
          translate="no"
        />

        {/* Send Button */}
        <button
          id="btn-send-msg"
          type="submit"
          className={`btn-send-message ${hasContent ? 'has-text' : ''}`}
          disabled={!hasContent || disabled || isUploading}
          title="Gửi"
        >
          {isUploading ? (
            <Loader2 size={16} className="spin-anim" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </form>
    </div>
  );
}
