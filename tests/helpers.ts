import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { NEST_DEFAULT, makeNest, type NestParams, type PlankScene } from '@/birdhouse/model';

const here = dirname(fileURLToPath(import.meta.url));
export const GOLDEN_DIR = join(here, 'golden');

/** Variantes de nichoir testées (les mêmes pour le modèle et la géométrie). */
export const VARIANTS: Record<string, Partial<NestParams>> = {
  default: {},
  'sans-clim': { clim: false },
  'sans-cam2': { cam2: false },
  'sans-solaire': { solar: false },
  'trou-120': { hole: 120 },
  'interieur-200': { l: 200, L: 200 },
};

/** Remplace les identifiants aléatoires (uid) par leur ordre d'apparition : `id1`, `id2`… */
export function normalizeIds(value: unknown): unknown {
  const ids = new Set<string>();
  const collect = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(collect); return; }
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.id === 'string') ids.add(o.id);
      if (typeof o.group === 'string') ids.add(o.group);
      if (o.groupNames && typeof o.groupNames === 'object') for (const k of Object.keys(o.groupNames)) ids.add(k);
      Object.values(o).forEach(collect);
    }
  };
  collect(value);
  const map = new Map<string, string>();
  [...ids].forEach((id, i) => map.set(id, `id${i + 1}`));
  let json = JSON.stringify(value);
  for (const [id, n] of map) json = json.split(`"${id}"`).join(`"${n}"`);
  return JSON.parse(json);
}

export function buildNest(over: Partial<NestParams>): PlankScene {
  const b = makeNest({ ...NEST_DEFAULT, ...over }, 3, 0, 1);
  return { t: 3, fit: 0, planks: b.planks, groupNames: b.groupNames, up: 'z2' };
}

/** Compare à tests/golden/<name>.json (le crée si UPDATE_GOLDEN=1). */
export function expectGolden(name: string, value: unknown): void {
  const file = join(GOLDEN_DIR, `${name}.json`);
  const text = JSON.stringify(value, null, 1) + '\n';
  if (process.env.UPDATE_GOLDEN === '1') { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); return; }
  if (!existsSync(file)) throw new Error(`référence manquante : ${file} (lancer avec UPDATE_GOLDEN=1)`);
  expect(JSON.parse(text)).toEqual(JSON.parse(readFileSync(file, 'utf8')));
}

/** Empreinte d'un tableau de nombres arrondis à 1e-4. */
export function hashNumbers(a: ArrayLike<number>): string {
  const h = createHash('sha1');
  const parts: string[] = [];
  for (let i = 0; i < a.length; i++) parts.push(String(Math.round(a[i] * 1e4) || 0));
  h.update(parts.join(','));
  return h.digest('hex').slice(0, 16);
}
