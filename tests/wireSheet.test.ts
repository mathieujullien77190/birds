import { describe, expect, it } from 'vitest';
import { isWirePlank, wireInfo, type Plank } from '@/birdhouse/model';
import { fmtCm, wireSheetFor, wireSheetRows, wireSummary } from '@/features/viewer/components/WireSheet/helpers';
import { schemaFocus, schemaKeys } from '@/features/schema/SchemaPanel/helpers';
import { buildNest } from './helpers';

const nest = buildNest({}).planks;
const wire = (re: RegExp) => nest.find((p) => re.test(p.name))!;
const label = (rows: [string, string][], k: string) => rows.find(([l]) => l === k)?.[1];

describe('fiche du fil affichée sur la vue', () => {
  it('format des longueurs', () => expect(fmtCm(23.4)).toBe('23,4 cm'));
  it('une fiche seulement pour un fil choisi seul, non fermé', () => {
    const w = wire(/^Fil PWM ventilateur/);
    expect(wireSheetFor(w, nest, null, null)?.name).toBe(w.name);
    expect(wireSheetFor(w, nest, 'g', null)).toBeNull(); // c'est tout un groupe qui est choisi
    expect(wireSheetFor(w, nest, null, w.id)).toBeNull(); // fiche fermée
    expect(wireSheetFor(null, nest, null, null)).toBeNull();
    expect(wireSheetFor(nest.find((p) => !isWirePlank(p))!, nest, null, null)).toBeNull();
  });
  it('les lignes : de, vers, tension, diamètre, section, longueur, broche, raccord', () => {
    const rows = wireSheetRows(wireInfo(wire(/^Fil PWM ventilateur/), nest)!);
    expect(label(rows, 'De')).toContain('GPIO18');
    expect(label(rows, 'Vers')).toContain('Rallonge');
    expect(label(rows, 'Diamètre dessiné')).toBe('Ø 1,2 mm');
    expect(label(rows, 'Section')).toBe('≈ 0,25 mm²');
    expect(label(rows, 'Longueur du trajet')).toMatch(/^\d+(,\d)? cm \(coudes arrondis\)$/);
    expect(label(rows, 'Broches du Pi')).toBe('broche 12');
    expect(label(rows, 'Raccord')).toContain('Dupont');
    expect(rows.every(([, v]) => v)).toBe(true);
  });
  it('nappe : largeur ; fil sans broche : pas de ligne « Broches du Pi »', () => {
    expect(label(wireSheetRows(wireInfo(wire(/^Nappe caméra$/), nest)!), 'Largeur')).toBe('16 mm');
    expect(label(wireSheetRows(wireInfo(wire(/^Fil Wago \+ → interrupteur/), nest)!), 'Broches du Pi')).toBeUndefined();
  });
  it('résumé dans « Pièces »', () => {
    expect(wireSummary(wire(/^Fil SDA/), nest)).toMatch(/^Raspberry Pi, GPIO2 SDA \(broche 3\) → Capteur BME280 \(SDA\) · [\d,]+ cm$/);
    expect(wireSummary(wire(/^Pi|^Raspberry/), nest)).toBeNull();
    expect(wireSummary({ ...wire(/^Fil SDA/), name: 'Fil mystère' }, nest)).toMatch(/^[\d,]+ cm$/);
  });
});

describe('surbrillance du fil choisi dans le schéma', () => {
  it('le survol l\'emporte ; sinon le fil choisi ; jamais un composant choisi', () => {
    const w = wire(/^Fil PWM ventilateur/), pi = wire(/^Raspberry Pi/);
    expect(schemaFocus({ plank: pi.id }, nest, w.id)).toEqual({ plank: pi.id });
    expect(schemaFocus(null, nest, w.id)).toEqual({ plank: w.id });
    expect(schemaFocus(null, nest, pi.id)).toBeNull();
    expect(schemaFocus(null, nest, null)).toBeNull();
    expect(schemaFocus(null, nest, 'inconnu')).toBeNull();
  });
  it('chaque fil de la scène a sa flèche dans le schéma (MAP)', () => {
    const missing = nest.filter((p: Plank) => isWirePlank(p) && p.special !== 'conduit' && !schemaKeys(p.name)?.edges.length).map((p) => p.name);
    expect(missing).toEqual([]);
  });
});
