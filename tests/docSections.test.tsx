// @vitest-environment jsdom
// Sommaire des documents : découpage en sections `##`, section affichée, bornes, mémoire, « Tout afficher », clavier, liens internes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_SECTIONS, hasToc, isTypingTarget, parseSavedSections, resolveSection, sectionForHash, slugify, splitSections, stepSection } from '@/features/docs/DocModal/helpers';
import { useDocSections } from '@/features/docs/DocModal/useDocSections';
import { DocModal } from '@/features/docs/DocModal';
import { STORAGE } from '@/features/viewer/constants';

vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), run: vi.fn(() => Promise.resolve()) } }));

const MD = ['# Titre', '', 'Chapeau.', '', '## Un', 'a', '```sh', '## pas un titre', '```', '### sous-titre', '', '## Deux (2026)', 'b', '', '## Un', 'c', '', '## Quatre', 'd', '', '## Cinq', 'e [vers](#quatre) et [rien](#absent)'].join('\n');
const doc = { id: 'x', title: 'Doc de test', md: MD };

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('découpage en sections', () => {
  it('chapeau = introduction, `##` hors bloc de code, `###` gardé dans sa section, identifiants uniques', () => {
    const s = splitSections(MD);
    expect(s.map((x) => x.id)).toEqual(['introduction', 'un', 'deux-2026', 'un-2', 'quatre', 'cinq']);
    expect(s[0]).toMatchObject({ title: 'Introduction', intro: true });
    expect(s[0].md).toContain('Chapeau.');
    expect(s[1].md).toContain('## pas un titre');
    expect(s[1].md).toContain('### sous-titre');
    expect(s.slice(1).every((x) => x.md.startsWith('## ') && !x.intro)).toBe(true);
    expect(s.map((x) => x.md).join('\n')).toBe(MD); // rien n'est perdu
    expect(hasToc(s)).toBe(true);
  });
  it('sans chapeau, pas d\'introduction ; titre nettoyé ; peu de sections = pas de sommaire ; ~~~ et CRLF', () => {
    const s = splitSections('## `Code` **gras**\r\ntexte\r\n~~~\r\n## non\r\n~~~\r\n## B');
    expect(s.map((x) => x.title)).toEqual(['Code gras', 'B']);
    expect(s[0].md).toContain('## non');
    expect(hasToc(s)).toBe(false);
    expect(splitSections('')).toEqual([]);
    expect(splitSections('# T\n\n## A', 'Vue d\'ensemble')[0].title).toBe('Vue d\'ensemble');
    expect(splitSections('```\n~~~\n## x\n```\n## y').map((x) => x.title)).toEqual(['Introduction', 'y']); // un ~~~ dans un bloc ``` ne le ferme pas
  });
  it('slugify, resolveSection, stepSection, sectionForHash', () => {
    expect(slugify('Prix (ordre de grandeur, 2026)')).toBe('prix-ordre-de-grandeur-2026');
    expect(slugify('???')).toBe('section');
    const s = splitSections(MD);
    expect(resolveSection(s, ALL_SECTIONS)).toBe(ALL_SECTIONS);
    expect(resolveSection(s, 'quatre')).toBe('quatre');
    expect(resolveSection(s, 'disparue')).toBe('introduction');
    expect(resolveSection(s, undefined)).toBe('introduction');
    expect(resolveSection([], undefined)).toBe(ALL_SECTIONS);
    expect(stepSection(s, 'introduction', -1)).toBeNull();
    expect(stepSection(s, 'cinq', 1)).toBeNull();
    expect(stepSection(s, 'un', 1)).toBe('deux-2026');
    expect(stepSection(s, 'inconnue', 1)).toBeNull();
    expect(sectionForHash(s, '#quatre')).toBe('quatre');
    expect(sectionForHash(s, '#Deux%20(2026)')).toBe('deux-2026');
    expect(sectionForHash(s, '#%E0%')).toBeNull(); // pourcentage invalide : pas d'exception
    expect(sectionForHash(s, '#absent')).toBeNull();
  });
  it('isTypingTarget et parseSavedSections', () => {
    const div = document.createElement('div'), input = document.createElement('input'), ce = document.createElement('div');
    ce.setAttribute('contenteditable', 'true');
    expect([div, input, document.createElement('textarea'), document.createElement('select'), ce].map(isTypingTarget)).toEqual([false, true, true, true, true]);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
    expect(parseSavedSections(null)).toEqual({});
    expect(parseSavedSections('pas du json')).toEqual({});
    expect(parseSavedSections('[1]')).toEqual({});
    expect(parseSavedSections('null')).toEqual({});
    expect(parseSavedSections('{"a":"b","c":3}')).toEqual({ a: 'b' });
  });
});

describe('useDocSections', () => {
  it('une section à la fois, mémorisée par document dans plaques-doc-section, tout afficher', () => {
    expect(STORAGE.docSection).toBe('plaques-doc-section');
    const { result, rerender } = renderHook(() => useDocSections(doc));
    expect(result.current.toc).toBe(true);
    expect(result.current.current).toBe('introduction');
    expect(result.current.prev).toBeNull();
    expect(result.current.next).toBe('un');
    act(() => result.current.select('quatre'));
    expect(result.current.md).toContain('## Quatre');
    expect(result.current.md).not.toContain('## Cinq');
    expect(JSON.parse(localStorage.getItem('plaques-doc-section')!)).toEqual({ x: 'quatre' });
    act(() => result.current.select(ALL_SECTIONS));
    expect(result.current.md).toBe(MD);
    expect(result.current.prev).toBeNull();
    expect(result.current.next).toBeNull();
    act(() => result.current.select('cinq'));
    rerender();
    expect(renderHook(() => useDocSections(doc)).result.current.current).toBe('cinq'); // relu au montage
  });
  it('document court ou code : pas de sommaire, document entier, aucune touche capturée', () => {
    const short = { id: 's', title: 'Court', md: '# T\n\n## A\n\nx\n\n## B\n\ny' };
    const { result } = renderHook(() => useDocSections(short));
    expect(result.current.toc).toBe(false);
    expect(result.current.current).toBe(ALL_SECTIONS);
    expect(result.current.md).toBe(short.md);
    expect(result.current.sections.length).toBe(3);
    expect(renderHook(() => useDocSections({ id: 'code', title: 'Code', md: '' })).result.current.sections).toEqual([]);
    const spy = vi.fn();
    window.addEventListener('keydown', spy);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(spy).toHaveBeenCalled();
    expect(result.current.current).toBe(ALL_SECTIONS);
    window.removeEventListener('keydown', spy);
  });
  it('clavier : ← → changent de section, bornes ignorées, champ de saisie et modificateurs ignorés, autres touches ignorées', () => {
    const { result } = renderHook(() => useDocSections(doc));
    const key = (k: string, init: KeyboardEventInit = {}, target: Element | Window = window) => act(() => { fireEvent.keyDown(target, { key: k, ...init }); });
    key('ArrowLeft'); expect(result.current.current).toBe('introduction'); // borne basse
    key('ArrowRight'); expect(result.current.current).toBe('un');
    key('ArrowRight', { ctrlKey: true }); key('ArrowRight', { shiftKey: true }); key('ArrowRight', { altKey: true }); key('ArrowRight', { metaKey: true });
    expect(result.current.current).toBe('un');
    key('a'); expect(result.current.current).toBe('un');
    const input = document.createElement('input'); document.body.appendChild(input);
    key('ArrowRight', {}, input); expect(result.current.current).toBe('un');
    input.remove();
    key('ArrowRight'); key('ArrowRight'); key('ArrowRight'); key('ArrowRight');
    expect(result.current.current).toBe('cinq');
    key('ArrowRight'); expect(result.current.current).toBe('cinq'); // borne haute
    key('ArrowLeft'); expect(result.current.current).toBe('quatre');
    act(() => result.current.select(ALL_SECTIONS));
    key('ArrowLeft'); expect(result.current.current).toBe(ALL_SECTIONS); // « tout afficher » : pas de navigation
  });
  it('liens internes : section visée affichée, ancre inconnue sans effet, clic hors lien ignoré', () => {
    const { result } = renderHook(() => useDocSections(doc));
    const click = (html: string, sel = 'a') => { const root = document.createElement('div'); root.innerHTML = html; const el = root.querySelector(sel)!; const e = { target: el, preventDefault: vi.fn() }; act(() => result.current.onLinkClick(e as never)); return e; };
    expect(click('<a href="#quatre">x</a>').preventDefault).toHaveBeenCalled();
    expect(result.current.current).toBe('quatre');
    click('<a href="#absent">x</a>'); expect(result.current.current).toBe('quatre');
    const e = click('<p>texte</p>', 'p'); expect(e.preventDefault).not.toHaveBeenCalled();
    const short = renderHook(() => useDocSections({ id: 's', title: 'C', md: '# T\n\n## A\n\nx' })).result;
    const root = document.createElement('div'); root.innerHTML = '<a href="#a">x</a>';
    act(() => short.current.onLinkClick({ target: root.firstChild, preventDefault: vi.fn() } as never));
    expect(short.current.current).toBe(ALL_SECTIONS);
    act(() => short.current.onLinkClick({ target: {}, preventDefault: vi.fn() } as never)); // cible sans closest : ignorée
  });
});

describe('fenêtre des documents', () => {
  it('sommaire en haut, une section affichée, précédente / suivante, tout afficher', () => {
    render(<DocModal doc={doc} onClose={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Sommaire' });
    expect(nav.querySelectorAll('button').length).toBe(7); // 6 sections + « Tout afficher »
    expect(screen.getByRole('heading', { name: 'Titre' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Quatre' })).toBeNull();
    expect((screen.getByText('◀ précédente') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('suivante ▶'));
    expect(screen.getByRole('heading', { name: 'Un', level: 2 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cinq' }));
    expect((screen.getByText('suivante ▶') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('◀ précédente'));
    expect(screen.getByRole('heading', { name: 'Quatre' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tout afficher' }));
    expect(screen.getByRole('heading', { name: 'Cinq' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Titre' })).toBeTruthy();
    expect(screen.queryByText('suivante ▶')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tout afficher' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('un lien vers une section cachée l\'ouvre ; les boutons font au moins 44 px (min-h-11) sur téléphone', () => {
    render(<DocModal doc={doc} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cinq' }));
    fireEvent.click(screen.getByText('vers'));
    expect(screen.getByRole('heading', { name: 'Quatre' })).toBeTruthy();
    for (const b of [...screen.getByRole('navigation', { name: 'Sommaire' }).querySelectorAll('button'), screen.getByText('suivante ▶')]) expect(b.className).toContain('min-h-11');
    expect(screen.getByRole('navigation', { name: 'Sommaire' }).className).toContain('overflow-x-auto');
  });
  it('document réel « Dossier du nichoir » : sommaire, schéma dans « Schéma général », prix interactifs dans « Prix »', async () => {
    const md = readFileSync(join(__dirname, '..', 'docs', 'schema-electronique.md'), 'utf8');
    const secs = splitSections(md);
    expect(secs.filter((s) => !s.intro).length).toBeGreaterThanOrEqual(10);
    const mermaidIn = secs.filter((s) => s.md.includes('```mermaid'));
    expect(mermaidIn.map((s) => s.title)).toEqual(['Schéma général', expect.stringMatching(/^Prix/)]); // le schéma, et le camembert des prix
    const prix = secs.find((s) => s.title.startsWith('Prix'))!;
    expect(prix.md).toContain('| Groupe | Désignation | Quantité | Prix |');
    localStorage.setItem('plaques-doc-section', JSON.stringify({ schema: prix.id }));
    const { DOCS } = await import('@/features/docs/DocModal/constants');
    const { container } = render(<DocModal doc={DOCS[0]} onClose={() => {}} />);
    expect(container.ownerDocument.querySelector('.doc-price-total')).not.toBeNull(); // enhancePrices a tourné sur la section affichée
    expect(container.ownerDocument.querySelector('pre.mermaid')!.textContent).toContain('pie'); // la section « Prix » n'a que le camembert, pas le schéma
    fireEvent.click(screen.getByRole('button', { name: 'Schéma général' }));
    expect(container.ownerDocument.querySelector('pre.mermaid')!.textContent).not.toContain('pie');
    fireEvent.click(screen.getByRole('button', { name: 'Logiciel (Pi, page web)' }));
    expect(screen.getByRole('navigation', { name: 'Sommaire' })).toBeTruthy(); // les autres documents ont aussi leur sommaire
    fireEvent.click(screen.getByRole('button', { name: 'Code' }));
    expect(screen.queryByRole('navigation', { name: 'Sommaire' })).toBeNull();
  });
});
