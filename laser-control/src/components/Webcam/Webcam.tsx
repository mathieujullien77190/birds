import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn, Hint, Notice } from '../../ui';

/** Message lisible pour une erreur `getUserMedia`. */
function cameraProblem(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError') return "Accès à la caméra refusé : autorise-la dans la barre d'adresse du navigateur.";
  if (name === 'NotFoundError') return 'Aucune caméra trouvée. Branche le câble USB-A de la caméra de la machine.';
  if (name === 'NotReadableError') return "La caméra est utilisée par un autre programme (Sculpfun Space, LightBurn, autre onglet).";
  return `Caméra indisponible : ${e instanceof Error ? e.message : String(e)}`;
}

/** Image de la caméra intégrée de la machine (reconnue comme une webcam USB) : pour voir la planche et le cadre à vide sans ouvrir le couvercle. Affichage seul, rien n'est envoyé à la machine. */
export function Webcam() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [on, setOn] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

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
      <video ref={video} autoPlay playsInline muted className={`w-full rounded-md bg-stone-900 ${on ? '' : 'hidden'}`} />
      <Hint>La caméra de la E1 Pro se branche au PC par son propre câble USB-A (port « Camera »). Elle n'est pas calibrée ici : l'image sert à regarder, pas à positionner. Ferme Sculpfun Space et LightBurn avant.</Hint>
    </div>
  );
}
