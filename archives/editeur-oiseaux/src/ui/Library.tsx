import { useState } from 'react';
import { useBird } from '@/store/bird';
import { useLibrary } from '@/store/library';

/** Enregistrer l'oiseau courant sous un nom, recharger ou supprimer les jeux enregistrés. */
export default function Library() {
  const birdName = useBird((s) => s.name);
  const parts = useBird((s) => s.parts);
  const loadParts = useBird((s) => s.loadParts);
  const birds = useLibrary((s) => s.birds);
  const save = useLibrary((s) => s.save);
  const remove = useLibrary((s) => s.remove);
  const [target, setTarget] = useState('');
  const [msg, setMsg] = useState('');

  const slot = target.trim() || birdName.trim();
  const exists = !!birds[slot];
  const entries = Object.values(birds).sort((a, b) => b.savedAt - a.savedAt);

  const doSave = () => {
    if (!slot || parts.length === 0) return;
    save(slot, parts);
    setMsg(`« ${slot} » enregistré (${parts.length} pièces).`);
    window.setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <button
          onClick={doSave}
          disabled={!slot || parts.length === 0}
          className="shrink-0 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
          title="Enregistre toutes les pièces (formes, positions, couleurs, finesse…) dans le navigateur"
        >
          {exists ? 'Remplacer dans' : 'Enregistrer dans'}
        </button>
        <input
          className="min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs"
          value={target}
          placeholder={birdName || 'Nom du jeu'}
          maxLength={40}
          list="saved-birds"
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doSave(); }}
        />
        <datalist id="saved-birds">
          {entries.map((b) => <option key={b.name} value={b.name} />)}
        </datalist>
      </div>
      {msg && <p className="text-xs text-emerald-700">{msg}</p>}

      {entries.length > 0 && (
        <ul className="space-y-1">
          {entries.map((b) => (
            <li key={b.name} className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate" title={`${b.parts.length} pièces · ${new Date(b.savedAt).toLocaleString('fr-FR')}`}>
                {b.name} <span className="text-stone-400">· {b.parts.length}</span>
              </span>
              <button
                onClick={() => { if (parts.length === 0) return; save(b.name, parts); setMsg(`« ${b.name} » remplacé (${parts.length} pièces).`); window.setTimeout(() => setMsg(''), 3000); }}
                disabled={parts.length === 0}
                className="rounded border border-emerald-600 bg-emerald-50 px-1.5 py-0.5 text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
                title="Remplace ce jeu par les pièces actuelles"
              >
                Save
              </button>
              <button onClick={() => { loadParts(b.name, b.parts); setTarget(b.name); }} className="rounded border border-stone-300 px-1.5 py-0.5 hover:bg-emerald-50" title="Remplace les pièces actuelles par ce jeu">
                Charger
              </button>
              <button onClick={() => remove(b.name)} className="rounded border border-rose-200 px-1.5 py-0.5 text-rose-700 hover:bg-rose-50" title="Supprimer ce jeu">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
