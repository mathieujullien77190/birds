import { useCallback, useEffect, useRef, useState } from 'react';
import { GrblClient, MockTransport, RT, WebSerialTransport, jogLine, type GrblResponse, type GrblStatus, type LogEntry } from '../grbl';

export type Connection = 'disconnected' | 'connecting' | 'connected';
export type LinkKind = 'serial' | 'mock';

const LOG_MAX = 600;

/** Vitesse de la machine simulée par rapport au réel (pour que l'essai ne dure pas des minutes). */
export const MOCK_SPEEDUP = 10;

/**
 * Connexion à la laser (port USB ou machine simulée) : état en direct (statut, réglages `$$`, alarme, liaison perdue), journal des échanges
 * et commandes manuelles. Aucune commande de mouvement ou de puissance n'est envoyée sans appel explicite.
 */
export function useGrbl() {
  const [client, setClient] = useState<GrblClient | null>(null);
  const clientRef = useRef<GrblClient | null>(null);
  const mockRef = useRef<MockTransport | null>(null);
  const [conn, setConn] = useState<Connection>('disconnected');
  const [kind, setKind] = useState<LinkKind | null>(null);
  const [status, setStatus] = useState<GrblStatus | null>(null);
  const [settings, setSettings] = useState<Record<number, number>>({});
  const [alarmCode, setAlarmCode] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null); // échec d'une connexion ou d'une commande
  const [linkLost, setLinkLost] = useState<string | null>(null); // liaison tombée sans qu'on l'ait demandé
  const [log, setLog] = useState<LogEntry[]>([]);
  const logBuf = useRef<LogEntry[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushLog = useCallback((e: LogEntry) => {
    logBuf.current.push(e);
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      const add = logBuf.current;
      logBuf.current = [];
      setLog((l) => [...l, ...add].slice(-LOG_MAX));
    }, 200);
  }, []);

  /** Ouvre la liaison. Pour `serial`, à appeler directement depuis un clic (le navigateur l'exige pour choisir le port). */
  const connect = useCallback(async (k: LinkKind, mockOpt?: { laserMode?: boolean }) => {
    if (clientRef.current?.connected) return;
    setProblem(null); setLinkLost(null); setAlarmCode(null); setStatus(null); setSettings({}); setLog([]);
    logBuf.current = [];
    const transport = k === 'mock' ? new MockTransport({ speedup: MOCK_SPEEDUP, laserMode: mockOpt?.laserMode ?? true }) : new WebSerialTransport();
    mockRef.current = k === 'mock' ? (transport as MockTransport) : null;
    const c = new GrblClient(transport);
    c.onLog.on(pushLog);
    c.onStatus.on((s) => { setStatus(s); if (s.state !== 'Alarm') setAlarmCode(null); });
    c.onSettings.on((s) => setSettings(s));
    c.onAlarm.on((code) => setAlarmCode(code));
    c.onClosed.on(({ unexpected, reason }) => {
      setConn('disconnected');
      if (unexpected) setLinkLost(reason ?? 'liaison coupée');
    });
    clientRef.current = c;
    setClient(c); setKind(k); setConn('connecting');
    try {
      await c.connect();
      setConn('connected');
    } catch (e) {
      setConn('disconnected'); setClient(null); clientRef.current = null; setKind(null);
      const name = e instanceof DOMException ? e.name : '';
      setProblem(name === 'NotFoundError' ? 'Aucun port choisi.' : name === 'InvalidStateError' || name === 'NetworkError' ? "Le port n'a pas pu être ouvert : il est peut-être utilisé par un autre programme (LaserGRBL, LightBurn, autre onglet)." : `Connexion impossible : ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [pushLog]);

  const disconnect = useCallback(async () => { await clientRef.current?.disconnect(); }, []);
  useEffect(() => () => { void clientRef.current?.disconnect(); if (flushTimer.current) clearTimeout(flushTimer.current); }, []);

  /** Envoie une ligne et mémorise le message d'erreur éventuel. */
  const command = useCallback(async (line: string): Promise<GrblResponse> => {
    const c = clientRef.current;
    if (!c?.connected) return { ok: false, code: null, message: 'Machine non connectée.' };
    setProblem(null);
    const r = await c.send(line);
    if (!r.ok) setProblem(`${line} : ${r.message}`);
    return r;
  }, []);

  const jog = useCallback((dx: number, dy: number, feed: number) => command(jogLine(dx, dy, feed)), [command]);
  const jogCancel = useCallback(() => clientRef.current?.realtime(RT.jogCancel), []);
  /** « Origine ici » : le point où se trouve la tête devient X0 Y0 (G54, gardé par la machine). */
  const setOrigin = useCallback(() => command('G10 L20 P1 X0 Y0'), [command]);
  const goOrigin = useCallback((feed: number) => command(`$J=G90 G21 X0 Y0 F${feed}`), [command]);
  const unlock = useCallback(() => command('$X'), [command]);
  const softReset = useCallback(async () => { await clientRef.current?.realtime(RT.reset); }, []);
  const readSettings = useCallback(() => command('$$'), [command]);
  /** Active le mode laser ($32=1) : à appeler seulement après confirmation. */
  const enableLaserMode = useCallback(async () => { const r = await command('$32=1'); if (r.ok) await command('$$'); return r; }, [command]);

  return {
    client, conn, kind, status, settings, alarmCode, problem, linkLost, log, mock: mockRef,
    connected: conn === 'connected',
    clearLog: () => { logBuf.current = []; setLog([]); },
    clearProblem: () => setProblem(null),
    connect, disconnect, command, jog, jogCancel, setOrigin, goOrigin, unlock, softReset, readSettings, enableLaserMode,
  };
}

export type Grbl = ReturnType<typeof useGrbl>;
