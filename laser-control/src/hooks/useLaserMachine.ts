import { useEffect, useMemo, useRef, useState } from 'react';
import { MACHINE_SETTINGS_KEY, TEST_CARD } from '../constants';
import { MACHINE_AREA, buildFrame, buildTestCard, motionFrom, spread, type GcodeJob } from '../grbl';
import { parseMachineSettings } from '../helpers';
import { buildGcode, jobBox, parseGcode, type LaserItem } from '../job';
import { useGcodeJob } from './useGcodeJob';
import { useGrbl } from './useGrbl';
import { useJobProgress } from './useJobProgress';
import { usePersistentState } from './usePersistentState';

/** Taille de la planche (mm) quand aucun programme n'est choisi. */
export interface Area { W: number; H: number }

/**
 * Pilotage de la laser : connexion GRBL, envoi en flux, réglages de coupe (gardés), programme de l'élément choisi.
 * `items` = les programmes proposés (planches à couper, G-code importé), suivis de la planche d'essai (puissance × vitesse, valeurs gravées à côté) ;
 * `area` = taille de planche par défaut (planche d'essai, cadre).
 * Vit au niveau de l'écran pour que la connexion et un envoi en cours survivent à la fermeture de la fenêtre « Pilotage ».
 */
export function useLaserMachine(items: LaserItem[], area: Area = { W: MACHINE_AREA.W, H: MACHINE_AREA.H }) {
  const grbl = useGrbl();
  const job = useGcodeJob(grbl);
  const [settings, setSettings] = usePersistentState(MACHINE_SETTINGS_KEY, parseMachineSettings);
  const [open, setOpen] = useState(false);
  const [itemIndex, setItemIndex] = useState(0);
  const [mockLaserMode, setMockLaserMode] = useState(true);

  const sMax = grbl.settings[30] ?? 1000;
  const motion = useMemo(() => motionFrom(grbl.settings), [grbl.settings]); // accélération, coins et vitesses de la machine (`$$`) : durée estimée juste
  const test = useMemo(() => {
    const t = TEST_CARD;
    const passes = settings.passes; // la planche d'essai suit le nombre de passes choisi, et ses vitesses sont multipliées par ce nombre (2 passes à 1200 = autant d'énergie qu'une passe à 600)
    return buildTestCard({ W: area.W, H: area.H, speeds: spread(t.speedMin * passes, t.speedMax * passes, t.speedCount), powers: spread(t.powerMin, t.powerMax, t.powerCount), size: t.size, gap: t.gap, passes, sMax, capPct: settings.capPct, air: settings.air, motion, labels: { feed: settings.engraveFeed, powerPct: settings.engravePower } });
  }, [area.W, area.H, sMax, motion, settings.passes, settings.capPct, settings.air, settings.engraveFeed, settings.engravePower]);
  const all = useMemo<LaserItem[]>(() => [...items, testItem(test.job)], [items, test]);

  const index = Math.min(itemIndex, Math.max(0, all.length - 1));
  const item = all[index] ?? null;
  const laserMode = grbl.settings[32]; // undefined tant que `$$` n'est pas lu
  /** Taille de la planche du programme choisi. */
  const W = item?.job?.widthMm ?? area.W, H = item?.job?.heightMm ?? area.H;

  const imported = useMemo(() => (item?.gcode !== undefined ? parseGcode(item.gcode, { sMax, capPct: settings.capPct, motion }) : null), [item?.gcode, sMax, settings.capPct, motion]);

  const cut = useMemo<GcodeJob | null>(() => {
    if (item?.program) return item.program;
    if (imported) return imported.job;
    if (!item?.job) return null;
    return buildGcode(item.job, { feed: settings.feed, powerPct: settings.power, passes: settings.passes, passMode: settings.passMode, air: settings.air, sMax, capPct: settings.capPct, engraveFeed: settings.engraveFeed, engravePowerPct: settings.engravePower, motion });
  }, [imported, item?.program, item?.job, settings.feed, settings.power, settings.passes, settings.passMode, settings.air, settings.capPct, settings.engraveFeed, settings.engravePower, sMax, motion]);

  const program: GcodeJob | null = cut;
  // autre planche choisie : l'envoi terminé (ou arrêté) de la précédente ne doit plus s'afficher (pointillé, temps, barre) ; pendant un envoi, rien ne change
  const { dismiss } = job, runningRef = useRef(job.running), prevIndex = useRef(index);
  runningRef.current = job.running;
  useEffect(() => {
    if (prevIndex.current !== index && !runningRef.current) dismiss();
    prevIndex.current = index;
  }, [index, dismiss]);
  const progress = useJobProgress(job.view, program, grbl.status?.wpos); // où en est la tête sur le tracé et le temps qui reste, pendant un envoi

  const frame = useMemo<GcodeJob | null>(() => {
    const box = settings.frameMode === 'sheet' ? { minX: 0, minY: 0, maxX: W, maxY: H } : item?.job ? jobBox(item.job) : (imported?.job ?? item?.program)?.stats.bounds ?? null;
    return box ? buildFrame(box, settings.jogFeed) : null;
  }, [item, imported, settings.frameMode, settings.jogFeed, W, H]);

  const state = grbl.status?.state;
  /** La machine peut recevoir un programme : connectée, inactive, mode laser actif, pas d'envoi en cours. */
  const idle = grbl.connected && state === 'Idle' && !job.running;
  const canCut = idle && laserMode === 1 && grbl.settings[30] !== undefined && !!program?.lines.length;
  const canFrame = idle && !!frame;

  return {
    grbl, job, settings, setSettings, open, setOpen, items: all, itemIndex: index, setItemIndex, item, area: { W, H },
    sMax, laserMode, cut, program, progress, frame, idle, canCut, canFrame, mockLaserMode, setMockLaserMode,
    /** Messages de l'import du G-code choisi (commandes retirées, plafond appliqué…). */
    importWarnings: imported?.warnings ?? [],
  };
}

export type LaserMachine = ReturnType<typeof useLaserMachine>;

/** La planche d'essai dans la liste des planches : programme déjà construit, non retirable. */
function testItem(program: GcodeJob): LaserItem {
  return {
    label: "Essai puissance × vitesse", fileName: 'essai-puissance-vitesse', program, test: true,
    notice: "Planche d'essai : un carré par couple. Colonnes = vitesses (mm/min, écrites au-dessus), lignes = puissances (%, écrites à gauche, la plus faible en bas). Origine dans le coin bas-gauche d'une chute du même matériau. Garde le carré qui se détache proprement avec le moins de brûlure.",
  };
}
