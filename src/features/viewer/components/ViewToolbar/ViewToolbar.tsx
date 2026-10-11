import { FloatingPanel, ToolbarButton } from '@/ui';
import type { WinterState } from '@/birdhouse/model';

/** Barre flottante en haut à droite de la vue : schéma électrique, simulateur du Pi, plan de coupe. */
export function ViewToolbar({ codesOn, onToggleCodes, schemaOn, onToggleSchema, onOpenPi, cutOn, onToggleCut, winter, onToggleCassette, onTogglePlug }: {
  winter: WinterState; onToggleCassette: () => void; onTogglePlug: () => void; codesOn: boolean; onToggleCodes: () => void;
  schemaOn: boolean; onToggleSchema: () => void; onOpenPi: () => void; cutOn: boolean; onToggleCut: () => void;
}) {
  return (
    <FloatingPanel className="absolute top-3 right-3 flex items-center gap-1.5 p-1">
      <ToolbarButton dense muted icon={winter.cassette === 'winter' ? '❄' : '🌀'} active={winter.cassette === 'winter'} aria-pressed={winter.cassette === 'winter'} disabled={winter.cassette === null} onClick={onToggleCassette} className="disabled:opacity-40" title="Cassette dans le siège : le ventilateur (été) ou le bloc isolant (hiver). Ne fait que montrer la cassette en place dans la 3D ; l'autre pièce est rangée à côté du nichoir">Cassette : {winter.cassette === 'winter' ? 'isolante' : 'ventilateur'}</ToolbarButton>
      <ToolbarButton dense muted icon={winter.plug === 'plugged' ? '🧱' : '💨'} active={winter.plug === 'plugged'} aria-pressed={winter.plug === 'plugged'} disabled={winter.plug === null} onClick={onTogglePlug} className="disabled:opacity-40" title="Prise d'air basse : ouverte, ou bouchée par la sous-boîte isolante remplie de laine (poussée dans le conduit par le dessous) ; la sous-boîte est rangée à côté du nichoir quand la prise d'air est ouverte">Prise d'air : {winter.plug === 'plugged' ? 'bouchée' : 'ouverte'}</ToolbarButton>
      <ToolbarButton dense muted icon="№" active={codesOn} aria-pressed={codesOn} onClick={onToggleCodes} title="Codes des plaques : écrit sur chaque plaque découpée son code (T01, T02…, le même pour des pièces identiques), tel qu'il est gravé sur la planche de découpe">N°</ToolbarButton>
      <ToolbarButton dense muted tone="emerald" icon="🔌" active={schemaOn} aria-pressed={schemaOn} onClick={onToggleSchema} title="Schéma électrique à côté de la 3D : survoler un fil ou un composant le met en surbrillance des deux côtés">Schéma</ToolbarButton>
      <ToolbarButton muted icon="🐍" onClick={onOpenPi} title="Page web du Pi simulée : le vrai programme Python tourne dans le navigateur">Pi</ToolbarButton>
      <ToolbarButton icon="✂" active={cutOn} aria-pressed={cutOn} onClick={onToggleCut} title="Plan de coupe : l'espace est coupé en deux, un côté devient invisible">Coupe</ToolbarButton>
    </FloatingPanel>
  );
}
