import { type PlankScene, type HistoryEntry } from './types';
import { DEFAULT_SCENE } from './constants';
import { toZUp } from './geometry/transform';

const KEY = 'plaques-scene';
export function loadScene(): PlankScene {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? '') as PlankScene; if (s && Array.isArray(s.planks)) return toZUp({ ...s, fit: 0, planks: s.planks.map((p) => ({ ...p, notches: p.notches ?? [], holes: p.holes ?? [] })) }); } catch { /* rien */ } // fit : toujours 0 (le réglage n'existe plus) ; anciennes scènes converties en Z = hauteur
  return DEFAULT_SCENE;
}
export function saveScene(s: PlankScene): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ } }

const HKEY = 'plaques-historique';
export function loadHistory(): HistoryEntry[] {
  try { const h = JSON.parse(localStorage.getItem(HKEY) ?? '') as HistoryEntry[]; if (Array.isArray(h)) return h.map((e) => ({ ...e, scene: toZUp(e.scene) })); } catch { /* rien */ }
  return [];
}
export function saveHistory(h: HistoryEntry[]): void {
  let keep = h;
  for (let tries = 0; tries < 6; tries++) {
    try { localStorage.setItem(HKEY, JSON.stringify(keep)); return; } catch { keep = keep.slice(Math.ceil(keep.length / 2)); }
  }
}
