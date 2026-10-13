import type { Plank } from '../../../model';
import type { PartGeometry } from '../geometry';
import { conduitGeometry, ribbonGeometry, wireGeometry } from '../wire';
import { barGeometry } from './bar';
import { blockGeometry } from './blockBox';
import { shapedBlockGeometry } from './blockShaped';
import { cameraBoardGeometry } from './camera';
import { caseGeometry } from './case';
import { driverGeometry } from './driver';
import { relayGeometry } from './relay';
import { fanGeometry } from './fan';
import { guardGeometry } from './guard';
import { irBoardGeometry } from './ir';
import { piGeometry } from './pi';
import { pinGeometry } from './pin';
import { sensorGeometry } from './sensor';
import { solarGeometry } from './solar';

type Special = NonNullable<Plank['special']>;
type PartFactory = (p: Plank, t: number) => PartGeometry;

/**
 * Une fabrique par type de pièce `special` (tout ce qui n'est pas une plaque de bois). Pour ajouter une pièce :
 * un fichier dans ce dossier, une ligne ici. `alu` (plaque d'aluminium) et `doc` (document, jamais dessiné) n'y sont pas : `alu` suit le chemin des plaques.
 */
const FACTORIES: Partial<Record<Special, PartFactory>> = {
  case: caseGeometry,
  solar: solarGeometry,
  fan: fanGeometry,
  guard: guardGeometry,
  driver: driverGeometry,
  relay: relayGeometry,
  sensor: sensorGeometry,
  block: (p, t) => (p.holes.length || p.poly ? shapedBlockGeometry(p, t) : blockGeometry(p, t)), // percé ou à contour libre : plaque épaisse ; sinon boîte pleine
  cable: ribbonGeometry,
  conduit: conduitGeometry,
  wire: wireGeometry,
  pi: piGeometry,
  bar: barGeometry,
  pin: pinGeometry,
  ir: irBoardGeometry,
  camera: cameraBoardGeometry,
};

/** Géométrie (surface colorée + arêtes) d'une pièce spéciale ; une pièce inconnue est dessinée comme une carte caméra (comme avant). */
export function partGeometry(p: Plank, t = 3): PartGeometry {
  const make = (p.special && FACTORIES[p.special]) || cameraBoardGeometry;
  return make(p, t);
}
