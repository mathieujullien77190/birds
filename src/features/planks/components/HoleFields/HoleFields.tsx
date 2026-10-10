import { Chip, Slider } from '@/ui';
import type { Hole, Plank } from '@/planks/model';

/** Les réglages d'un trou : forme, dimensions, position depuis le coin haut-gauche de la plaque. Servi par la fenêtre du clic droit et par la section « Trous ». */
export function HoleFields({ plank, hole, onChange }: { plank: Plank; hole: Hole; onChange: (patch: Partial<Hole>) => void }) {
  const rounded = !!hole.r && hole.r > 0;
  return (
    <>
      <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
        Forme
        <Chip active={hole.shape === 'round'} onClick={() => onChange({ shape: 'round' })}>Rond</Chip>
        <Chip active={hole.shape === 'square'} onClick={() => onChange({ shape: 'square', sh: hole.sh ?? hole.size })}>Rectangle</Chip>
      </div>
      {hole.shape === 'round' ? (
        <Slider label="Diamètre" value={hole.size} min={1} max={Math.max(2, Math.min(plank.w, plank.h) - 2)} step={1} unit=" mm" onChange={(v) => onChange({ size: v })} />
      ) : (
        <>
          <Slider label="Longueur (selon la largeur de la plaque)" value={hole.size} min={1} max={Math.max(2, plank.w - 2)} step={1} unit=" mm" onChange={(v) => onChange({ size: v })} />
          <Slider label="Largeur (selon la hauteur de la plaque)" value={hole.sh ?? hole.size} min={1} max={Math.max(2, plank.h - 2)} step={1} unit=" mm" onChange={(v) => onChange({ sh: v })} />
          <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
            Coins
            <Chip active={!rounded} onClick={() => onChange({ r: 0 })}>Droits</Chip>
            <Chip active={rounded} onClick={() => onChange({ r: Math.min(3, hole.size / 2, (hole.sh ?? hole.size) / 2) })}>Arrondis</Chip>
          </div>
          {rounded && <Slider label="Rayon des coins" value={hole.r!} min={0.5} max={Math.max(0.5, Math.min(hole.size, hole.sh ?? hole.size) / 2)} step={0.5} unit=" mm" onChange={(v) => onChange({ r: v })} />}
        </>
      )}
      {/* réglage : distance du bord gauche / haut de la plaque au centre du trou (en interne, repère centré) */}
      <Slider label="Centre du trou depuis le bord gauche" value={Math.round(hole.x + plank.w / 2)} min={0} max={plank.w} step={1} unit=" mm" onChange={(v) => onChange({ x: v - plank.w / 2 })} marks={[{ at: plank.w / 2, label: `milieu : ${plank.w / 2}` }]} />
      <Slider label="Centre du trou depuis le bord haut" value={Math.round(plank.h / 2 - hole.y)} min={0} max={plank.h} step={1} unit=" mm" onChange={(v) => onChange({ y: plank.h / 2 - v })} marks={[{ at: plank.h / 2, label: `milieu : ${plank.h / 2}` }]} />
    </>
  );
}
