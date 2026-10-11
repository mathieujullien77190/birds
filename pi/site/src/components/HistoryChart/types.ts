import type { HistoryPoint } from '@/types';

export interface HistoryChartProps {
  /** Les points de GET /api/historique, du plus ancien au plus récent. */
  points: HistoryPoint[];
}
