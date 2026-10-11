// Exporte laser-control vers un autre dossier, puis vérifie que la copie s'installe et se compile toute seule.
//   npm run export -- <dossier-cible> [--no-check] [--keep-modules]
// Copie tout sauf node_modules et dist ; refuse un dossier cible non vide. Sans --no-check : npm install, typecheck, build et tests dans la copie.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const target = args.find((a) => !a.startsWith('--'));

if (!target) {
  console.error('Usage : npm run export -- <dossier-cible> [--no-check] [--keep-modules]');
  process.exit(2);
}
const dest = resolve(target);
if (dest === source || dest.startsWith(source + sep)) {
  console.error(`Le dossier cible (${dest}) ne peut pas être dans laser-control lui-même.`);
  process.exit(2);
}
if (existsSync(dest) && readdirSync(dest).length) {
  console.error(`Le dossier cible n'est pas vide : ${dest}`);
  process.exit(2);
}

mkdirSync(dest, { recursive: true });
cpSync(source, dest, {
  recursive: true,
  filter: (src) => {
    const rel = relative(source, src).split(sep);
    return !rel.includes('node_modules') && !(rel[0] === 'dist');
  },
});
console.log(`Copié : ${source} -> ${dest}`);

if (flags.has('--no-check')) process.exit(0);

function run(cmd) {
  console.log(`\n$ ${cmd}   (dans ${dest})`);
  const r = spawnSync(cmd, { cwd: dest, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\nÉCHEC : « ${cmd} » (code ${r.status}). La copie reste dans ${dest}.`);
    process.exit(1);
  }
}
run('npm install --no-audit --no-fund');
run('npm run typecheck');
run('npm run build');
run('npm test');
if (!flags.has('--keep-modules')) rmSync(join(dest, 'node_modules'), { recursive: true, force: true });
rmSync(join(dest, 'dist'), { recursive: true, force: true });
console.log(`\nOK : la copie s'installe, se compile et passe ses tests. Pour l'utiliser : cd "${dest}" && npm install && npm run dev`);
