import { useMemo } from 'react';
import { Btn, Chip, Notice } from '@/ui';
import { saveText } from '@/lib';
import { sheetLabel } from '@/birdhouse/model';
import { MACHINE_AREA, formatDuration, gcodeText } from '../../grbl';
import type { LaserMachine } from '../../hooks/useLaserMachine';
import { segmentsPath } from './helpers';

const PAD = 12;

/**
 * Aperçu du trajet avant envoi : coupes en rouge, déplacements rapides en pointillés gris, zone de la machine (410 × 400),
 * planche, cadre et position de la tête en direct. Le repère est celui du G-code (origine en bas à gauche, Y vers le haut = vers l'arrière).
 */
export function GcodePreview({ m }: { m: LaserMachine }) {
  const { program, cutCfg, sheets, sheetIndex, grbl, frame } = m;
  const { W, H } = cutCfg;
  const cutD = useMemo(() => (program ? segmentsPath(program.segments, true) : ''), [program]);
  const rapidD = useMemo(() => (program ? segmentsPath(program.segments, false) : ''), [program]);
  const st = program?.stats;
  const head = grbl.status?.wpos;
  const maxX = Math.max(W, MACHINE_AREA.W), maxY = Math.max(H, MACHINE_AREA.H);
  const frameBox = frame?.stats.bounds;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-600">
        {m.target === 'sheet' && sheets.map((_, i) => <Chip key={i} active={i === sheetIndex} onClick={() => m.setSheetIndex(i)}>{sheetLabel(sheets, i)}</Chip>)}
        <Chip active={m.target === 'test'} onClick={() => m.setTarget(m.target === 'test' ? 'sheet' : 'test')}>Planche d'essai</Chip>
        {program && <Btn block={false} variant="ghost" onClick={() => saveText(gcodeText(program), `${m.target === 'test' ? 'essai' : `planche-${sheetIndex + 1}`}.gcode`)}>Télécharger le G-code</Btn>}
      </div>
      <svg viewBox={`${-PAD} ${-PAD} ${maxX + 2 * PAD} ${maxY + 2 * PAD}`} className="max-h-[52vh] w-full rounded-md border border-stone-200 bg-stone-50" role="img" aria-label="Aperçu du trajet de la laser">
        <g transform={`translate(0 ${maxY}) scale(1 -1)`}>
          <rect x={0} y={0} width={MACHINE_AREA.W} height={MACHINE_AREA.H} fill="#fffdf7" stroke="#78716c" strokeWidth={0.8} strokeDasharray="6 3" />
          {(W !== MACHINE_AREA.W || H !== MACHINE_AREA.H) && <rect x={0} y={0} width={W} height={H} fill="none" stroke="#a8a29e" strokeWidth={0.5} />}
          {frameBox && <rect x={frameBox.minX} y={frameBox.minY} width={frameBox.maxX - frameBox.minX} height={frameBox.maxY - frameBox.minY} fill="none" stroke="#2563eb" strokeWidth={0.6} strokeDasharray="3 2" />}
          {rapidD && <path d={rapidD} fill="none" stroke="#9ca3af" strokeWidth={0.4} strokeDasharray="2 2" />}
          {cutD && <path d={cutD} fill="none" stroke="#dc2626" strokeWidth={0.6} strokeLinejoin="round" />}
          <circle cx={0} cy={0} r={2.5} fill="#16a34a" />
          {head && (
            <g>
              <circle cx={head.x} cy={head.y} r={4} fill="none" stroke="#f59e0b" strokeWidth={1.2} />
              <path d={`M${head.x - 8} ${head.y}H${head.x + 8}M${head.x} ${head.y - 8}V${head.y + 8}`} stroke="#f59e0b" strokeWidth={1} />
            </g>
          )}
        </g>
      </svg>
      <p className="text-[11px] text-stone-500">
        Rouge = coupe, pointillés gris = déplacements rapides (laser éteint), cadre bleu = « Cadre à vide », rond vert = origine (X0 Y0), croix orange = la tête. Pointillés noirs = zone de la machine {MACHINE_AREA.W} × {MACHINE_AREA.H} mm.
      </p>
      {st && (
        <p className="text-[11px] text-stone-700">
          {st.contours} contours · {st.lines} lignes de G-code · coupe {(st.cutMm / 1000).toFixed(2)} m · durée estimée <b>{formatDuration(st.seconds)}</b> (vitesses réelles ; le tracé de la machine simulée va plus vite).
        </p>
      )}
      {st?.outOfBounds && <Notice kind="error">Une partie du tracé sort de la planche ({W} × {H} mm) : une pièce est plus grande que la planche.</Notice>}
      <Notice kind="info">Les noms des pièces (en bleu dans les SVG) ne sont pas gravés : seules les coupes (contours des pièces et de leurs trous) sont envoyées.</Notice>
    </div>
  );
}
