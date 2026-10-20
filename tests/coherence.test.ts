// Tests de COHÉRENCE : ils ne vérifient pas un calcul, mais que les fichiers qui vont ensemble restent d'accord
// (voir docs/checklist-changements.md). Un échec ici veut dire « tu as changé X et oublié Y » : la ligne du message dit quoi.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NEST_DEFAULT, makeNest, setAirPlug, setWinterCassette, type PlankScene } from '@/birdhouse/model';
import { schemaKeys } from '@/features/schema/SchemaPanel/helpers';
import { FICHES, MAP, MERMAID_SRC, OPTION_NODES, SECTIONS } from '@/features/schema/SchemaPanel/constants';
import { DOCS } from '@/features/docs/DocModal/constants';
import { NOTE } from '@/features/docs/CodeBrowser/constants';
import { HIDDEN_AT_CREATION, STORAGE } from '@/features/viewer/constants';
import { buildNest, VARIANTS } from './helpers';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const exists = (p: string) => existsSync(join(root, p));

// ---------- le schéma électronique ----------

const lines = MERMAID_SRC.split('\n');
const isArrow = (l: string) => /<?-->|---/.test(l) && !/^\s*(subgraph|%%)/.test(l);
const arrows = lines.filter(isArrow).map((l) => /^\s*([A-Z0-9]+)\s*(?:<?-->|---)(?:\|[^|]*\|)?\s*([A-Z0-9]+)/.exec(l)).map((m) => (m ? ([m[1], m[2]] as [string, string]) : null));
const nodeIds = lines.map((l) => /^\s*([A-Z0-9]+)(\[|\(\()/.exec(l)?.[1]).filter((x): x is string => !!x);

describe('cohérence : schéma mermaid de docs/schema-electronique.md', () => {
  it('chaque flèche est bien lue (nœuds de départ et d\'arrivée)', () => {
    expect(arrows.length).toBeGreaterThan(10);
    for (const a of arrows) expect(a, 'flèche illisible : voir buildSchema').not.toBeNull();
    for (const a of arrows) for (const id of a!) expect(nodeIds, `flèche vers ${id} sans bloc`).toContain(id);
  });
  it('autant de `linkStyle n` que de flèches, numérotés de 0 à n−1 dans l\'ordre (refaire la liste quand on ajoute ou retire une flèche)', () => {
    const idx = lines.map((l) => /^\s*linkStyle (\d+) /.exec(l)?.[1]).filter((x): x is string => x !== undefined).map(Number);
    expect(idx).toEqual(arrows.map((_, i) => i));
  });
  it('chaque `class X nom` utilise un `classDef nom` défini et un bloc qui existe', () => {
    const defs = new Set(lines.map((l) => /^\s*classDef (\w+) /.exec(l)?.[1]).filter(Boolean));
    for (const l of lines) {
      const m = /^\s*class ([A-Z0-9,]+) (\w+)$/.exec(l);
      if (!m) continue;
      expect(defs.has(m[2]), `classDef ${m[2]} manquant`).toBe(true);
      for (const id of m[1].split(',')) expect(nodeIds, `class sur ${id} : bloc absent`).toContain(id);
    }
  });
  it('chaque bloc a une fiche (FICHES) et chaque fiche une section « ### » du document', () => {
    expect([...nodeIds].sort()).toEqual(Object.keys(FICHES).sort());
    for (const [id, start] of Object.entries(FICHES)) expect(SECTIONS.some((s) => s.title.startsWith(start)), `fiche ${id} : aucune section « ${start} »`).toBe(true);
  });
  it('MAP (pièce → schéma) ne vise que des blocs et des flèches qui existent', () => {
    const edges = arrows.map((a) => a!.join('>'));
    for (const [re, k] of MAP) {
      for (const n of k.nodes) expect(nodeIds, `${re} : bloc ${n}`).toContain(n);
      for (const [a, b] of k.edges) expect(edges, `${re} : flèche ${a} → ${b}`).toContain(`${a}>${b}`);
    }
  });
  it('les blocs des options (2ᵉ caméra) existent dans le schéma', () => {
    for (const ids of Object.values(OPTION_NODES)) for (const id of ids) expect(nodeIds).toContain(id);
  });
});

// ---------- les documents ----------

describe('cohérence : documents', () => {
  const docs = readdirSync(join(root, 'docs')).filter((f) => f.endsWith('.md'));
  const NOT_IN_APP = ['architecture-3d.md', 'checklist-changements.md']; // documents gardés dans le dépôt mais volontairement absents de l'application
  it('chaque docs/*.md est dans DOCS, dans la table « Documentation » du README et cité dans CLAUDE.md', () => {
    const src = read('src/features/docs/DocModal/constants.ts'), readme = read('README.md'), claude = read('CLAUDE.md');
    expect(docs.length).toBeGreaterThanOrEqual(5);
    for (const d of docs) {
      if (NOT_IN_APP.includes(d)) expect(src, `${d} ne doit pas être dans l'application`).not.toContain(`/docs/${d}`);
      else expect(src, `${d} absent de DOCS`).toContain(`/docs/${d}?raw`);
      expect(readme, `${d} absent du README`).toContain(`docs/${d}`);
      expect(claude, `${d} absent de CLAUDE.md`).toContain(`docs/${d}`);
    }
  });
  it('chaque entrée de DOCS a un titre et un identifiant uniques', () => {
    expect(new Set(DOCS.map((d) => d.id)).size).toBe(DOCS.length);
    expect(new Set(DOCS.map((d) => d.title)).size).toBe(DOCS.length);
    for (const d of DOCS.filter((x) => x.id !== 'code')) expect(d.md.length, d.title).toBeGreaterThan(200);
  });
  it('chaque fichier cité dans les notes de l\'explorateur de code (NOTE) existe', () => {
    for (const p of Object.keys(NOTE)) expect(exists(p), `NOTE : ${p} n'existe plus`).toBe(true);
  });
  it('chaque fichier ou dossier cité entre accents graves dans la checklist existe', () => {
    const md = read('docs/checklist-changements.md');
    const cited = new Set([...md.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]).filter((t) => /^(src|tests|docs|pi|laser-control|scripts|tools|\.github|\.claude)\/[\w./-]+$/.test(t) || /^(package\.json|tsconfig\.json|vite\.config\.ts|vitest\.config\.ts|eslint\.config\.js|README\.md|CLAUDE\.md)$/.test(t)));
    expect(cited.size).toBeGreaterThan(40);
    for (const p of cited) expect(exists(p), `checklist : ${p} n'existe pas`).toBe(true);
  });
});

// ---------- les skills du projet ----------

describe('cohérence : skills de .claude/skills', () => {
  const dirs = readdirSync(join(root, '.claude/skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  it('chaque skill a un SKILL.md avec name = nom du dossier et une description qui dit quand l\'utiliser', () => {
    expect(dirs.length).toBeGreaterThanOrEqual(4);
    for (const d of dirs) {
      const md = read(`.claude/skills/${d}/SKILL.md`).replace(/\r\n/g, '\n');
      const fm = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(md);
      expect(fm, `${d} : en-tête invalide`).not.toBeNull();
      expect(fm![1]).toBe(d);
      expect(fm![2].length, `${d} : description trop courte`).toBeGreaterThan(60);
    }
  });
  it('chaque skill renvoie vers la checklist (ou les règles) au lieu de la dupliquer, et ne cite que des fichiers qui existent', () => {
    for (const d of dirs) {
      const md = read(`.claude/skills/${d}/SKILL.md`);
      if (d !== 'regles-du-projet') expect(md, d).toContain('docs/checklist-changements.md');
      for (const m of md.matchAll(/`((?:src|tests|docs|pi|laser-control|scripts)\/[\w./-]+)`/g)) expect(exists(m[1]), `${d} cite ${m[1]} : introuvable`).toBe(true);
    }
  });
});

// ---------- le code qui doit rester d'accord ----------

describe('cohérence : réglages et configuration', () => {
  it('clés localStorage : valeurs figées (les renommer efface les réglages enregistrés de l\'utilisateur)', () => {
    expect(STORAGE).toEqual({
      leftOpen: 'plaques-menu-gauche', rightOpen: 'plaques-menu-droit', night: 'plaques-nuit',
      schema: 'plaques-schema', cut: 'plaques-coupe', hidden: 'plaques-caches', nest: 'plaques-nichoir-3', docSection: 'plaques-doc-section', assembly: 'plaques-montage',
    });
    expect(new Set(Object.values(STORAGE)).size).toBe(Object.keys(STORAGE).length);
  });
  it('alias @ et @laser identiques dans tsconfig, vite et vitest', () => {
    const ts = read('tsconfig.json'), vite = read('vite.config.ts'), vt = read('vitest.config.ts');
    expect(ts).toContain('"@/*": ["./src/*"]');
    expect(ts).toContain('"@laser": ["./laser-control/src/index.ts"]');
    for (const f of [vite, vt]) { expect(f).toContain("'@': fileURLToPath(new URL('./src'"); expect(f).toContain("'@laser': fileURLToPath(new URL('./laser-control/src'"); }
  });
  it('mêmes versions de react, typescript, vite et vitest dans les trois projets npm', () => {
    const pk = (p: string) => JSON.parse(read(p)) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const all = [pk('package.json'), pk('pi/site/package.json'), pk('laser-control/package.json')];
    for (const dep of ['react', 'react-dom', 'typescript', 'vite', 'vitest', '@vitest/coverage-v8', '@vitejs/plugin-react']) {
      const versions = all.map((p) => p.dependencies?.[dep] ?? p.devDependencies?.[dep]).filter((v): v is string => !!v);
      expect(new Set(versions).size, `${dep} : ${versions.join(' / ')}`).toBe(1);
    }
  });
  it('les briques d\'interface copiées dans laser-control/src sont identiques à celles de src (seul l\'import d\'Échap diffère)', () => {
    const norm = (s: string) => s.replace(/'@\/hooks\/useEscapeKey'|'\.\.\/\.\.\/hooks\/useEscapeKey'/g, "'useEscapeKey'").replace(/\r\n/g, '\n');
    const pairs: [string, string][] = [];
    for (const brick of readdirSync(join(root, 'laser-control/src/ui'), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      for (const f of readdirSync(join(root, 'laser-control/src/ui', brick.name))) pairs.push([`laser-control/src/ui/${brick.name}/${f}`, `src/ui/${brick.name}/${f}`]);
    }
    for (const f of ['useEscapeKey', 'usePersistentFlag', 'usePersistentState']) pairs.push([`laser-control/src/hooks/${f}.ts`, `src/hooks/${f}.ts`]);
    pairs.push(['laser-control/src/lib/download.ts', 'src/lib/download.ts']);
    expect(pairs.length).toBeGreaterThan(30);
    for (const [a, b] of pairs) { expect(exists(b), `${b} manque (copie de ${a})`).toBe(true); expect(norm(read(a)), `${a} et ${b} ont divergé`).toBe(norm(read(b))); }
  });
});

// ---------- le modèle du nichoir ----------

/** Tous les noms de pièces que le modèle peut produire (variantes, mode hiver, prise d'air bouchée). */
function allNames(): { names: string[]; scenes: PlankScene[] } {
  const scenes: PlankScene[] = Object.values(VARIANTS).map((v) => buildNest(v));
  const base = scenes[0];
  scenes.push(setWinterCassette(base, true), setAirPlug(base, true), setAirPlug(setWinterCassette(base, true), true));
  return { names: [...new Set(scenes.flatMap((s) => s.planks.map((p) => p.name)))], scenes };
}
const makeNestSrc = read('src/birdhouse/model/nest/makeNest.ts');

/** Découpe `a|b|c(d|e)f` en alternatives de premier niveau, puis développe un niveau de parenthèses : de quoi tester chaque motif séparément. */
function alternatives(body: string): string[] {
  const out: string[] = []; let depth = 0, cur = '';
  for (const c of body) {
    if (c === '(') depth++; if (c === ')') depth--;
    if (c === '|' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.flatMap((alt) => { const m = /^(.*?)\(([^()]*)\)(.*)$/.exec(alt); return m ? m[2].split('|').map((x) => m[1] + x + m[3]) : [alt]; });
}

describe('cohérence : makeNest, pièces, groupes, liens', () => {
  const { names, scenes } = allNames();
  it('chaque alternative de VENT_PIECES correspond à au moins une pièce générée (sinon : nom changé, groupe « Ventilation » incomplet)', () => {
    const m = /const VENT_PIECES = \/\^\((.*)\)\/;/.exec(makeNestSrc);
    expect(m, 'VENT_PIECES introuvable dans makeNest.ts').not.toBeNull();
    for (const alt of alternatives(m![1])) {
      const re = new RegExp('^' + alt);
      expect(names.some((n) => re.test(n)), `VENT_PIECES : « ${alt} » ne correspond à aucune pièce`).toBe(true);
    }
  });
  it('AIR_PIECES (groupe « Aération du corps ») correspond à des pièces générées, aucune n\'est dans VENT_PIECES', () => {
    const m = /const AIR_PIECES = \/(.*)\/;/.exec(makeNestSrc);
    expect(m, 'AIR_PIECES introuvable dans makeNest.ts').not.toBeNull();
    expect(names.some((n) => new RegExp(m![1]).test(n))).toBe(true);
    const v = /const VENT_PIECES = \/(.*)\/;/.exec(makeNestSrc)!;
    expect(names.some((n) => new RegExp(m![1]).test(n) && new RegExp(v[1]).test(n))).toBe(false);
  });
  it('chaque motif de LINKS correspond à une pièce et porte une adresse https ; chaque pièce liée a son url', () => {
    const block = makeNestSrc.slice(makeNestSrc.indexOf('const LINKS'), makeNestSrc.indexOf('const underRoof'));
    const links = [...block.matchAll(/\[\/(.+?)\/,\s*'(https:\/\/[^']+)'\]/g)];
    expect(links.length).toBeGreaterThan(5);
    for (const [, re, url] of links) {
      const r = new RegExp(re);
      const hit = scenes.flatMap((s) => s.planks).filter((p) => r.test(p.name));
      expect(hit.length, `LINKS : « ${re} » ne correspond à aucune pièce`).toBeGreaterThan(0);
      for (const p of hit) expect(p.url, p.name).toBe(url);
    }
  });
  it('chaque motif de HIDDEN_AT_CREATION correspond à une pièce générée (sinon : la pièce ne sera plus cachée à la création)', () => {
    for (const re of HIDDEN_AT_CREATION) expect(names.some((n) => re.test(n)), `HIDDEN_AT_CREATION : ${re}`).toBe(true);
  });
  it('chaque type `special` de pièce générée est connu : il a une fabrique 3D ou fait partie des types sans dessin propre', () => {
    const factories = read('src/birdhouse/three/factories/part/index.ts');
    const table = factories.slice(factories.indexOf('const FACTORIES'), factories.indexOf('/** Géométrie'));
    const typeSrc = read('src/birdhouse/model/types.ts');
    const union = /special\?: ([^;]+);/.exec(typeSrc)![1];
    const declared = [...union.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    const NO_FACTORY = ['alu', 'doc']; // `alu` suit le chemin des plaques, `doc` n'est jamais dessiné (voir part/index.ts)
    for (const s of declared) expect(NO_FACTORY.includes(s) || new RegExp(`\\b${s}:`).test(table), `special '${s}' sans fabrique dans part/index.ts`).toBe(true);
    const used = new Set(scenes.flatMap((sc) => sc.planks.map((p) => p.special)).filter(Boolean));
    for (const s of used) expect(declared, `special '${s}' utilisé mais absent de Plank['special']`).toContain(s);
  });
  it('chaque fil, nappe et câble du modèle est relié au schéma (MAP) : le survol 3D ↔ schéma fonctionne', () => {
    const wires = scenes[0].planks.filter((p) => p.special === 'wire' || p.special === 'cable' || p.special === 'conduit');
    expect(wires.length).toBeGreaterThan(20);
    for (const p of wires) expect(schemaKeys(p.name), `« ${p.name} » n'a pas de ligne dans MAP (SchemaPanel/constants.ts)`).not.toBeNull();
  });
  it('chaque groupe de pièces est nommé (groupNames)', () => {
    const b = makeNest(NEST_DEFAULT, 3, 0, 1);
    const groups = new Set(b.planks.map((p) => p.group).filter(Boolean));
    for (const g of groups) expect(b.groupNames[g!], `groupe ${g} sans nom`).toBeTruthy();
  });
});
