import { FloatingPanel, ToolbarButton } from '@/ui';

/** Bascule en bas à droite de la vue : la 3D ou les planches à découper (vue 2D, à la place de la 3D). Toujours à sa place : la feuille de montage se pose AU-DESSUS (bottom-14). */
export function ViewModeToggle({ sheets, onChange }: { sheets: boolean; onChange: (sheets: boolean) => void }) {
  return (
    <FloatingPanel role="group" aria-label="Vue" className="absolute bottom-3 right-3 z-30 flex items-center gap-0.5 p-0.5">
      <ToolbarButton dense tone="emerald" icon="🧊" active={!sheets} aria-pressed={!sheets} onClick={() => onChange(false)} title="Vue 3D du nichoir">3D</ToolbarButton>
      <ToolbarButton dense tone="emerald" icon="📐" active={sheets} aria-pressed={sheets} onClick={() => onChange(true)} title="Vue 2D : les planches à découper (contreplaqué, MDF, okoumé) à la place de la 3D">Planches</ToolbarButton>
    </FloatingPanel>
  );
}
