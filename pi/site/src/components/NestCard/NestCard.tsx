import { Card, ErrorLine, Stat } from '@/ui';
import { fmt } from '@/utils';
import { nestDelta } from './helpers';
import type { NestCardProps } from './types';

export function NestCard({ state }: NestCardProps) {
  const delta = nestDelta(state?.t_nid, state?.ext.t);
  return (
    <Card title="Nid">
      <Stat id="t_nid" value={fmt(state?.t_nid)} unit="°C" />
      <Stat id="hum_nid" value={fmt(state?.hum_nid)} unit="% d&apos;humidité" />
      {delta !== null && <div className="muted" id="ecart_nid">{delta >= 0 ? `${delta} °C plus chaud` : `${-delta} °C plus froid`} que dehors.</div>}
      <ErrorLine message={state?.erreurs.bme280} />
    </Card>
  );
}
