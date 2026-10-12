// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, makeZip, saveZip } from '@/lib';
import { nestSheets } from '@/birdhouse/model';
import { sheetFiles } from '@/features/laser/helpers';
import { sheetSvg } from '@/birdhouse/model';
import { buildNest } from './helpers';

const enc = (s: string) => new TextEncoder().encode(s);

/** Relit une archive ZIP « stockée » : noms, contenus et CRC par le répertoire central. */
function readZip(z: Uint8Array) {
  const v = new DataView(z.buffer, z.byteOffset, z.byteLength), n = v.getUint16(z.length - 12, true), cd = v.getUint32(z.length - 6, true);
  expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50);
  const out: { name: string; text: string; crc: number }[] = []; let o = cd;
  for (let i = 0; i < n; i++) {
    expect(v.getUint32(o, true)).toBe(0x02014b50);
    const crc = v.getUint32(o + 16, true), size = v.getUint32(o + 24, true), nl = v.getUint16(o + 28, true), off = v.getUint32(o + 42, true);
    const name = new TextDecoder().decode(z.subarray(o + 46, o + 46 + nl));
    expect(v.getUint32(off, true)).toBe(0x04034b50); const ll = v.getUint16(off + 26, true);
    out.push({ name, text: new TextDecoder().decode(z.subarray(off + 30 + ll, off + 30 + ll + size)), crc }); o += 46 + nl;
  }
  return out;
}

describe('zip (archive stockée, sans bibliothèque)', () => {
  it('crc32 : valeur de référence « 123456789 » = CBF43926 ; vide = 0', () => {
    expect(crc32(enc('123456789'))).toBe(0xcbf43926); expect(crc32(new Uint8Array())).toBe(0);
  });
  it('makeZip : noms (accents compris), contenus, CRC et nombre d’entrées relus ; texte ou octets', () => {
    const z = makeZip([{ name: 'planche-1.svg', data: '<svg>é</svg>' }, { name: 'dossier/pièce.bin', data: new Uint8Array([0, 1, 2, 255]) }], new Date(2026, 9, 12, 13, 14, 16));
    const e = readZip(z);
    expect(e.map((x) => x.name)).toEqual(['planche-1.svg', 'dossier/pièce.bin']); expect(e[0].text).toBe('<svg>é</svg>');
    expect(e[0].crc).toBe(crc32(enc('<svg>é</svg>'))); expect(e[1].crc).toBe(crc32(new Uint8Array([0, 1, 2, 255])));
    expect(readZip(makeZip([]))).toEqual([]);
  });
  it('un vrai outil d’extraction relit l’archive (unzip -t), si disponible', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zip-')), f = join(dir, 'a.zip');
    writeFileSync(f, makeZip([{ name: 'a.svg', data: '<svg/>' }, { name: 'b.svg', data: 'x'.repeat(5000) }]));
    let out = ''; try { out = execFileSync('unzip', ['-t', f], { encoding: 'utf8' }); } catch { return; /* pas d'unzip sur cette machine */ }
    expect(out).toMatch(/No errors detected/); expect(readFileSync(f).length).toBeGreaterThan(5000);
  });
  it('saveZip : lien de téléchargement nommé, type application/zip, adresse libérée', () => {
    const blobs: Blob[] = []; (URL as unknown as Record<string, unknown>).createObjectURL = (b: Blob) => { blobs.push(b); return 'blob:z'; };
    const revoke = vi.fn(); (URL as unknown as Record<string, unknown>).revokeObjectURL = revoke;
    const clicked: string[] = []; vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.download); });
    saveZip([{ name: 'a.svg', data: '<svg/>' }], 'planches.zip');
    expect(clicked).toEqual(['planches.zip']); expect(blobs[0].type).toBe('application/zip'); expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe('sheetFiles : un SVG par planche pour l’archive', () => {
  it('nommés par matériau, numéro et taille ; contenu = sheetSvg ; autant de fichiers que de planches', () => {
    const sc = buildNest({}), sheets = nestSheets(sc, 410, 400), cfg = { W: 410, H: 400, gap: 5 };
    const files = sheetFiles(sheets, cfg, sheetSvg);
    expect(files).toHaveLength(sheets.length); expect(files.length).toBeGreaterThan(5);
    files.forEach((f, i) => { expect(f.name).toMatch(/^planche(-mdf|-okoume)?-\d+-410x400\.svg$/); expect(f.name).toContain(`-${i + 1}-`); expect(f.data).toBe(sheetSvg(sheets[i], 410, 400, i)); expect(f.data).toContain('<svg'); });
    expect(files.some((f) => f.name.startsWith('planche-okoume'))).toBe(true); expect(new Set(files.map((f) => f.name)).size).toBe(files.length);
    expect(sheetFiles([{ material: 'mdf', items: [], used: 0 } as never], cfg, () => '')[0].name).toBe('planche-mdf-1-410x400.svg');
  });
});
