// Colonne « Vérifié » : réécriture d'une ligne du tableau des prix (applyVerified), validation du corps, hôte local, requête vers le plugin de développement.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyVerified, isChecked, isLocalHost, parseVerifiedBody, persistVerified, plain, verifiedKey } from '@/features/docs/DocModal/verified';

const MD = [
  'Avant', '',
  '| Groupe | Désignation | Quantité | Prix | Prix du lot | Modèle exact / lien | Vérifié |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  '| Pi | Raspberry **Pi 5** | 1 | 75 € | 75 € | [page](https://x.fr/a) | [ ] |',
  '| Pi | Caméra | 1 | 35 € | 35 € | lien à trouver — référence exacte : caméra | [x] |',
  '| Corps | Caméra | 1 | 5 € | 5 € | fabriqué | [ ] |',
  '| Corps | Colle | 1 | 8 € | 8 € | fabriqué | [ ] |',
  '| Corps | Colle | 1 | 9 € | 9 € | fabriqué | [ ] |',
  '', 'Après [ ] | [ ] |',
].join('\n');
const md = (r: unknown) => (r as { md: string }).md;

describe('applyVerified', () => {
  it('coche et décoche la seule ligne visée, le reste du fichier est intact', () => {
    const r = applyVerified(MD, 'Pi', 'Raspberry Pi 5', true);
    const a = md(r).split('\n'), b = MD.split('\n');
    expect(a.filter((l, i) => l !== b[i])).toEqual(['| Pi | Raspberry **Pi 5** | 1 | 75 € | 75 € | [page](https://x.fr/a) | [x] |']);
    expect(applyVerified(md(r), 'Pi', 'Raspberry Pi 5', false)).toEqual({ ok: true, md: MD });
    expect(md(applyVerified(MD, 'Pi', 'Caméra', true))).toBe(MD); // déjà cochée : idempotent
  });
  it('le groupe départage deux éléments de même nom', () => {
    const r = md(applyVerified(MD, 'Corps', 'Caméra', true));
    expect(r).toContain('| Corps | Caméra | 1 | 5 € | 5 € | fabriqué | [x] |');
    expect(r).toContain('| Pi | Caméra | 1 | 35 € | 35 € | lien à trouver — référence exacte : caméra | [x] |');
  });
  it('ligne ambiguë, inexistante, ou tableau absent : échec propre', () => {
    expect(applyVerified(MD, 'Corps', 'Colle', true)).toEqual({ ok: false, error: 'ambigu' });
    expect(applyVerified(MD, 'Corps', 'Rien', true)).toEqual({ ok: false, error: 'introuvable' });
    expect(applyVerified('# rien', 'Pi', 'x', true)).toEqual({ ok: false, error: 'tableau' });
  });
  it('ligne sans case « Vérifié » en fin : introuvable (jamais de réécriture à l\'aveugle)', () => {
    const t = '| Groupe | Désignation | Quantité | Prix |\n| - | - | - | - |\n| A | b | 1 | 1 € | 1 € | x | oui |\n';
    expect(applyVerified(t, 'A', 'b', true)).toEqual({ ok: false, error: 'introuvable' });
  });
  it('garde les fins de ligne CRLF (et le LF d\'un fichier LF)', () => {
    const crlf = MD.replace(/\n/g, '\r\n');
    const r = md(applyVerified(crlf, 'Corps', 'Caméra', true));
    expect(r).toBe(crlf.replace('| Corps | Caméra | 1 | 5 € | 5 € | fabriqué | [ ]', '| Corps | Caméra | 1 | 5 € | 5 € | fabriqué | [x]'));
    expect(md(applyVerified(MD, 'Corps', 'Caméra', true))).not.toContain('\r');
  });
  it('s\'arrête au bout du tableau', () => {
    expect(applyVerified(MD, 'Après [ ]', '[ ]', true)).toEqual({ ok: false, error: 'introuvable' });
  });
  it('le vrai document : chaque ligne du tableau se retrouve par groupe + élément', () => {
    const doc = readFileSync(join(__dirname, '..', 'docs', 'schema-electronique.md'), 'utf8');
    const start = doc.indexOf('| Groupe | Désignation | Quantité | Prix |'), rows = doc.slice(start, doc.indexOf('\n\n', start)).split('\n').slice(2);
    for (const l of rows) {
      const c = l.split('|').slice(1, -1).map((x) => x.trim());
      expect(applyVerified(doc, c[0], c[1], true).ok, l).toBe(true);
    }
  });
});

describe('petits outils', () => {
  it('plain : liens, gras, code et espaces', () => { expect(plain(' [a **b**](https://x)  `c`\n d ')).toBe('a b c d'); });
  it('verifiedKey, isChecked', () => {
    expect(verifiedKey('a', 'b')).toBe('a\u0000b');
    expect([isChecked('[x]'), isChecked(' [X] '), isChecked('[ ]'), isChecked(''), isChecked(null), isChecked(undefined)]).toEqual([true, true, false, false, false, false]);
  });
  it('parseVerifiedBody : types, longueurs et clés strictes', () => {
    const ok = { groupe: 'Pi', element: 'Caméra', verified: true };
    expect(parseVerifiedBody(ok)).toEqual(ok);
    for (const bad of [null, 'x', 3, [], { ...ok, extra: 1 }, { groupe: 'Pi', element: 'x' }, { groupe: 'Pi', element: 'x', other: true },
      { ...ok, groupe: '' }, { ...ok, groupe: 'a'.repeat(201) }, { ...ok, element: '' }, { ...ok, element: 'a'.repeat(2001) },
      { ...ok, groupe: 1 }, { ...ok, element: 2 }, { ...ok, verified: 'true' }]) expect(parseVerifiedBody(bad), JSON.stringify(bad)).toBeNull();
    expect(parseVerifiedBody({ groupe: 'a'.repeat(200), element: 'b'.repeat(2000), verified: false })).not.toBeNull();
  });
  it('isLocalHost : seulement la machine locale', () => {
    for (const h of ['localhost', 'localhost:5174', '127.0.0.1:5174', '[::1]:5174', 'LOCALHOST:80']) expect(isLocalHost(h), h).toBe(true);
    for (const h of [undefined, '', 'evil.com', 'localhost.evil.com', '192.168.1.5:5174', 'localhost:99999x', '::1', 'x@localhost']) expect(isLocalHost(h), String(h)).toBe(false);
  });
});

describe('persistVerified', () => {
  const body = { groupe: 'Pi', element: 'Caméra', verified: true };
  it('en production : aucune requête', async () => {
    let n = 0;
    expect(await persistVerified(body, false, (async () => { n++; return { ok: true }; }) as unknown as typeof fetch)).toBe(false);
    expect(n).toBe(0);
  });
  it('en développement : POST JSON vers la route locale ; true si accepté, false si refusé ou en panne', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const f = (ok: boolean) => (async (url: string, init: RequestInit) => { seen.push({ url, init }); return { ok }; }) as unknown as typeof fetch;
    expect(await persistVerified(body, true, f(true))).toBe(true);
    expect(seen[0].url).toBe('/__doc/verified');
    expect(seen[0].init.method).toBe('POST');
    expect(JSON.parse(String(seen[0].init.body))).toEqual(body);
    expect(await persistVerified(body, true, f(false))).toBe(false);
    expect(await persistVerified(body, true, (async () => { throw new Error('réseau'); }) as unknown as typeof fetch)).toBe(false);
  });
  it('sans fetch fourni, utilise le fetch global', async () => {
    const orig = globalThis.fetch; let url = '';
    globalThis.fetch = (async (u: string) => { url = u; return { ok: true }; }) as unknown as typeof fetch;
    try { expect(await persistVerified(body, true)).toBe(true); } finally { globalThis.fetch = orig; }
    expect(url).toBe('/__doc/verified');
  });
});
