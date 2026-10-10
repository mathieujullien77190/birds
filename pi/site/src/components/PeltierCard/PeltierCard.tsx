import { useState } from 'react';
import { Card, ErrorLine, ToggleButton } from '@/ui';
import { PUISSANCE_DEFAUT, PUISSANCE_MAX } from '@/constants';
import { MODES } from './constants';
import type { PeltierCardProps } from './types';

export function PeltierCard({ state, onCommand }: PeltierCardProps) {
  const [power, setPower] = useState(PUISSANCE_DEFAUT);
  return (
    <Card title="Peltier">
      <div className="row">
        {MODES.map((m) => (
          <ToggleButton key={m.mode} id={m.id} on={state?.peltier === m.mode} onClick={() => onCommand(m.mode, power)}>{m.label}</ToggleButton>
        ))}
      </div>
      <div className="row">
        Puissance <input id="puiss" type="range" min={0} max={PUISSANCE_MAX} value={power} onChange={(e) => setPower(Number(e.target.value))} /> <span id="puiss_v">{power}</span> %
      </div>
      <ErrorLine message={state?.erreurs.gpio} />
    </Card>
  );
}
