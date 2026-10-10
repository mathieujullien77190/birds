import type { DeviceState, PeltierMode } from '@/types';

export interface PeltierCardProps {
  state: DeviceState | null;
  /** `power` en pourcentage (0 à 60). */
  onCommand: (mode: PeltierMode, power: number) => void;
}
