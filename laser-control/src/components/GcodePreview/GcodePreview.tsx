import { useEffect, useMemo, useRef, useState } from 'react';
import { Btn, Chip, Notice } from '../../ui';
import { saveText } from '../../lib';
import { MACHINE_AREA, formatDuration, gcodeText } from '../../grbl';
import type { LaserMachine } from '../../hooks/useLaserMachine';
import { finishedSegments, panView, segmentGroups, segmentsPath, zoomView, type View } from './helpers';

const PAD = 12;

/**
 * Aperçu du trajet avant envoi : coupes en rouge, déplacements rapides en pointillés gris, zone de la machine (410 × 400),
 * planche, cadre et position de la tête en direct. Le repère est celui du G-code (origine en bas à gauche, Y vers le haut = vers l'arrière).
 * Roulette = zoom autour du curseur, glisser = déplacer, double-clic ou « Recadrer » = vue d'ensemble (pour lire les valeurs gravées sur la planche d'essai).
 */
export function GcodePreview({ m }: { m: LaserMachine }) {
  const { program, area, items, itemIndex, grbl, frame } = m;
  const { W, H } = area;
  const head = grbl.status?.wpos;
  // avancement de l'envoi (m.progress) : une pièce passe en pointillé rouge quand le laser a fini de la couper
  const done = m.progress?.segment ?? 0;
  const groups = useMemo(() => (program ? segmentGroups(program.segments) : null), [program]);
  const split = useMemo(() => (program && groups && done > 0 ? finishedSegments(program.segments, groups, done) : null), [program, groups, done]);
  const cutD = useMemo(() => (program ? segmentsPath(split ? split.rest : program.segments, true, false) : ''), [program, split]);
  const doneD = useMemo(() => (split ? segmentsPath(split.done, true, false) : ''), [split]);
  const engraveD = useMemo(() => (program ? segmentsPath(program.segments, true, true) : ''), [program]);
  const rapidD = useMemo(() => (program ? segmentsPath(program.segments, false, false) : ''), [program]);
  const st = program?.stats;
  const maxX = Math.max(W, MACHINE_AREA.W), maxY = Math.max(H, MACHINE_AREA.H);
  const frameBox = frame?.stats.bounds;
  const base = useMemo<View>(() => ({ x: -PAD, y: -PAD, w: maxX + 2 * PAD, h: maxY + 2 * PAD }), [maxX, maxY]);
  const [view, setView] = useState<View>(base);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => setView(base), [base]);
  /** Point du dessin sous un point de l'écran (la vue garde ses proportions, d'où `getScreenCTM`). */
  const toDrawing = (cx: number, cy: number): [number, number] => {
    const ctm = svg.current?.getScreenCTM();
    return ctm ? [(cx - ctm.e) / ctm.a, (cy - ctm.f) / ctm.d] : [view.x + view.w / 2, view.y + view.h / 2];
  };
  const zoom = (factor: number, at?: [number, number]) => { const [px, py] = at ?? [view.x + view.w / 2, view.y + view.h / 2]; setView((v) => zoomView(v, base, factor, px, py)); };
  useEffect(() => { // la roulette zoome l'aperçu au lieu de faire défiler la fenêtre (écouteur non passif)
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.25 : 1 / 1.25, toDrawing(e.clientX, e.clientY)); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-600">
        {items.map((it, i) => <Chip key={i} active={i === itemIndex} disabled={m.job.running} className="disabled:cursor-not-allowed disabled:opacity-50" onClick={() => m.setItemIndex(i)}>{it.label}</Chip>)}
        {program && <Btn block={false} variant="ghost" onClick={() => saveText(gcodeText(program), `${m.item?.fileName ?? 'programme'}.gcode`)}>Télécharger le G-code</Btn>}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
        <Btn block={false} variant="ghost" onClick={() => zoom(1.5)} title="Zoom avant">+</Btn>
        <Btn block={false} variant="ghost" onClick={() => zoom(1 / 1.5)} title="Zoom arrière">−</Btn>
        <Btn block={false} variant="ghost" onClick={() => setView(base)}>Recadrer</Btn>
        <span>{Math.round((base.w / view.w) * 100)} % · roulette : zoom · glisser : déplacer</span>
      </div>
      <div className="relative">
      {m.progress && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-md border border-stone-300 bg-white/90 px-2 py-1 text-xs font-semibold tabular-nums text-stone-800 shadow-sm">
          {m.progress.remaining > 0 ? `Reste ${formatDuration(m.progress.remaining)}` : 'Terminé'} <span className="font-normal text-stone-500">sur {formatDuration(m.program?.stats.seconds ?? 0)}</span>
        </div>
      )}
      <svg
        ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="max-h-[calc(52vh+100px)] w-full cursor-grab touch-none select-none rounded-md border border-stone-200 bg-stone-50 active:cursor-grabbing" role="img" aria-label="Aperçu du trajet de la laser"
        onDoubleClick={() => setView(base)}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => {
          const d = drag.current, ctm = svg.current?.getScreenCTM();
          if (!d || !ctm) return;
          setView((v) => panView(v, base, -(e.clientX - d.x) / ctm.a, -(e.clientY - d.y) / ctm.d));
          drag.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
      >
        <g transform={`translate(0 ${maxY}) scale(1 -1)`}>
          <rect x={0} y={0} width={MACHINE_AREA.W} height={MACHINE_AREA.H} fill="#fffdf7" stroke="#78716c" strokeWidth={0.8} strokeDasharray="6 3" />
          {(W !== MACHINE_AREA.W || H !== MACHINE_AREA.H) && <rect x={0} y={0} width={W} height={H} fill="none" stroke="#a8a29e" strokeWidth={0.5} />}
          {frameBox && <rect x={frameBox.minX} y={frameBox.minY} width={frameBox.maxX - frameBox.minX} height={frameBox.maxY - frameBox.minY} fill="none" stroke="#2563eb" strokeWidth={0.6} strokeDasharray="3 2" />}
          {rapidD && <path d={rapidD} fill="none" stroke="#9ca3af" strokeWidth={0.4} strokeDasharray="2 2" />}
          {engraveD && <path d={engraveD} fill="none" stroke="#2563eb" strokeWidth={0.6} strokeLinejoin="round" />}
          {cutD && <path d={cutD} fill="none" stroke="#dc2626" strokeWidth={0.6} strokeLinejoin="round" />}
          {doneD && <path d={doneD} fill="none" stroke="#dc2626" strokeWidth={0.6} strokeDasharray="1.2 1.2" strokeLinejoin="round" />}
          <circle cx={0} cy={0} r={2.5} fill="#16a34a" />
          {head && (
            <g>
              <circle cx={head.x} cy={head.y} r={4} fill="none" stroke="#f59e0b" strokeWidth={1.2} />
              <path d={`M${head.x - 8} ${head.y}H${head.x + 8}M${head.x} ${head.y - 8}V${head.y + 8}`} stroke="#f59e0b" strokeWidth={1} />
            </g>
          )}
        </g>
      </svg>
      </div>
      <p className="text-[11px] text-stone-500">
        Rouge = coupe (une pièce passe en pointillé rouge quand elle est finie, pendant l'envoi), bleu = gravure, pointillés gris = déplacements rapides (laser éteint), cadre bleu = « Cadre à vide », rond vert = origine (X0 Y0), croix orange = la tête. Pointillés noirs = zone de la machine {MACHINE_AREA.W} × {MACHINE_AREA.H} mm.
      </p>
      {st && (
        <p className="text-[11px] text-stone-700">
          {st.contours} contours · {st.lines} lignes de G-code · coupe {(st.cutMm / 1000).toFixed(2)} m · durée estimée <b>{formatDuration(st.seconds)}</b> (vitesses réelles ; le tracé de la machine simulée va plus vite).
        </p>
      )}
      {st?.outOfBounds && <Notice kind="error">Une partie du tracé sort de la planche ({W} × {H} mm) : une pièce est plus grande que la planche.</Notice>}
      {m.item?.notice && <Notice kind="info">{m.item.notice}</Notice>}
      {m.importWarnings.map((w) => <Notice key={w} kind="warn">{w}</Notice>)}
    </div>
  );
}
