import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import App from './App.jsx';

// ─── Fix: Chrome Translate gây removeChild crash ──────────────────────────
// Chrome Translate modifies DOM text nodes trực tiếp. Khi React cố sync
// virtual DOM → real DOM, nó gặp node đã bị Translate xóa/thay → crash.
// Giải pháp: patch Node.prototype.removeChild để bỏ qua lỗi "not a child".
const _removeChild = Node.prototype.removeChild;
Node.prototype.removeChild = function (child) {
  if (child && child.parentNode !== this) {
    // Chrome Translate đã move node này rồi – bỏ qua silently
    return child;
  }
  return _removeChild.call(this, child);
};

// Tương tự với insertBefore
const _insertBefore = Node.prototype.insertBefore;
Node.prototype.insertBefore = function (newNode, refNode) {
  if (refNode && refNode.parentNode !== this) {
    return newNode;
  }
  return _insertBefore.call(this, newNode, refNode);
};
// ──────────────────────────────────────────────────────────────────────────

import './index.css';
import './styles/index.css';
import './styles/layout.css';
import './styles/chat.css';
import './styles/friends.css';
import './styles/profile.css';
import './App.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <WebSocketProvider>
        <App />
      </WebSocketProvider>
    </AuthProvider>
  </StrictMode>
);
