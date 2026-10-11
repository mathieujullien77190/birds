import { Btn, Hint, Slider } from '@/ui';
import { formatDuration } from '../../grbl';
import type { LaserMachine } from '../../hooks/useLaserMachine';

/** Planche d'essai : petits carrés découpés pour une grille vitesse × puissance, tableau à l'écran (rien n'est gravé) pour choisir le bon couple. */
export function TestCard({ m }: { m: LaserMachine }) {
  const { settings, setSettings, test } = m;
  const t = settings.test;
  const set = (patch: Partial<typeof t>) => setSettings({ ...settings, test: { ...t, ...patch } });
  const speeds = [...new Set(test.cells.map((c) => c.speed))];
  const powers = [...new Set(test.cells.map((c) => c.power))];
  const cell = (speed: number, power: number) => test.cells.find((c) => c.speed === speed && c.power === power);
  const active = m.target === 'test';

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Slider label="Vitesse min" value={t.speedMin} min={20} max={3000} step={10} unit=" mm/min" onChange={(speedMin) => set({ speedMin })} />
        <Slider label="Vitesse max" value={t.speedMax} min={20} max={3000} step={10} unit=" mm/min" onChange={(speedMax) => set({ speedMax })} />
        <Slider label="Colonnes (vitesses)" value={t.speedCount} min={1} max={8} step={1} onChange={(speedCount) => set({ speedCount })} />
        <Slider label="Lignes (puissances)" value={t.powerCount} min={1} max={8} step={1} onChange={(powerCount) => set({ powerCount })} />
        <Slider label="Puissance min" value={t.powerMin} min={1} max={100} step={1} unit=" %" onChange={(powerMin) => set({ powerMin })} />
        <Slider label="Puissance max" value={t.powerMax} min={1} max={100} step={1} unit=" %" onChange={(powerMax) => set({ powerMax })} />
        <Slider label="Côté d'un carré" value={t.size} min={5} max={30} step={1} unit=" mm" onChange={(size) => set({ size })} />
        <Slider label="Passes" value={t.passes} min={1} max={10} step={1} onChange={(passes) => set({ passes })} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center text-[10px] tabular-nums">
          <thead>
            <tr><th className="p-1 text-left text-stone-500">Puissance ↓ / vitesse →</th>{speeds.map((v) => <th key={v} className="border border-stone-200 bg-stone-50 p-1">{v}</th>)}</tr>
          </thead>
          <tbody>
            {[...powers].reverse().map((p) => (
              <tr key={p}>
                <th className="border border-stone-200 bg-stone-50 p-1">{p} %</th>
                {speeds.map((v) => { const c = cell(v, p); return <td key={v} className={`border border-stone-200 p-1 ${c?.clamped ? 'bg-amber-50 text-amber-800' : ''}`}>{c ? `x ${Math.round(c.x)}, y ${Math.round(c.y)}` : ''}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Hint>Chaque case = le coin bas-gauche du carré (mm, depuis l'origine : place l'origine dans le coin d'une chute). Les lignes du bas sont les plus proches de l'origine ; les cases en orange dépassent le plafond de puissance et sont limitées. Le carré qui se détache proprement avec le moins de brûlure donne ta vitesse et ta puissance.</Hint>
      <div className="flex items-center gap-2">
        <Btn variant={active ? 'primary' : 'secondary'} onClick={() => m.setTarget(active ? 'sheet' : 'test')}>{active ? '✔ Planche d\'essai choisie' : 'Choisir la planche d\'essai'}</Btn>
      </div>
      <p className="text-[11px] text-stone-500">{test.cells.length} carrés, {formatDuration(test.job.stats.seconds)} estimées{test.fits ? '' : ' — NE TIENT PAS sur la planche'}.</p>
    </div>
  );
}
