import { useState } from 'react';
import { Card, ErrorLine, Stat, ToggleButton } from '@/ui';
import { fmt } from '@/utils';
import { PUISSANCE_DEFAUT, PUISSANCE_MAX } from '@/constants';
import { AutoPeltier } from '@/components/AutoPeltier';
import { MODES } from './constants';
import type { PeltierCardProps } from './types';

export function PeltierCard({ state, onCommand, onAuto }: PeltierCardProps) {
  const [power, setPower] = useState(PUISSANCE_DEFAUT);
  return (
    <Card title="Peltier">
      <div className="muted">Dissipateur (face chaude)</div>
      <Stat id="t_dissipateur" value={fmt(state?.t_dissipateur)} unit="°C" />
      <ErrorLine message={state?.erreurs.ds18b20} />
      <ErrorLine message={state?.erreurs.securite} />
      <div className="row">
        {MODES.map((m) => (
          <ToggleButton key={m.mode} id={m.id} on={state?.peltier === m.mode} onClick={() => onCommand(m.mode, power)}>{m.label}</ToggleButton>
        ))}
      </div>
      <div className="row">
        Puissance <input id="puiss" type="range" min={0} max={PUISSANCE_MAX} value={power} onChange={(e) => setPower(Number(e.target.value))} /> <span id="puiss_v">{power}</span> %
      </div>
      <ErrorLine message={state?.erreurs.gpio} />
      <AutoPeltier state={state} onAuto={onAuto} />
    </Card>
  );
}
