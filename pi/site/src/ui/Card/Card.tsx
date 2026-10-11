import type { CardProps } from './types';
import './Card.css';

export function Card({ title, className, children }: CardProps) {
  return (
    <div className={className ? `card ${className}` : 'card'}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
