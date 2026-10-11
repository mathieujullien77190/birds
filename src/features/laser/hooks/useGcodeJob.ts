import { useCallback, useEffect, useRef, useState } from 'react';
import { GcodeStreamer, RT, alarmMessage, type GcodeJob, type StreamSnapshot } from '../grbl';
import type { Grbl } from './useGrbl';

export type JobKind = 'cut' | 'test' | 'frame';

export interface JobView {
  kind: JobKind | null;
  snap: StreamSnapshot | null;
  /** Arrêt demandé par l'utilisateur. */
  stopped: boolean;
  /** Raison d'un arrêt forcé (alarme, liaison perdue). */
  failure: string | null;
  elapsed: number;
  remaining: number;
}

const EMPTY: JobView = { kind: null, snap: null, stopped: false, failure: null, elapsed: 0, remaining: 0 };

/**
 * Envoi d'un programme en flux (protocole « character counting ») avec Pause / Reprise / Arrêt. L'arrêt = pause `!` (laser éteint aussitôt),
 * réinitialisation douce 0x18 puis `M5`. Une alarme ou une liaison perdue interrompt l'envoi. Rien ne part sans appel à `start`.
 */
export function useGcodeJob(grbl: Grbl) {
  const { client, status, linkLost, alarmCode } = grbl;
  const [view, setView] = useState<JobView>(EMPTY);
  const streamer = useRef<GcodeStreamer | null>(null);
  const jobRef = useRef<GcodeJob | null>(null);
  const startedAt = useRef(0);
  const kindRef = useRef<JobKind | null>(null);
  const [, tick] = useState(0);

  const phase = view.snap?.phase;
  const running = phase === 'running' || phase === 'paused' || phase === 'draining';

  const compute = useCallback((snap: StreamSnapshot, extra: Partial<JobView> = {}) => {
    const job = jobRef.current;
    const total = job?.stats.seconds ?? 0;
    const done = snap.acked > 0 && job ? job.lineTimes[Math.min(snap.acked, job.lineTimes.length) - 1] ?? 0 : 0;
    setView((v) => ({ ...v, kind: kindRef.current, snap, remaining: Math.max(0, total - done), elapsed: (Date.now() - startedAt.current) / 1000, ...extra }));
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  /** Lance l'envoi. L'appelant a déjà obtenu la confirmation de sécurité. */
  const start = useCallback((kind: JobKind, job: GcodeJob) => {
    if (!client?.connected || streamer.current && ['running', 'paused', 'draining'].includes(streamer.current.snapshot().phase)) return;
    const s = new GcodeStreamer(client, job.lines);
    streamer.current = s; jobRef.current = job; kindRef.current = kind; startedAt.current = Date.now();
    s.onChange = (snap) => {
      compute(snap);
      if (snap.phase === 'error') void client.realtime(RT.hold); // une ligne refusée : on fige la machine (le laser s'éteint)
    };
    setView({ ...EMPTY, kind, snap: s.snapshot(), remaining: job.stats.seconds });
    s.start();
  }, [client, compute]);

  const pause = useCallback(async () => {
    const s = streamer.current;
    if (!s || !client) return;
    await client.realtime(RT.hold);
    s.pause();
  }, [client]);

  const resume = useCallback(async () => {
    const s = streamer.current;
    if (!s || !client) return;
    await client.realtime(RT.resume);
    s.resume();
  }, [client]);

  /** Arrêt : on cesse d'envoyer, puis `!` + 0x18 + `M5` (le laser s'éteint). */
  const stop = useCallback(async () => {
    const s = streamer.current;
    if (!s || !client) return;
    s.abort();
    setView((v) => ({ ...v, stopped: true, snap: s.snapshot() }));
    await client.emergencyStop();
  }, [client]);

  const dismiss = useCallback(() => { streamer.current = null; jobRef.current = null; setView(EMPTY); }, []);

  // la machine est revenue au repos : le programme est vraiment fini ; une alarme l'interrompt
  useEffect(() => {
    const s = streamer.current;
    if (!s || !status) return;
    if (status.state === 'Idle') s.machineIdle();
    if (status.state === 'Alarm' && ['running', 'paused', 'draining'].includes(s.snapshot().phase)) {
      s.abort({ text: '', message: `Alarme ${alarmCode ?? ''} : ${alarmCode ? alarmMessage(alarmCode) : 'la machine est verrouillée.'}` });
    }
  }, [status, alarmCode]);

  // liaison tombée en plein envoi : GRBL éteint le laser à la réinitialisation, mais on avertit en grand
  useEffect(() => {
    const s = streamer.current;
    if (!linkLost || !s) return;
    if (['running', 'paused', 'draining'].includes(s.snapshot().phase)) {
      s.abort();
      setView((v) => ({ ...v, failure: `Liaison perdue (${linkLost}).`, snap: s.snapshot() }));
    }
  }, [linkLost]);

  // fermer l'onglet pendant une coupe : le navigateur demande confirmation
  useEffect(() => {
    if (!running) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [running]);

  const elapsed = running ? (Date.now() - startedAt.current) / 1000 : view.elapsed;
  return { view: { ...view, elapsed }, running, start, pause, resume, stop, dismiss, job: jobRef.current };
}

export type GcodeJobApi = ReturnType<typeof useGcodeJob>;
