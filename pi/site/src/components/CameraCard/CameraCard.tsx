import { Card, ErrorLine, ToggleButton } from '@/ui';
import { cameraError } from './helpers';
import type { CameraCardProps } from './types';
import './CameraCard.css';

export function CameraCard({ title, num, cameraOn, ledOn, errors, onCamera, onLed }: CameraCardProps) {
  return (
    <Card title={title}>
      <div className="row">
        <ToggleButton id={`c_${num}`} on={cameraOn} onClick={() => onCamera(!cameraOn)}>Caméra {num}</ToggleButton>
        <ToggleButton id={num === 1 ? 'l_nid' : 'l_ext'} on={ledOn} onClick={() => onLed(!ledOn)}>LED infrarouges</ToggleButton>
      </div>
      {/* src constant : le simulateur de l'app remplace l'image par img.src sans que React la réécrive */}
      <img className="cam" src={`/video/${num}`} alt={`caméra ${num}`} style={{ visibility: cameraOn ? 'visible' : 'hidden' }} />
      <ErrorLine message={cameraError(errors, num)} />
    </Card>
  );
}
