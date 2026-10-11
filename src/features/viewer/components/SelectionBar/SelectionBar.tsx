import { Btn, FloatingPanel } from '@/ui';

/** Barre « N plaques sélectionnées : Lier / Délier / Annuler » (sélection multiple par Ctrl + clic). */
export function SelectionBar({ count, onLink, onUnlink, onCancel }: { count: number; onLink: () => void; onUnlink: () => void; onCancel: () => void }) {
  return (
    <FloatingPanel className="absolute top-14 left-3 flex items-center gap-1.5 p-1.5 text-[11px]">
      <span className="px-1 text-stone-600">{count} plaques sélectionnées</span>
      <Btn variant="primary" block={false} onClick={onLink}>Lier</Btn>
      <Btn block={false} onClick={onUnlink}>Délier</Btn>
      <Btn variant="ghost" block={false} onClick={onCancel}>Annuler</Btn>
    </FloatingPanel>
  );
}
