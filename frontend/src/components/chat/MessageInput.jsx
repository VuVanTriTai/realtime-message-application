import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Smile } from 'lucide-react';

const COMMON_EMOJIS = [
  '😊','😂','❤️','👍','🔥','🎉','👋','😎',
  '🙌','✨','🤔','💯','😍','🥰','😁','🤣',
  '💪','🎯','⚡','🚀','💬','🎊','🌟','😭',
];

export default function MessageInput({ onSendMessage, onTyping, disabled = false }) {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const typingTimeoutRef = useRef(null);
  const isTypingActiveRef = useRef(false);
  const inputRef = useRef(null);
  const pickerRef = useRef(null);

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

  const handleSend = useCallback((e) => {
    if (e) e.preventDefault();
    if (!text.trim() || disabled) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingActiveRef.current) {
      isTypingActiveRef.current = false;
      if (onTyping) onTyping(false);
    }

    onSendMessage(text.trim());
    setText('');
    setShowEmojiPicker(false);
    if (inputRef.current) inputRef.current.focus();
  }, [text, disabled, onSendMessage, onTyping]);

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

  const hasText = text.trim().length > 0;

  return (
    <div className="message-input-container" translate="no">
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

      <form onSubmit={handleSend} className="message-input-form">
        <button
          type="button"
          className={`input-action-btn ${showEmojiPicker ? 'active' : ''}`}
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          title="Emoji"
        >
          <Smile size={20} />
        </button>

        <input
          ref={inputRef}
          id="msg-input"
          type="text"
          className="chat-text-input"
          placeholder="Nhập tin nhắn..."
          value={text}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          translate="no"
        />

        <button
          id="btn-send-msg"
          type="submit"
          className={`btn-send-message ${hasText ? 'has-text' : ''}`}
          disabled={!hasText || disabled}
          title="Gửi"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
