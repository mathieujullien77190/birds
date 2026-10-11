// @vitest-environment jsdom
// Tableau des prix interactif (enhancePrices) : cases à cocher par ligne et par groupe, sous-totaux, total, mémoire dans localStorage.
import { beforeEach, describe, expect, it } from 'vitest';
import { enhancePrices } from '@/features/docs/DocModal/helpers';

const KEY = 'plaques-prix-decoches';
const TABLE = `<table><thead><tr><th>Groupe</th><th>Élément</th><th>Prix</th><th>Modèle exact / lien</th></tr></thead><tbody>
<tr><td>Énergie</td><td>Batterie</td><td>100 €</td><td><a href="https://x.fr">fiche</a></td></tr>
<tr><td>Énergie</td><td>Fusible</td><td>2,50 €</td><td>réf</td></tr>
<tr><td>Pi</td><td>Raspberry</td><td>80 €</td><td></td></tr>
<tr><td>Pi</td><td>Gratuit</td><td>offert</td></tr>
</tbody></table><table><thead><tr><th>Autre</th><th>x</th><th>y</th></tr></thead><tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>`;

const mount = () => { const root = document.createElement('div'); root.innerHTML = TABLE; enhancePrices(root); return root; };
const num = (td: Element) => parseFloat((td.textContent ?? '').replace(/[^0-9,]/g, '').replace(',', '.'));
const rows = (root: HTMLElement) => Array.from(root.querySelector('table')!.querySelectorAll('tbody tr'));
const box = (tr: Element) => tr.querySelector('input') as HTMLInputElement;
const click = (cb: HTMLInputElement) => { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); };

describe('enhancePrices', () => {
  beforeEach(() => localStorage.clear());

  it('regroupe par groupe : une ligne de groupe avec son sous-total, les éléments, puis le total coché', () => {
    const root = mount();
    const r = rows(root);
    expect(r.map((x) => x.className)).toEqual(['doc-price-group', '', '', 'doc-price-group', '', '', 'doc-price-total']);
    expect(num(r[0].children[2])).toBe(102.5);
    expect(num(r[3].children[2])).toBe(80); // « offert » : prix 0
    expect(num(r[6].children[2])).toBe(182.5);
    expect(root.querySelector('thead')!.textContent).toContain('Modèle exact / lien');
    expect(r[1].children[3].innerHTML).toContain('href="https://x.fr"'); // le lien est gardé
    expect(r[5].children[3].innerHTML).toBe(''); // ligne sans 4ᵉ colonne
    expect(rows(root).every((x) => x === r[6] || box(x).checked)).toBe(true);
  });

  it('ne touche pas aux autres tableaux', () => {
    const root = mount();
    expect(root.querySelectorAll('table')[1].textContent).toContain('Autre');
    expect(root.querySelectorAll('table')[1].querySelector('input')).toBeNull();
  });

  it('décocher une ligne retire son prix du sous-total et du total, la ligne est barrée, et le choix est gardé', () => {
    const root = mount();
    click(box(rows(root)[1])); // Batterie
    const r = rows(root);
    expect(r[1].className).toBe('doc-price-off');
    expect(box(r[1]).checked).toBe(false);
    expect(num(r[0].children[2])).toBe(2.5);
    expect(num(r[6].children[2])).toBe(82.5);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['Batterie']);
    click(box(rows(root)[1])); // on recoche
    expect(num(rows(root)[6].children[2])).toBe(182.5);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
  });

  it('la case du groupe décoche puis recoche tout le groupe ; elle est décochée quand tout est décoché', () => {
    const root = mount();
    click(box(rows(root)[0]));
    let r = rows(root);
    expect(box(r[0]).checked).toBe(false);
    expect([r[1].className, r[2].className]).toEqual(['doc-price-off', 'doc-price-off']);
    expect(num(r[0].children[2])).toBe(0);
    expect(num(r[6].children[2])).toBe(80);
    expect(JSON.parse(localStorage.getItem(KEY)!).sort()).toEqual(['Batterie', 'Fusible']);
    click(box(rows(root)[0]));
    r = rows(root);
    expect(box(r[0]).checked).toBe(true);
    expect(num(r[6].children[2])).toBe(182.5);
  });

  it('relit les lignes décochées au montage, et ignore un stockage illisible', () => {
    localStorage.setItem(KEY, JSON.stringify(['Raspberry']));
    let r = rows(mount());
    expect(r[4].className).toBe('doc-price-off');
    expect(num(r[6].children[2])).toBe(102.5);
    localStorage.setItem(KEY, 'pas du json');
    r = rows(mount());
    expect(num(r[6].children[2])).toBe(182.5);
  });

  it('un stockage qui refuse l\'écriture ne casse pas le tableau', () => {
    const root = mount();
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('quota'); };
    try { click(box(rows(root)[1])); } finally { Storage.prototype.setItem = orig; }
    expect(num(rows(root)[6].children[2])).toBe(82.5);
  });
});
