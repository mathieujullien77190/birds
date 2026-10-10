import type { ErrorLineProps } from './types';
import './ErrorLine.css';

export function ErrorLine({ message }: ErrorLineProps) {
  if (!message) return null;
  return <div className="err">{message}</div>;
}
