import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderDoc } from '@/features/docs/DocModal/helpers';

const md = readFileSync(join(__dirname, '..', 'docs', 'schema-electronique.md'), 'utf8');

describe('liens du document « Schéma électronique »', () => {
  it('chaque ligne du tableau des prix donne le modèle exact : un lien, ou la référence exacte à chercher', () => {
    const start = md.indexOf('| Groupe | Élément | Prix |'), rows = md.slice(start, md.indexOf('\n\n', start)).split('\n').slice(2);
    expect(rows.length).toBeGreaterThan(30);
    for (const r of rows) {
      const cells = r.split('|').slice(1, -1).map((c) => c.trim());
      expect(cells, r).toHaveLength(4);
      expect(/\]\(https:\/\/[^ )]+\)/.test(cells[3]) || /^lien à trouver — référence exacte : .{15,}/.test(cells[3]) || /^(fabriqué|incluse)/.test(cells[3]), r).toBe(true);
    }
  });
  it('le rendu ouvre chaque lien dans un nouvel onglet, sans casser le tableau', () => {
    const html = renderDoc(md), anchors = html.match(/<a [^>]*href="https?:[^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThan(20);
    for (const a of anchors) { expect(a).toContain('target="_blank"'); expect(a).toContain('rel="noopener noreferrer"'); }
    expect(html).toContain('<th>Modèle exact / lien</th>');
  });
  it('plus de lien mort connu', () => { expect(md).not.toContain('azcus.digikey.com'); expect(md).not.toContain('cdn.sparkfun.com'); });
});
