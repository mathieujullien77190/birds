// @vitest-environment jsdom
// Tableau des prix interactif (enhancePrices) : cases à cocher par ligne et par groupe, sous-totaux, total, mémoire dans localStorage.
import { beforeEach, describe, expect, it } from 'vitest';
import { enhancePrices } from '@/features/docs/DocModal/helpers';

const KEY = 'plaques-prix-decoches';
const TABLE = `<table><thead><tr><th>Groupe</th><th>Désignation</th><th>Quantité</th><th>Prix</th><th>Prix du lot</th><th>Modèle exact / lien</th><th>Vérifié</th></tr></thead><tbody>
<tr><td>Énergie</td><td>Batterie</td><td>1</td><td>100 €</td><td>100 €</td><td><a href="https://x.fr">fiche</a></td><td>[x]</td></tr>
<tr><td>Énergie</td><td>Fusible</td><td>1 sur 5</td><td>2,50 €</td><td>12,50 €</td><td>réf</td><td>[ ]</td></tr>
<tr><td>Pi</td><td>Raspberry</td><td>1</td><td>80 €</td><td></td></tr>
<tr><td>Pi</td><td>Gratuit</td><td>1</td><td>offert</td></tr>
</tbody></table><table><thead><tr><th>Autre</th><th>x</th><th>y</th></tr></thead><tbody><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>`;

const mount = (dev = false, doFetch: typeof fetch = (() => Promise.reject(new Error('pas de serveur'))) as typeof fetch) => { const root = document.createElement('div'); root.innerHTML = TABLE; enhancePrices(root, dev, doFetch); return root; };
const vbox = (tr: Element) => tr.querySelector('input.doc-verified') as HTMLInputElement;
const flush = () => new Promise((r) => setTimeout(r, 0));
const VKEY = 'plaques-prix-verifies';
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
    expect(num(r[0].children[3])).toBe(102.5);
    expect(num(r[3].children[3])).toBe(80); // « offert » : prix 0
    expect(num(r[6].children[3])).toBe(182.5);
    expect(root.querySelector('thead')!.textContent).toContain('Modèle exact / lien');
    expect(r[1].children[5].innerHTML).toContain('href="https://x.fr"'); // le lien est gardé
    expect(r[5].children[5].innerHTML).toBe(''); // ligne sans 4ᵉ colonne
    expect(rows(root).every((x) => x === r[6] || box(x).checked)).toBe(true);
  });

  it('colonne « Prix du lot » : sous-totaux et total du lot ; sans prix de lot, le prix du besoin compte', () => {
    const r = rows(mount());
    expect(num(r[0].children[4])).toBe(112.5); // 100 + 12,50
    expect(num(r[3].children[4])).toBe(80); // pas de prix de lot : le besoin
    expect(num(r[6].children[4])).toBe(192.5);
    expect(num(r[2].children[4])).toBe(12.5);
  });

  it('colonne « Vérifié » : case par ligne lue du Markdown, compteurs par groupe et au total, indépendante de la case du total', () => {
    const root = mount();
    const r = rows(root);
    expect(root.querySelector('thead')!.textContent).toContain('Vérifié');
    expect([r[1], r[2], r[4], r[5]].map((x) => vbox(x).checked)).toEqual([true, false, false, false]);
    expect(r[0].children[6].textContent).toBe('1 / 2 vérifiés');
    expect(r[3].children[6].textContent).toBe('0 / 2 vérifiés');
    expect(r[6].children[6].textContent).toBe('1 / 4 vérifiés');
    click(box(r[1])); // décocher l'inclusion ne change pas « Vérifié »
    expect(vbox(rows(root)[1]).checked).toBe(true);
  });

  it('hors développement : « Vérifié » reste dans le navigateur (plaques-prix-verifies), la note le dit, relu au montage', () => {
    const root = mount(false);
    expect(root.querySelector('.doc-price-note')!.textContent).toContain('navigateur seulement');
    click(vbox(rows(root)[2])); // Fusible -> vérifié
    click(vbox(rows(root)[1])); // Batterie (md [x]) -> pas vérifié
    expect(JSON.parse(localStorage.getItem(VKEY)!)).toEqual({ 'Énergie\u0000Fusible': true, 'Énergie\u0000Batterie': false });
    expect(rows(root)[0].children[6].textContent).toBe('1 / 2 vérifiés');
    const again = rows(mount(false));
    expect([vbox(again[1]).checked, vbox(again[2]).checked]).toEqual([false, true]);
  });

  it('un stockage « Vérifié » illisible ou de mauvaise forme est ignoré ; un refus d\'écriture ne casse rien', () => {
    localStorage.setItem(VKEY, 'pas du json');
    expect(vbox(rows(mount())[1]).checked).toBe(true);
    localStorage.setItem(VKEY, '[1]');
    expect(vbox(rows(mount())[1]).checked).toBe(true);
    const root = mount(), orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('quota'); };
    try { click(vbox(rows(root)[2])); } finally { Storage.prototype.setItem = orig; }
    expect(vbox(rows(root)[2]).checked).toBe(true);
  });

  it('en développement : la case envoie la ligne au serveur ; si le fichier est réécrit, rien ne reste dans le navigateur', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const ok = (async (url: string, init: RequestInit) => { calls.push({ url, body: JSON.parse(String(init.body)) }); return { ok: true }; }) as unknown as typeof fetch;
    const root = mount(true, ok);
    expect(root.querySelector('.doc-price-note')!.textContent).toContain('réécrit à chaque case');
    click(vbox(rows(root)[2]));
    await flush();
    expect(calls).toEqual([{ url: '/__doc/verified', body: { groupe: 'Énergie', element: 'Fusible', verified: true } }]);
    expect(JSON.parse(localStorage.getItem(VKEY)!)).toEqual({});
    expect(vbox(rows(root)[2]).checked).toBe(true); // cohérent : le fichier fait foi
    click(vbox(rows(root)[2])); // décoche : la valeur de départ de la ligne est devenue « vérifié »
    await flush();
    expect(vbox(rows(root)[2]).checked).toBe(false);
  });

  it('en développement sans serveur (refus ou panne) : repli sur le navigateur et note explicite', async () => {
    const refuse = (async () => ({ ok: false })) as unknown as typeof fetch;
    const root = mount(true, refuse);
    click(vbox(rows(root)[2]));
    await flush();
    expect(root.querySelector('.doc-price-note')!.textContent).toContain('navigateur seulement');
    expect(JSON.parse(localStorage.getItem(VKEY)!)).toEqual({ 'Énergie\u0000Fusible': true });
    localStorage.clear();
    const down = mount(true); // fetch qui échoue
    click(vbox(rows(down)[2]));
    await flush();
    expect(vbox(rows(down)[2]).checked).toBe(true);
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
    expect(num(r[0].children[3])).toBe(2.5);
    expect(num(r[6].children[3])).toBe(82.5);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['Batterie']);
    click(box(rows(root)[1])); // on recoche
    expect(num(rows(root)[6].children[3])).toBe(182.5);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([]);
  });

  it('la case du groupe décoche puis recoche tout le groupe ; elle est décochée quand tout est décoché', () => {
    const root = mount();
    click(box(rows(root)[0]));
    let r = rows(root);
    expect(box(r[0]).checked).toBe(false);
    expect([r[1].className, r[2].className]).toEqual(['doc-price-off', 'doc-price-off']);
    expect(num(r[0].children[3])).toBe(0);
    expect(num(r[6].children[3])).toBe(80);
    expect(JSON.parse(localStorage.getItem(KEY)!).sort()).toEqual(['Batterie', 'Fusible']);
    click(box(rows(root)[0]));
    r = rows(root);
    expect(box(r[0]).checked).toBe(true);
    expect(num(r[6].children[3])).toBe(182.5);
  });

  it('relit les lignes décochées au montage, et ignore un stockage illisible', () => {
    localStorage.setItem(KEY, JSON.stringify(['Raspberry']));
    let r = rows(mount());
    expect(r[4].className).toBe('doc-price-off');
    expect(num(r[6].children[3])).toBe(102.5);
    localStorage.setItem(KEY, 'pas du json');
    r = rows(mount());
    expect(num(r[6].children[3])).toBe(182.5);
  });

  it('un stockage qui refuse l\'écriture ne casse pas le tableau', () => {
    const root = mount();
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('quota'); };
    try { click(box(rows(root)[1])); } finally { Storage.prototype.setItem = orig; }
    expect(num(rows(root)[6].children[3])).toBe(82.5);
  });
});

describe('enhancePrices : réglages par défaut', () => {
  it('sans paramètres : mode et fetch de l\'environnement (ici développement de vitest, fetch absent du serveur → repli navigateur)', async () => {
    localStorage.clear();
    const orig = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('pas de serveur'))) as typeof fetch;
    try {
      const root = document.createElement('div'); root.innerHTML = TABLE; enhancePrices(root);
      click(vbox(rows(root)[2]));
      await flush();
      expect(vbox(rows(root)[2]).checked).toBe(true);
      expect(JSON.parse(localStorage.getItem(VKEY)!)).toEqual({ 'Énergie\u0000Fusible': true });
    } finally { globalThis.fetch = orig; }
  });
});
