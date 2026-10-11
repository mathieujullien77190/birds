import { type PlankScene } from './types';
import { DEFAULT_SCENE } from './constants';
import { toZUp } from './geometry/transform';

const KEY = 'plaques-scene';
export function loadScene(): PlankScene {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? '') as PlankScene; if (s && Array.isArray(s.planks)) return toZUp({ ...s, fit: 0, planks: s.planks.map((p) => ({ ...p, notches: p.notches ?? [], holes: p.holes ?? [] })) }); } catch { /* rien */ } // fit : toujours 0 (le réglage n'existe plus) ; anciennes scènes converties en Z = hauteur
  return DEFAULT_SCENE;
}
export function saveScene(s: PlankScene): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ } }

const HKEY = 'plaques-historique';
/** L'ancien historique « Retour » enregistré (retiré : il saturait le stockage du navigateur) est effacé au démarrage. */
export function forgetHistory(): void { try { localStorage.removeItem(HKEY); } catch { /* rien */ } }
