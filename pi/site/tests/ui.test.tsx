import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Banner, Card, ErrorLine, Gauge, Stat, ToggleButton } from '@/ui';

const fill = (c: HTMLElement) => c.querySelector('.gauge-fill') as HTMLElement;

describe('Gauge', () => {
  it('remplit selon le ratio, avec la couleur et la hauteur par défaut (12)', () => {
    const { container } = render(<Gauge ratio={0.25} color="rgb(1, 2, 3)" />);
    expect(fill(container).style.width).toBe('25%');
    expect(fill(container).style.background).toBe('rgb(1, 2, 3)');
    expect((container.querySelector('.gauge') as HTMLElement).style.height).toBe('12px');
  });
  it('prend la hauteur demandée', () => {
    const { container } = render(<Gauge ratio={0.5} color="red" height={8} />);
    expect((container.querySelector('.gauge') as HTMLElement).style.height).toBe('8px');
  });
  it.each([[-3, '0%'], [0, '0%'], [1, '100%'], [4, '100%']])('borne le ratio %s à %s', (ratio, w) => {
    const { container } = render(<Gauge ratio={ratio} color="red" />);
    expect(fill(container).style.width).toBe(w);
  });
});

describe('Stat', () => {
  it('affiche valeur, unité et id', () => {
    const { container } = render(<Stat id="t" value="24.5" unit="°C" />);
    expect(container.querySelector('span#t')?.textContent).toBe('24.5');
    expect(container.querySelector('small')?.textContent).toBe('°C');
  });
  it("fonctionne sans id", () => {
    const { container } = render(<Stat value="3" unit="W" />);
    expect(container.querySelector('span')?.hasAttribute('id')).toBe(false);
    expect(container.textContent).toBe('3 W');
  });
});

describe('Card', () => {
  it('titre et contenu, classe « card » seule par défaut', () => {
    const { container } = render(<Card title="Nid"><p>contenu</p></Card>);
    expect(screen.getByRole('heading', { name: 'Nid' })).toBeTruthy();
    expect(screen.getByText('contenu')).toBeTruthy();
    expect((container.firstChild as HTMLElement).className).toBe('card');
  });
  it('ajoute la classe demandée', () => {
    const { container } = render(<Card title="T" className="wide">x</Card>);
    expect((container.firstChild as HTMLElement).className).toBe('card wide');
  });
});

describe('ErrorLine et Banner', () => {
  it('ErrorLine affiche le message dans .err', () => {
    const { container } = render(<ErrorLine message="capteur muet" />);
    expect(container.querySelector('.err')?.textContent).toBe('capteur muet');
  });
  it.each([undefined, ''])('ErrorLine ne rend rien pour %j', (m) => {
    const { container } = render(<ErrorLine message={m} />);
    expect(container.innerHTML).toBe('');
  });
  it('Banner affiche le message dans .banner', () => {
    const { container } = render(<Banner message="MODE SIMULÉ" />);
    expect(container.querySelector('.banner')?.textContent).toBe('MODE SIMULÉ');
  });
  it.each([undefined, ''])('Banner ne rend rien pour %j', (m) => {
    const { container } = render(<Banner message={m} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('ToggleButton', () => {
  it('actif : classe « on », id, libellé, et le clic appelle onClick', () => {
    const onClick = vi.fn();
    render(<ToggleButton id="b" on onClick={onClick}>Allumer</ToggleButton>);
    const b = screen.getByRole('button', { name: 'Allumer' });
    expect(b.id).toBe('b');
    expect(b.className).toBe('on');
    fireEvent.click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('inactif : pas de classe', () => {
    render(<ToggleButton on={false} onClick={() => {}}>Éteindre</ToggleButton>);
    expect(screen.getByRole('button').hasAttribute('class')).toBe(false);
  });
});
