import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderDoc } from '@/features/docs/DocModal/helpers';

const md = readFileSync(join(__dirname, '..', 'docs', 'schema-electronique.md'), 'utf8');

describe('liens du document « Dossier du nichoir »', () => {
  it('chaque ligne du tableau des prix donne le modèle exact : un lien, ou la référence exacte à chercher', () => {
    const start = md.indexOf('| Groupe | Désignation | Quantité | Prix |'), rows = md.slice(start, md.indexOf('\n\n', start)).split('\n').slice(2);
    expect(rows.length).toBeGreaterThan(30);
    for (const r of rows) {
      const cells = r.split('|').slice(1, -1).map((c) => c.trim());
      expect(cells, r).toHaveLength(7);
      expect(cells[6], r).toMatch(/^\[( |x)\]$/); // colonne « Vérifié »
      expect(/\]\(https:\/\/[^ )]+\)/.test(cells[5]) || /^lien à trouver — référence exacte : .{15,}/.test(cells[5]) || /^(fabriqué|incluse)/.test(cells[5]), r).toBe(true);
    }
  });
  it('le rendu ouvre chaque lien dans un nouvel onglet, sans casser le tableau', () => {
    const html = renderDoc(md), anchors = html.match(/<a [^>]*href="https?:[^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThan(20);
    for (const a of anchors) { expect(a).toContain('target="_blank"'); expect(a).toContain('rel="noopener noreferrer"'); }
    expect(html).toContain('<th>Modèle exact / lien</th>'); expect(html).toContain('<th>Prix du lot</th>');
    expect(html).toContain('<th>Vérifié</th>');
  });
  it('plus de lien mort connu', () => { expect(md).not.toContain('azcus.digikey.com'); expect(md).not.toContain('cdn.sparkfun.com'); });
});

describe('camembert des prix', () => {
  it('les parts du camembert totalisent exactement la colonne « Prix » du tableau', () => {
    const eur = (x: string) => parseFloat(x.replace(/[^0-9,]/g, '').replace(',', '.'));
    const start = md.indexOf('| Groupe | Désignation | Quantité | Prix |'), rows = md.slice(start, md.indexOf('\n\n', start)).split('\n').slice(2);
    const table = rows.reduce((t, r) => t + eur(r.split('|').slice(1, -1)[3]), 0), lots = rows.reduce((t, r) => t + eur(r.split('|').slice(1, -1)[4]), 0);
    const pie = md.slice(md.indexOf('pie showData'), md.indexOf('```', md.indexOf('pie showData')));
    const sum = [...pie.matchAll(/" : ([0-9.]+)/g)].reduce((t, m) => t + parseFloat(m[1]), 0);
    expect(sum).toBeCloseTo(table, 2);
    expect(md).toContain(`besoin exact : ${table.toFixed(2).replace('.', ',')} €`);
    expect(md).toContain(`lots entiers : ${lots.toFixed(2).replace('.', ',')} €`);
  });
});

describe('Où acheter (par magasin)', () => {
  it('les totaux par magasin retombent exactement sur le total du tableau des prix (besoin exact et lots entiers)', () => {
    const eur = (x: string) => parseFloat(x.replace(/[^0-9,]/g, '').replace(',', '.'));
    const start = md.indexOf('| Groupe | Désignation | Quantité | Prix |'), rows = md.slice(start, md.indexOf('\n\n', start)).split('\n').slice(2).map((r) => r.split('|').slice(1, -1));
    const p = rows.reduce((t, c) => t + eur(c[3]), 0), l = rows.reduce((t, c) => t + eur(c[4]), 0);
    const sec = md.slice(md.indexOf('### Où acheter (par magasin)')), tab = sec.slice(0, sec.indexOf('\n\n', sec.indexOf('| Magasin'))).split('\n').slice(4).map((r) => r.split('|').slice(1, -1)).filter((c) => !/Total/.test(c[0]));
    expect(tab.length).toBeGreaterThanOrEqual(5);
    expect(tab.reduce((t, c) => t + eur(c[2]), 0)).toBeCloseTo(p, 2);
    expect(tab.reduce((t, c) => t + eur(c[3]), 0)).toBeCloseTo(l, 2);
  });
});
