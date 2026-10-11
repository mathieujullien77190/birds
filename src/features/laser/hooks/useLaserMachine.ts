import { useMemo, useState } from 'react';
import { usePersistentState } from '@/hooks';
import { MACHINE_SETTINGS_KEY } from '../constants';
import { buildFrame, buildGcode, buildTestCard, sheetBox, spread, type GcodeJob, type TestCardResult } from '../grbl';
import { parseMachineSettings } from '../helpers';
import type { CutCfg, Sheets } from '../types';
import { useGcodeJob } from './useGcodeJob';
import { useGrbl } from './useGrbl';

/** Programme à envoyer : la planche choisie ou la planche d'essai. */
export type Target = 'sheet' | 'test';

/**
 * Pilotage de la laser : connexion GRBL, envoi en flux, réglages de coupe (gardés), programme de la planche choisie ou planche d'essai.
 * Vit au niveau de l'écran pour que la connexion et un envoi en cours survivent à la fermeture de la fenêtre « Pilotage ».
 */
export function useLaserMachine(sheets: Sheets, cutCfg: CutCfg) {
  const grbl = useGrbl();
  const job = useGcodeJob(grbl);
  const [settings, setSettings] = usePersistentState(MACHINE_SETTINGS_KEY, parseMachineSettings);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target>('sheet');
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mockLaserMode, setMockLaserMode] = useState(true);

  const index = Math.min(sheetIndex, Math.max(0, sheets.length - 1));
  const sheet = sheets[index] ?? null;
  const sMax = grbl.settings[30] ?? 1000;
  const laserMode = grbl.settings[32]; // undefined tant que `$$` n'est pas lu

  const cut = useMemo<GcodeJob | null>(() => sheet ? buildGcode(sheet, { W: cutCfg.W, H: cutCfg.H, feed: settings.feed, powerPct: settings.power, passes: settings.passes, passMode: settings.passMode, sMax, capPct: settings.capPct }) : null, [sheet, cutCfg.W, cutCfg.H, settings.feed, settings.power, settings.passes, settings.passMode, settings.capPct, sMax]);

  const test = useMemo<TestCardResult>(() => {
    const t = settings.test;
    return buildTestCard({ W: cutCfg.W, H: cutCfg.H, speeds: spread(t.speedMin, t.speedMax, t.speedCount), powers: spread(t.powerMin, t.powerMax, t.powerCount), size: t.size, gap: 5, passes: t.passes, sMax, capPct: settings.capPct });
  }, [settings.test, settings.capPct, cutCfg.W, cutCfg.H, sMax]);

  const program: GcodeJob | null = target === 'test' ? test.job : cut;

  const frame = useMemo<GcodeJob | null>(() => {
    const box = settings.frameMode === 'sheet' ? { minX: 0, minY: 0, maxX: cutCfg.W, maxY: cutCfg.H } : sheet ? sheetBox(sheet, cutCfg.H) : null;
    return box ? buildFrame(box, settings.jogFeed) : null;
  }, [sheet, settings.frameMode, settings.jogFeed, cutCfg.W, cutCfg.H]);

  const state = grbl.status?.state;
  /** La machine peut recevoir un programme : connectée, inactive, mode laser actif, pas d'envoi en cours. */
  const idle = grbl.connected && state === 'Idle' && !job.running;
  const canCut = idle && laserMode === 1 && grbl.settings[30] !== undefined && !!program?.lines.length;
  const canFrame = idle && !!frame;

  return {
    grbl, job, settings, setSettings, open, setOpen, target, setTarget, sheetIndex: index, setSheetIndex, sheets, cutCfg,
    sheet, sMax, laserMode, cut, test, program, frame, idle, canCut, canFrame, mockLaserMode, setMockLaserMode,
  };
}

export type LaserMachine = ReturnType<typeof useLaserMachine>;
