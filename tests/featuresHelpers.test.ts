// Fonctions pures de src/features/** : schéma dynamique, liens pièce ↔ schéma, arborescence du code, rendu des documents, petits calculs de l'interface.
import { describe, expect, it } from 'vitest';
import type { Plank, PlankScene } from '@/birdhouse/model';
import { buildSchema, edgeKey, ficheOf, nodeKey, schemaKeys } from '@/features/schema/SchemaPanel/helpers';
import { MERMAID_SRC } from '@/features/schema/SchemaPanel/constants';
import { buildTree } from '@/features/docs/CodeBrowser/helpers';
import { renderDoc } from '@/features/docs/DocModal/helpers';
import { nestOuterSize } from '@/features/viewer/components/NestSection/helpers';
import { cardScale, groupName } from '@/features/viewer/components/PiecesList/helpers';
import { parseCutCfg } from '@/features/laser/helpers';
import { CUT_CFG_KEY, DEFAULT_CUT_CFG, SHEET_GAP_PREVIEW } from '@/features/laser/constants';
import { NEST_DEFAULT } from '@/birdhouse/model';

const arrowsOf = (src: string) => src.split('\n').filter((l) => /-->|---/.test(l) && !/^\s*(subgraph|%%)/.test(l));
const linkStyles = (src: string) => src.split('\n').filter((l) => /^\s*linkStyle /.test(l));

describe('buildSchema : schéma dynamique', () => {
  it('toutes les options présentes : le schéma complet du document, tel quel', () => {
    expect(buildSchema({ cam2: true, solar: true })).toBe(MERMAID_SRC);
  });
  it('sans 2ᵉ caméra : plus de CAM2 ni IR2, ni de leurs flèches, et un `linkStyle` par flèche restante avec la couleur d\'origine', () => {
    const out = buildSchema({ cam2: false, solar: true });
    expect(out).not.toMatch(/\bCAM2\b|\bIR2\b/);
    expect(out).toContain('CAM1');
    const full = arrowsOf(MERMAID_SRC), now = arrowsOf(out);
    expect(full.length - now.length).toBe(3); // nappe vers CAM2, 5 V vers IR2, masse commutée vers IR2
    expect(linkStyles(out)).toHaveLength(now.length);
    // la couleur suit la flèche : la première flèche (câble du panneau) reste noire
    expect(linkStyles(out)[0]).toContain('#111827');
    // `class CAM1,CAM2 cam` devient `class CAM1 cam`
    expect(out).toMatch(/class CAM1 cam/);
    expect(out).toMatch(/class IR ir/);
  });
  it('sans solaire : plus de PV ni MPPT, le bloc « Dehors » garde la caméra 2', () => {
    const out = buildSchema({ cam2: true, solar: false });
    expect(out).not.toMatch(/\bPV\b|\bMPPT\b/);
    expect(out).not.toMatch(/class PV|class MPPT/);
    expect(out).toContain('subgraph DEHORS');
    expect(linkStyles(out)).toHaveLength(arrowsOf(out).length);
  });
  it('sans aucune option : la zone « Dehors » devenue vide disparaît', () => {
    const out = buildSchema({ cam2: false, solar: false });
    expect(out).not.toContain('subgraph DEHORS');
    expect(out).toContain('subgraph TOIT');
    expect(linkStyles(out)).toHaveLength(arrowsOf(out).length);
  });
});

describe('liens pièce ↔ schéma', () => {
  it('schemaKeys : nœud pour un composant, flèche pour un fil, null pour une plaque de bois', () => {
    expect(schemaKeys('Raspberry Pi 5')).toEqual({ nodes: ['PI'], edges: [] });
    expect(schemaKeys('Caméra 2')?.nodes).toEqual(['CAM2']);
    expect(schemaKeys('Caméra')?.nodes).toEqual(['CAM1']);
    expect(schemaKeys('Fil masse (noir)')?.edges).toEqual([['SW', 'IR'], ['PI', 'SENS']]);
    expect(schemaKeys('Fil Wago + → interrupteur ventilateur (rouge)')?.edges).toEqual([['RAIL', 'SWF']]);
    expect(schemaKeys('Fil fusible → Wago + (rouge)')?.edges).toEqual([['FUSE', 'RAIL']]);
    expect(schemaKeys('Face avant ext')).toBeNull();
  });
  it('nodeKey et edgeKey lisent les identifiants fabriqués par mermaid', () => {
    expect(nodeKey('schema-cote-3d-flowchart-PI-12')).toBe('PI');
    expect(nodeKey('flowchart-FUSE-3')).toBe('FUSE');
    expect(nodeKey('autre-chose')).toBeNull();
    expect(edgeKey('schema-L_PI_SWF_4')).toEqual(['PI', 'SWF']);
    expect(edgeKey('x-L-RAIL-BUCK-0')).toEqual(['RAIL', 'BUCK']);
    expect(edgeKey('flowchart-PI-1')).toBeNull();
  });
  it('ficheOf : la section du document d\'un module, ou rien', () => {
    expect(ficheOf('FAN')?.title).toMatch(/^Ventilateur/);
    expect(ficheOf('FAN')?.md.startsWith('### ')).toBe(true);
    expect(ficheOf('ZZZ')).toBeUndefined();
  });
});

describe('buildTree : arborescence de fichiers', () => {
  it('dossiers d\'abord puis ordre alphabétique, chemins complets, sans doublon', () => {
    const t = buildTree(['pi/nichoir.py', 'pi/site/src/main.tsx', 'pi/README.md', 'pi/site/index.html', 'pi/nichoir.service']);
    expect(t.dir).toBe(true);
    const pi = t.children[0];
    expect(pi.name).toBe('pi');
    expect(pi.children.map((c) => c.name)).toEqual(['site', 'nichoir.py', 'nichoir.service', 'README.md'].sort((a, b) => (a === 'site' ? -1 : b === 'site' ? 1 : a.localeCompare(b))));
    const site = pi.children[0];
    expect(site.children.map((c) => c.name)).toEqual(['src', 'index.html']);
    expect(site.children[0].children[0]).toMatchObject({ name: 'main.tsx', path: 'pi/site/src/main.tsx', dir: false });
    expect(buildTree([]).children).toEqual([]);
  });
});

describe('renderDoc : Markdown → HTML', () => {
  it('mermaid laissé tel quel (échappé), code python coloré, autre code simple, tableau encadré, liens en nouvel onglet', () => {
    const html = renderDoc('```mermaid\nA-->B & <C>\n```\n\n```python\nx = 1\n```\n\n```zzz\nbrut\n```\n\n```\nsans langue\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[lien](https://exemple.fr)');
    expect(html).toContain('<pre class="mermaid">A-->B &amp; &lt;C>');
    expect(html).toContain('class="hljs language-python"');
    expect(html).toContain('<span class="hljs-');
    expect(html).toContain('brut');
    expect(html).not.toContain('hljs language-zzz');
    expect(html).toContain('sans langue');
    expect(html).toContain('<div class="tw"><table>');
    expect(html).toContain('<a target="_blank" rel="noopener noreferrer" href="https://exemple.fr">lien</a>');
  });
});

describe('petits calculs de l\'interface', () => {
  it('nestOuterSize : extérieur = utile + 2 × (2t + isolant) ; hauteur totale', () => {
    expect(nestOuterSize(NEST_DEFAULT, 3)).toEqual([120 + 2 * (6 + 39), 120 + 2 * (6 + 39), 130 + 32 + 20 + 6 + 2 * (3 + 39)]);
    expect(nestOuterSize({ ...NEST_DEFAULT, l: 200, L: 150, ins: 20 }, 4)).toEqual([200 + 2 * 28, 150 + 2 * 28, 130 + 32 + 20 + 8 + 2 * 24]);
  });
  it('cardScale : la plus large plaque tient dans 216 px, jamais au-delà de 1,2', () => {
    const pl = (w: number) => ({ w } as Plank);
    expect(cardScale([pl(10), pl(200)])).toBeCloseTo(216 / 208, 6);
    expect(cardScale([pl(400), pl(20)])).toBeCloseTo(216 / 408, 6);
    expect(cardScale([pl(10)])).toBe(1.2);
    expect(cardScale([pl(100)])).toBe(1.2);
  });
  it('groupName : nom enregistré (sans parenthèse finale), sinon « Boîte k » d\'après « Face avant k », sinon « Groupe »', () => {
    const mk = (names?: Record<string, string>): PlankScene => ({ t: 3, fit: 0, planks: [], groupNames: names });
    const m = (name: string) => ({ name } as Plank);
    expect(groupName(mk({ g: 'Corps (3 plaques)' }), 'g', [])).toBe('Corps');
    expect(groupName(mk(), 'g', [m('Face avant 2'), m('Dessus')])).toBe('Boîte 2');
    expect(groupName(mk(), 'g', [m('Dessus')])).toBe('Groupe');
    expect(groupName({ t: 3, fit: 0, planks: [] }, 'g', [])).toBe('Groupe');
  });
  it('parseCutCfg : réglages lus, sinon ceux par défaut (texte absent, invalide ou sans largeur numérique)', () => {
    expect(parseCutCfg('{"W":500,"H":300,"gap":2}')).toEqual({ W: 500, H: 300, gap: 2 });
    for (const bad of [null, 'pas du json', '{"W":"410"}', 'null']) expect(parseCutCfg(bad)).toEqual(DEFAULT_CUT_CFG);
    expect(parseCutCfg(null)).not.toBe(DEFAULT_CUT_CFG); // une copie : on ne modifie jamais la constante
    expect(DEFAULT_CUT_CFG).toEqual({ W: 410, H: 400, gap: 5 });
    expect(CUT_CFG_KEY).toBe('plaques-decoupe');
    expect(SHEET_GAP_PREVIEW).toBeGreaterThan(0);
  });
});
