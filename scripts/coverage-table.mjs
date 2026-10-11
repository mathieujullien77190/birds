// Tableau de couverture lu dans coverage/coverage-summary.json (après `npm run coverage`).
//   node scripts/coverage-table.mjs [dossier-du-projet]          : une ligne par dossier
//   node scripts/coverage-table.mjs [dossier-du-projet] --files  : seulement les fichiers sous 100 %
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const base = resolve(args.find((a) => !a.startsWith('--')) ?? '.');
const summary = JSON.parse(readFileSync(join(base, 'coverage/coverage-summary.json'), 'utf8'));
const norm = (p) => p.split(String.fromCharCode(92)).join('/');
const rel = (file) => norm(file).replace(norm(base) + '/', '');
const pct = (c, t) => (t ? ((100 * c) / t).toFixed(1) : '-').padStart(6);

if (args.includes('--files')) {
  for (const [f, v] of Object.entries(summary)) {
    if (f === 'total' || (v.lines.pct === 100 && v.branches.pct === 100)) continue;
    console.log(rel(f).padEnd(62), `lignes ${v.lines.covered}/${v.lines.total}`, `branches ${v.branches.covered}/${v.branches.total}`);
  }
} else {
  const dirs = {};
  for (const [file, v] of Object.entries(summary)) {
    if (file === 'total') continue;
    const dir = rel(file).split('/').slice(0, -1).join('/') || '.';
    const o = (dirs[dir] ??= { l: 0, lc: 0, b: 0, bc: 0 });
    o.l += v.lines.total; o.lc += v.lines.covered; o.b += v.branches.total; o.bc += v.branches.covered;
  }
  console.log('dossier'.padEnd(54), 'lignes %', 'branches %');
  for (const [d, o] of Object.entries(dirs).sort()) console.log(d.padEnd(54), pct(o.lc, o.l), pct(o.bc, o.b));
  const t = summary.total;
  console.log('TOTAL'.padEnd(54), pct(t.lines.covered, t.lines.total), pct(t.branches.covered, t.branches.total));
}
