import { usePersistentState } from '@/hooks';
import { STORAGE } from '../constants';
import type { DrawerId } from '../types';

/** Volet ouvert du panneau de droite (un seul à la fois, ou aucun), gardé dans localStorage. */
export function useDrawer() {
  return usePersistentState<DrawerId | null>(STORAGE.drawer, (raw) => (raw as DrawerId | null) ?? 'pieces', (v) => v ?? '');
}
