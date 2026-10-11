import type { WireInfo } from '@/birdhouse/model';
import { IconButton } from '@/ui';
import { wireSheetRows } from './helpers';

/**
 * Fiche d'un fil sur la vue 3D : nom, couleur, diamètre, section, longueur, extrémités, rôle, tension, courant, raccord.
 * Flottante en bas à gauche (en bas sur toute la largeur sur téléphone), défilable, fermée par × ou Échap.
 */
export function WireSheet({ info, onClose }: { info: WireInfo; onClose: () => void }) {
  return (
    <section aria-label={`Fiche du fil : ${info.name}`} className="absolute bottom-3 left-3 right-3 z-10 flex max-h-[55%] flex-col overflow-hidden rounded-lg border border-stone-200 bg-white/95 text-[11px] text-stone-700 shadow-md backdrop-blur sm:right-auto sm:w-[22rem]">
      <header className="flex items-center gap-2 border-b border-stone-200 px-3 py-1.5">
        <span aria-hidden className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-stone-300" style={{ background: info.color }} title={info.color} />
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-900" title={info.name}>{info.name}</h2>
        <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-500">{info.kind === 'ribbon' ? 'nappe' : info.kind === 'conduit' ? 'gaine' : `fil ${info.colorName}`}</span>
        <IconButton size="sm" onClick={onClose} aria-label="Fermer la fiche" title="Fermer la fiche (Échap)">×</IconButton>
      </header>
      <dl className="min-h-0 flex-1 overflow-auto px-3 py-2">
        {wireSheetRows(info).map(([label, value]) => (
          <div key={label} className="grid grid-cols-[6.5rem_1fr] gap-x-2 py-0.5">
            <dt className="text-stone-500">{label}</dt>
            <dd className="text-stone-800">{value}</dd>
          </div>
        ))}
        {!info.known && <p className="pt-1 text-amber-700">Fil sans description : voir le tableau « Branchements » du document.</p>}
      </dl>
    </section>
  );
}
