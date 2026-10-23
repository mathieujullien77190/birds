import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Btn, Chip, Hint, Notice, Slider } from '../../ui';
import { usePersistentState } from '../../hooks/usePersistentState';
import { CAMERA_KEY, CORNER_NAMES, DEFAULT_CALIBRATION, parseCalibration, type CameraCalibration } from './calibration';
import { createFlatRenderer } from './flatView';
import { squareToQuad, type Mat3 } from './homography';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const FLAT_WIDTH = 800;

/** Message lisible pour une erreur `getUserMedia`. */
function cameraProblem(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError') return "Accès à la caméra refusé : autorise-la dans la barre d'adresse du navigateur.";
  if (name === 'NotFoundError') return 'Aucune caméra trouvée. Branche le câble USB-A de la caméra de la machine.';
  if (name === 'NotReadableError') return 'La caméra est utilisée par un autre programme (Sculpfun Space, LightBurn, autre onglet).';
  return `Caméra indisponible : ${e instanceof Error ? e.message : String(e)}`;
}

/**
 * Image de la caméra intégrée de la machine (reconnue comme une webcam USB), redressée : correction de l'objectif (distorsion radiale) puis perspective
 * (vue de dessus) à partir des 4 coins d'un rectangle de taille connue. Affichage seul : rien n'est envoyé à la machine, et la vue n'est pas assez précise pour positionner une coupe.
 */
export function Webcam() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [on, setOn] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [noGl, setNoGl] = useState(false);
  const [cal, setCal] = usePersistentState<CameraCalibration>(CAMERA_KEY, parseCalibration);
  const calRef = useRef(cal);
  useEffect(() => { calRef.current = cal; }, [cal]);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setOn(false);
  }, []);

  const start = useCallback(async (id: string) => {
    stop();
    if (!navigator.mediaDevices?.getUserMedia) { setProblem("Ce navigateur n'a pas accès aux caméras (page en HTTPS ou localhost requise)."); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId: { exact: id } } : true, audio: false });
      stream.current = s;
      if (video.current) video.current.srcObject = s;
      setProblem(null); setOn(true);
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'));
      setDeviceId(s.getVideoTracks()[0]?.getSettings().deviceId ?? id);
    } catch (e) { setProblem(cameraProblem(e)); }
  }, [stop]);

  useEffect(() => stop, [stop]); // la caméra s'éteint quand le bloc se replie ou se ferme

  // dessin : une image par rafraîchissement d'écran tant que la caméra est allumée
  useEffect(() => {
    const v = video.current, c = canvas.current;
    if (!on || !v || !c) return;
    const r = createFlatRenderer(c);
    if (!r) { setNoGl(true); return; }
    setNoGl(false);
    let raf = 0;
    const tick = () => {
      const cur = calRef.current;
      if (v.videoWidth) {
        const aspect = v.videoWidth / v.videoHeight;
        const w = cur.flat ? FLAT_WIDTH : Math.min(v.videoWidth, 960);
        const h = Math.round(cur.flat ? (FLAT_WIDTH * cur.refH) / cur.refW : w / aspect);
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        r.draw(v, { h: cur.flat ? squareToQuad(cur.corners) : IDENTITY, k1: cur.k1, aspect });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); r.dispose(); };
  }, [on]);

  const moveCorner = (i: number, e: PointerEvent<HTMLButtonElement>) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)), y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setCal((c) => ({ ...c, corners: c.corners.map((p, k) => (k === i ? [x, y] : p)) as CameraCalibration['corners'] }));
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        {on ? <Btn block={false} onClick={stop}>Arrêter la caméra</Btn> : <Btn block={false} variant="primary" onClick={() => void start(deviceId)}>Afficher la caméra</Btn>}
        {devices.length > 1 && (
          <select aria-label="Caméra" value={deviceId} onChange={(e) => void start(e.target.value)} className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-xs">
            {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Caméra ${i + 1}`}</option>)}
          </select>
        )}
      </div>
      {problem && <Notice kind="error">{problem}</Notice>}
      {noGl && <Notice kind="warn">WebGL indisponible : l'image brute est affichée, sans redressement.</Notice>}
      <video ref={video} autoPlay playsInline muted className={noGl && on ? 'w-full rounded-md bg-stone-900' : 'pointer-events-none absolute h-px w-px opacity-0'} />
      <div ref={box} className={`relative ${on && !noGl ? '' : 'hidden'}`}>
        <canvas ref={canvas} className="block w-full rounded-md bg-stone-900" />
        {cal.flat && cal.grid && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${cal.refW} ${cal.refH}`} preserveAspectRatio="none" aria-hidden>
            {Array.from({ length: Math.floor((cal.refW - 1) / 50) }, (_, i) => <line key={`x${i}`} x1={(i + 1) * 50} x2={(i + 1) * 50} y1={0} y2={cal.refH} stroke="rgba(255,255,255,0.4)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
            {Array.from({ length: Math.floor((cal.refH - 1) / 50) }, (_, i) => <line key={`y${i}`} y1={(i + 1) * 50} y2={(i + 1) * 50} x1={0} x2={cal.refW} stroke="rgba(255,255,255,0.4)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          </svg>
        )}
        {!cal.flat && cal.corners.map((p, i) => (
          <button
            key={CORNER_NAMES[i]} type="button" title={`Coin ${CORNER_NAMES[i]} du rectangle de référence`} aria-label={`Coin ${CORNER_NAMES[i]}`}
            onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={(e) => moveCorner(i, e)}
            style={{ left: `${p[0] * 100}%`, top: `${p[1] * 100}%`, touchAction: 'none' }}
            className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 border-amber-400 bg-amber-400/30 text-[10px] font-bold text-white active:cursor-grabbing"
          >{i + 1}</button>
        ))}
      </div>
      {on && !noGl && (cal.flat ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={cal.grid} onClick={() => setCal({ ...cal, grid: !cal.grid })}>Grille de 50 mm</Chip>
          <Btn block={false} onClick={() => setCal({ ...cal, flat: false })}>Régler</Btn>
        </div>
      ) : (
        <div className="space-y-2">
          <Slider label="Correction de l'objectif" value={cal.k1} min={-0.6} max={0.6} step={0.01} onChange={(k1) => setCal({ ...cal, k1 })} />
          <Slider label="Largeur du rectangle de référence" value={cal.refW} min={50} max={600} step={1} unit=" mm" onChange={(refW) => setCal({ ...cal, refW })} />
          <Slider label="Hauteur du rectangle de référence" value={cal.refH} min={50} max={600} step={1} unit=" mm" onChange={(refH) => setCal({ ...cal, refH })} />
          <div className="flex items-center gap-1.5">
            <Btn block={false} variant="primary" onClick={() => setCal({ ...cal, flat: true })}>Vue plate</Btn>
            <Btn block={false} variant="ghost" onClick={() => setCal({ ...DEFAULT_CALIBRATION })}>Réinitialiser</Btn>
          </div>
        </div>
      ))}
      <Hint>
        {cal.flat
          ? 'Vue de dessus redressée du rectangle de référence. Si les lignes droites ne le sont pas, « Régler ».'
          : `Pose un rectangle de taille connue (la planche, ou le plateau) et tire les 4 coins numérotés dessus : ${CORNER_NAMES.map((n, i) => `${i + 1} ${n}`).join(', ')} (de la machine). Règle « Correction de l'objectif » jusqu'à ce que les lignes droites le soient, saisis la taille du rectangle, puis « Vue plate ».`}
        {' '}La caméra de la E1 Pro se branche au PC par son propre câble USB-A (port « Camera ») ; ferme Sculpfun Space et LightBurn avant. Précision indicative (le constructeur annonce 0,5 à 1 mm après calibration) : pour regarder, pas pour positionner une coupe.
      </Hint>
    </div>
  );
}
