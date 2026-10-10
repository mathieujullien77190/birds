import { Card, ErrorLine, Stat } from '@/ui';
import { fmt } from '@/utils';
import type { NestCardProps } from './types';

export function NestCard({ state }: NestCardProps) {
  return (
    <Card title="Nid">
      <Stat id="t_nid" value={fmt(state?.t_nid)} unit="°C" />
      <Stat id="hum_nid" value={fmt(state?.hum_nid)} unit="% d&apos;humidité" />
      <ErrorLine message={state?.erreurs.bme280} />
    </Card>
  );
}
