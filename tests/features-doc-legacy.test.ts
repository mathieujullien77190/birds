// @vitest-environment jsdom
// renderDoc avec l'ancienne signature du moteur Markdown (code(texte, langue) en chaînes) : `marked` est doublé, le renderer enveloppé par renderDoc est appelé à la main.
import { describe, expect, it, vi } from 'vitest';

type Fn = (...a: unknown[]) => string;
vi.mock('marked', () => {
  class Renderer {
    code(a: unknown, b?: string): string { return `<pre data-orig="${String(b)}">${typeof a === 'string' ? a : '?'}</pre>`; }
    table(...a: unknown[]): string { return `<table>${a.join('')}</table>`; }
    link(...a: unknown[]): string { return `<a href="${String(a[0])}">${String(a[2])}</a>`; }
  }
  /** `parse` appelle les méthodes du renderer dans l'ancienne signature et rend leur sortie. */
  const parse = (md: string, o: { renderer: { code: Fn; table: Fn; link: Fn } }) => {
    const [kind, ...rest] = md.split('|');
    if (kind === 'code') return o.renderer.code(rest[0], rest[1] || undefined);
    if (kind === 'table') return o.renderer.table(rest[0]);
    return o.renderer.link('http://x', '', rest[0]);
  };
  return { marked: { Renderer, parse } };
});

import { renderDoc } from '@/features/docs/DocModal/helpers';

describe('renderDoc : signature à chaînes (texte, langue)', () => {
  it('un bloc mermaid est gardé tel quel pour mermaid, avec & et < échappés', () => {
    expect(renderDoc('code|A & B <C>|mermaid')).toBe('<pre class="mermaid">A &amp; B &lt;C></pre>');
  });
  it('une langue connue est colorée par highlight.js, avec sa classe', () => {
    const html = renderDoc('code|x = 1|python');
    expect(html).toContain('<code class="hljs language-python">');
    expect(html).toContain('hljs-');
  });
  it('une langue inconnue ou absente retombe sur le rendu par défaut du moteur', () => {
    expect(renderDoc('code|a|klingon')).toBe('<pre data-orig="klingon">a</pre>');
    expect(renderDoc('code|a')).toBe('<pre data-orig="undefined">a</pre>');
  });
  it("les tableaux sont dans un cadre défilant et les liens s'ouvrent dans un nouvel onglet sécurisé", () => {
    expect(renderDoc('table|<tr></tr>')).toBe('<div class="tw"><table><tr></tr></table></div>');
    expect(renderDoc('link|texte')).toBe('<a target="_blank" rel="noopener noreferrer" href="http://x">texte</a>');
  });
});
