import type { DeviceErrors } from '@/types';

export interface CameraCardProps {
  title: string;
  num: 1 | 2;
  cameraOn: boolean;
  ledOn: boolean;
  errors?: DeviceErrors;
  onCamera: (on: boolean) => void;
  onLed: (on: boolean) => void;
}
