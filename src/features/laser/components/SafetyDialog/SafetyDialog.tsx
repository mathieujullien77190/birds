import { useState } from 'react';
import { Btn, Modal, Notice } from '@/ui';
import { formatDuration, type GcodeJob } from '../../grbl';
import type { MachineSettings } from '../../types';
import { SAFETY_ITEMS } from './constants';

/** Confirmation obligatoire avant de lancer une découpe : liste de sécurité à cocher en entier, récapitulatif du programme. */
export function SafetyDialog({ program, settings, simulated, label, onConfirm, onCancel }: {
  program: GcodeJob; settings: MachineSettings; simulated: boolean; label: string; onConfirm: () => void; onCancel: () => void;
}) {
  const [checked, setChecked] = useState<boolean[]>(() => SAFETY_ITEMS.map(() => false));
  const all = checked.every(Boolean);
  const st = program.stats;
  return (
    <Modal maxWidth="max-w-lg" header={<h2 className="text-sm font-semibold text-rose-700">Avant de lancer la découpe</h2>} onClose={onCancel}>
      <div className="space-y-3 overflow-y-auto p-5 text-xs text-stone-700">
        {simulated && <Notice kind="info">Machine simulée : rien ne partira vers une vraie laser. Les cases restent obligatoires pour s'entraîner.</Notice>}
        <p className="font-semibold">{label} — {st.contours} contours, {st.lines} lignes, environ {formatDuration(st.seconds)}.</p>
        <p>
          Vitesse {settings.feed} mm/min · puissance {Math.min(settings.power, settings.capPct)} % · {settings.passes} passe{settings.passes > 1 ? 's' : ''} · S max envoyé : {st.maxS}.
          {st.clamped ? ' (puissance demandée limitée par le plafond)' : ''}
        </p>
        <ul className="space-y-2">
          {SAFETY_ITEMS.map((t, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-start gap-2 leading-snug">
                <input type="checkbox" className="mt-0.5" checked={checked[i]} onChange={(e) => setChecked((c) => c.map((v, k) => (k === i ? e.target.checked : v)))} />
                <span>{t}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="rounded-md bg-rose-50 p-2 text-rose-800">Une laser de 10 W peut enflammer le bois et le contreplaqué. Au moindre départ de flamme : bouton Arrêt, arrêt d'urgence, puis étouffe le feu.</p>
        <div className="flex justify-end gap-2">
          <Btn block={false} onClick={onCancel}>Annuler</Btn>
          <Btn block={false} variant="danger" disabled={!all} onClick={onConfirm}>Lancer la découpe</Btn>
        </div>
      </div>
    </Modal>
  );
}
