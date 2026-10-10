import type { BannerProps } from './types';
import './Banner.css';

/** Bandeau d'avertissement en gras (ex. « MODE SIMULÉ »). */
export function Banner({ message }: BannerProps) {
  if (!message) return null;
  return <div className="banner">{message}</div>;
}
