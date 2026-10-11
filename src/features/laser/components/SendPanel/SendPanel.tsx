import { useState } from 'react';
import { Btn, Hint, Notice, ProgressBar } from '@/ui';
import { sheetLabel } from '@/birdhouse/model';
import { formatDuration } from '../../grbl';
import type { LaserMachine } from '../../hooks/useLaserMachine';
import { SafetyDialog } from '../SafetyDialog';
import { StopButton } from '../StopButton';
import { blockers, JOB_LABEL, PHASE_LABEL } from './helpers';

/** Envoi du programme à la machine : verrous de sécurité, confirmation, progression, Pause / Reprise, Arrêt toujours visible. */
export function SendPanel({ m }: { m: LaserMachine }) {
  const { job, program, grbl, settings } = m;
  const [ask, setAsk] = useState(false);
  const { view } = job;
  const snap = view.snap;
  const why = blockers(m);
  const finished = snap && ['done', 'error', 'aborted'].includes(snap.phase);
  const kind = m.target === 'test' ? 'test' : 'cut';

  return (
    <div className="space-y-2.5">
      {(job.running || finished) && (
        <div className="space-y-2">
          {view.failure && (
            <div role="alert" className="rounded-md border-2 border-rose-600 bg-rose-50 p-3 text-sm font-bold text-rose-800">
              ENVOI INTERROMPU : {view.failure} Vérifie la machine tout de suite : le laser doit être éteint, l'alimentation coupée au besoin.
            </div>
          )}
          {snap && (
            <>
              <ProgressBar value={snap.total ? snap.acked / snap.total : 0} label={`${JOB_LABEL[view.kind ?? 'cut']} — ${PHASE_LABEL[snap.phase]} — ${snap.acked} / ${snap.total} lignes`} tone={snap.phase === 'error' ? 'error' : snap.phase === 'paused' ? 'busy' : 'ok'} />
              <p className="text-[11px] text-stone-600">Écoulé {formatDuration(view.elapsed)} · reste environ {formatDuration(view.remaining)} (estimation à vitesse réelle) · {snap.sent} lignes envoyées</p>
              {snap.error && <Notice kind="error">Ligne {snap.error.line}{snap.error.text ? ` (${snap.error.text})` : ''} : {snap.error.message}. La machine a été mise en pause : appuie sur Arrêt.</Notice>}
            </>
          )}
          {view.stopped && <Notice kind="warn">Arrêté : pause, réinitialisation et M5 envoyés, le laser est éteint. La machine passe en alarme 3 si la tête bougeait : déverrouille ($X) et refais l'origine avant de recommencer.</Notice>}
          {snap?.phase === 'done' && <Notice kind="ok">Terminé : la tête est revenue à l'origine, laser éteint (M5).</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            {job.running && view.kind !== 'frame' && (snap?.phase === 'paused'
              ? <Btn block={false} variant="primary" onClick={() => void job.resume()}>▶ Reprendre</Btn>
              : <Btn block={false} variant="warn" disabled={snap?.phase !== 'running'} onClick={() => void job.pause()}>❚❚ Pause</Btn>)}
            {(job.running || snap?.phase === 'error') && <StopButton onStop={() => void job.stop()} />}
            {finished && <Btn block={false} onClick={job.dismiss}>Fermer le résultat</Btn>}
          </div>
        </div>
      )}
      {!job.running && (
        <>
          <Btn variant="danger" className="py-2 text-sm" disabled={!m.canCut} onClick={() => setAsk(true)}>Lancer la découpe…</Btn>
          {!m.canCut && why.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-stone-500">{why.map((w) => <li key={w}>{w}</li>)}</ul>}
          <Hint>Rien ne part sans ton clic et la confirmation de sécurité. En cours de route : Pause (!) / Reprendre (~) / Arrêt (pause, réinitialisation, M5).</Hint>
        </>
      )}
      {ask && program && (
        <SafetyDialog
          program={program} settings={settings} simulated={grbl.kind === 'mock'}
          label={m.target === 'test' ? "Planche d'essai" : sheetLabel(m.sheets, m.sheetIndex)}
          onCancel={() => setAsk(false)}
          onConfirm={() => { setAsk(false); job.start(kind, program); }}
        />
      )}
    </div>
  );
}
