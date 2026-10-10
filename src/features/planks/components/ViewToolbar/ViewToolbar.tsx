import { FloatingPanel, ToolbarButton } from '@/ui';

/** Barre flottante en haut à droite de la vue : schéma électrique, simulateur du Pi, plan de coupe. */
export function ViewToolbar({ schemaOn, onToggleSchema, onOpenPi, cutOn, onToggleCut }: {
  schemaOn: boolean; onToggleSchema: () => void; onOpenPi: () => void; cutOn: boolean; onToggleCut: () => void;
}) {
  return (
    <FloatingPanel className="absolute top-3 right-3 flex items-center gap-1.5 p-1">
      <ToolbarButton dense muted tone="emerald" icon="🔌" active={schemaOn} aria-pressed={schemaOn} onClick={onToggleSchema} title="Schéma électrique à côté de la 3D : survoler un fil ou un composant le met en surbrillance des deux côtés">Schéma</ToolbarButton>
      <ToolbarButton muted icon="🐍" onClick={onOpenPi} title="Page web du Pi simulée : le vrai programme Python tourne dans le navigateur">Pi</ToolbarButton>
      <ToolbarButton icon="✂" active={cutOn} aria-pressed={cutOn} onClick={onToggleCut} title="Plan de coupe : l'espace est coupé en deux, un côté devient invisible">Coupe</ToolbarButton>
    </FloatingPanel>
  );
}
