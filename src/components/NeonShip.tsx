import { memo } from 'react';

const NeonShip = memo(({ className = "", tension = 0 }: { className?: string, tension?: number }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="glow">
        <feGaussianBlur stdDeviation={2.5 + tension * 2} result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    {/* Wings - They 'flex' with tension */}
    <path
      d={`M50 20 L${85 + tension * 5} ${75 - tension * 5} L50 65 L${15 - tension * 5} ${75 - tension * 5} Z`}
      stroke="#00ffcc"
      strokeWidth={3 + tension}
      filter="url(#glow)"
      strokeLinejoin="round"
    />
    {/* Cockpit */}
    <path d="M50 35 L65 60 L50 55 L35 60 Z" stroke="#33ccff" strokeWidth="2" filter="url(#glow)" strokeLinejoin="round" />
    {/* Engine Glow */}
    <circle cx="50" cy="70" r={8 + tension * 10} fill={tension > 0.5 ? "#ffcc00" : "#ff3366"} filter="url(#glow)" opacity={0.6 + tension * 0.4}>
      <animate attributeName="r" values={`${8 + tension * 5};${12 + tension * 10};${8 + tension * 5}`} dur="0.2s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.4;0.8;0.4" dur="0.2s" repeatCount="indefinite" />
    </circle>
  </svg>
));

export default NeonShip;
