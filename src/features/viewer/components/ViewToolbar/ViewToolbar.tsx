import { FloatingPanel, ToolbarButton } from '@/ui';
import type { WinterState } from '@/birdhouse/model';

/** Barre flottante en haut à droite de la vue : montage, cassette, schéma électrique et dossier du nichoir, simulateur du Pi, plan de coupe. */
export function ViewToolbar({ assemblyOn, onToggleAssembly, schemaOn, onToggleSchema, meterOn, onToggleMeter, onOpenPi, onOpenDoc, cutOn, onToggleCut, winter, onToggleCassette, onTogglePlug }: {
  assemblyOn: boolean; onToggleAssembly: () => void;
  winter: WinterState; onToggleCassette: () => void; onTogglePlug: () => void;
  schemaOn: boolean; onToggleSchema: () => void; meterOn: boolean; onToggleMeter: () => void; onOpenPi: () => void; onOpenDoc?: () => void; cutOn: boolean; onToggleCut: () => void;
}) {
  return (
    <FloatingPanel className="absolute top-3 right-3 flex items-center gap-1.5 p-1">
      <ToolbarButton dense icon="🛠" tone="emerald" active={assemblyOn} aria-pressed={assemblyOn} onClick={onToggleAssembly} title="Montage pas à pas : les pièces se montent une à une, étape suivante / précédente (← →), avec les consignes de finition">Montage</ToolbarButton>
      <ToolbarButton dense muted icon={winter.cassette === 'winter' ? '❄' : winter.cassette === 'none' ? '∅' : '🌀'} active={winter.cassette === 'winter' || winter.cassette === 'none'} aria-pressed={winter.cassette === 'winter' || winter.cassette === 'none'} disabled={winter.cassette === null} onClick={onToggleCassette} className="disabled:opacity-40" title="Cassette dans le siège (un clic passe à l'état suivant) : le ventilateur (été), le bloc isolant (hiver) ou aucune (siège vide, pour accéder au grenier ou tester). Ne fait que montrer la cassette en place dans la 3D ; les autres pièces sont rangées à côté du nichoir">Cassette : {winter.cassette === 'winter' ? 'isolante' : winter.cassette === 'none' ? 'aucune' : 'ventilateur'}</ToolbarButton>
      <ToolbarButton dense muted icon={winter.plug === 'plugged' ? '🧱' : '💨'} active={winter.plug === 'plugged'} aria-pressed={winter.plug === 'plugged'} disabled={winter.plug === null} onClick={onTogglePlug} className="disabled:opacity-40" title="Prise d'air basse : ouverte, ou bouchée par la sous-boîte isolante remplie de laine (poussée dans le conduit par le dessous) ; la sous-boîte est rangée à côté du nichoir quand la prise d'air est ouverte">Prise d'air : {winter.plug === 'plugged' ? 'bouchée' : 'ouverte'}</ToolbarButton>
      <span className="flex items-center gap-0.5 rounded-lg bg-emerald-50 p-0.5">
        <ToolbarButton dense muted tone="emerald" icon="🔌" active={schemaOn} aria-pressed={schemaOn} onClick={onToggleSchema} title="Schéma électrique à côté de la 3D : survoler un fil ou un composant le met en surbrillance des deux côtés">Schéma</ToolbarButton>
        {onOpenDoc && <ToolbarButton dense muted tone="emerald" icon="📖" onClick={onOpenDoc} title="Dossier du nichoir : schéma électrique détaillé, branchements, paramètres de chaque composant, poids, prix, montage">Dossier</ToolbarButton>}
      </span>
      <ToolbarButton muted icon="🐍" onClick={onOpenPi} title="Page web du Pi simulée : le vrai programme Python tourne dans le navigateur">Pi</ToolbarButton>
      <ToolbarButton muted icon="📏" active={meterOn} aria-pressed={meterOn} onClick={onToggleMeter} title="Mètre ruban : clique un premier point sur une pièce (il s'aimante aux coins), puis un second : la distance s'affiche en haut. Un troisième clic recommence, Échap quitte">Mètre</ToolbarButton>
      <ToolbarButton icon="✂" active={cutOn} aria-pressed={cutOn} onClick={onToggleCut} title="Plan de coupe : l'espace est coupé en deux, un côté devient invisible">Coupe</ToolbarButton>
    </FloatingPanel>
  );
}
