// @vitest-environment jsdom
// Découpe laser : adaptateur (planche vide) et hook useLaser (réglages gardés, rangement, aperçu, machine) ; laser-control est doublé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { NEST_DEFAULT, makeNest, nestSheets, sheetsPreviewSvg, type NestSheet, type PlankScene } from '@/birdhouse/model';
import { sheetToJob, sheetsToItems } from '@/features/laser/adapter';
import { CUT_CFG_KEY, DEFAULT_CUT_CFG } from '@/features/laser/constants';

const machine = { fake: 'machine' };
const useLaserMachine = vi.fn((..._a: unknown[]) => machine);
vi.mock('@laser', () => ({ useLaserMachine: (...a: unknown[]) => useLaserMachine(...a) }));

import { useLaser } from '@/features/laser/hooks/useLaser';

const nest = makeNest(NEST_DEFAULT, 3, 0.2, 1);
const sc: PlankScene = { t: 3, fit: 0.2, planks: nest.planks, groupNames: nest.groupNames, up: 'z2' };

describe('sheetToJob : planche vide ou pleine', () => {
  it('sans pièce : pas de cadre, pas de contour, mais la taille de la planche', () => {
    const job = sheetToJob({ items: [] } as unknown as NestSheet, 410, 400);
    expect(job.frame).toBeUndefined();
    expect(job.pieces).toEqual([]);
    expect(job.layers.cut).toEqual([]);
    expect([job.widthMm, job.heightMm]).toEqual([410, 400]);
  });
  it("avec des pièces : le cadre est l'encombrement des plaques entières, origine en bas à gauche", () => {
    const sheets = nestSheets(sc, 410, 400, 5), job = sheetToJob(sheets[0], 410, 400);
    const items = sheets[0].items;
    expect(job.frame!.minX).toBeCloseTo(Math.min(...items.map((i) => i.x)), 9);
    expect(job.frame!.maxX).toBeCloseTo(Math.max(...items.map((i) => i.x + i.w)), 9);
    expect(job.frame!.minY).toBeCloseTo(400 - Math.max(...items.map((i) => i.y + i.h)), 9);
    expect(job.frame!.maxY).toBeCloseTo(400 - Math.min(...items.map((i) => i.y)), 9);
  });
});

describe('useLaser', () => {
  beforeEach(() => { localStorage.clear(); useLaserMachine.mockClear(); });
  afterEach(() => localStorage.clear());

  it('réglages par défaut, planches rangées, aperçu SVG et pilotage de la machine alimenté par les planches', () => {
    const { result } = renderHook(() => useLaser(sc));
    const r = result.current;
    expect(r.cutCfg).toEqual(DEFAULT_CUT_CFG);
    expect(r.cutView).toBe(false);
    expect(r.sheets).toEqual(nestSheets(sc, 400, 400, 5));
    expect(r.preview).toBe(sheetsPreviewSvg(r.sheets, 400, 400));
    expect(r.preview).toContain('<svg');
    expect(r.machine).toBe(machine);
    const [items, size] = useLaserMachine.mock.calls[useLaserMachine.mock.calls.length - 1] as [{ fileName: string }[], { W: number; H: number }];
    expect(items.map((i) => i.fileName)).toEqual(r.sheets.map((_, i) => `planche-${i + 1}`));
    expect(size).toEqual({ W: 400, H: 400 });
  });
  it('lit les réglages enregistrés, les enregistre à chaque changement et refait le rangement', () => {
    localStorage.setItem(CUT_CFG_KEY, JSON.stringify({ W: 300, H: 250, gap: 4 }));
    const { result } = renderHook(() => useLaser(sc));
    expect(result.current.cutCfg).toEqual({ W: 300, H: 250, gap: 4 });
    expect(result.current.sheets).toEqual(nestSheets(sc, 300, 250, 4));
    act(() => result.current.setCutCfg({ W: 500, H: 500, gap: 6 }));
    expect(JSON.parse(localStorage.getItem(CUT_CFG_KEY)!)).toEqual({ W: 500, H: 500, gap: 6 });
    expect(result.current.sheets).toEqual(nestSheets(sc, 500, 500, 6));
    expect(useLaserMachine.mock.calls[useLaserMachine.mock.calls.length - 1][1]).toEqual({ W: 500, H: 500 });
  });
  it("bascule entre l'aperçu des planches et la 3D", () => {
    const { result } = renderHook(() => useLaser(sc));
    act(() => result.current.setCutView(true));
    expect(result.current.cutView).toBe(true);
  });
  it('ne refait pas le rangement quand ni la scène ni les réglages ne changent', () => {
    const { result, rerender } = renderHook(() => useLaser(sc));
    const sheets = result.current.sheets, preview = result.current.preview;
    rerender();
    expect(result.current.sheets).toBe(sheets);
    expect(result.current.preview).toBe(preview);
    expect(sheetsToItems(sheets, 410, 400)).toHaveLength(sheets.length);
  });
});
