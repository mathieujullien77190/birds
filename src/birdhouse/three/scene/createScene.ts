import { AmbientLight, Color, DirectionalLight, Group, MOUSE, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AMBIENCE, SUN_POSITION, VIEW } from '../constants';
import { CameraShooter } from '../cameraShooter';
import { clearGroup, disposeObject3D } from '../dispose';
import { disposeAll } from '../registry/materials';
import type { View } from '../types';
import { spinRotors } from '../fanSpin';
import { startRenderLoop } from './renderLoop';

/** La vue 3D créée, et de quoi la défaire. */
export interface SceneHandle {
  view: View;
  /** Arrête la boucle et libère tout : meshes, repères, matériaux et textures partagés, contrôles, renderer. À appeler une fois, à la fermeture. */
  dispose(): void;
}

/**
 * Crée la scène Three.js dans `host` : scène (ambiance du jour), caméra (vue de départ en 3/4), lumières, renderer, contrôles orbite,
 * groupes de repères, redimensionnement automatique et boucle de rendu (démarrée tout de suite).
 * Les interactions (clic, survol, glissés) ne sont PAS ici : voir `three/interactions/`.
 */
export function createScene(host: HTMLElement): SceneHandle {
  const scene = new Scene();
  scene.background = new Color(AMBIENCE.day.background);
  const ambient = new AmbientLight(AMBIENCE.day.ambient, AMBIENCE.day.ambientI);
  scene.add(ambient);
  const sun = new DirectionalLight(AMBIENCE.day.sun, AMBIENCE.day.sunI);
  sun.position.set(...SUN_POSITION);
  scene.add(sun);
  const camera = new PerspectiveCamera(VIEW.fov, 1, VIEW.near, VIEW.far);
  camera.up.set(0, 0, 1); // Z = hauteur, comme la visionneuse STL
  camera.position.set(...VIEW.position);
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, VIEW.maxPixelRatio));
  host.appendChild(renderer.domElement);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.ROTATE, RIGHT: MOUSE.PAN };
  orbit.target.set(...VIEW.target);
  orbit.enableDamping = true;
  const labels = new Group();
  scene.add(labels);
  const holeMark = new Group(); // le trou en cours de réglage, en pointillés ambre sur les deux faces de la plaque
  renderer.localClippingEnabled = true;
  const cutMark = new Group(); // le plan de coupe (carré bleu transparent), qu'on glisse le long de son axe
  scene.add(cutMark);
  const pullMark = new Group(); // la face double-cliquée, en pointillés bleus : on la tire ou on la pousse
  scene.add(holeMark, pullMark);
  const shooter = new CameraShooter(scene, renderer, [labels, holeMark, pullMark, cutMark]);
  const view: View = { ambient, sun, scene, camera, renderer, orbit, meshes: new Map(), labels, holeMark, pullMark, cutMark, shooter, dragging: false, fan: { pct: 0, angle: 0 } };

  const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  let last = performance.now();
  const stopLoop = startRenderLoop(() => { const now = performance.now(), dt = (now - last) / 1000; last = now; spinRotors(view, dt); orbit.update(); renderer.render(scene, camera); }); // ne rend rien tant que la page est cachée

  const dispose = () => {
    stopLoop();
    ro.disconnect();
    orbit.dispose();
    view.shooter.dispose();
    for (const m of view.meshes.values()) { scene.remove(m); disposeObject3D(m); }
    view.meshes.clear();
    for (const g of [labels, holeMark, pullMark, cutMark]) clearGroup(g);
    scene.clear();
    disposeAll(); // matériaux et textures partagés (après les objets qui s'en servent)
    renderer.dispose();
    renderer.domElement.remove();
  };
  return { view, dispose };
}
