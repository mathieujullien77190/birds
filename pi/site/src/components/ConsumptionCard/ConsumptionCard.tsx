import { Card, Gauge, Stat } from '@/ui';
import { ITEMS } from './constants';
import type { ConsumptionCardProps } from './types';
import './ConsumptionCard.css';

export function ConsumptionCard({ state }: ConsumptionCardProps) {
  const total = state?.conso.total_w ?? null;
  const detail = state?.conso.detail ?? {};
  return (
    <Card title="Consommation">
      <Stat id="conso_w" value={total === null ? '—' : String(total)} unit="W" />
      {ITEMS.map((it) => {
        const w = detail[it.key] ?? 0;
        return (
          <div key={it.key} className={w === 0 ? 'conso-line off' : 'conso-line'}>
            <span>{it.label}</span>
            <Gauge ratio={total ? w / total : 0} color="#059669" height={8} />
            <span className="conso-w">{w} W</span>
          </div>
        );
      })}
    </Card>
  );
}
