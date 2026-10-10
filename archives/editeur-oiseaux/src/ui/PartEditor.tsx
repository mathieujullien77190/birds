import type { Part, Vec3 } from '@/engine/types';
import { ROTATION_AXES, SHAPE_LABELS } from '@/engine/types';
import { DETAIL_MAX, partTriangles } from '@/engine/shapes';
import { PYRAMID_DEFAULT_POINTS } from '@/engine/shapes/pyramid';
import { useBird } from '@/store/bird';
import { create } from 'zustand';
import Slider from './Slider';

/** Presse-papiers de position : « Copier » dans une pièce, « Coller » dans une autre. */
const useClipboard = create<{ pos: Vec3 | null; setPos: (p: Vec3) => void }>((set) => ({ pos: null, setPos: (pos) => set({ pos: [...pos] as Vec3 }) }));

const AXES = ['X', 'Y', 'Z'] as const;
const pct = (v: number) => Math.round(v * 100); // facteur → pourcentage entier
const ROT_LABEL = { X: 'Bascule avant / arrière (X)', Y: 'Penche sur le côté (Y)', Z: 'Pivote à gauche / droite (Z)' } as const;

/** Réglages de la pièce sélectionnée. */
export default function PartEditor({ part }: { part: Part }) {
  const update = useBird((s) => s.updatePart);
  const remove = useBird((s) => s.removePart);
  const duplicate = useBird((s) => s.duplicatePart);
  const clip = useClipboard((s) => s.pos);
  const setClip = useClipboard((s) => s.setPos);
  const setVec = (key: 'pos' | 'rot' | 'scl', i: number, v: number) => {
    const arr = [...part[key]] as Vec3;
    arr[i] = v;
    update(part.id, { [key]: arr }, key + i);
  };
  const setAllScl = (v: number) => update(part.id, { scl: [v, v, v] }, 'scl');

  return (
    <div className="space-y-4">
      <div>
        <input
          className="w-full rounded-md border border-stone-200 bg-white px-2 py-1 text-sm"
          value={part.name}
          maxLength={30}
          onChange={(e) => update(part.id, { name: e.target.value }, 'name')}
        />
        <p className="mt-1 text-xs text-stone-500">{SHAPE_LABELS[part.shape]}</p>
      </div>

      {part.points && (
        <Group title="Coins">
          <p className="text-xs text-stone-600">Tire les billes orange dans la vue 3D pour déplacer chaque coin (4 coins de la base + le sommet).</p>
          <div className="flex gap-1.5">
            <button onClick={() => update(part.id, { points: PYRAMID_DEFAULT_POINTS.map((p) => [...p] as Vec3) })} className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs hover:bg-stone-100">
              Remettre les coins d'origine
            </button>
          </div>
        </Group>
      )}
      <Group title="Taille">
        <Slider label="Taille globale" value={pct(Math.cbrt(part.scl[0] * part.scl[1] * part.scl[2]))} min={20} max={300} step={1} unit=" %" onChange={(v) => setAllScl(v / 100)} />
        <Slider label="Largeur (X)" value={pct(part.scl[0])} min={10} max={300} step={1} unit=" %" onChange={(v) => setVec('scl', 0, v / 100)} />
        <Slider label="Longueur (Y, les deux bouts)" value={pct(part.scl[1])} min={10} max={300} step={1} unit=" %" onChange={(v) => setVec('scl', 1, v / 100)} />
        <Slider label="Hauteur (Z)" value={pct(part.scl[2])} min={10} max={300} step={1} unit=" %" onChange={(v) => setVec('scl', 2, v / 100)} />
        <Slider label="Avant seul (+Y, l'arrière ne bouge pas)" value={pct(part.yStretch[0])} min={20} max={300} step={1} unit=" %" onChange={(v) => update(part.id, { yStretch: [v / 100, part.yStretch[1]] }, 'yFront')} />
        <Slider label="Arrière seul (−Y, l'avant ne bouge pas)" value={pct(part.yStretch[1])} min={20} max={300} step={1} unit=" %" onChange={(v) => update(part.id, { yStretch: [part.yStretch[0], v / 100] }, 'yBack')} />
      </Group>

      <Group
        title="Position"
        actions={
          <>
            <button onClick={() => setClip(part.pos)} className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11px] hover:bg-stone-100" title="Copie la position de cette pièce">
              Copier
            </button>
            {clip && (
              <button onClick={() => update(part.id, { pos: [...clip] as Vec3 })} className="rounded border border-emerald-600 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-900 hover:bg-emerald-100" title={`Colle la position copiée : ${clip.map((v) => Math.round(v * 100)).join(', ')}`}>
                Coller
              </button>
            )}
          </>
        }
      >
        {AXES.map((a, i) => (
          <Slider key={a} label={`Position ${a}${a === 'Y' ? ' (avant)' : a === 'Z' ? ' (hauteur)' : ''}`} value={Math.round(part.pos[i] * 100)} min={-200} max={200} step={1} onChange={(v) => setVec('pos', i, v / 100)} />
        ))}
      </Group>

      <Group title={ROTATION_AXES[part.shape].length === 1 ? 'Rotation (un seul axe)' : 'Rotation'}>
        {AXES.map((a, i) =>
          ROTATION_AXES[part.shape].includes(a) ? (
            <Slider key={a} label={ROT_LABEL[a]} value={part.rot[i]} min={-180} max={180} step={1} unit="°" onChange={(v) => setVec('rot', i, v)} />
          ) : null,
        )}
      </Group>

      <Group title="Apparence">
        <label className="flex items-center justify-between text-xs text-stone-600">
          Couleur
          <input type="color" value={part.color} onChange={(e) => update(part.id, { color: e.target.value }, 'color')} className="h-7 w-12 cursor-pointer rounded border border-stone-200 bg-white" />
        </label>
        {!part.mesh && <Slider label="Finesse du maillage" value={part.detail} min={1} max={DETAIL_MAX[part.shape]} step={1} onChange={(v) => update(part.id, { detail: v }, 'detail')} />}
        <p className="text-right text-[11px] text-stone-500">
          {partTriangles(part).toLocaleString('fr-FR')} triangles{part.mirror ? ' × 2' : ''}
        </p>
        <label className="flex items-center gap-2 text-xs text-stone-600">
          <input type="checkbox" checked={part.smooth} onChange={(e) => update(part.id, { smooth: e.target.checked })} className="accent-emerald-700" />
          Lisser (arrondi, sans facettes)
        </label>
        <label className="flex items-center gap-2 text-xs text-stone-600">
          <input type="checkbox" checked={part.mirror} onChange={(e) => update(part.id, { mirror: e.target.checked })} className="accent-emerald-700" />
          Symétrique (copie de l'autre côté)
        </label>
        <label className="flex items-center gap-2 text-xs text-stone-600">
          <input type="checkbox" checked={part.transparent} onChange={(e) => update(part.id, { transparent: e.target.checked })} className="accent-emerald-700" />
          Transparent
        </label>
        <label className="flex items-center gap-2 text-xs text-stone-600">
          <input type="checkbox" checked={part.showAxes} onChange={(e) => update(part.id, { showAxes: e.target.checked })} className="accent-emerald-700" />
          Afficher ses axes (X rouge, Y vert, Z bleu)
        </label>
      </Group>

      <div className="flex gap-2">
        <button onClick={() => duplicate(part.id)} className="flex-1 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs hover:bg-stone-100">
          Dupliquer
        </button>
        <button onClick={() => remove(part.id)} className="flex-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700 hover:bg-rose-100">
          Supprimer
        </button>
      </div>
    </div>
  );
}

function Group({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2 rounded-lg border border-stone-200 bg-white/60 p-3">
      <legend className="flex items-center gap-2 px-1 text-[11px] font-semibold tracking-wide text-emerald-800 uppercase">
        {title}
        {actions && <span className="flex gap-1 normal-case tracking-normal">{actions}</span>}
      </legend>
      {children}
    </fieldset>
  );
}
