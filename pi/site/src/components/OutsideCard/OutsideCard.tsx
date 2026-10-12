import { Card, ErrorLine, Stat } from '@/ui';
import { fmt } from '@/utils';
import { nestDelta } from '@/components/NestCard/helpers';
import { probeStatus } from './helpers';
import type { OutsideCardProps } from './types';

/** Carte « Dehors (sonde) » : la température vient de la sonde DS18B20 étanche (aucun service en ligne). */
export function OutsideCard({ state }: OutsideCardProps) {
  const t = state?.ext.t;
  const status = probeStatus(state);
  const delta = nestDelta(state?.t_nid, t);
  return (
    <Card title="Dehors (sonde)">
      <Stat id="t_ext" value={fmt(t)} unit="°C" />
      {delta !== null && <div className="muted" id="ecart_sonde">Nid − dehors : {delta > 0 ? '+' : ''}{delta} °C</div>}
      {status && <div className="muted" id="etat_sonde">{status}</div>}
      {state && t === null && <div className="muted">Sans cette mesure, la ventilation automatique ne démarre pas.</div>}
      <ErrorLine message={state?.erreurs.sonde_ext} />
    </Card>
  );
}
