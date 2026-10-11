import { Banner } from '@/ui';
import { lastReading } from './helpers';
import type { HeaderProps } from './types';

export function Header({ state, unreachable }: HeaderProps) {
  return (
    <>
      <h1>Nichoir</h1>
      <Banner message={state?.erreurs.mock} />
      <p className="muted">Dernière lecture : <span id="maj">{lastReading(state, unreachable)}</span></p>
    </>
  );
}
