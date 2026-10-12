import { ToolbarButton } from '@/ui';
import type { WinterState } from '@/birdhouse/model';

/** Barre du haut du téléphone : réglages, retour, pièces (afficher / cacher), puis les outils de la vue (cassette, prise d'air, coupe) sur une ligne qui défile. */
export function MobileBar({ assemblyOn, onToggleAssembly, settingsOn, onSettings, partsOn, onParts, winter, onToggleCassette, onTogglePlug, cutOn, onToggleCut }: {
  assemblyOn: boolean; onToggleAssembly: () => void;
  settingsOn: boolean; onSettings: () => void; partsOn: boolean; onParts: () => void;
  winter: WinterState; onToggleCassette: () => void; onTogglePlug: () => void; cutOn: boolean; onToggleCut: () => void;
}) {
  return (
    <header className="z-10 shrink-0 border-b border-stone-200 bg-white">
      <div className="flex items-center gap-1 px-2 py-1">
        <ToolbarButton icon="☰" active={settingsOn} aria-pressed={settingsOn} onClick={onSettings}>Réglages</ToolbarButton>
        <ToolbarButton icon="🛠" tone="emerald" active={assemblyOn} aria-pressed={assemblyOn} onClick={onToggleAssembly}>Montage</ToolbarButton>
        <span className="flex-1" />
        <ToolbarButton icon="👁" active={partsOn} aria-pressed={partsOn} onClick={onParts}>Pièces</ToolbarButton>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto px-2 pb-1">
        <ToolbarButton dense muted icon={winter.cassette === 'winter' ? '❄' : winter.cassette === 'none' ? '∅' : '🌀'} active={winter.cassette === 'winter' || winter.cassette === 'none'} aria-pressed={winter.cassette === 'winter' || winter.cassette === 'none'} disabled={winter.cassette === null} onClick={onToggleCassette} className="shrink-0 disabled:opacity-40">Cassette{winter.cassette === 'none' ? ' : aucune' : ''}</ToolbarButton>
        <ToolbarButton dense muted icon={winter.plug === 'plugged' ? '🧱' : '💨'} active={winter.plug === 'plugged'} aria-pressed={winter.plug === 'plugged'} disabled={winter.plug === null} onClick={onTogglePlug} className="shrink-0 disabled:opacity-40">Prise d&apos;air</ToolbarButton>
        <ToolbarButton dense icon="✂" active={cutOn} aria-pressed={cutOn} onClick={onToggleCut} className="shrink-0">Coupe</ToolbarButton>
      </div>
    </header>
  );
}
