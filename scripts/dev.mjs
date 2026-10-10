// Lance Vite sur l'outil choisi : `npm run dev bird`, `npm run dev birdhouse`, ou sans argument pour le menu.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const ALIASES = {
  planks: 'planks', plaques: 'planks', plaque: 'planks', plank: 'planks', bois: 'planks',
  bird: 'bird', birds: 'bird', oiseau: 'bird', viewer: 'bird', stl: 'bird',
  birdhouse: 'birdhouse', 'bird-house': 'birdhouse', nestbox: 'birdhouse', 'nest-box': 'birdhouse', nest: 'birdhouse', nichoir: 'birdhouse', mur: 'birdhouse', wall: 'birdhouse',
  house: 'house', 'full-house': 'house',
};

const [first, ...rest] = process.argv.slice(2);
const flags = first?.startsWith('-') ? [first, ...rest] : rest;
const asked = first && !first.startsWith('-') ? first.toLowerCase() : undefined;
const tool = asked ? ALIASES[asked] : undefined;
if (asked && !tool) console.warn(`Outil « ${asked} » inconnu (essaie : planks, bird, birdhouse, house) : ouverture du menu.`);

const vite = join(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin', 'vite.js');
const child = spawn(process.execPath, [vite, '--open', ...flags], {
  stdio: 'inherit',
  env: { ...process.env, VITE_TOOL: tool ?? '' },
});
child.on('exit', (code) => process.exit(code ?? 0));
