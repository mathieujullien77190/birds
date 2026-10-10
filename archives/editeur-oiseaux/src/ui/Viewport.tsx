import { useEffect, useRef } from 'react';
import { BirdScene } from '@/engine/scene';
import { useBird } from '@/store/bird';

/** La vue 3D. Crée la scène Three.js une fois, puis lui pousse l'état du store à chaque changement. */
export default function Viewport() {
  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BirdScene | null>(null);
  const parts = useBird((s) => s.parts);
  const selectedId = useBird((s) => s.selectedId);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scene = new BirdScene(el, {
      onSelect: (id) => useBird.getState().select(id),
      onMove: (id, pos) => useBird.getState().movePart(id, pos),
      onRotate: (id, rot) => useBird.getState().rotatePart(id, rot),
      onGestureStart: () => useBird.getState().beginGesture(),
      onPoint: (id, index, local) => useBird.getState().movePoint(id, index, local),
    });
    sceneRef.current = scene;
    const st = useBird.getState();
    scene.sync(st.parts, st.selectedId);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.sync(parts, selectedId);
  }, [parts, selectedId]);

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="absolute inset-0" />
      <div className="pointer-events-none absolute right-3 bottom-3 rounded-md bg-white/70 px-3 py-1.5 text-xs text-stone-600 backdrop-blur">
        X droite · Y avant · Z haut · Clic gauche : choisir / glisser (Maj : en hauteur) · Tirer une flèche de la pièce : glisser le long de cet axe · Anneau vert : tourner la pièce (Maj : pas de 15°) · Molette : orbiter · Clic droit : déplacer la vue · Ctrl+Z / Ctrl+Y
      </div>
    </div>
  );
}
