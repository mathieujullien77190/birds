import type { Dispatch, SetStateAction } from 'react';
import { CollapseButton, SidePanel } from '@/ui';
import { LaserSection, type CutCfg, type LaserMachine, type Sheets } from '@/features/laser';
import type { NestParams, PlankScene } from '@/birdhouse/model';
import type { Commit } from '../../types';
import { NestSection } from '../NestSection';
import { WoodSection } from '../WoodSection';

export interface LeftPanelProps {
  open: boolean;
  setOpen: (o: boolean) => void;
  sc: PlankScene;
  commit: Commit;
  nest: NestParams;
  setNest: (n: NestParams) => void;
  addNest: () => void;
  cutCfg: CutCfg;
  setCutCfg: Dispatch<SetStateAction<CutCfg>>;
  cutView: boolean;
  setCutView: (v: boolean) => void;
  sheets: Sheets;
  machine: LaserMachine;
  /** Téléphone : pas de bloc « Machine » (pilotage de la laser). */
  hideMachine?: boolean;
}

/** Panneau de gauche : « Bois », « Nichoir high tech », « Découpe laser » ; replié, il ne reste qu'une languette ▸ sur la tranche. */
export function LeftPanel({ open, setOpen, sc, commit, nest, setNest, addNest, cutCfg, setCutCfg, cutView, setCutView, sheets, machine, hideMachine }: LeftPanelProps) {
  return (
    <SidePanel side="left" open={open} onOpen={() => setOpen(true)} openTitle="Ouvrir le menu" width="w-[22rem]" className="gap-3 overflow-y-auto p-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold text-emerald-900">Nichoir high tech</h1>
        </div>
        <div className="flex items-center gap-1">
          <CollapseButton roomy onClick={() => setOpen(false)} title="Replier le menu">◂</CollapseButton>
        </div>
      </header>
      <WoodSection sc={sc} commit={commit} />
      <NestSection sc={sc} nest={nest} setNest={setNest} addNest={addNest} />
      <LaserSection cutCfg={cutCfg} setCutCfg={setCutCfg} cutView={cutView} setCutView={setCutView} sheets={sheets} machine={machine} hideMachine={hideMachine} />
    </SidePanel>
  );
}
