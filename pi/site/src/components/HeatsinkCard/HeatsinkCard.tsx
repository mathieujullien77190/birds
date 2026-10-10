import { Card, ErrorLine, Stat } from '@/ui';
import { fmt } from '@/utils';
import type { HeatsinkCardProps } from './types';

export function HeatsinkCard({ state }: HeatsinkCardProps) {
  return (
    <Card title="Dissipateur du Peltier">
      <Stat id="t_dissipateur" value={fmt(state?.t_dissipateur)} unit="°C" />
      <ErrorLine message={state?.erreurs.ds18b20} />
      <ErrorLine message={state?.erreurs.securite} />
    </Card>
  );
}
