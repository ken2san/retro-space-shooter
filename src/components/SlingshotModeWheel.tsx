import { useEffect, useState } from 'react';
import { SlingshotWallMode } from '../types';

interface ModeItem {
  mode: SlingshotWallMode;
  label: string;
  sublabel: string;
  color: string;
  icon: string;
}

const MODES: ModeItem[] = [
  { mode: 'OD_CHARGE', label: 'OVERDRIVE',  sublabel: 'Charge OD gauge',    color: '#ff3366', icon: '⚡' },
  { mode: 'HP_ABSORB', label: 'REPAIR',     sublabel: 'Restore integrity',   color: '#00ffcc', icon: '✦' },
];

type Props = {
  current: SlingshotWallMode;
  onSelect: (mode: SlingshotWallMode) => void;
  onClose: () => void;
};

export default function SlingshotModeWheel({ current, onSelect, onClose }: Props) {
  const [hovered, setHovered] = useState<SlingshotWallMode | null>(null);
  const n = MODES.length;
  const radius = 100;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Tab') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="relative"
        style={{ width: 280, height: 280 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Center node */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(0,0,0,0.7)',
            }}
          >
            <span className="text-[8px] text-white/40 font-black uppercase tracking-widest leading-tight text-center">WALL<br/>MODE</span>
          </div>
        </div>

        {/* Mode items arranged radially */}
        {MODES.map((m, i) => {
          const angle = (2 * Math.PI / n) * i - Math.PI / 2;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const isSelected = m.mode === current;
          const isHighlighted = m.mode === (hovered ?? current);

          return (
            <button
              key={m.mode}
              onMouseEnter={() => setHovered(m.mode)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => { onSelect(m.mode); onClose(); }}
              onTouchStart={(e) => { e.stopPropagation(); setHovered(m.mode); }}
              onTouchEnd={(e) => { e.preventDefault(); onSelect(m.mode); onClose(); }}
              className="absolute flex flex-col items-center gap-1.5"
              style={{
                left: `calc(50% + ${x}px - 44px)`,
                top: `calc(50% + ${y}px - 32px)`,
                width: 88,
                transform: isHighlighted ? 'scale(1.12)' : 'scale(1)',
                transition: 'transform 0.12s ease',
              }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                style={{
                  border: `2px solid ${m.color}`,
                  background: isHighlighted ? `${m.color}28` : 'rgba(0,0,0,0.6)',
                  boxShadow: isSelected ? `0 0 18px ${m.color}66, inset 0 0 8px ${m.color}22` : 'none',
                  transition: 'background 0.12s, box-shadow 0.12s',
                }}
              >
                <span style={{ filter: `drop-shadow(0 0 4px ${m.color})` }}>{m.icon}</span>
              </div>
              <div className="text-center">
                <div
                  className="text-[9px] font-black uppercase tracking-widest"
                  style={{ color: isHighlighted ? m.color : `${m.color}99` }}
                >
                  {m.label}
                </div>
                <div className="text-[7px] text-white/35">{m.sublabel}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="absolute bottom-10 text-center pointer-events-none">
        <span className="text-[8px] text-white/25 uppercase tracking-widest">[Tab] / [Esc] to close</span>
      </div>
    </div>
  );
}
