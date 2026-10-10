import type { DeviceState } from '@/types';

export interface HeaderProps {
  state: DeviceState | null;
  /** Vrai quand la dernière lecture a échoué. */
  unreachable: boolean;
}
