import type { Dispatch, SetStateAction } from 'react';
import { Btn, Chip, Slider } from '@/ui';
import { saveSvg } from '@/lib';
import { sheetLabel, sheetSvg } from '@/birdhouse/model';
import { LaserSection as LaserShell, type LaserMachine } from '@laser';
import type { CutCfg, Sheets } from '../types';

/**
 * Section « Découpe laser » du panneau de gauche : taille de la planche, espace entre pièces, vue 3D / planches, un SVG par planche.
 * Le bloc « Machine » qui suit vient de laser-control (`LaserSection`).
 */
export function LaserSection({ cutCfg, setCutCfg, cutView, setCutView, sheets, machine, hideMachine = false }: {
  cutCfg: CutCfg; setCutCfg: Dispatch<SetStateAction<CutCfg>>; cutView: boolean; setCutView: (v: boolean) => void; sheets: Sheets; machine: LaserMachine; hideMachine?: boolean;
}) {
  return (
    <LaserShell machine={machine} hideMachine={hideMachine} note={`${sheets.length} planche${sheets.length > 1 ? 's' : ''} de ${cutCfg.W} × ${cutCfg.H}`}>
      <Slider label="Largeur de la planche" value={cutCfg.W} min={100} max={1500} step={5} unit=" mm" onChange={(W) => setCutCfg({ ...cutCfg, W })} />
      <Slider label="Hauteur de la planche" value={cutCfg.H} min={100} max={1500} step={5} unit=" mm" onChange={(H) => setCutCfg({ ...cutCfg, H })} />
      <Slider label="Espace entre les pièces" value={cutCfg.gap} min={0} max={20} step={0.5} unit=" mm" onChange={(gap) => setCutCfg({ ...cutCfg, gap })} />
      <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
        Vue
        <Chip active={!cutView} onClick={() => setCutView(false)}>3D</Chip>
        <Chip active={cutView} onClick={() => setCutView(true)}>Planches à découper</Chip>
      </div>
      {sheets.map((sh, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="min-w-0 flex-1 truncate text-stone-700">{sheetLabel(sheets, i)} : {sh.items.length} pièce{sh.items.length > 1 ? 's' : ''}, {Math.round(Math.min(sh.used, 1) * 100)} % de la hauteur{sh.used > 1 ? ' — déborde !' : ''}</span>
          <Btn block={false} variant="primary" onClick={() => saveSvg(sheetSvg(sh, cutCfg.W, cutCfg.H, i), `${sh.material === 'mdf' ? 'planche-mdf' : 'planche'}-${i + 1}-${cutCfg.W}x${cutCfg.H}.svg`)}>SVG</Btn>
        </div>
      ))}
    </LaserShell>
  );
}
