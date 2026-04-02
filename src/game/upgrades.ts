export type UpgradeOption = {
  id: string;
  label: string;
  desc: string;
};

export const LEVEL_UP_OPTIONS: UpgradeOption[] = [
  { id: 'FIREPOWER', label: 'Plasma Overclock', desc: 'Increase bullet damage and size.' },
  { id: 'SPEED', label: 'Engine Boost', desc: 'Increase movement speed and agility.' },
  { id: 'MAGNET', label: 'Scrap Magnet', desc: 'Increase scrap collection range.' },
  { id: 'CRIT', label: 'Critical Core', desc: '10% chance for double damage.' },
];

export const RELIC_OPTIONS: UpgradeOption[] = [
  { id: 'CHAIN', label: 'Tesla Arc', desc: 'Bullets jump between nearby enemies.' },
  { id: 'DRONE', label: 'Tactical Drone', desc: 'Deploy an orbiting support drone.' },
  { id: 'REGEN', label: 'Nano-Repair', desc: 'Slowly regenerate hull integrity.' },
  { id: 'SHIELD_REGEN', label: 'Aegis Protocol', desc: 'Absorbs one hit; recharges every 20s.' },
  { id: 'WINGMAN', label: 'Wingman Support', desc: 'Summon a combat support ship.' },
  { id: 'FRENZY', label: 'Overdrive Sync', desc: 'Overdrive lasts 50% longer.' },
  { id: 'CHRONO', label: 'Chrono-Trigger', desc: 'Chance to slow time on enemy kill.' },
  { id: 'EMP', label: 'EMP Burst', desc: 'Chance to stun enemies on hit.' },
  { id: 'FOLLOWER', label: 'Energy Follower', desc: 'Deploy a chain of defensive energy pods.' },
];

export const RELIC_LABELS: Record<string, string> = {
  CHAIN: 'Tesla Arc',
  DRONE: 'Tactical Drone',
  REGEN: 'Nano-Repair',
  SHIELD_REGEN: 'Aegis Protocol',
  WINGMAN: 'Wingman Support',
  FRENZY: 'Overdrive Sync',
  CHRONO: 'Chrono-Trigger',
  EMP: 'EMP Burst',
  FOLLOWER: 'Energy Follower',
};

export const pickRandomOptions = (options: UpgradeOption[], count: number): UpgradeOption[] => {
  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
};
