import { usePersistentState } from '@/hooks';
import { NEST_DEFAULT, type NestParams } from '@/planks/model';
import { STORAGE } from '../constants';

const parseNest = (raw: string | null): NestParams => { try { return { ...NEST_DEFAULT, ...JSON.parse(raw ?? '{}') }; } catch { return NEST_DEFAULT; } };

/** Réglages du nichoir (panneau de gauche), gardés dans localStorage. */
export function useNestParams() {
  return usePersistentState<NestParams>(STORAGE.nest, parseNest);
}
