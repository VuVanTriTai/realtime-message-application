import React from 'react';

const PALETTE = [
  '#0084ff', '#a855f7', '#10b981', '#f59e0b',
  '#ef4444', '#06b6d4', '#ec4899', '#8b5cf6',
];

function getColor(name) {
  if (!name) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function Avatar({
  name,
  src,
  size = 'md',
  isOnline,
  showStatus = false,
  className = '',
}) {
  const color = getColor(name);
  const initials = getInitials(name);

  return (
    <div className={`avatar-wrapper avatar-${size} ${className}`}>
      {src ? (
        <img src={src} alt={name} className="avatar-img" />
      ) : (
        <div
          className="avatar-placeholder"
          style={{ background: `linear-gradient(135deg, ${color}cc 0%, ${color} 100%)` }}
          aria-label={name}
        >
          {initials}
        </div>
      )}
      {showStatus && (
        <span className={`status-dot ${isOnline ? 'status-online' : 'status-offline'}`} />
      )}
    </div>
  );
}
