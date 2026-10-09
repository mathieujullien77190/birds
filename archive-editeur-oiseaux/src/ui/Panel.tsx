import { SHAPE_LABELS, SHAPE_ORDER } from '@/engine/types';
import { MALLARD_MALE } from '@/engine/presets/mallard';
import { useBird } from '@/store/bird';
import { useRef, useState } from 'react';
import { STL_ORIENTATION_LABELS, importStl, type StlOrientation } from '@/engine/importStl';
import PartEditor from './PartEditor';
import Library from './Library';
import { partTriangles } from '@/engine/shapes';

/** Panneau de gauche : nom de l'oiseau, modèles, ajout de formes, liste des pièces, réglages. */
export default function Panel() {
  const name = useBird((s) => s.name);
  const setName = useBird((s) => s.setName);
  const parts = useBird((s) => s.parts);
  const selectedId = useBird((s) => s.selectedId);
  const select = useBird((s) => s.select);
  const addPart = useBird((s) => s.addPart);
  const removePart = useBird((s) => s.removePart);
  const setAll = useBird((s) => s.setAll);
  const allOn = (k: 'smooth' | 'transparent' | 'showAxes') => parts.length > 0 && parts.every((p) => p[k]);
  const loadParts = useBird((s) => s.loadParts);
  const clear = useBird((s) => s.clear);
  const undo = useBird((s) => s.undo);
  const redo = useBird((s) => s.redo);
  const canUndo = useBird((s) => s.past.length > 0);
  const canRedo = useBird((s) => s.future.length > 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [orient, setOrient] = useState<StlOrientation>('frontX');
  const [status, setStatus] = useState('');
  const say = (msg: string) => { setStatus(msg); window.setTimeout(() => setStatus(''), 5000); };
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const name = file.name.replace(/\.stl$/i, '').slice(0, 30);
      const defs = importStl(await file.arrayBuffer(), orient, name);
      loadParts(name, defs);
      say(`Importé : ${(defs[0].mesh!.idx.length / 3).toLocaleString('fr-FR')} triangles après simplification.`);
    } catch (e) {
      say(`Import impossible : ${e instanceof Error ? e.message : e}`);
    }
  };
  const selected = parts.find((p) => p.id === selectedId) ?? null;
  const triangles = parts.reduce((n, p) => n + partTriangles(p) * (p.mirror ? 2 : 1), 0);

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-stone-200 bg-stone-50 p-4">
      <header>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-base font-semibold text-emerald-900">Éditeur d'oiseaux</h1>
          <div className="flex gap-1">
            <button onClick={undo} disabled={!canUndo} title="Annuler (Ctrl+Z)" className="rounded-md border border-stone-300 bg-white px-2 py-0.5 text-sm hover:bg-stone-100 disabled:opacity-30">↶</button>
            <button onClick={redo} disabled={!canRedo} title="Rétablir (Ctrl+Y)" className="rounded-md border border-stone-300 bg-white px-2 py-0.5 text-sm hover:bg-stone-100 disabled:opacity-30">↷</button>
          </div>
        </div>
        <p className="text-xs text-stone-500">Low poly, style Alba</p>
        <input
          className="mt-2 w-full rounded-md border border-stone-200 bg-white px-2 py-1 text-sm"
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom de l'oiseau"
        />
      </header>

      <Section title="Modèles">
        <button
          onClick={() => loadParts('Colvert mâle', MALLARD_MALE)}
          className="w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-800"
          title="Remplace les pièces actuelles par un canard colvert complet : corps, tête, bec, yeux, ailes, queue"
        >
          Canard colvert (mâle)
        </button>
        <div className="mt-2 flex gap-1.5">
          <button onClick={() => fileRef.current?.click()} className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs hover:bg-emerald-50" title="Remplace les pièces actuelles par un fichier .stl (une seule pièce, simplifiée)">
            Importer un .stl…
          </button>
          <select value={orient} onChange={(e) => setOrient(e.target.value as StlOrientation)} className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-1 text-xs" title="Orientation du fichier">
            {(Object.keys(STL_ORIENTATION_LABELS) as StlOrientation[]).map((k) => <option key={k} value={k}>{STL_ORIENTATION_LABELS[k]}</option>)}
          </select>
          <input ref={fileRef} type="file" accept=".stl" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        {status && <p className="mt-1 text-xs text-stone-600">{status}</p>}
      </Section>

      <Section title="Enregistrements">
        <Library />
      </Section>

      <Section title="Ajouter une forme">
        <div className="grid grid-cols-2 gap-1.5">
          {SHAPE_ORDER.map((k) => (
            <button
              key={k}
              onClick={() => addPart(k)}
              className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-left text-xs hover:bg-emerald-50"
            >
              + {SHAPE_LABELS[k]}
            </button>
          ))}
        </div>
      </Section>

      <Section title={parts.length ? `Pièces · ${triangles.toLocaleString('fr-FR')} triangles` : 'Pièces'}>
        {parts.length > 0 && (
          <div className="mb-2 flex gap-1.5" title="Pour toutes les pièces d'un coup">
            {([['smooth', 'Lisser'], ['transparent', 'Transparent'], ['showAxes', 'Axes']] as const).map(([k, label]) => {
              const on = allOn(k);
              return (
                <button
                  key={k}
                  onClick={() => setAll({ [k]: !on })}
                  className={`flex-1 rounded-md border px-2 py-1 text-xs ${on ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-stone-300 bg-white text-stone-600 hover:bg-stone-100'}`}
                  title={on ? `${label} : désactiver pour toutes les pièces` : `${label} : activer pour toutes les pièces`}
                >
                  {on ? '✓ ' : ''}{label}
                </button>
              );
            })}
          </div>
        )}
        {parts.length === 0 ? (
          <p className="text-xs text-stone-500">Aucune pièce. Charge un modèle ou ajoute un corps.</p>
        ) : (
          <ul className="space-y-1">
            {parts.map((p) => (
              <li key={p.id} className={`group flex items-center rounded-md ${p.id === selectedId ? 'bg-emerald-100 text-emerald-900' : 'hover:bg-stone-100'}`}>
                <button
                  onClick={() => select(p.id === selectedId ? null : p.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                >
                  <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: p.color }} />
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.mirror && <span className="text-[10px] text-stone-400" title="Symétrique">×2</span>}
                </button>
                <button
                  onClick={() => removePart(p.id)}
                  title={`Supprimer « ${p.name} »`}
                  className="mr-1 rounded px-1.5 py-0.5 text-sm text-stone-400 hover:bg-rose-100 hover:text-rose-700"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {selected && (
        <Section title="Pièce sélectionnée">
          <PartEditor part={selected} />
        </Section>
      )}

      {parts.length > 0 && (
        <button onClick={clear} className="mt-auto rounded-md border border-stone-300 px-2 py-1.5 text-xs text-stone-600 hover:bg-stone-100">
          Tout effacer
        </button>
      )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">{title}</h2>
      {children}
    </section>
  );
}
