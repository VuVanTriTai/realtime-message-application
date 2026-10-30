import React from 'react';

export default function MountainLandscape({ isDark }) {
  return (
    <div className={`landscape-panel ${isDark ? 'night' : 'day'}`}>
      <div className="sky-overlay" />
      
      {/* Stars in Night Mode */}
      {isDark && (
        <div className="stars-container">
          <span className="star s1" />
          <span className="star s2" />
          <span className="star s3" />
          <span className="star s4" />
          <span className="star s5" />
          <span className="star s6" />
          <span className="star s7" />
          <span className="star s8" />
        </div>
      )}

      {/* Celestial Body: Sun or Moon */}
      <div className={`celestial-body ${isDark ? 'moon' : 'sun'}`}>
        {isDark ? (
          <div className="moon-details">
            <span className="crater c1" />
            <span className="crater c2" />
            <span className="crater c3" />
          </div>
        ) : (
          <div className="sun-glow" />
        )}
      </div>

      {/* SVG Layered Mountains & Pine Forests */}
      <svg
        className="mountains-svg"
        viewBox="0 0 400 450"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Day Gradients */}
          <linearGradient id="daySky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c5d8dc" />
            <stop offset="60%" stopColor="#9fb9c2" />
            <stop offset="100%" stopColor="#7899a4" />
          </linearGradient>
          <linearGradient id="dayMountainBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b3cacf" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#75939c" />
          </linearGradient>
          <linearGradient id="dayMountainMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#67868f" />
            <stop offset="100%" stopColor="#43636c" />
          </linearGradient>
          <linearGradient id="dayMountainFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#37555e" />
            <stop offset="100%" stopColor="#223a41" />
          </linearGradient>
          <linearGradient id="dayWater" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2c474f" />
            <stop offset="100%" stopColor="#1e343b" />
          </linearGradient>

          {/* Night Gradients */}
          <linearGradient id="nightSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#101923" />
            <stop offset="60%" stopColor="#0b131a" />
            <stop offset="100%" stopColor="#070c10" />
          </linearGradient>
          <linearGradient id="nightMountainBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#253545" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#172430" />
          </linearGradient>
          <linearGradient id="nightMountainMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#17232e" />
            <stop offset="100%" stopColor="#0e171f" />
          </linearGradient>
          <linearGradient id="nightMountainFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d141b" />
            <stop offset="100%" stopColor="#06090d" />
          </linearGradient>
          <linearGradient id="nightWater" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a1017" />
            <stop offset="100%" stopColor="#05070a" />
          </linearGradient>
        </defs>

        {/* Back Mountain Ridge */}
        <path
          d="M0 240 L70 160 L140 210 L230 130 L320 220 L400 170 L400 450 L0 450 Z"
          fill={isDark ? "url(#nightMountainBack)" : "url(#dayMountainBack)"}
        />

        {/* Mid Mountain Ridge */}
        <path
          d="M0 280 L90 210 L180 270 L280 190 L360 250 L400 220 L400 450 L0 450 Z"
          fill={isDark ? "url(#nightMountainMid)" : "url(#dayMountainMid)"}
        />

        {/* Pine Trees on Mid Ridge */}
        <g fill={isDark ? "#121d26" : "#405b63"}>
          {/* Left Pines */}
          <polygon points="25,245 32,265 18,265" />
          <polygon points="25,240 30,253 20,253" />
          <polygon points="40,240 48,268 32,268" />
          <polygon points="40,235 46,252 34,252" />
          <polygon points="55,250 62,270 48,270" />

          {/* Right Pines */}
          <polygon points="340,235 348,265 332,265" />
          <polygon points="340,230 346,250 334,250" />
          <polygon points="360,225 369,260 351,260" />
          <polygon points="378,230 386,262 370,262" />
        </g>

        {/* Foreground Mountain / Riverbank */}
        <path
          d="M0 320 C100 310, 150 330, 240 310 C320 295, 360 315, 400 305 L400 450 L0 450 Z"
          fill={isDark ? "url(#nightMountainFront)" : "url(#dayMountainFront)"}
        />

        {/* Water Lake Base */}
        <path
          d="M0 370 Q200 360 400 370 L400 450 L0 450 Z"
          fill={isDark ? "url(#nightWater)" : "url(#dayWater)"}
        />

        {/* Water Ripple Reflections */}
        <ellipse cx="200" cy="385" rx="90" ry="1.5" fill={isDark ? "#283b4d" : "#7ea0a9"} opacity="0.4" />
        <ellipse cx="160" cy="400" rx="120" ry="2" fill={isDark ? "#1f3040" : "#6c8e98"} opacity="0.3" />
        <ellipse cx="230" cy="415" rx="70" ry="1" fill={isDark ? "#1f3040" : "#6c8e98"} opacity="0.25" />
      </svg>

      {/* Atmospheric Mist layer */}
      <div className="mist-layer" />

      {/* Title & Slogan at Bottom */}
      <div className="landscape-content">
        <h2 className="landscape-title">EchoWave Chat</h2>
        <p className="landscape-desc">
          Kết nối và trò chuyện thời gian thực cùng bạn bè, đội ngũ và cộng đồng.
        </p>
      </div>
    </div>
  );
}
