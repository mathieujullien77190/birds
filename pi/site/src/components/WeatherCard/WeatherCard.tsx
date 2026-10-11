import { Card, ErrorLine, Stat } from '@/ui';
import { fmt } from '@/utils';
import { nestDelta } from './helpers';
import type { WeatherCardProps } from './types';

export function WeatherCard({ state }: WeatherCardProps) {
  const w = state?.meteo;
  const delta = nestDelta(state?.t_nid, w?.t_ext);
  return (
    <Card title="Dehors">
      <Stat id="t_ext" value={fmt(w?.t_ext)} unit="°C" />
      <div className="row muted">
        <span>{w?.hum_ext == null ? '— %' : `${w.hum_ext} % d'humidité`}</span>
        <span>· nuages {w?.nuages == null ? '—' : `${w.nuages} %`}</span>
        <span>· vent {w?.vent_kmh == null ? '—' : `${w.vent_kmh} km/h`}</span>
      </div>
      <div className="row muted">
        {w?.jour != null && <span>{w.jour ? '☀ jour' : '🌙 nuit'}</span>}
        {w?.rayonnement != null && <span>· rayonnement {w.rayonnement} W/m²</span>}
      </div>
      {delta !== null && <div className="muted" id="ecart_nid">Le nid est {delta >= 0 ? `${delta} °C plus chaud` : `${-delta} °C plus froid`} que dehors.</div>}
      {w?.source && <div className="muted">Source : {w.source}{w.maj ? `, ${w.maj}` : ''}</div>}
      {state && !w?.source && !state.erreurs.meteo && <div className="muted">Pas encore de météo.</div>}
      <ErrorLine message={state?.erreurs.meteo} />
    </Card>
  );
}
