import { useEffect, useState } from 'react';
import { ErrorLine, ToggleButton } from '@/ui';
import { AUTO_FIELDS } from './constants';
import { describeAuto, isDirty } from './helpers';
import type { AutoFanProps } from './types';
import './AutoFan.css';

/** Ventilation automatique : un bouton pour l'activer et des réglages modifiables (seuil, écart avec dehors, vitesses). */
export function AutoFan({ state, onAuto }: AutoFanProps) {
  const a = state?.auto;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const signature = a ? AUTO_FIELDS.map((f) => a[f.key]).join('|') : '';
  useEffect(() => { // le brouillon repart des valeurs enregistrées quand elles changent côté programme
    if (a) setDraft(Object.fromEntries(AUTO_FIELDS.map((f) => [f.key, String(a[f.key])])));
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!a) return null;
  const saved = Object.fromEntries(AUTO_FIELDS.map((f) => [f.key, a[f.key]]));
  const dirty = isDirty(draft, saved);
  const apply = () => onAuto(Object.fromEntries(AUTO_FIELDS.map((f) => [f.key, Number(draft[f.key])])));
  return (
    <div className="auto">
      <div className="row">
        <ToggleButton id="v_auto" on={a.actif} onClick={() => onAuto({ actif: !a.actif })}>Ventilation automatique</ToggleButton>
      </div>
      <div className={`muted auto-etat auto-${a.etat}`} id="auto_etat">{describeAuto(a)}</div>
      {a.avertissements.map((w) => <div key={w} className="muted">⚠ {w}</div>)}
      <ErrorLine message={state?.erreurs.alerte_chaleur} />
      <div className="row"><label className="auto-check" title="ventilateur retiré et remplacé par le bloc isolant, bouchon du dessous posé : le ventilateur ne démarre pas en automatique (la commande manuelle reste possible)"><input id="auto_hiver" type="checkbox" checked={a.hiver} onChange={(e) => onAuto({ hiver: e.target.checked })} /> Mode hiver</label></div>
      {a.hiver && <div className="muted" id="auto_hiver_rappel">⚠ Au printemps : remettre la cassette du ventilateur (connecteur 4 broches), ôter le bloc isolant et le bouchon du dessous, puis décocher.</div>}
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
