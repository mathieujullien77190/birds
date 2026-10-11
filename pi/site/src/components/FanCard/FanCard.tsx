import { useState } from 'react';
import { Card, ErrorLine, Stat, ToggleButton } from '@/ui';
import { VITESSE_DEFAUT, VITESSE_MIN } from '@/constants';
import { AutoFan } from '@/components/AutoFan';
import { describeFan } from './helpers';
import type { FanCardProps } from './types';

/** Ventilateur de 60 mm (aspire l'air chaud du nid) : état, arrêt / marche, vitesse, et la ventilation automatique. */
export function FanCard({ state, onFan, onAuto }: FanCardProps) {
  const [speed, setSpeed] = useState(VITESSE_DEFAUT);
  const f = state?.ventilo;
  const e = state?.erreurs;
  return (
    <Card title="Ventilateur">
      <div className="muted">Vitesse</div>
      <Stat id="ventilo_pct" value={f ? String(f.pourcent) : '—'} unit="%" />
      <div className="muted" id="ventilo_etat">{describeFan(f)}</div>
      <ErrorLine message={e?.ventilo} />
      <ErrorLine message={e?.ventilo_gpio} />
      <ErrorLine message={e?.ventilo_pwm} />
      <ErrorLine message={e?.tachymetre} />
      <div className="row">
        <ToggleButton id="v_arret" on={f?.pourcent === 0} onClick={() => onFan(0)}>Arrêt</ToggleButton>
        <ToggleButton id="v_marche" on={!!f && f.pourcent > 0 && f.mode === 'manuel'} onClick={() => onFan(speed)}>Marche</ToggleButton>
      </div>
      <div className="row">
        Vitesse <input id="vitesse" type="range" min={VITESSE_MIN} max={100} value={speed} onChange={(ev) => setSpeed(Number(ev.target.value))}
          onPointerUp={() => { if (f && f.mode === 'manuel') onFan(speed); }} /> <span id="vitesse_v">{speed}</span> %
      </div>
      <ErrorLine message={e?.gpio} />
      <AutoFan state={state} onAuto={onAuto} />
    </Card>
  );
}
