import React from 'react';

/**
 * Error Boundary - bắt lỗi React (như removeChild từ Chrome Translate)
 * để không unmount toàn bộ app và không disconnect WebSocket.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.warn('[ErrorBoundary] Caught error:', error?.message, info?.componentStack?.split('\n')[1]);
    // Tự recover sau 1 giây (reset error state)
    setTimeout(() => {
      this.setState({ hasError: false, error: null });
    }, 1000);
  }

  render() {
    if (this.state.hasError) {
      // Hiển thị nothing trong 1 giây rồi auto-recover
      return null;
    }
    return this.props.children;
  }
}

