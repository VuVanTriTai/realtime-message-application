import React, { useEffect, useState } from 'react';

export default function OwlMascot({ isIlluminated, isDark, isTypingPassword }) {
  const [blinking, setBlinking] = useState(false);

  // Random blink effect
  useEffect(() => {
    const interval = setInterval(() => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 220);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`owl-wrapper ${isIlluminated ? 'illuminated' : ''} ${isDark ? 'night-owl' : 'day-owl'}`}>
      <div className="owl-spotlight-halo" />
      <svg
        className={`owl-svg ${isTypingPassword ? 'surprised' : ''} ${blinking ? 'blinking' : ''}`}
        viewBox="0 0 100 110"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="owlBodyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isDark ? "#8ba3b0" : "#a8bcc4"} />
            <stop offset="100%" stopColor={isDark ? "#586e7a" : "#728892"} />
          </linearGradient>

          <linearGradient id="owlBellyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isDark ? "#cad8df" : "#deeaee"} />
            <stop offset="100%" stopColor={isDark ? "#9bb0b9" : "#b5c9d1"} />
          </linearGradient>

          <filter id="owlGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Ear Tufts / Horns */}
        <path d="M22 36 L12 12 L36 28 Z" fill="url(#owlBodyGrad)" />
        <path d="M78 36 L88 12 L64 28 Z" fill="url(#owlBodyGrad)" />

        {/* Head & Body */}
        <ellipse cx="50" cy="58" rx="38" ry="42" fill="url(#owlBodyGrad)" />

        {/* Belly */}
        <ellipse cx="50" cy="68" rx="26" ry="28" fill="url(#owlBellyGrad)" />

        {/* Feather Patterns on Belly */}
        <path d="M42 62 Q50 67 58 62" stroke={isDark ? "#7a909b" : "#94a9b3"} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M38 72 Q50 78 62 72" stroke={isDark ? "#7a909b" : "#94a9b3"} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M44 82 Q50 87 56 82" stroke={isDark ? "#7a909b" : "#94a9b3"} strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* Eye Circles / Mask */}
        <circle cx="34" cy="46" r="16" fill={isDark ? "#2a3b45" : "#445963"} />
        <circle cx="66" cy="46" r="16" fill={isDark ? "#2a3b45" : "#445963"} />

        <circle cx="34" cy="46" r="13" fill="#ffffff" />
        <circle cx="66" cy="46" r="13" fill="#ffffff" />

        {/* Pupils */}
        {!blinking ? (
          <>
            <circle
              cx={isTypingPassword ? "35" : "34"}
              cy={isTypingPassword ? "48" : "46"}
              r={isIlluminated ? "9" : "7"}
              fill="#101920"
              className="owl-pupil"
            />
            <circle
              cx={isTypingPassword ? "67" : "66"}
              cy={isTypingPassword ? "48" : "46"}
              r={isIlluminated ? "9" : "7"}
              fill="#101920"
              className="owl-pupil"
            />
            {/* Eye Highlights */}
            <circle cx="31" cy="43" r="3" fill="#ffffff" />
            <circle cx="63" cy="43" r="3" fill="#ffffff" />
            <circle cx="36" cy="49" r="1.5" fill="#ffffff" />
            <circle cx="68" cy="49" r="1.5" fill="#ffffff" />
          </>
        ) : (
          /* Closed eyes / blink line */
          <>
            <path d="M22 46 Q34 52 46 46" stroke="#101920" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M54 46 Q66 52 78 46" stroke="#101920" strokeWidth="3" fill="none" strokeLinecap="round" />
          </>
        )}

        {/* Beak */}
        <polygon points="50,48 44,59 56,59" fill="#f59e0b" />

        {/* Little Claws */}
        <ellipse cx="40" cy="98" rx="6" ry="3" fill="#d97706" />
        <ellipse cx="60" cy="98" rx="6" ry="3" fill="#d97706" />
      </svg>
    </div>
  );
}
