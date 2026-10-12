import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import { App } from '@/components';
import { makeState, point } from './fixtures';

vi.mock('@/api');
const m = vi.mocked(api);

beforeEach(() => {
  m.getState.mockReset().mockResolvedValue(makeState({ erreurs: { mock: 'MODE SIMULÉ' } }));
  m.getHistory.mockReset().mockResolvedValue([point('10:00', 20, 15), point('10:05', 21, 16)]);
  for (const f of [m.setFan, m.setAuto, m.setLed, m.setCamera]) f.mockReset().mockResolvedValue(makeState({ cam2: true, led_nid: true, led_ext: true }));
});

describe('App', () => {
  it('assemble toutes les cartes avec l\'état chargé', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#t_nid')?.textContent).toBe('24.5'));
    expect(container.querySelector('.banner')?.textContent).toBe('MODE SIMULÉ');
    expect(container.querySelector('#maj')?.textContent).toBe('12:34:56');
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Nid', 'Dehors (sonde)', 'Ventilateur', 'Batterie', 'Consommation', 'Températures (24 h)', 'Caméra 1 (nid)', 'Caméra 2 (entrée)',
    ]);
    await waitFor(() => expect(container.querySelector('svg#histo')).not.toBeNull());
    expect(container.querySelector('#batt_pct')?.textContent).toBe('80');
    expect(container.querySelector('#conso_w')?.textContent).toBe('10');
    expect(container.querySelector('#c_1')?.className).toBe('on');
    expect(container.querySelector('#c_2')?.hasAttribute('class')).toBe(false);
  });

  it('programme injoignable : indiqué dans l\'en-tête', async () => {
    m.getState.mockRejectedValue(new Error('down'));
    m.getHistory.mockRejectedValue(new Error('down'));
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#maj')?.textContent).toBe('programme injoignable'));
    expect(container.querySelector('#histo_vide')).not.toBeNull();
  });

  it('les clics des caméras et des LED appellent l\'API avec les bons numéros', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#t_nid')?.textContent).toBe('24.5'));
    fireEvent.click(container.querySelector('#c_1')!);      // allumée -> éteindre
    expect(m.setCamera).toHaveBeenLastCalledWith(0, false);
    fireEvent.click(container.querySelector('#c_2')!);      // éteinte -> allumer
    expect(m.setCamera).toHaveBeenLastCalledWith(1, true);
    fireEvent.click(container.querySelector('#l_nid')!);
    expect(m.setLed).toHaveBeenLastCalledWith('nid', true);
    fireEvent.click(container.querySelector('#l_ext')!);
    expect(m.setLed).toHaveBeenLastCalledWith('ext', true);
    // la réponse de la commande met l'état à jour : caméra 2 et LED allumées
    await waitFor(() => expect(container.querySelector('#c_2')?.className).toBe('on'));
    expect(container.querySelector('#l_nid')?.className).toBe('on');
    expect(container.querySelector('#l_ext')?.className).toBe('on');
  });

  it('les commandes du ventilateur et de l\'automatique appellent l\'API', async () => {
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('#t_nid')?.textContent).toBe('24.5'));
    fireEvent.click(container.querySelector('#v_marche')!);
    expect(m.setFan).toHaveBeenLastCalledWith(60);
    fireEvent.click(container.querySelector('#v_arret')!);
    expect(m.setFan).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByText('Ventilation automatique'));
    expect(m.setAuto).toHaveBeenLastCalledWith({ actif: true });
    await waitFor(() => expect(m.setAuto).toHaveBeenCalledTimes(1));
  });

  it('avant la première réponse : tirets partout', () => {
    m.getState.mockReturnValue(new Promise(() => {}));
    m.getHistory.mockReturnValue(new Promise(() => {}));
    const { container } = render(<App />);
    expect(container.querySelector('#t_nid')?.textContent).toBe('—');
    expect(container.querySelector('#maj')?.textContent).toBe('—');
    expect(container.querySelector('#v_auto')).toBeNull();
  });
});
