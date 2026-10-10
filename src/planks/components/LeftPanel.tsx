import type { Dispatch, SetStateAction } from 'react';
import Slider from '@/ui/Slider';
import { Btn, Chip, Section } from '@/ui/kit';
import { saveSvg } from '../../ui/Sheet2D';
import { recastAll, sheetSvg, type NestParams, type PlankScene } from '../model';

export interface CutCfg { W: number; H: number; gap: number }

export interface LeftPanelProps {
  open: boolean;
  setOpen: (o: boolean) => void;
  sc: PlankScene;
  commit: (label: string, next: (s: PlankScene) => PlankScene, merge?: boolean) => void;
  nest: NestParams;
  setNest: (n: NestParams) => void;
  addNest: () => void;
  cutCfg: CutCfg;
  setCutCfg: Dispatch<SetStateAction<CutCfg>>;
  cutView: boolean;
  setCutView: (v: boolean) => void;
  sheets: ReturnType<typeof import('../model').nestSheets>;
}

/** Panneau de gauche : « Bois », « Nichoir mésange », « Découpe laser » ; replié, il ne reste qu'une languette ▸ sur la tranche. */
export function LeftPanel({ open, setOpen, sc, commit, nest, setNest, addNest, cutCfg, setCutCfg, cutView, setCutView, sheets }: LeftPanelProps) {
  return (
    <>
      {!open && <button onClick={() => setOpen(true)} title="Ouvrir le menu" className="flex h-full w-7 shrink-0 items-start justify-center border-r border-stone-200 bg-stone-50 pt-3 text-stone-500 hover:bg-stone-100">▸</button>}
        {open && <aside className="flex h-full w-[22rem] shrink-0 flex-col gap-3 overflow-y-auto border-r border-stone-200 bg-stone-50 p-3">
          <header className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-base font-semibold text-emerald-900">Nichoir mésange</h1>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setOpen(false)} title="Replier le menu" className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-100">◂</button>
            </div>
          </header>
  
          <Section title="Bois" defaultOpen note={`${sc.t} mm`}>
            <Slider label="Épaisseur de toutes les plaques" value={sc.t} min={1} max={30} step={0.5} unit=" mm" onChange={(t) => commit('Épaisseur', (s) => ({ ...s, t, planks: s.planks.map((p) => recastAll(p, t, s.fit)) }))} />
          </Section>
  
          <Section title="Nichoir mésange" defaultOpen note={`${nest.l} × ${nest.L}`}>
            <Slider label="Intérieur (carré, fond)" value={nest.l} min={120} max={300} step={1} unit=" mm" onChange={(l) => setNest({ ...nest, l, L: l })} />
            <Slider label="Du sol au bas du trou" value={nest.floorToHole} min={60} max={600} step={1} unit=" mm" onChange={(floorToHole) => setNest({ ...nest, floorToHole })} />
            <Slider label="Diamètre du trou" value={nest.hole} min={20} max={120} step={1} unit=" mm" onChange={(hole) => setNest({ ...nest, hole })} />
            <Slider label="Hauteur au-dessus du trou" value={nest.above} min={0} max={100} step={1} unit=" mm" onChange={(above) => setNest({ ...nest, above })} />
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-700">
              Options
              <Chip active={nest.solar} onClick={() => setNest({ ...nest, solar: !nest.solar })} title="Panneau solaire de 100 W déporté sur deux poteaux, câble vers le toit ; batterie, régulateur et pont en H dans le toit">Solaire</Chip>
              <Chip active={nest.cam2} onClick={() => setNest({ ...nest, cam2: !nest.cam2 })} title="Deuxième caméra dans une mini boîte en contreplaqué sous le toit à gauche, tournée vers le trou d'entrée">2ᵉ caméra</Chip>
              <Chip active={nest.clim} onClick={() => setNest({ ...nest, clim: !nest.clim })} title="Peltier + radiateur alu sur la moitié haute du mur arrière, capteur de température et d'humidité">Peltier + capteur</Chip>
            </div>
            <Btn variant="primary" onClick={addNest} disabled={sc.planks.length > 0} title={sc.planks.length > 0 ? "Un nichoir est déjà là : « Tout supprimer » dans « Pièces » pour en créer un autre" : undefined}>Créer le nichoir ({nest.l + 2 * (2 * sc.t + nest.ins)} × {nest.L + 2 * (2 * sc.t + nest.ins)} × {nest.floorToHole + nest.hole + nest.above + 2 * sc.t + 2 * (sc.t + nest.ins)})</Btn>
          </Section>
  
  
  
          <Section title="Découpe laser" defaultOpen note={`${sheets.length} planche${sheets.length > 1 ? 's' : ''} de ${cutCfg.W} × ${cutCfg.H}`}>
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
                <span className="min-w-0 flex-1 truncate text-stone-700">Planche {i + 1} : {sh.items.length} pièce{sh.items.length > 1 ? 's' : ''}, {Math.round(Math.min(sh.used, 1) * 100)} % de la hauteur{sh.used > 1 ? ' — déborde !' : ''}</span>
                <Btn block={false} variant="primary" onClick={() => saveSvg(sheetSvg(sh, cutCfg.W, cutCfg.H, i), `planche-${i + 1}-${cutCfg.W}x${cutCfg.H}.svg`)}>SVG</Btn>
              </div>
            ))}
          </Section>
        </aside>}
    </>
  );
}
