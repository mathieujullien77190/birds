import { useCallback, useEffect, useMemo, type MouseEvent } from 'react';
import { usePersistentState } from '@/hooks';
import { STORAGE } from '@/features/viewer/constants';
import { ALL_SECTIONS, hasToc, isTypingTarget, parseSavedSections, resolveSection, sectionForHash, splitSections, stepSection } from './helpers';
import type { DocDef } from './types';

/**
 * Sommaire d'un document : sections `##`, section affichée (mémorisée par document dans `plaques-doc-section`), précédente / suivante,
 * flèches ← → du clavier (sauf dans un champ de saisie), liens internes `#ancre`. Sans sommaire (code, document court), le document est affiché en entier.
 */
export function useDocSections(doc: DocDef) {
  const sections = useMemo(() => (doc.id === 'code' ? [] : splitSections(doc.md)), [doc]);
  const toc = hasToc(sections);
  const [saved, setSaved] = usePersistentState<Record<string, string>>(STORAGE.docSection, parseSavedSections);
  const current = toc ? resolveSection(sections, saved[doc.id]) : ALL_SECTIONS;
  const select = useCallback((id: string) => setSaved((s) => ({ ...s, [doc.id]: id })), [doc.id, setSaved]);
  const prev = current === ALL_SECTIONS ? null : stepSection(sections, current, -1);
  const next = current === ALL_SECTIONS ? null : stepSection(sections, current, 1);
  const md = !toc || current === ALL_SECTIONS ? doc.md : sections.find((s) => s.id === current)!.md;
  useEffect(() => {
    if (!toc) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isTypingTarget(e.target)) return;
      const to = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : null;
      if (to) { e.preventDefault(); select(to); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toc, prev, next, select]);
  /** Clic dans le texte : un lien `#ancre` vers une section l'affiche (même cachée), sans quitter la page. */
  const onLinkClick = useCallback((e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const id = toc ? sectionForHash(sections, a.getAttribute('href')!) : null;
    if (id) select(id);
  }, [toc, sections, select]);
  return { sections, toc, current, md, prev, next, select, onLinkClick };
}
