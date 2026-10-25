import { useState } from 'react';
import { Btn, Chip, ConfirmDialog, Hint, Slider } from '../../ui';
import { JOG_STEPS, PLATE_ORIGIN } from '../../constants';
import type { LaserMachine } from '../../hooks/useLaserMachine';

const ARROW = 'flex h-10 w-10 items-center justify-center rounded-md border border-stone-300 bg-white text-lg text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40';

/** Pilotage manuel : flèches (pas réglable), vitesse, origine ici / aller à l'origine, déverrouillage, réinitialisation. Jamais de laser. */
export function JogPad({ m }: { m: LaserMachine }) {
  const { grbl, settings, setSettings } = m;
  const [confirm, setConfirm] = useState<'unlock' | 'reset' | 'home' | null>(null);
  const state = grbl.status?.state;
  const moveOk = grbl.connected && !m.job.running && (state === 'Idle' || state === 'Jog');
  const step = settings.jogStep, feed = settings.jogFeed;
  /** Origine de planche : X0 Y0 posé à PLATE_ORIGIN (coordonnées machine), puis la tête s'y rend. */
  const plateOrigin = async () => { const r = await grbl.setPlateOrigin(PLATE_ORIGIN.x, PLATE_ORIGIN.y); if (r.ok) void grbl.goOrigin(feed); };
  const go = (dx: number, dy: number) => void grbl.jog(dx * step, dy * step, feed);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
        Pas
        {JOG_STEPS.map((s) => <Chip key={s} active={step === s} onClick={() => setSettings({ ...settings, jogStep: s })}>{s} mm</Chip>)}
      </div>
      <div className="mx-auto grid w-fit grid-cols-3 gap-1">
        <span />
        <button className={ARROW} disabled={!moveOk} onClick={() => go(0, 1)} title="Vers l'arrière de la machine (Y+)" aria-label="Arrière">↑</button>
        <span />
        <button className={ARROW} disabled={!moveOk} onClick={() => go(-1, 0)} title="Vers la gauche (X−)" aria-label="Gauche">←</button>
        <button className={`${ARROW} text-xs`} disabled={!grbl.connected || state !== 'Jog'} onClick={() => void grbl.jogCancel()} title="Annule le déplacement en cours (0x85)" aria-label="Stopper le déplacement">■</button>
        <button className={ARROW} disabled={!moveOk} onClick={() => go(1, 0)} title="Vers la droite (X+)" aria-label="Droite">→</button>
        <span />
        <button className={ARROW} disabled={!moveOk} onClick={() => go(0, -1)} title="Vers l'avant de la machine (Y−)" aria-label="Avant">↓</button>
        <span />
      </div>
      <Slider label="Vitesse de déplacement" value={feed} min={50} max={6000} step={50} unit=" mm/min" onChange={(jogFeed) => setSettings({ ...settings, jogFeed })} />
      <div className="grid grid-cols-2 gap-2">
        <Btn variant="primary" disabled={!moveOk || state !== 'Idle'} onClick={() => void grbl.setOrigin()} title="La position actuelle de la tête devient X0 Y0 (G10 L20 P1)">Origine ici</Btn>
        <Btn disabled={!moveOk} onClick={() => void grbl.goOrigin(feed)}>Aller à l'origine</Btn>
        <Btn disabled={!moveOk || state !== 'Idle'} onClick={() => void plateOrigin()} title={`L'origine de travail (X0 Y0) est posée à X${PLATE_ORIGIN.x} Y${PLATE_ORIGIN.y} de l'origine machine (G10 L2 P1), puis la tête s'y rend : à faire après le référencement ($H)`}>Origine planche (X{PLATE_ORIGIN.x} Y{PLATE_ORIGIN.y})</Btn>
        <Btn disabled={!grbl.connected || m.job.running || (state !== 'Idle' && state !== 'Alarm')} onClick={() => setConfirm('home')} title="Envoie la tête sur ses butées ($H) : à faire à la mise sous tension si la machine est en alarme">Référencer ($H)</Btn>
        <Btn variant="warn" disabled={!grbl.connected || state !== 'Alarm'} onClick={() => setConfirm('unlock')}>Déverrouiller ($X)</Btn>
        <Btn disabled={!grbl.connected || m.job.running} onClick={() => setConfirm('reset')}>Réinitialiser</Btn>
      </div>
      <Hint>L'origine de travail (X0 Y0) est le coin bas-gauche de la planche : place la tête sur ce coin du matériau puis « Origine ici », ou, après le référencement ($H), « Origine planche » : la tête se range {PLATE_ORIGIN.x} mm plus loin sur X et {PLATE_ORIGIN.y} mm sur Y de l'origine machine. X augmente vers la droite, Y vers l'arrière de la machine.</Hint>
      {confirm === 'unlock' && (
        <ConfirmDialog title="Déverrouiller la machine ?" confirmLabel="Envoyer $X" danger onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void grbl.unlock(); }}>
          <p>$X lève l'alarme sans vérifier la position de la tête. Après une alarme, la position connue par la machine peut être fausse.</p>
          <p>Vérifie que rien ne gêne la tête, puis <b>refais l'origine</b> avant de couper.</p>
        </ConfirmDialog>
      )}
      {confirm === 'home' && (
        <ConfirmDialog title="Référencer la machine ?" confirmLabel="Envoyer $H" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void grbl.home(); }}>
          <p>$H envoie la tête sur ses butées pour retrouver sa position. Couvercle fermé, rien dans la machine qui gêne la tête. Si la commande est refusée (error:5), le homing est désactivé : utilise « Déverrouiller ($X) » à la place, puis refais l'origine.</p>
          <p>Le double-clic sur le bouton E1 de la machine fait la même chose.</p>
        </ConfirmDialog>
      )}
      {confirm === 'reset' && (
        <ConfirmDialog title="Réinitialiser le contrôleur ?" confirmLabel="Réinitialiser" onCancel={() => setConfirm(null)} onConfirm={() => { setConfirm(null); void grbl.softReset(); }}>
          <p>Envoie une réinitialisation douce (0x18) : les mouvements en cours sont abandonnés et le laser est éteint. Si la tête bougeait, la machine passera en alarme.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
