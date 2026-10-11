import { Btn, IconButton } from '@/ui';
import type { Hole, Plank } from '@/birdhouse/model';
import { HoleFields } from '../HoleFields';

/** Petite fenêtre de réglage d'un trou (clic droit → « Trou… ») : forme, dimensions, position ; OK / Supprimer. */
export function HoleWindow({ plank, hole, onChange, onClose, onRemove }: { plank: Plank; hole: Hole; onChange: (patch: Partial<Hole>) => void; onClose: () => void; onRemove: () => void }) {
  return (
    <div className="absolute top-14 left-3 z-10 w-72 space-y-2.5 rounded-lg border border-stone-200 bg-white p-3 text-xs shadow-xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-emerald-900">Trou dans {plank.name}</span>
        <IconButton size="md" onClick={() => onClose()} title="Fermer">×</IconButton>
      </div>
      <HoleFields plank={plank} hole={hole} onChange={onChange} />
      <div className="grid grid-cols-2 gap-1.5">
        <Btn variant="primary" onClick={() => onClose()}>OK</Btn>
        <Btn variant="danger" onClick={() => onRemove()}>Supprimer le trou</Btn>
      </div>
    </div>
  );
}
