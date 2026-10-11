import { type Notch, type Plank } from '../types';
import { uid } from '../util';

export const newPlank = (n: number, w = 120, h = 80): Plank => ({ id: uid(), name: `Plaque ${n}`, w, h, pos: [(n - 1) * 40, 0, h / 2], rot: [90, 0, 0], notches: [], holes: [] }); // debout, face à l'avant (−y)

export const newNotch = (plank: Plank, t: number, fit: number): Notch => ({ id: uid(), edge: 'top', pos: plank.w / 2, width: +(t + fit).toFixed(2), depth: Math.round(plank.h / 4) });
