import { ToolbarButton } from '@/ui';
import type { WinterState } from '@/birdhouse/model';

/** Barre du haut du téléphone : réglages, retour, pièces (afficher / cacher), puis les outils de la vue sur une ligne qui défile. */
export function MobileBar({ settingsOn, onSettings, partsOn, onParts, backLabel, onBack, winter, onToggleCassette, onTogglePlug, schemaOn, onToggleSchema, onOpenPi, cutOn, onToggleCut }: {
  settingsOn: boolean; onSettings: () => void; partsOn: boolean; onParts: () => void; backLabel: string | null; onBack: () => void;
  winter: WinterState; onToggleCassette: () => void; onTogglePlug: () => void; schemaOn: boolean; onToggleSchema: () => void; onOpenPi: () => void; cutOn: boolean; onToggleCut: () => void;
}) {
  return (
    <header className="z-10 shrink-0 border-b border-stone-200 bg-white">
      <div className="flex items-center gap-1 px-2 py-1">
        <ToolbarButton icon="☰" active={settingsOn} aria-pressed={settingsOn} onClick={onSettings}>Réglages</ToolbarButton>
        <ToolbarButton icon="↶" disabled={!backLabel} onClick={onBack} className="disabled:opacity-40" title={backLabel ? `Annuler : ${backLabel}` : 'Rien à annuler'}>Retour</ToolbarButton>
        <span className="flex-1" />
        <ToolbarButton icon="👁" active={partsOn} aria-pressed={partsOn} onClick={onParts}>Pièces</ToolbarButton>
      </div>
      <div className="flex items-center gap-1 overflow-x-auto px-2 pb-1">
        <ToolbarButton dense muted icon={winter.cassette === 'winter' ? '❄' : '🌀'} active={winter.cassette === 'winter'} aria-pressed={winter.cassette === 'winter'} disabled={winter.cassette === null} onClick={onToggleCassette} className="shrink-0 disabled:opacity-40">Cassette</ToolbarButton>
        <ToolbarButton dense muted icon={winter.plug === 'plugged' ? '🧱' : '💨'} active={winter.plug === 'plugged'} aria-pressed={winter.plug === 'plugged'} disabled={winter.plug === null} onClick={onTogglePlug} className="shrink-0 disabled:opacity-40">Prise d&apos;air</ToolbarButton>
        <ToolbarButton dense muted tone="emerald" icon="🔌" active={schemaOn} aria-pressed={schemaOn} onClick={onToggleSchema} className="shrink-0">Schéma</ToolbarButton>
        <ToolbarButton dense muted icon="🐍" onClick={onOpenPi} className="shrink-0">Pi</ToolbarButton>
        <ToolbarButton dense icon="✂" active={cutOn} aria-pressed={cutOn} onClick={onToggleCut} className="shrink-0">Coupe</ToolbarButton>
      </div>
    </header>
  );
}
