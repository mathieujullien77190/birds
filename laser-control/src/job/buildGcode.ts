import { DEFAULT_RAPID, Writer, epilogue, powerToS, prologue, type CutOptions, type GcodeJob, type PassMode } from '../grbl/gcode';
import { simplifyContour } from './geometry';
import { orderContours, type Contour } from './order';
import type { LaserJob } from './types';

const num = (v: number): string => (Math.round(v * 1000) / 1000).toString().replace(/^-0$/, '0');

/** Coupe des contours selon le mode de passes. */
function emitContours(w: Writer, contours: Contour[], o: { feed: number; s: number; passes: number; passMode: PassMode }) {
  const passes = Math.max(1, Math.round(o.passes));
  if (o.passMode === 'contour') {
    for (const c of contours) for (let p = 0; p < passes; p++) w.cut(c.pts, o.feed, o.s, p === 0);
  } else {
    for (let p = 0; p < passes; p++) for (const c of contours) w.cut(c.pts, o.feed, o.s, p === 0);
  }
}

/**
 * G-code d'un travail : gravure d'abord (matière intacte), puis coupe — trous avant contour extérieur, petites pièces d'abord —, passes,
 * `M5` final et retour à l'origine. La valeur S n'est jamais au-dessus du plafond (`capPct`) ni de S max (`sMax`).
 */
export function buildGcode(job: LaserJob, opt: CutOptions): GcodeJob {
  const w = new Writer(opt.rapidFeed ?? DEFAULT_RAPID, job.widthMm, job.heightMm);
  const contours = orderContours(job);
  const engrave = (job.layers.engrave ?? []).map((p) => simplifyContour(p)).filter((p) => p.length >= 3);
  const s = powerToS(opt.powerPct, opt.sMax, opt.capPct);
  const feed = Math.max(1, opt.feed);
  const eFeed = Math.max(1, opt.engraveFeed ?? 1500);
  const ePower = opt.engravePowerPct ?? 15;
  const eS = powerToS(ePower, opt.sMax, opt.capPct);
  const ePasses = Math.max(1, Math.round(opt.engravePasses ?? 1));
  const clamped = opt.powerPct > opt.capPct || opt.powerPct > 100 || (engrave.length > 0 && ePower > opt.capPct);
  prologue(w, opt.air);
  for (let p = 0; p < ePasses; p++) for (const c of engrave) w.cut(c, eFeed, eS, p === 0, true);
  emitContours(w, contours, { feed, s, passes: opt.passes, passMode: opt.passMode });
  epilogue(w, opt.air);
  const stats = w.stats(contours.length + engrave.length, clamped);
  return {
    lines: w.lines, lineTimes: w.lineTimes, segments: w.segments, stats,
    header: [
      `${job.title ?? 'Découpe laser'} (Sculpfun S30 Ultra 22 W, GRBL 1.1)`,
      `Planche ${num(job.widthMm)} x ${num(job.heightMm)} mm ; origine de travail = coin bas-gauche, X à droite, Y vers l'arrière`,
      `${contours.length} contours, ${Math.max(1, Math.round(opt.passes))} passe(s) (${opt.passMode === 'all' ? 'tout le jeu' : 'contour par contour'}), F${num(feed)} mm/min, S${s}/${opt.sMax}`,
      ...(opt.air ? ["Assistance d'air : M8 avant la coupe, M9 après"] : []),
      ...(engrave.length ? [`${engrave.length} contours gravés avant la coupe : F${num(eFeed)} mm/min, S${eS}/${opt.sMax}, ${ePasses} passe(s)`] : ['Les noms des pièces ne sont pas gravés.']),
    ],
  };
}
