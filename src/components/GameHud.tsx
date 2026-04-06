import { AnimatePresence, motion } from 'motion/react';
import { Zap } from 'lucide-react';

type GameHudProps = {
  level: number;
  xp: number;
  xpToNextLevel: number;
  sectorName: string;
  score: number;
  wingmanActive: boolean;
  integrity: number;
  overdrive: number;
  maxOverdrive: number;
  isOverdriveActive: boolean;
  stageProgress: number;
};

export default function GameHud({
  level,
  xp,
  xpToNextLevel,
  sectorName,
  score,
  wingmanActive,
  integrity,
  overdrive,
  maxOverdrive,
  isOverdriveActive,
  stageProgress,
}: GameHudProps) {
  return (
    <div className="w-full max-w-150 px-3 md:px-4 mb-2 md:mb-3 flex flex-col gap-1.5 md:gap-2 z-100 relative">
      <div className="w-full flex flex-col gap-1 mb-0.5 md:mb-1">
        <div className="flex justify-between items-end px-1">
          <div className="flex items-center gap-2">
            <span className="text-[8px] text-gray-500 font-black uppercase tracking-[0.2em]">Pilot Level</span>
            <span className="text-xs md:text-sm font-black text-[#00ffcc] drop-shadow-[0_0_8px_rgba(0,255,204,0.5)]">{level}</span>
          </div>
          <span className="text-[7px] text-gray-600 font-bold uppercase tracking-widest">{Math.floor(xp)} / {xpToNextLevel} XP</span>
        </div>
        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden border border-white/5 p-px">
          <motion.div
            animate={{ width: `${(xp / xpToNextLevel) * 100}%` }}
            className="h-full bg-[#00ffcc] shadow-[0_0_10px_rgba(0,255,204,0.8)] rounded-full"
          />
        </div>
      </div>

      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-[#00ffcc]/30 rounded-tl-md" />
      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-[#00ffcc]/30 rounded-tr-md" />
      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-[#00ffcc]/30 rounded-bl-md" />
      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-[#00ffcc]/30 rounded-br-md" />

      <div className="flex justify-between items-end">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-3 bg-[#00ffcc] rounded-full animate-pulse" />
            <span className="text-[10px] font-black text-[#00ffcc] uppercase tracking-[0.4em]">{sectorName}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-white tracking-tighter leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">
              {score.toLocaleString().padStart(8, '0')}
            </span>
            <span className="text-[8px] text-gray-600 font-bold uppercase tracking-widest">PTS</span>
          </div>
        </div>

        <AnimatePresence>
          {wingmanActive && (
            <motion.div
              key="wingman-indicator"
              initial={{ scale: 0, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0, opacity: 0, y: 10 }}
              className="absolute left-1/2 -translate-x-1/2 -top-6 flex items-center gap-2 px-3 py-1 bg-[#00ffcc]/10 border border-[#00ffcc]/40 rounded-full shadow-[0_0_20px_rgba(0,255,204,0.2)]"
            >
              <Zap className="w-3 h-3 text-[#00ffcc] fill-[#00ffcc] animate-pulse" />
              <span className="text-[9px] font-black text-[#00ffcc] uppercase tracking-widest">Dual Mode Active</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <span className="text-[8px] text-gray-500 uppercase tracking-widest font-black">Integrity</span>
            <div className="flex gap-1">
              {[...Array(10)].map((_, i) => (
                <motion.div
                  key={i}
                  animate={i < integrity / 10 ? { opacity: [0.7, 1, 0.7] } : {}}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }}
                  className={`w-2 h-1.5 rounded-sm transition-all duration-500 ${
                    i < integrity / 10
                      ? 'bg-[#00ffcc] shadow-[0_0_10px_rgba(0,255,204,0.8)]'
                      : 'bg-white/5 border border-white/10'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              {(() => {
                const odReady = overdrive >= maxOverdrive && !isOverdriveActive;
                const wallActive = overdrive >= 25 && !isOverdriveActive && !odReady;
                const label = isOverdriveActive ? 'Overdrive' : odReady ? 'OD Ready' : wallActive ? 'Wall Active' : 'Energy';
                const labelColor = isOverdriveActive ? 'text-[#ff3366]' : odReady ? 'text-[#ffcc00]' : wallActive ? 'text-[#00ffcc]' : 'text-[#ff8820]';
                const barColor = isOverdriveActive ? '#ff3366' : odReady ? undefined : wallActive ? '#00ffcc' : '#ff8820';
                const thresholdPct = (25 / maxOverdrive) * 100;
                return (
                  <>
                    <span className={`text-[8px] uppercase tracking-widest font-black transition-colors duration-300 ${labelColor}`}>{label}</span>
                    <div className="w-28 md:w-36 relative">
                      {/* Wall activation threshold marker */}
                      {!isOverdriveActive && (
                        <div
                          className="absolute -top-0.5 -bottom-0.5 w-px z-10 pointer-events-none"
                          style={{ left: `${thresholdPct}%`, backgroundColor: overdrive >= 25 ? 'rgba(0,255,204,0.5)' : 'rgba(255,255,255,0.35)' }}
                        />
                      )}
                      <div className="h-2.5 md:h-3 bg-black/40 rounded-full overflow-hidden border border-white/10 p-px">
                        <motion.div
                          animate={odReady
                            ? { width: '100%', backgroundColor: ['#ff3366', '#ff336633', '#ff3366'] }
                            : { width: `${(overdrive / maxOverdrive) * 100}%`, backgroundColor: barColor ?? '#ff3366' }
                          }
                          transition={odReady ? { duration: 0.5, repeat: Infinity } : { duration: 0.3 }}
                          className="h-full rounded-full shadow-[0_0_20px_rgba(255,51,102,0.6)]"
                        />
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full h-0.75 bg-white/5 relative overflow-hidden rounded-full mt-1">
        <motion.div
          animate={{ width: `${Math.max(0, Math.min(100, stageProgress * 100))}%` }}
          className="h-full bg-linear-to-r from-[#ff3366] via-[#ffcc00] to-[#ff3366] shadow-[0_0_15px_rgba(255,51,102,0.6)]"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[6px] text-white/40 font-bold uppercase tracking-[0.5em]">Sector_Progress</span>
        </div>
      </div>
    </div>
  );
}
