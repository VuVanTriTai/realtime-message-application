import React from 'react';

/**
 * Component vẽ chùm sáng đèn pin động (Dynamic Flashlight Beam)
 * Chiếu tia sáng hình nón từ vị trí đèn pin (source) đến vị trí mục tiêu (target)
 */
export default function FlashlightBeam({ source, target, isDark }) {
  if (!source || !target) return null;

  const sx = source.x;
  const sy = source.y;
  const tx = target.x;
  const ty = target.y;

  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 10) return null;

  // Vectơ đơn vị chỉ hướng từ nguồn tới đích
  const ux = dx / dist;
  const uy = dy / dist;

  // Vectơ pháp tuyến vuông góc để tạo độ mở rộng hình nón
  const nx = -uy;
  const ny = ux;

  // Bề rộng của đầu đèn pin và chùm sáng tại đích
  const beamWidth = Math.min(85, Math.max(45, dist * 0.28));
  const sourceWidth = 6;

  // 4 điểm tạo nên hình nón ánh sáng
  const p0x = sx + nx * sourceWidth;
  const p0y = sy + ny * sourceWidth;

  const p1x = tx + nx * beamWidth;
  const p1y = ty + ny * beamWidth;

  const p2x = tx - nx * beamWidth;
  const p2y = ty - ny * beamWidth;

  const p3x = sx - nx * sourceWidth;
  const p3y = sy - ny * sourceWidth;

  const polygonPoints = `${p0x},${p0y} ${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`;

  return (
    <svg className="dynamic-flashlight-svg" aria-hidden="true">
      <defs>
        {/* Gradient màu ánh sáng ấm của đèn pin */}
        <linearGradient id="beamGradient" x1={sx} y1={sy} x2={tx} y2={ty} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef08a" stopOpacity={isDark ? "0.85" : "0.55"} />
          <stop offset="20%" stopColor="#fde047" stopOpacity={isDark ? "0.45" : "0.3"} />
          <stop offset="70%" stopColor="#facc15" stopOpacity={isDark ? "0.2" : "0.12"} />
          <stop offset="100%" stopColor="#eab308" stopOpacity="0.02" />
        </linearGradient>

        {/* Đốm sáng rực rỡ tại điểm đến */}
        <radialGradient id="spotlightGlow" cx={tx} cy={ty} r={beamWidth * 1.2} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fef08a" stopOpacity={isDark ? "0.5" : "0.35"} />
          <stop offset="45%" stopColor="#fde047" stopOpacity={isDark ? "0.22" : "0.15"} />
          <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Tia sáng hình nón */}
      <polygon
        points={polygonPoints}
        fill="url(#beamGradient)"
        style={{ filter: 'blur(2.5px)' }}
      />

      {/* Đốm sáng tròn chiếu xuống đối tượng */}
      <circle
        cx={tx}
        cy={ty}
        r={beamWidth}
        fill="url(#spotlightGlow)"
        style={{ filter: 'blur(4px)' }}
      />

      {/* Ánh sáng lóe tại đầu đèn pin */}
      <circle
        cx={sx}
        cy={sy}
        r="7"
        fill="#fef08a"
        style={{ filter: 'blur(1.5px)', opacity: isDark ? 0.9 : 0.7 }}
      />
    </svg>
  );
}
