import { Card } from '@/ui';
import { CHART, COLORS } from './constants';
import { hasData, linePaths, temperatureRange, timeTicks } from './helpers';
import type { HistoryChartProps } from './types';
import './HistoryChart.css';

/** Graphique SVG (sans bibliothèque) : température du nid et de dehors sur les dernières 24 h, avec la vitesse du ventilateur en fond. */
export function HistoryChart({ points }: HistoryChartProps) {
  const range = temperatureRange(points);
  const { width, height, left, right, top, bottom } = CHART;
  const w = width - left - right, h = height - top - bottom;
  const x = (i: number) => left + (points.length <= 1 ? 0 : (i / (points.length - 1)) * w);
  return (
    <Card title="Températures (24 h)" className="wide">
      {!range || !hasData(points) ? (
        <div className="muted" id="histo_vide">Pas encore de données : un point est enregistré toutes les 5 minutes.</div>
      ) : (
        <>
          <ChartSvg points={points} min={range.min} max={range.max} x={x} w={w} h={h} />
          <div className="chart-legend">
            <span><i style={{ background: COLORS.nid }} />Nid</span>
            <span><i style={{ background: COLORS.ext }} />Dehors</span>
            <span><i className="fan" style={{ background: COLORS.fan }} />Ventilateur (0 à 100 %)</span>
          </div>
        </>
      )}
    </Card>
  );
}

interface ChartSvgProps { points: HistoryChartProps['points']; min: number; max: number; x: (i: number) => number; w: number; h: number }

function ChartSvg({ points, min, max, x, w, h }: ChartSvgProps) {
  const { width, height, left, top } = CHART;
  const y = (v: number) => top + h - ((v - min) / (max - min)) * h;
  const yFan = (p: number) => top + h - (p / 100) * h;
  const step = Math.max(1, Math.round((max - min) / 4));
  const yTicks: number[] = [];
  for (let v = min; v <= max; v += step) yTicks.push(v);
  const fanArea = `M${x(0).toFixed(1)},${top + h}` + points.map((p, i) => `L${x(i).toFixed(1)},${yFan(p.ventilo).toFixed(1)}`).join('') + `L${x(points.length - 1).toFixed(1)},${top + h}Z`;
  return (
    <svg className="chart" id="histo" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Températures du nid et de dehors sur 24 heures">
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={left} x2={left + w} y1={y(v)} y2={y(v)} stroke={COLORS.grid} />
          <text x={left - 6} y={y(v) + 4} textAnchor="end">{v} °C</text>
        </g>
      ))}
      <path d={fanArea} fill={COLORS.fan} opacity={0.45} />
      {timeTicks(points.length, 6).map((i) => (
        <text key={i} x={x(i)} y={height - 8} textAnchor="middle">{points[i].t}</text>
      ))}
      {linePaths(points.map((p) => p.ext), x, y).map((d) => <path key={`e${d.slice(0, 12)}`} d={d} fill="none" stroke={COLORS.ext} strokeWidth={2} />)}
      {linePaths(points.map((p) => p.nid), x, y).map((d) => <path key={`n${d.slice(0, 12)}`} d={d} fill="none" stroke={COLORS.nid} strokeWidth={2.5} />)}
    </svg>
  );
}
