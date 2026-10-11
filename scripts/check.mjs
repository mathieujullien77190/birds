// Une seule commande pour tout vérifier : npm run check
// Enchaîne tsc, lint, tests, pytest, builds et les sous-projets (pi/site, laser-control), puis résume.
// Options : --fast (sans les builds), --only=<mot> (n'exécute que les étapes dont le nom contient le mot).
// Code de sortie non nul si une étape échoue (toutes les étapes sont lancées, le récapitulatif est à la fin).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const args = process.argv.slice(2);
const fast = args.includes('--fast');
const only = (args.find((a) => a.startsWith('--only=')) ?? '').slice(7).toLowerCase();

/** Lance une commande (shell : npm / npx sont des .cmd sous Windows) ; renvoie { ok, out }. */
function run(cmd, cwd = root, env = {}) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1 << 28 });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** Trouve un Python qui a pytest (variable NICHOIR_PYTHON, venv, puis python / py du PATH). */
function findPython() {
  const venv = process.env.NICHOIR_PYTHON;
  const candidates = [venv, join(root, '.venv', win ? 'Scripts/python.exe' : 'bin/python'), 'python', 'python3', 'py'].filter(Boolean);
  for (const c of candidates) {
    if (c.includes('/') || c.includes('\\')) if (!existsSync(c)) continue;
    const q = c.includes(' ') ? `"${c}"` : c;
    if (run(`${q} -c "import pytest, flask"`).ok) return q;
  }
  return null;
}

const missing = (dir, label) => (existsSync(join(root, dir, 'node_modules')) ? null : `${label} : node_modules absent. Installer avec : npm --prefix ${dir} install`);

/** @type {{ name: string, skip?: string | null, cmd?: string, cwd?: string, env?: Record<string,string>, after?: () => { warn?: string } }[]} */
const steps = [
  { name: 'tsc (racine)', cmd: 'npx tsc --noEmit -p .' },
  { name: 'lint', skip: existsSync(join(root, 'tools/lint/node_modules')) ? null : 'tools/lint/node_modules absent. Installer avec : npm --prefix tools/lint install', cmd: 'npm run lint --silent' },
  { name: 'tests racine', cmd: 'npm test --silent' },
  {
    name: 'tests Python (pytest pi/tests)',
    get skip() {
      if (!existsSync(join(root, 'pi/tests'))) return 'pi/tests absent';
      this.py ??= findPython();
      return this.py ? null : 'Python avec pytest et flask introuvable. Installer : python -m pip install -r pi/requirements-dev.txt (ou définir NICHOIR_PYTHON)';
    },
    get cmd() {
      return `${this.py} -m pytest pi/tests -q`;
    },
    env: { NICHOIR_MOCK: '1' },
  },
  { name: 'build racine', cmd: 'npm run build --silent', skip: fast ? '--fast' : null },
  {
    name: 'build:pi (pi/site -> pi/web)',
    skip: fast ? '--fast' : missing('pi/site', 'pi/site'),
    cmd: 'npm run build:pi --silent',
    after() {
      // pi/web est commité : le build doit redonner exactement ce qui est suivi par git
      const d = run('git diff --exit-code --stat -- pi/web');
      return d.ok ? {} : { warn: `pi/web compilé diffère des sources : committer le résultat de « npm run build:pi » (git diff pi/web)\n${d.out.trim()}` };
    },
  },
  { name: 'pi/site typecheck', skip: missing('pi/site', 'pi/site'), cmd: 'npm run typecheck --silent', cwd: join(root, 'pi/site') },
  { name: 'pi/site tests', skip: missing('pi/site', 'pi/site'), cmd: 'npm test --silent', cwd: join(root, 'pi/site') },
  { name: 'laser-control typecheck', skip: missing('laser-control', 'laser-control'), cmd: 'npm run typecheck --silent', cwd: join(root, 'laser-control') },
  { name: 'laser-control tests', skip: missing('laser-control', 'laser-control'), cmd: 'npm test --silent', cwd: join(root, 'laser-control') },
  { name: 'laser-control build', skip: fast ? '--fast' : missing('laser-control', 'laser-control'), cmd: 'npm run build --silent', cwd: join(root, 'laser-control') },
];

const results = [];
const t0 = Date.now();
for (const s of steps) {
  if (only && !s.name.toLowerCase().includes(only)) continue;
  const skip = s.skip;
  if (skip) {
    console.log(`- ${s.name} : ignoré (${skip})`);
    results.push({ name: s.name, status: 'skip', note: skip, ms: 0 });
    continue;
  }
  process.stdout.write(`> ${s.name} ... `);
  const t = Date.now();
  const r = run(s.cmd, s.cwd, s.env);
  const ms = Date.now() - t;
  let warn;
  if (r.ok && s.after) warn = s.after().warn;
  console.log(r.ok ? `ok (${(ms / 1000).toFixed(1)} s)` : `ÉCHEC (${(ms / 1000).toFixed(1)} s)`);
  if (!r.ok) console.log(r.out.split('\n').slice(-60).join('\n'));
  if (warn) console.log(`  AVERTISSEMENT : ${warn}`);
  results.push({ name: s.name, status: r.ok ? 'ok' : 'fail', warn, ms });
}

console.log('\n=== Récapitulatif ===');
for (const r of results) {
  const mark = r.status === 'ok' ? '✔' : r.status === 'fail' ? '✘' : '-';
  const tail = r.status === 'skip' ? `ignoré : ${r.note}` : `${(r.ms / 1000).toFixed(1)} s${r.warn ? ' (avertissement : voir plus haut)' : ''}`;
  console.log(` ${mark} ${r.name.padEnd(34)} ${tail}`);
}
const fails = results.filter((r) => r.status === 'fail');
const skips = results.filter((r) => r.status === 'skip');
console.log(`\n${fails.length ? '✘' : '✔'} ${results.length - fails.length - skips.length} ok, ${fails.length} échec(s), ${skips.length} ignoré(s) — ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(fails.length ? 1 : 0);
