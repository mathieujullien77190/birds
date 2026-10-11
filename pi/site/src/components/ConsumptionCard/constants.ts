import type { Consumption } from '@/types';

export const ITEMS: { key: keyof Consumption['detail']; label: string }[] = [
  { key: 'pi', label: 'Raspberry Pi' },
  { key: 'cameras', label: 'Caméras' },
  { key: 'led', label: 'LED infrarouges' },
  { key: 'ventilo', label: 'Ventilateur' },
];
