import type { DeviceErrors } from '@/types';

/** Erreur de la caméra `num` (1 ou 2) ; celle de picamera2 prime, comme dans l'ancienne page. */
export const cameraError = (errors: DeviceErrors | undefined, num: 1 | 2): string | undefined =>
  errors?.picamera2 ?? errors?.[num === 1 ? 'camera1' : 'camera2'];
