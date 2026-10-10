import type { ToggleButtonProps } from './types';
import './ToggleButton.css';

export function ToggleButton({ id, on, onClick, children }: ToggleButtonProps) {
  return <button id={id} className={on ? 'on' : undefined} onClick={onClick}>{children}</button>;
}
