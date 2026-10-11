import type { ReactNode } from 'react';
import { Btn } from '../Btn';
import { Modal } from '../Modal';

/** Petite fenêtre de confirmation : titre, explication, « Annuler » et le bouton qui valide (rouge si `danger`). */
export function ConfirmDialog({ title, children, confirmLabel = 'Confirmer', danger = false, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal maxWidth="max-w-md" header={<h2 className="text-sm font-semibold text-stone-800">{title}</h2>} onClose={onCancel}>
      <div className="space-y-3 p-5 text-xs leading-relaxed text-stone-700">
        {children}
        <div className="flex justify-end gap-2 pt-1">
          <Btn block={false} onClick={onCancel}>Annuler</Btn>
          <Btn block={false} variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </Modal>
  );
}
