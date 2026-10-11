import { Card, ErrorLine, Stat } from '@/ui';
import { fmt } from '@/utils';
import type { WeatherCardProps } from './types';

/** Carte « Dehors » : la météo en ligne (Open-Meteo) sert de sonde extérieure ; l'écart avec le nid est sur la carte « Nid ». */
export function WeatherCard({ state }: WeatherCardProps) {
  const w = state?.meteo;
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
      {w?.source && <div className="muted">Source : {w.source}{w.maj ? `, ${w.maj}` : ''}</div>}
      {state && !w?.source && !state.erreurs.meteo && <div className="muted">Pas encore de météo.</div>}
      <ErrorLine message={state?.erreurs.meteo} />
    </Card>
  );
}
