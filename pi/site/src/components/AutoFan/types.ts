import type { AutoPatch, DeviceState } from '@/types';

export interface AutoFanProps {
  state: DeviceState | null;
  onAuto: (patch: AutoPatch) => void;
}
