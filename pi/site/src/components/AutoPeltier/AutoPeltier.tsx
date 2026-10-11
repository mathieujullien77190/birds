import { useEffect, useState } from 'react';
import { ErrorLine, ToggleButton } from '@/ui';
import { AUTO_FIELDS } from './constants';
import { describeAuto, isDirty } from './helpers';
import type { AutoPeltierProps } from './types';
import './AutoPeltier.css';

/** Peltier automatique : un bouton pour l'activer et des réglages modifiables (seuils de gel et de chaleur, écart avec l'extérieur). */
export function AutoPeltier({ state, onAuto }: AutoPeltierProps) {
  const a = state?.auto;
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => { // le brouillon repart des valeurs enregistrées quand elles changent côté programme
    if (a) setDraft(Object.fromEntries(AUTO_FIELDS.map((f) => [f.key, String(a[f.key])])));
  }, [a?.min_gel, a?.plafond_chauffe, a?.ecart_ext, a?.max_chaleur, a?.hysteresis]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return null;
  const saved = Object.fromEntries(AUTO_FIELDS.map((f) => [f.key, a[f.key]]));
  const dirty = isDirty(draft, saved);
  const apply = () => onAuto(Object.fromEntries(AUTO_FIELDS.map((f) => [f.key, Number(draft[f.key])])));
  return (
    <div className="auto">
      <div className="row">
        <ToggleButton id="p_auto" on={a.actif} onClick={() => onAuto({ actif: !a.actif })}>Peltier automatique</ToggleButton>
      </div>
      <div className={`muted auto-etat auto-${a.etat}`} id="auto_etat">{describeAuto(a)}</div>
      {a.avertissements.map((w) => <div key={w} className="muted">⚠ {w}</div>)}
      <ErrorLine message={state?.erreurs.alerte_chaleur} />
      <details>
        <summary>Réglages</summary>
        <div className="auto-fields">
          {AUTO_FIELDS.map((f) => (
            <label key={f.key} title={f.hint}>
              <span>{f.label}</span>
              <input id={`auto_${f.key}`} type="number" min={f.min} max={f.max} step={f.step} value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} /> {f.unit}
            </label>
          ))}
        </div>
        <div className="row"><button id="auto_appliquer" disabled={!dirty} onClick={apply}>Appliquer</button></div>
      </details>
    </div>
  );
}
