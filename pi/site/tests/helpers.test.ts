import { describe, expect, it } from 'vitest';
import { describeAuto, isDirty, AUTO_LABELS } from '@/components/AutoFan/helpers';
import { AUTO_FIELDS } from '@/components/AutoFan/constants';
import { levelColor, remainingWh } from '@/components/BatteryCard/helpers';
import { LEVEL_COLORS } from '@/components/BatteryCard/constants';
import { cameraError } from '@/components/CameraCard/helpers';
import { autonomyHours, formatHours } from '@/components/ConsumptionCard/helpers';
import { ITEMS } from '@/components/ConsumptionCard/constants';
import { describeFan } from '@/components/FanCard/helpers';
import { lastReading } from '@/components/Header/helpers';
import { hasData, linePaths, temperatureRange, timeTicks } from '@/components/HistoryChart/helpers';
import { nestDelta } from '@/components/NestCard/helpers';
import { makeState, point } from './fixtures';

describe('AutoFan helpers', () => {
  it.each([
    ['inactif', 'Désactivée'], ['veille', 'Veille (ventilateur arrêté)'], ['ventile', 'Ventile'], ['securite', 'Arrêtée par sécurité'],
  ] as const)('describeAuto(%s)', (etat, label) => {
    const a = { ...makeState().auto, etat, raison: 'parce que' };
    expect(AUTO_LABELS[etat]).toBe(label);
    expect(describeAuto(a)).toBe(`${label} — parce que`);
  });
  it('isDirty : faux si identique (texte vs nombre), vrai si un champ diffère', () => {
    expect(isDirty({ a: '28', b: '2.5' }, { a: 28, b: 2.5 })).toBe(false);
    expect(isDirty({ a: '28', b: '3' }, { a: 28, b: 2.5 })).toBe(true);
    expect(isDirty({}, {})).toBe(false);
  });
  it('AUTO_FIELDS couvre exactement les réglages de AutoSettings', () => {
    const { auto } = makeState();
    for (const f of AUTO_FIELDS) {
      expect(typeof auto[f.key]).toBe('number');
      expect(f.min).toBeLessThan(f.max);
    }
    expect(AUTO_FIELDS.map((f) => f.key).sort()).toEqual(
      ['alerte_chaleur', 'ecart_ext', 'hysteresis', 'plage', 'seuil_marche', 'vitesse_max', 'vitesse_min'],
    );
  });
});

describe('BatteryCard helpers', () => {
  it.each([[null, LEVEL_COLORS.unknown], [100, LEVEL_COLORS.high], [51, LEVEL_COLORS.high], [50, LEVEL_COLORS.mid], [20, LEVEL_COLORS.mid], [19.9, LEVEL_COLORS.low], [0, LEVEL_COLORS.low]])(
    'levelColor(%s)', (pct, color) => { expect(levelColor(pct)).toBe(color); });
  it('les trois couleurs sont distinctes', () => {
    expect(new Set(Object.values(LEVEL_COLORS)).size).toBe(4);
  });
  it('remainingWh arrondit au dixième', () => {
    expect(remainingWh(100)).toBe(76.8);
    expect(remainingWh(50)).toBe(38.4);
    expect(remainingWh(33)).toBe(25.3);
    expect(remainingWh(0)).toBe(0);
  });
});

describe('cameraError', () => {
  it('picamera2 prime sur la caméra', () => {
    expect(cameraError({ picamera2: 'P', camera1: 'C1', camera2: 'C2' }, 1)).toBe('P');
    expect(cameraError({ picamera2: 'P', camera2: 'C2' }, 2)).toBe('P');
  });
  it('sinon l\'erreur de la caméra demandée', () => {
    expect(cameraError({ camera1: 'C1', camera2: 'C2' }, 1)).toBe('C1');
    expect(cameraError({ camera1: 'C1', camera2: 'C2' }, 2)).toBe('C2');
  });
  it('rien sans erreurs', () => {
    expect(cameraError({}, 1)).toBeUndefined();
    expect(cameraError(undefined, 2)).toBeUndefined();
  });
});

describe('ConsumptionCard helpers', () => {
  it('autonomyHours = Wh restants / W', () => {
    expect(autonomyHours(100, 7.68)).toBeCloseTo(10, 10);
    expect(autonomyHours(50, 7.68)).toBeCloseTo(5, 10);
  });
  it.each([[null, 10], [80, null], [80, 0], [80, -2]])('autonomyHours(%s, %s) = null', (p, w) => {
    expect(autonomyHours(p, w)).toBeNull();
  });
  it('autonomyHours accepte 0 % (0 h)', () => { expect(autonomyHours(0, 10)).toBe(0); });
  it('formatHours : heures-minutes, zéro de remplissage, jours au-delà de 48 h', () => {
    expect(formatHours(7.5)).toBe('7 h 30');
    expect(formatHours(2 + 5 / 60)).toBe('2 h 05');
    expect(formatHours(0)).toBe('0 h 00');
    expect(formatHours(47.99)).toBe('47 h 59');
    expect(formatHours(48)).toBe('2 jours');
    expect(formatHours(100)).toBe('4 jours');
  });
  it('ITEMS liste les quatre postes', () => {
    expect(ITEMS.map((i) => i.key)).toEqual(['pi', 'cameras', 'led', 'ventilo']);
  });
});

describe('describeFan', () => {
  const fan = makeState().ventilo;
  it('— sans ventilateur', () => { expect(describeFan(undefined)).toBe('—'); });
  it('coupé quand non alimenté', () => { expect(describeFan({ ...fan, alimente: false, pourcent: 50 })).toBe('coupé (12 V)'); });
  it('avec tachymètre', () => { expect(describeFan({ ...fan, pourcent: 60, rpm: 1920, mode: 'auto' })).toBe('60 % · 1920 tr/min · automatique'); });
  it('sans tachymètre', () => { expect(describeFan({ ...fan, pourcent: 40, rpm: null, mode: 'manuel' })).toBe('40 % · à la main'); });
  it('arrêté', () => { expect(describeFan(fan)).toBe('0 % · arrêté'); });
});

describe('lastReading', () => {
  it('injoignable prime', () => { expect(lastReading(makeState(), true)).toBe('programme injoignable'); });
  it("l'heure du Pi", () => { expect(lastReading(makeState(), false)).toBe('12:34:56'); });
  it('tiret sans état ou sans lecture', () => {
    expect(lastReading(null, false)).toBe('—');
    expect(lastReading(makeState({ derniere_lecture: null }), false)).toBe('—');
  });
});

describe('nestDelta', () => {
  it('écart arrondi au dixième, signe conservé', () => {
    expect(nestDelta(24.5, 20)).toBe(4.5);
    expect(nestDelta(18, 20.26)).toBe(-2.3);
    expect(nestDelta(20, 20)).toBe(0);
  });
  it.each([[null, 1], [1, null], [undefined, 1], [1, undefined]])('null si une mesure manque (%s, %s)', (a, b) => {
    expect(nestDelta(a, b)).toBeNull();
  });
  it('0 est une vraie mesure', () => { expect(nestDelta(0, 0)).toBe(0); });
});

describe('HistoryChart helpers', () => {
  it('temperatureRange : null sans mesure', () => {
    expect(temperatureRange([])).toBeNull();
    expect(temperatureRange([point('a', null, null)])).toBeNull();
  });
  it('temperatureRange : entiers autour des extrêmes', () => {
    expect(temperatureRange([point('a', 10.2, 20.5), point('b', 12, null)])).toEqual({ min: 9, max: 22 });
  });
  it('temperatureRange : au moins 4 °C d\'écart, centré', () => {
    expect(temperatureRange([point('a', 20, 20)])).toEqual({ min: 18, max: 22 });
    expect(temperatureRange([point("a", 20.5, 21.4)])).toEqual({ min: 19, max: 23 });
  });
  it('linePaths : un tronçon continu', () => {
    expect(linePaths([1, 2, 3], (i) => i * 10, (v) => v * 2)).toEqual(['M0.0,2.0L10.0,4.0L20.0,6.0']);
  });
  it('linePaths : les null coupent la ligne', () => {
    expect(linePaths([1, null, 2, 3, null], (i) => i, (v) => v)).toEqual(['M0.0,1.0', 'M2.0,2.0L3.0,3.0']);
  });
  it('linePaths : plusieurs null d\'affilée, début nul, liste vide', () => {
    expect(linePaths([null, null, 5], (i) => i, (v) => v)).toEqual(['M2.0,5.0']);
    expect(linePaths([4, null, null], (i) => i, (v) => v)).toEqual(['M0.0,4.0']);
    expect(linePaths([], (i) => i, (v) => v)).toEqual([]);
    expect(linePaths([null], (i) => i, (v) => v)).toEqual([]);
  });
  it('timeTicks : 0 ou 1 point', () => {
    expect(timeTicks(0, 6)).toEqual([0]);
    expect(timeTicks(1, 6)).toEqual([0]);
  });
  it('timeTicks : régulier, dernier repère ajouté s\'il est loin', () => {
    expect(timeTicks(11, 6)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(timeTicks(8, 6)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(timeTicks(5, 3)).toEqual([0, 2, 4]);
    expect(timeTicks(10, 4)).toEqual([0, 3, 6, 9]);
  });
  it('timeTicks : le dernier point n\'est pas dupliqué quand il est proche', () => {
    // count 7, n 4 : pas 2 -> 0,2,4,6 ; 6 est le dernier
    expect(timeTicks(7, 4)).toEqual([0, 2, 4, 6]);
    // count 6, n 4 : pas round(5/3)=2 -> 0,2,4 ; reste 1 <= 1 : pas d'ajout
    expect(timeTicks(6, 4)).toEqual([0, 2, 4]);
    // count 8, n 3 : pas round(3.5)=4 -> 0,4 ; reste 3 > 2 : ajout de 7
    expect(timeTicks(8, 3)).toEqual([0, 4, 7]);
  });
  it('hasData : au moins deux points avec une mesure', () => {
    expect(hasData([])).toBe(false);
    expect(hasData([point('a', 1, null)])).toBe(false);
    expect(hasData([point('a', 1, null), point('b', null, null)])).toBe(false);
    expect(hasData([point('a', 1, null), point('b', null, 2)])).toBe(true);
  });
});
