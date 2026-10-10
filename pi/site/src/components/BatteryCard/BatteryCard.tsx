import { CAPACITE_WH } from '@/constants';
import { Card, ErrorLine, Gauge, Stat } from '@/ui';
import { levelColor, remainingWh } from './helpers';
import type { BatteryCardProps } from './types';

export function BatteryCard({ state }: BatteryCardProps) {
  const b = state?.batterie;
  const pct = b?.pourcent ?? null;
  return (
    <Card title="Batterie">
      <Stat id="batt_pct" value={pct === null ? '—' : String(pct)} unit="%" />
      <Gauge ratio={(pct ?? 0) / 100} color={levelColor(pct)} />
      <div className="row muted">
        <span id="batt_v">{b?.tension == null ? '— V' : `${b.tension} V`}</span>
        {b?.source && <span>· {b.source}</span>}
        {pct !== null && <span>· ≈ {remainingWh(pct)} Wh sur {CAPACITE_WH}</span>}
        {b?.solaire_w !== undefined && <span>· solaire {b.solaire_w} W</span>}
      </div>
      {pct === null && <div className="muted">Niveau inconnu : pas de mesure de batterie.</div>}
      <ErrorLine message={state?.erreurs.batterie} />
    </Card>
  );
}
