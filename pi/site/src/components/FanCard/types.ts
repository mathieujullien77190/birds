import type { AutoPatch, DeviceState } from '@/types';

export interface FanCardProps {
  state: DeviceState | null;
  /** `pourcent` : 0 = arrêt, sinon 30 à 100. */
  onFan: (pourcent: number) => void;
  onAuto: (patch: AutoPatch) => void;
}
