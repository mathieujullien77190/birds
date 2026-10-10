import { useEffect, useRef, useState } from 'react';

const PX_PER_MM = 96 / 25.4;

/** Planche de découpe à plat : clic droit (ou gauche, ou milieu) + glisser = déplacer, roulette = zoom. */
export function Sheet2D({ svg, width, height }: { svg: string; width: number; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 20, y: 20, k: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const fit = () => {
    const el = box.current;
    if (!el) return;
    const k = Math.min((el.clientWidth - 40) / (width * PX_PER_MM), (el.clientHeight - 40) / (height * PX_PER_MM), 4);
    setView({ x: 20, y: 20, k });
  };
  useEffect(fit, [width, Math.round(height / 20)]); // eslint-disable-line react-hooks/exhaustive-deps
  const onWheel = (e: React.WheelEvent) => {
    const r = box.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setView((v) => { const k = Math.min(20, Math.max(0.05, v.k * f)); return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }; });
  };
  return (
    <div
      ref={box}
      className="absolute inset-0 cursor-grab overflow-hidden bg-stone-200 select-none active:cursor-grabbing"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; (e.currentTarget as Element).setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { const d = drag.current; if (!d) return; setView((v) => ({ ...v, x: v.x + e.clientX - d.x, y: v.y + e.clientY - d.y })); drag.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onWheel={onWheel}
    >
      <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0' }} className="pointer-events-none inline-block bg-white shadow-md" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[11px] text-stone-600">
        <button onClick={fit} className="rounded border border-stone-300 bg-white px-2 py-0.5 hover:bg-stone-100">Recadrer</button>
        Clic droit + glisser : déplacer · roulette : zoom
      </div>
    </div>
  );
}

/** Télécharge un SVG (fichier de découpe). */
export const saveSvg = (svg: string, name: string) => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
};
