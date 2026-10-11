import type { AutoPatch, DeviceState } from '@/types';

export interface AutoPeltierProps {
  state: DeviceState | null;
  onAuto: (patch: AutoPatch) => void;
}
