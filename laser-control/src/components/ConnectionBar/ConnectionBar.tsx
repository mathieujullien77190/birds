import { useState } from 'react';
import { Btn, Chip, ConfirmDialog, Hint, Notice, StatusDot } from '../../ui';
import { alarmMessage, webSerialProblem } from '../../grbl';
import type { LaserMachine } from '../../hooks/useLaserMachine';
import { indicator, mm } from './helpers';

/** Connexion à la laser (port USB réel ou machine simulée), état en direct, positions et réglages GRBL utiles ($30, $32). */
export function ConnectionBar({ m }: { m: LaserMachine }) {
  const { grbl } = m;
  const [confirmLaser, setConfirmLaser] = useState(false);
  const unsupported = webSerialProblem();
  const ind = indicator(grbl);
  const st = grbl.status;
  const mock = grbl.mock.current;

  return (
    <div className="space-y-2.5">
      {grbl.linkLost && (
        <div role="alert" className="rounded-md border-2 border-rose-600 bg-rose-50 p-3 text-sm font-bold text-rose-800">
          LIAISON AVEC LA LASER PERDUE ({grbl.linkLost}). Le contrôleur éteint le laser quand il perd le port, mais ne te fie pas à cela :
          vérifie la machine, coupe l'alimentation au besoin, puis reconnecte-toi. La position de la tête est peut-être perdue.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusDot tone={ind.tone} pulse={ind.pulse}>{ind.label}</StatusDot>
        {grbl.connected && <span className="text-[11px] text-stone-500">{grbl.kind === 'mock' ? 'Machine simulée' : 'Sculpfun E1 Pro 21 W'}</span>}
      </div>

      {!grbl.connected && (
        <div className="space-y-2">
          {unsupported && <Notice kind="error">{unsupported}</Notice>}
          <div className="flex flex-wrap gap-2">
            <Btn block={false} variant="primary" disabled={!!unsupported || grbl.conn === 'connecting'} onClick={() => void grbl.connect('serial')}>Connecter la laser</Btn>
            <Btn block={false} disabled={grbl.conn === 'connecting'} onClick={() => void grbl.connect('mock', { laserMode: m.mockLaserMode })}>Machine simulée</Btn>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-stone-600">
            <input type="checkbox" checked={!m.mockLaserMode} onChange={(e) => m.setMockLaserMode(!e.target.checked)} />
            simulée sans mode laser ($32=0), pour voir l'avertissement
          </label>
          <Hint>Câble USB de la laser branché, laser allumée, aucun autre programme (LaserGRBL, LightBurn) connecté au port. Chrome ou Edge uniquement. Rien n'est envoyé tant que tu ne lances pas toi-même une action.</Hint>
        </div>
      )}

      {grbl.connected && (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-md bg-stone-50 p-2 font-mono text-[11px] tabular-nums text-stone-700">
            <span className="text-stone-500">Travail X Y</span><span>{mm(st?.wpos.x)}  {mm(st?.wpos.y)}</span>
            <span className="text-stone-500">Machine X Y</span><span>{mm(st?.mpos.x)}  {mm(st?.mpos.y)}</span>
            <span className="text-stone-500">Avance</span><span>{st ? Math.round(st.feed) : '—'} mm/min</span>
            <span className="text-stone-500">Laser (S)</span>
            <span className={st && st.spindle > 0 ? 'font-bold text-rose-600' : ''}>{st ? (st.spindle > 0 ? `S${Math.round(st.spindle)} ALLUMÉ` : 'éteint') : '—'}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-600">
            <span>$30 (S max) : <b>{grbl.settings[30] ?? '?'}</b></span>
            <span>$32 (mode laser) : <b className={grbl.settings[32] === 1 ? 'text-emerald-700' : 'text-rose-600'}>{grbl.settings[32] ?? '?'}</b></span>
            <Chip onClick={() => void grbl.readSettings()}>Relire</Chip>
          </div>
          {grbl.settings[32] === 0 && (
            <Notice kind="warn">
              Le mode laser ($32) est désactivé. Dans cet état GRBL peut laisser le laser allumé quand la tête s'arrête : rien ne peut être découpé depuis ici.
              <span className="mt-1.5 block"><Btn block={false} variant="warn" onClick={() => setConfirmLaser(true)}>Activer le mode laser ($32=1)…</Btn></span>
            </Notice>
          )}
          {grbl.settings[32] === undefined && <Notice kind="info">Réglages de la machine pas encore lus ($$) : la découpe reste verrouillée.</Notice>}
          {st?.state === 'Alarm' && (
            <Notice kind="error"><b>Alarme{grbl.alarmCode ? ` ${grbl.alarmCode}` : ''}.</b> {grbl.alarmCode ? alarmMessage(grbl.alarmCode) : 'La machine est verrouillée ($X pour la déverrouiller).'}</Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Btn block={false} onClick={() => void grbl.disconnect()} disabled={m.job.running} title={m.job.running ? "Arrête d'abord l'envoi" : undefined}>Déconnecter</Btn>
            {grbl.kind === 'mock' && mock && (
              <>
                <Btn block={false} variant="ghost" onClick={() => mock.grbl.triggerAlarm(1)}>Simuler une alarme</Btn>
                <Btn block={false} variant="ghost" onClick={() => mock.dropLink()}>Simuler une coupure USB</Btn>
              </>
            )}
          </div>
        </>
      )}
      {grbl.problem && <Notice kind="error">{grbl.problem} <button className="underline" onClick={grbl.clearProblem}>ok</button></Notice>}

      {confirmLaser && (
        <ConfirmDialog title="Activer le mode laser ?" confirmLabel="Écrire $32=1" onCancel={() => setConfirmLaser(false)} onConfirm={() => { setConfirmLaser(false); void grbl.enableLaserMode(); }}>
          <p>Cela écrit <b>$32=1</b> dans la mémoire du contrôleur GRBL. C'est le réglage normal d'une laser à diode : le laser s'éteint dès que la tête ne coupe pas (déplacements rapides, arrêt) et la puissance suit la vitesse.</p>
          <p>Ce réglage reste enregistré dans la machine, y compris pour les autres logiciels.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
