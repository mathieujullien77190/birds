import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n === 'dist') return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

/** Tous les « from '…' », import('…') et require('…') d'un fichier. */
function specifiers(src: string): string[] {
  return [...src.matchAll(/(?:from|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2]);
}

describe('laser-control est autonome', () => {
  const all = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'tests')), ...files(join(ROOT, 'scripts')), ...['vite.config.ts', 'vitest.config.ts'].map((f) => join(ROOT, f))];

  it('aucun fichier n\'importe hors du dossier ni via l\'alias @/ (qui désigne src/ dans l\'application hôte)', () => {
    const bad: string[] = [];
    for (const f of all) {
      for (const s of specifiers(readFileSync(f, 'utf8'))) {
        const where = `${relative(ROOT, f)} → ${s}`;
        if (s.startsWith('@/') || s.startsWith('@laser')) { if (f.startsWith(join(ROOT, 'src'))) bad.push(where); continue; }
        if (s.startsWith('.')) { const target = resolve(dirname(f), s); if (target !== ROOT && !target.startsWith(ROOT + sep)) bad.push(where); }
        else if (/^(\/|[A-Za-z]:)/.test(s)) bad.push(where);
      }
    }
    expect(bad).toEqual([]);
  });

  it('chaque dépendance importée est déclarée dans package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const declared = new Set([...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies)]);
    const builtin = (s: string) => s.startsWith('node:');
    const used = new Set<string>();
    for (const f of all) for (const s of specifiers(readFileSync(f, 'utf8'))) {
      if (s.startsWith('.') || s.startsWith('@/') || builtin(s) || !/^[@a-z0-9]/i.test(s)) continue;
      used.add(s.startsWith('@') ? s.split('/').slice(0, 2).join('/') : s.split('/')[0]);
    }
    expect([...used].filter((u) => !declared.has(u))).toEqual([]);
  });
});
