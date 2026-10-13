import type { Dispatch, SetStateAction } from 'react';
import { Btn, Chip, Slider } from '@/ui';
import { saveZip } from '@/lib';
import { sheetSvg } from '@/birdhouse/model';
import { LaserSection as LaserShell, type LaserMachine } from '@laser';
import { sheetFiles } from '../helpers';
import type { CutCfg, Sheets } from '../types';

/**
 * Section « Découpe laser » du panneau de gauche : taille de la planche, espace entre pièces, vue 3D / planches, un SVG par planche.
 * Le pilotage de la machine est un bloc à part (`MachineSection` de laser-control, posé par `LeftPanel` sous cette section).
 */
export function LaserSection({ cutCfg, setCutCfg, cutView, setCutView, sheets, machine }: {
  cutCfg: CutCfg; setCutCfg: Dispatch<SetStateAction<CutCfg>>; cutView: boolean; setCutView: (v: boolean) => void; sheets: Sheets; machine: LaserMachine;
}) {
  return (
    <LaserShell machine={machine} hideMachine note={`${sheets.length} planche${sheets.length > 1 ? 's' : ''} de ${cutCfg.W} × ${cutCfg.H}`}>
      <Slider label="Largeur de la planche" value={cutCfg.W} min={100} max={1500} step={5} unit=" mm" onChange={(W) => setCutCfg({ ...cutCfg, W })} />
      <Slider label="Hauteur de la planche" value={cutCfg.H} min={100} max={1500} step={5} unit=" mm" onChange={(H) => setCutCfg({ ...cutCfg, H })} />
      <Slider label="Espace entre les pièces" value={cutCfg.gap} min={0} max={20} step={0.5} unit=" mm" onChange={(gap) => setCutCfg({ ...cutCfg, gap })} />
      <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
        Vue
        <Chip active={!cutView} onClick={() => setCutView(false)}>3D</Chip>
        <Chip active={cutView} onClick={() => setCutView(true)}>Planches à découper</Chip>
      </div>
      <Btn variant="primary" disabled={!sheets.length} onClick={() => saveZip(sheetFiles(sheets, cutCfg, sheetSvg), `planches-nichoir-${cutCfg.W}x${cutCfg.H}.zip`)}>Télécharger les planches (ZIP)</Btn>
    </LaserShell>
  );
}
