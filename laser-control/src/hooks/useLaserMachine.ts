import { useMemo, useState } from 'react';
import { MACHINE_SETTINGS_KEY } from '../constants';
import { MACHINE_AREA, buildFrame, buildTestCard, spread, type GcodeJob, type TestCardResult } from '../grbl';
import { parseMachineSettings } from '../helpers';
import { buildGcode, jobBox, parseGcode, type LaserItem } from '../job';
import { useGcodeJob } from './useGcodeJob';
import { useGrbl } from './useGrbl';
import { usePersistentState } from './usePersistentState';

/** Programme à envoyer : la planche (ou le fichier) choisie ou la planche d'essai. */
export type Target = 'sheet' | 'test';

/** Taille de la planche (mm) quand aucun programme n'est choisi. */
export interface Area { W: number; H: number }

/**
 * Pilotage de la laser : connexion GRBL, envoi en flux, réglages de coupe (gardés), programme de l'élément choisi ou planche d'essai.
 * `items` = les programmes proposés (planches à couper, G-code importé) ; `area` = taille de planche par défaut (planche d'essai, cadre).
 * Vit au niveau de l'écran pour que la connexion et un envoi en cours survivent à la fermeture de la fenêtre « Pilotage ».
 */
export function useLaserMachine(items: LaserItem[], area: Area = { W: MACHINE_AREA.W, H: MACHINE_AREA.H }) {
  const grbl = useGrbl();
  const job = useGcodeJob(grbl);
  const [settings, setSettings] = usePersistentState(MACHINE_SETTINGS_KEY, parseMachineSettings);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target>('sheet');
  const [itemIndex, setItemIndex] = useState(0);
  const [mockLaserMode, setMockLaserMode] = useState(true);

  const index = Math.min(itemIndex, Math.max(0, items.length - 1));
  const item = items[index] ?? null;
  const sMax = grbl.settings[30] ?? 1000;
  const laserMode = grbl.settings[32]; // undefined tant que `$$` n'est pas lu
  /** Taille de la planche du programme choisi. */
  const W = item?.job?.widthMm ?? area.W, H = item?.job?.heightMm ?? area.H;

  const imported = useMemo(() => (item?.gcode !== undefined ? parseGcode(item.gcode, { sMax, capPct: settings.capPct }) : null), [item?.gcode, sMax, settings.capPct]);

  const cut = useMemo<GcodeJob | null>(() => {
    if (imported) return imported.job;
    if (!item?.job) return null;
    return buildGcode(item.job, { feed: settings.feed, powerPct: settings.power, passes: settings.passes, passMode: settings.passMode, air: settings.air, sMax, capPct: settings.capPct, engraveFeed: settings.engraveFeed, engravePowerPct: settings.engravePower });
  }, [imported, item?.job, settings.feed, settings.power, settings.passes, settings.passMode, settings.air, settings.capPct, settings.engraveFeed, settings.engravePower, sMax]);

  const test = useMemo<TestCardResult>(() => {
    const t = settings.test;
    return buildTestCard({ W, H, speeds: spread(t.speedMin, t.speedMax, t.speedCount), powers: spread(t.powerMin, t.powerMax, t.powerCount), size: t.size, gap: 5, passes: t.passes, sMax, capPct: settings.capPct, air: settings.air });
  }, [settings.test, settings.capPct, settings.air, W, H, sMax]);

  const program: GcodeJob | null = target === 'test' ? test.job : cut;

  const frame = useMemo<GcodeJob | null>(() => {
    const box = settings.frameMode === 'sheet' ? { minX: 0, minY: 0, maxX: W, maxY: H } : item?.job ? jobBox(item.job) : imported?.job.stats.bounds ?? null;
    return box ? buildFrame(box, settings.jogFeed) : null;
  }, [item, imported, settings.frameMode, settings.jogFeed, W, H]);

  const state = grbl.status?.state;
  /** La machine peut recevoir un programme : connectée, inactive, mode laser actif, pas d'envoi en cours. */
  const idle = grbl.connected && state === 'Idle' && !job.running;
  const canCut = idle && laserMode === 1 && grbl.settings[30] !== undefined && !!program?.lines.length;
  const canFrame = idle && !!frame;

  return {
    grbl, job, settings, setSettings, open, setOpen, target, setTarget, items, itemIndex: index, setItemIndex, item, area: { W, H },
    sMax, laserMode, cut, test, program, frame, idle, canCut, canFrame, mockLaserMode, setMockLaserMode,
    /** Messages de l'import du G-code choisi (commandes retirées, plafond appliqué…). */
    importWarnings: imported?.warnings ?? [],
  };
}

export type LaserMachine = ReturnType<typeof useLaserMachine>;
