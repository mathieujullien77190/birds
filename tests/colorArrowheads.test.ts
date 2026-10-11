// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { colorArrowheads } from '@/lib';

const NS = 'http://www.w3.org/2000/svg';
const build = () => {
  const host = document.createElement('div');
  host.innerHTML = `<svg xmlns="${NS}"><defs><marker id="m-end"><path d="M0 0"/></marker><marker id="m-start"><path d="M0 0"/></marker></defs>
    <path class="flowchart-link" id="a" marker-end="url(#m-end)" style="stroke:rgb(220, 38, 38)"/>
    <path class="flowchart-link" id="b" marker-start="url(#m-start)" marker-end="url(#m-end)" style="stroke:rgb(37, 99, 235)"/>
    <path class="flowchart-link" id="c" marker-end="url(#m-end)" style="stroke:rgb(220, 38, 38)"/></svg>`;
  return host;
};

describe('colorArrowheads', () => {
  it('donne à chaque flèche une pointe de la couleur de son trait, partagée entre traits de même couleur', () => {
    const host = build();
    colorArrowheads(host);
    const ref = (id: string, a: string) => host.querySelector(`#${id}`)!.getAttribute(a)!;
    expect(ref('a', 'marker-end')).toBe(ref('c', 'marker-end'));
    expect(ref('a', 'marker-end')).not.toBe(ref('b', 'marker-end'));
    expect(ref('a', 'marker-end')).not.toBe('url(#m-end)');
    const fill = (u: string) => host.querySelector<SVGElement>(`[id="${/#(.+)\)/.exec(u)![1]}"] path`)!.style.fill;
    expect(fill(ref('a', 'marker-end'))).toBe('rgb(220, 38, 38)');
    expect(fill(ref('b', 'marker-end'))).toBe('rgb(37, 99, 235)');
    expect(fill(ref('b', 'marker-start'))).toBe('rgb(37, 99, 235)');
  });
  it('sans svg, ou avec une pointe introuvable : ne plante pas', () => {
    expect(() => colorArrowheads(document.createElement('div'))).not.toThrow();
    const host = document.createElement('div');
    host.innerHTML = `<svg xmlns="${NS}"><path class="flowchart-link" marker-end="url(#absent)" style="stroke:red"/></svg>`;
    expect(() => colorArrowheads(host)).not.toThrow();
  });
});

describe('colorArrowheads : cas limites', () => {
  it('accepte un <svg> directement, ignore les traits sans couleur, les flèches sans pointe et les pointes sans id', () => {
    const host = document.createElement('div');
    host.innerHTML = `<svg xmlns="${NS}"><defs><marker id="m"><path d="M0 0"/></marker></defs>
      <path class="flowchart-link" id="nocolor" marker-end="url(#m)"/>
      <path class="flowchart-link" id="empty" marker-end="url(#m)"/>
      <path class="flowchart-link" id="nomarker" style="stroke:rgb(1, 2, 3)"/>
      <path class="flowchart-link" id="badref" marker-end="none" style="stroke:rgb(1, 2, 3)"/>
      <path class="flowchart-link" id="ok" marker-end="url(#m)" style="stroke:rgb(1, 2, 3)"/></svg>`;
    const real = window.getComputedStyle.bind(window);
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
      if (el.id === 'nocolor') return { stroke: 'none' } as CSSStyleDeclaration;
      if (el.id === 'empty') return { stroke: '' } as CSSStyleDeclaration;
      return real(el);
    });
    colorArrowheads(host.querySelector('svg') as SVGSVGElement);
    spy.mockRestore();
    expect(host.querySelector('#nocolor')!.getAttribute('marker-end')).toBe('url(#m)');
    expect(host.querySelector('#empty')!.getAttribute('marker-end')).toBe('url(#m)');
    expect(host.querySelector('#nomarker')!.getAttribute('marker-end')).toBeNull();
    expect(host.querySelector('#badref')!.getAttribute('marker-end')).toBe('none');
    expect(host.querySelector('#ok')!.getAttribute('marker-end')).not.toBe('url(#m)');
  });
});
