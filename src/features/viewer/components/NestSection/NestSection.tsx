import { Btn, Chip, Section, Slider } from '@/ui';
import type { NestParams, PlankScene } from '@/birdhouse/model';
import { nestOuterSize } from './helpers';

/** Section « Nichoir mésange » : dimensions, options (Solaire, 2ᵉ caméra, Peltier + capteur) et création du nichoir. */
export function NestSection({ sc, nest, setNest, addNest }: { sc: PlankScene; nest: NestParams; setNest: (n: NestParams) => void; addNest: () => void }) {
  const [W, D, H] = nestOuterSize(nest, sc.t);
  return (
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
      <Btn variant="primary" onClick={addNest} disabled={sc.planks.length > 0} title={sc.planks.length > 0 ? "Un nichoir est déjà là : « Tout supprimer » dans « Pièces » pour en créer un autre" : undefined}>Créer le nichoir ({W} × {D} × {H})</Btn>
    </Section>
  );
}
