import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

// --- SVG Diagrams ---

// Ship shape reused across diagrams
const ShipPath = ({ x, y, scale = 1, color = '#00ffcc' }: { x: number; y: number; scale?: number; color?: string }) => (
  <g transform={`translate(${x},${y}) scale(${scale})`}>
    <polygon points="0,-12 8,8 0,4 -8,8" fill={color} opacity={0.9} />
    <polygon points="0,-12 8,8 0,4 -8,8" fill="none" stroke={color} strokeWidth="1" />
  </g>
);

const DiagramMove = ({ isMobile }: { isMobile: boolean }) => (
  <svg viewBox="0 0 200 90" className="w-full h-20">
    {/* dashed trail path */}
    <path d="M 40 60 Q 80 20 140 45" stroke="#00ffcc" strokeWidth="1" strokeDasharray="4 3" fill="none" opacity={0.4} />
    {/* ship */}
    <ShipPath x={140} y={45} />
    {/* auto bullets */}
    <line x1={140} y1={30} x2={140} y2={10} stroke="#ffff66" strokeWidth="1.5" opacity={0.7} />
    <line x1={136} y1={30} x2={134} y2={10} stroke="#ffff66" strokeWidth="1.5" opacity={0.5} />
    <line x1={144} y1={30} x2={146} y2={10} stroke="#ffff66" strokeWidth="1.5" opacity={0.5} />
    {/* input indicator */}
    {isMobile ? (
      <>
        <circle cx="60" cy="55" r="10" fill="none" stroke="#ffffff" strokeWidth="1" opacity={0.5} />
        <circle cx="60" cy="55" r="3" fill="#ffffff" opacity={0.6} />
        {/* drag arrow */}
        <path d="M 75 50 L 115 38" stroke="#ffffff" strokeWidth="1" strokeDasharray="3 2" opacity={0.4} markerEnd="url(#arr)" />
      </>
    ) : (
      <>
        {/* mouse icon */}
        <rect x="52" y="42" width="14" height="20" rx="7" fill="none" stroke="#ffffff" strokeWidth="1" opacity={0.5} />
        <line x1="59" y1="42" x2="59" y2="52" stroke="#ffffff" strokeWidth="1" opacity={0.4} />
        <path d="M 72 48 L 110 40" stroke="#ffffff" strokeWidth="1" strokeDasharray="3 2" opacity={0.4} markerEnd="url(#arr)" />
      </>
    )}
    <defs>
      <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="#ffffff" opacity={0.5} />
      </marker>
    </defs>
  </svg>
);

const DiagramSlingshot = ({ isMobile }: { isMobile: boolean }) => (
  <svg viewBox="0 0 200 90" className="w-full h-20">
    {/* anchor point */}
    <circle cx="100" cy="65" r="3" fill="#00ffcc" opacity={0.5} />
    {/* pull rubber band lines */}
    <line x1="100" y1="65" x2="72" y2="50" stroke="#00ffcc" strokeWidth="1.5" opacity={0.5} />
    <line x1="100" y1="65" x2="72" y2="80" stroke="#00ffcc" strokeWidth="1.5" opacity={0.5} />
    {/* ship at pull position */}
    <ShipPath x={66} y={65} scale={0.9} color="#00ffcc" />
    {/* pull arrow */}
    <path d="M 56 65 L 38 65" stroke="#ffffff" strokeWidth="1" opacity={0.4} markerEnd="url(#arrl)" />
    {/* snap trajectory */}
    <path d="M 100 65 Q 130 40 160 20" stroke="#00ffcc" strokeWidth="1.5" strokeDasharray="5 3" fill="none" opacity={0.7} />
    {/* landed ship */}
    <ShipPath x={160} y={20} color="#ffffff" />
    {/* tier badges */}
    <text x="118" y="44" fontSize="7" fill="#00ffcc" opacity={0.7} fontFamily="monospace">T1</text>
    <text x="136" y="32" fontSize="7" fill="#00ffcc" opacity={0.8} fontFamily="monospace">T2</text>
    <text x="152" y="22" fontSize="7" fill="#00ffcc" opacity={0.9} fontFamily="monospace">T3</text>
    {/* input label */}
    {isMobile ? (
      <text x="28" y="62" fontSize="7" fill="#ffffff" opacity={0.5} fontFamily="monospace">2×tap+drag</text>
    ) : (
      <text x="28" y="62" fontSize="7" fill="#ffffff" opacity={0.5} fontFamily="monospace">Ctrl+drag</text>
    )}
    <defs>
      <marker id="arrl" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="#ffffff" opacity={0.5} />
      </marker>
    </defs>
  </svg>
);

const DiagramEnergyWall = () => (
  <svg viewBox="0 0 200 90" className="w-full h-20">
    {/* shield arc */}
    <path
      d="M 86 30 A 40 40 0 0 1 114 30"
      stroke="#00ffcc" strokeWidth="6" fill="none" opacity={0.7}
      strokeLinecap="round"
    />
    <path
      d="M 86 30 A 40 40 0 0 1 114 30"
      stroke="#00ffcc" strokeWidth="12" fill="none" opacity={0.15}
      strokeLinecap="round"
    />
    {/* ship */}
    <ShipPath x={100} y={58} />
    {/* incoming bullets */}
    <circle cx="60" cy="22" r="3" fill="#ff3366" opacity={0.8} />
    <circle cx="80" cy="10" r="3" fill="#ff3366" opacity={0.8} />
    <circle cx="120" cy="10" r="3" fill="#ff3366" opacity={0.8} />
    <circle cx="140" cy="22" r="3" fill="#ff3366" opacity={0.8} />
    {/* bullet trail arrows toward shield */}
    <path d="M60 22 L78 28" stroke="#ff3366" strokeWidth="1" opacity={0.5} markerEnd="url(#arrb)" />
    <path d="M80 10 L90 24" stroke="#ff3366" strokeWidth="1" opacity={0.5} markerEnd="url(#arrb)" />
    <path d="M120 10 L110 24" stroke="#ff3366" strokeWidth="1" opacity={0.5} markerEnd="url(#arrb)" />
    <path d="M140 22 L122 28" stroke="#ff3366" strokeWidth="1" opacity={0.5} markerEnd="url(#arrb)" />
    {/* absorbed flash */}
    <circle cx="88" cy="28" r="5" fill="#ffcc00" opacity={0.5} />
    <circle cx="112" cy="28" r="5" fill="#ffcc00" opacity={0.5} />
    {/* OD gauge */}
    <rect x="60" y="76" width="80" height="6" fill="none" stroke="#00ffcc" strokeWidth="1" opacity={0.5} />
    <rect x="60" y="76" width="52" height="6" fill="#00ffcc" opacity={0.5} />
    <text x="146" y="82" fontSize="7" fill="#00ffcc" opacity={0.7} fontFamily="monospace">OD</text>
    <defs>
      <marker id="arrb" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="#ff3366" opacity={0.6} />
      </marker>
    </defs>
  </svg>
);

const DiagramOverdrive = () => (
  <svg viewBox="0 0 200 90" className="w-full h-20">
    {/* full OD gauge */}
    <rect x="30" y="70" width="140" height="7" fill="none" stroke="#00ffcc" strokeWidth="1" opacity={0.6} />
    <rect x="30" y="70" width="140" height="7" fill="#00ffcc" opacity={0.6} />
    <text x="174" y="77" fontSize="7" fill="#00ffcc" opacity={0.9} fontFamily="monospace">FULL</text>
    {/* ship with glow */}
    <circle cx="100" cy="44" r="22" fill="#00ffcc" opacity={0.08} />
    <circle cx="100" cy="44" r="16" fill="#00ffcc" opacity={0.1} />
    <ShipPath x={100} y={44} scale={1.3} color="#ffffff" />
    {/* burst rays */}
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
      const rad = (deg * Math.PI) / 180;
      const x2 = 100 + Math.cos(rad) * 32;
      const y2 = 44 + Math.sin(rad) * 32;
      return <line key={i} x1={100} y1={44} x2={x2} y2={y2} stroke="#00ffcc" strokeWidth="1.5" opacity={0.4} />;
    })}
    {/* rapid bullets */}
    <line x1="97" y1="25" x2="97" y2="8" stroke="#ffff66" strokeWidth="2" opacity={0.9} />
    <line x1="103" y1="25" x2="103" y2="8" stroke="#ffff66" strokeWidth="2" opacity={0.9} />
    <line x1="94" y1="20" x2="94" y2="4" stroke="#ffff66" strokeWidth="1.5" opacity={0.6} />
    <line x1="106" y1="20" x2="106" y2="4" stroke="#ffff66" strokeWidth="1.5" opacity={0.6} />
    {/* label */}
    <text x="66" y="88" fontSize="7" fill="#00ffcc" opacity={0.8} fontFamily="monospace" letterSpacing="2">OVERDRIVE</text>
  </svg>
);

// --- Slide Definitions ---

type SlideRaw = {
  title: string;
  diagram: (isMobile: boolean) => React.ReactNode;
  body: (isMobile: boolean) => string;
  hint?: (isMobile: boolean) => string;
};

const SLIDES_RAW: SlideRaw[] = [
  {
    title: 'MOVE',
    diagram: (isMobile) => <DiagramMove isMobile={isMobile} />,
    body: (isMobile) =>
      isMobile ? 'Drag to move. Auto-fire is always on.' : 'Move mouse to move. Auto-fire is always on.',
    hint: (isMobile) => isMobile ? 'Ship follows your finger with inertia.' : 'Ship follows with inertia — lead your target.',
  },
  {
    title: 'SLINGSHOT',
    diagram: (isMobile) => <DiagramSlingshot isMobile={isMobile} />,
    body: (isMobile) =>
      isMobile
        ? 'Double-tap then drag to charge. Pull further = bigger snap.'
        : 'Hold Ctrl + drag to charge. Pull further = bigger snap.',
    hint: () => 'Tier 1–4: pull distance = jump range.',
  },
  {
    title: 'ENERGY WALL',
    diagram: () => <DiagramEnergyWall />,
    body: () => 'Shield arc absorbs enemy bullets → charges Overdrive gauge.',
    hint: (isMobile: boolean) => isMobile
      ? 'Two-finger tap triggers OD manually when full.'
      : 'Hold and absorb as many bullets as you can before releasing.',
  },
  {
    title: 'OVERDRIVE',
    diagram: () => <DiagramOverdrive />,
    body: () => 'OD full → next absorbed bullet triggers OVERDRIVE: rapid fire + speed boost + bigger explosions.',
    hint: () => 'FRENZY relic: 6s → 9s.',
  },
];

interface Props {
  isTouchDevice: boolean;
  onClose: () => void;
}

export default function TutorialOverlay({ isTouchDevice, onClose }: Props) {
  const [page, setPage] = useState(0);
  const slide = SLIDES_RAW[page];
  const isLast = page === SLIDES_RAW.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-200 flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-sm mx-6 bg-[#080c10] border border-[#00ffcc]/30 shadow-[0_0_60px_rgba(0,255,204,0.12)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Corner accents */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#00ffcc]" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#00ffcc]" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#00ffcc]" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#00ffcc]" />

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-white transition-colors"
        >
          <X size={16} />
        </button>

        {/* Header label */}
        <div className="px-8 pt-7 pb-0">
          <span className="text-[7px] uppercase tracking-[0.8em] font-black text-[#00ffcc]/50">
            HOW_TO_PLAY — {page + 1}/{SLIDES_RAW.length}
          </span>
        </div>

        {/* Slide content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.2 }}
            className="px-8 pt-4 pb-4"
          >
            {/* Diagram */}
            <div className="bg-[#050810] border border-[#00ffcc]/10 rounded mb-4 py-2 px-2">
              {slide.diagram(isTouchDevice)}
            </div>
            <h2 className="text-xl font-black tracking-[0.25em] text-white mb-2">
              {slide.title}
            </h2>
            <p className="text-sm text-gray-300 leading-relaxed mb-4">
              {slide.body(isTouchDevice)}
            </p>
            {slide.hint && (
              <p className="text-[11px] text-[#00ffcc]/60 font-mono border-l-2 border-[#00ffcc]/30 pl-3">
                {slide.hint(isTouchDevice)}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 pb-2">
          {SLIDES_RAW.map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                i === page
                  ? 'bg-[#00ffcc] shadow-[0_0_6px_#00ffcc]'
                  : 'bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-8 pb-7 pt-3 border-t border-white/5">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 text-[10px] uppercase tracking-[0.4em] font-black text-gray-600 hover:text-white transition-colors disabled:opacity-20 disabled:pointer-events-none"
          >
            <ChevronLeft size={12} /> Prev
          </button>

          {isLast ? (
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-6 py-2 border border-[#00ffcc] text-[#00ffcc] text-[10px] uppercase tracking-[0.5em] font-black hover:bg-[#00ffcc] hover:text-black transition-all duration-300"
            >
              Engage
            </button>
          ) : (
            <button
              onClick={() => setPage(p => Math.min(SLIDES_RAW.length - 1, p + 1))}
              className="flex items-center gap-1 text-[10px] uppercase tracking-[0.4em] font-black text-[#00ffcc] hover:text-white transition-colors"
            >
              Next <ChevronRight size={12} />
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
