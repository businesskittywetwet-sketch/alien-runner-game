import type { ReactNode } from 'react';

/** Flat, solid-colour illustrations used by the tutorial. */
function Frame({ children, bg = '#10101a' }: { children: ReactNode; bg?: string }) {
  return (
    <svg viewBox="0 0 120 84" className="h-full w-full" role="img">
      <rect width="120" height="84" rx="10" fill={bg} />
      <rect y="70" width="120" height="14" fill="#23232f" />
      <rect y="70" width="120" height="2" fill="#3a3a4c" />
      {children}
    </svg>
  );
}

export const CarIcon = () => (
  <Frame>
    <rect x="12" y="44" width="96" height="22" rx="6" fill="#b3382c" />
    <path d="M30 44 L43 27 H82 L94 44 Z" fill="#8e2a22" />
    <path d="M46 30 H62 V44 H37 Z" fill="#7fd0ff" />
    <path d="M66 30 H79 L88 44 H66 Z" fill="#7fd0ff" />
    <path d="M52 30 L58 44 M70 36 L80 33" stroke="#10101a" strokeWidth="1.5" />
    <circle cx="34" cy="67" r="9" fill="#0a0a0a" />
    <circle cx="34" cy="67" r="4" fill="#9aa3ad" />
    <circle cx="86" cy="67" r="9" fill="#0a0a0a" />
    <circle cx="86" cy="67" r="4" fill="#9aa3ad" />
    <path d="M100 40 q4 -8 -2 -14 q8 2 6 12" fill="#ff7a1a" />
  </Frame>
);

export const BarrierIcon = () => (
  <Frame>
    <path d="M22 70 L32 36 H88 L98 70 Z" fill="#9aa0a6" />
    <path d="M30 70 L38 46 H82 L90 70 Z" fill="#b8bec4" />
    {[0, 1, 2, 3].map((i) => (
      <path key={i} d={`M${34 + i * 15} 36 h8 l-6 10 h-8 z`} fill={i % 2 ? '#1a1a1a' : '#ffc400'} />
    ))}
    <rect x="20" y="68" width="80" height="3" fill="#7c8288" />
  </Frame>
);

export const GapIcon = () => (
  <Frame>
    <rect x="0" y="62" width="38" height="10" fill="#3a3a4c" />
    <rect x="82" y="62" width="38" height="10" fill="#3a3a4c" />
    <rect x="38" y="62" width="44" height="22" fill="#020205" />
    <path d="M44 84 q4 -14 8 -4 q4 -16 8 -2 q4 -14 8 -2 q4 -12 8 0 v8 h-32 z" fill="#ff5a1a" />
    <path d="M52 84 q3 -8 6 -2 q3 -9 6 -1 v3 h-12 z" fill="#ffc400" />
    <path d="M30 56 q30 -26 60 0" stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeDasharray="4 4" />
    <path d="M86 52 l6 5 l-8 1 z" fill="#22d3ee" />
  </Frame>
);

export const BillboardIcon = () => (
  <Frame>
    <rect x="12" y="8" width="5" height="62" fill="#4a505c" />
    <rect x="103" y="8" width="5" height="62" fill="#4a505c" />
    <rect x="10" y="8" width="100" height="5" fill="#4a505c" />
    <rect x="16" y="18" width="88" height="26" rx="3" fill="#14161f" stroke="#ff3da5" strokeWidth="3" />
    <text x="60" y="37" textAnchor="middle" fontSize="16" fontWeight="900" fill="#ff3da5" fontFamily="Arial Black, Arial, sans-serif">
      BAR
    </text>
    <path d="M30 64 H90" stroke="#fb923c" strokeWidth="3" strokeDasharray="5 4" />
    <path d="M86 58 l8 6 l-8 6 z" fill="#fb923c" />
  </Frame>
);

export const ScaffoldIcon = () => (
  <Frame>
    {[16, 104].map((x) => (
      <rect key={x} x={x - 2} y="12" width="4" height="58" fill="#8d949e" />
    ))}
    <rect x="12" y="14" width="96" height="6" fill="#b08a4a" />
    <rect x="14" y="30" width="92" height="3" fill="#8d949e" />
    <path d="M16 70 L104 14 M104 70 L16 14" stroke="#6a717b" strokeWidth="2" />
    <rect x="14" y="30" width="92" height="4" fill="#ffc400" />
    <path d="M30 64 H90" stroke="#fb923c" strokeWidth="3" strokeDasharray="5 4" />
    <path d="M86 58 l8 6 l-8 6 z" fill="#fb923c" />
  </Frame>
);

export const DroneIcon = () => (
  <Frame>
    <ellipse cx="60" cy="40" rx="24" ry="11" fill="#2a2d3a" />
    <ellipse cx="60" cy="40" rx="30" ry="6" fill="none" stroke="#ff4d6d" strokeWidth="3" />
    <circle cx="60" cy="44" r="5" fill="#ff4d6d" />
    <circle cx="60" cy="44" r="9" fill="#5a1f32" />
    <rect x="34" y="24" width="3" height="8" fill="#2a2d3a" />
    <rect x="83" y="24" width="3" height="8" fill="#2a2d3a" />
    <ellipse cx="60" cy="68" rx="18" ry="2.5" fill="#15151f" />
    <path d="M30 64 H90" stroke="#fb923c" strokeWidth="3" strokeDasharray="5 4" />
  </Frame>
);

export const BulletsIcon = () => (
  <Frame>
    {[30, 44, 56].map((y, i) => (
      <g key={y}>
        <line x1={20 + i * 8} y1={y} x2={78 + i * 8} y2={y} stroke="#ffd54f" strokeWidth="3" strokeLinecap="round" />
        <circle cx={82 + i * 8} cy={y} r="4.5" fill="#fff6c8" />
      </g>
    ))}
    <rect x="12" y="66" width="30" height="4" fill="#fb923c" />
    <path d="M30 64 H90" stroke="#fb923c" strokeWidth="3" strokeDasharray="5 4" />
  </Frame>
);

/** A little runner figure: pose = run | jump | slide */
export function Runner({ pose }: { pose: 'jump' | 'slide' | 'run' }) {
  const skin = '#e0b090';
  const suit = '#3b5b8a';
  return (
    <svg viewBox="0 0 120 84" className="h-full w-full" role="img">
      <rect width="120" height="84" rx="10" fill="#10101a" />
      <rect y="70" width="120" height="14" fill="#23232f" />
      <rect y="70" width="120" height="2" fill="#3a3a4c" />
      {pose === 'jump' && (
        <g>
          <ellipse cx="60" cy="70" rx="12" ry="2" fill="#15151f" />
          <circle cx="62" cy="14" r="7" fill={skin} />
          <rect x="55" y="21" width="14" height="22" rx="4" fill={suit} />
          <path d="M56 24 L44 18 M68 24 L80 16" stroke={suit} strokeWidth="5" strokeLinecap="round" />
          <path d="M58 42 L48 54 L40 50 M66 42 L74 52 L84 50" stroke="#1d2b44" strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M16 46 l14 -14 l14 14 M30 32 V62" stroke="#34d399" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {pose === 'slide' && (
        <g>
          <circle cx="40" cy="48" r="7" fill={skin} />
          <path d="M44 54 L70 62" stroke={suit} strokeWidth="14" strokeLinecap="round" />
          <path d="M70 62 L100 64" stroke="#1d2b44" strokeWidth="9" strokeLinecap="round" />
          <path d="M46 52 L62 50" stroke={suit} strokeWidth="5" strokeLinecap="round" />
          <path d="M84 18 V44 M72 34 l12 14 l12 -14" stroke="#fb923c" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 70 q10 -4 22 0" stroke="#9aa3ad" strokeWidth="2" fill="none" />
        </g>
      )}
      {pose === 'run' && (
        <g>
          <circle cx="60" cy="18" r="7" fill={skin} />
          <rect x="53" y="25" width="14" height="22" rx="4" fill={suit} />
          <path d="M54 46 L48 66 M66 46 L76 62" stroke="#1d2b44" strokeWidth="6" strokeLinecap="round" />
          <path d="M56 28 L70 36" stroke={suit} strokeWidth="5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

/** Four-lane road with a runner moving exactly ONE lane. */
export function LaneDiagram() {
  const lane = (i: number) => 18 + i * 28;
  return (
    <svg viewBox="0 0 140 96" className="h-full w-full" role="img">
      <rect width="140" height="96" rx="10" fill="#10101a" />
      <rect x="4" y="4" width="132" height="88" rx="6" fill="#23232f" />
      {[1, 2, 3].map((i) => (
        <line key={i} x1={4 + i * 33} y1="6" x2={4 + i * 33} y2="90" stroke="#5a5a70" strokeWidth="1.5" strokeDasharray="6 5" />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <text key={i} x={lane(i) - 4 + (i === 3 ? 2 : 0)} y="16" fontSize="9" fontWeight="700" fill="#94a3b8" fontFamily="Arial, sans-serif">
          {i + 1}
        </text>
      ))}
      <circle cx={lane(1) + 2} cy="64" r="9" fill="#3b5b8a" stroke="#fff" strokeWidth="2" />
      <circle cx={lane(2) + 2} cy="64" r="9" fill="none" stroke="#22d3ee" strokeWidth="2" strokeDasharray="3 3" />
      <path d={`M${lane(1) + 14} 64 H${lane(2) - 10}`} stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" />
      <path d={`M${lane(2) - 14} 58 l8 6 l-8 6 z`} fill="#22d3ee" />
      <text x="70" y="88" textAnchor="middle" fontSize="8" fontWeight="800" fill="#fbbf24" fontFamily="Arial, sans-serif">
        1 SWIPE = 1 LANE
      </text>
    </svg>
  );
}

export function SwipeHand({ dir }: { dir: 'left' | 'right' | 'up' | 'down' }) {
  const rot = { right: 0, down: 90, left: 180, up: 270 }[dir];
  return (
    <svg viewBox="0 0 60 60" className="h-full w-full" role="img">
      <circle cx="30" cy="30" r="29" fill="#1a1a24" stroke="#34344a" strokeWidth="2" />
      <g transform={`rotate(${rot} 30 30)`}>
        <path d="M14 30 H44" stroke="#22d3ee" strokeWidth="5" strokeLinecap="round" />
        <path d="M34 18 L46 30 L34 42" stroke="#22d3ee" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="30" r="5" fill="#fff" />
      </g>
    </svg>
  );
}

export function TapIcon() {
  return (
    <svg viewBox="0 0 120 84" className="h-full w-full" role="img">
      <rect width="120" height="84" rx="10" fill="#10101a" />
      <circle cx="60" cy="40" r="30" fill="none" stroke="#fb923c" strokeWidth="3" strokeDasharray="5 5" />
      <circle cx="60" cy="40" r="18" fill="none" stroke="#fb923c" strokeWidth="3" />
      <circle cx="60" cy="40" r="7" fill="#fff" />
      <path d="M60 46 V74 l8 -6 l6 12" stroke="none" fill="none" />
      <g stroke="#ffd54f" strokeWidth="3" strokeLinecap="round">
        <line x1="96" y1="22" x2="112" y2="18" />
        <line x1="98" y1="40" x2="116" y2="40" />
        <line x1="96" y1="58" x2="112" y2="62" />
      </g>
    </svg>
  );
}
