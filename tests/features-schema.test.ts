// Schéma : cas limites de buildSchema (liaisons sans couleur, zone sans « end », classes) et repli quand le document n'a pas de bloc mermaid.
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.doUnmock('../docs/schema-electronique.md?raw'); vi.doUnmock('@/features/schema/SchemaPanel/constants'); vi.resetModules(); });

describe('constants : source du schéma', () => {
  it('un document sans bloc mermaid : MERMAID_SRC retombe sur un schéma « introuvable » et SECTIONS reste vide', async () => {
    vi.resetModules();
    vi.doMock('../docs/schema-electronique.md?raw', () => ({ default: '# Titre\n\nrien ici\n' }));
    const c = await import('@/features/schema/SchemaPanel/constants');
    expect(c.MERMAID_SRC).toBe('flowchart TB\n  X["schéma introuvable"]');
    expect(c.SECTIONS).toEqual([]);
  });
  it('un document complet : bloc mermaid lu (rogné) et sections découpées par « ### »', async () => {
    vi.resetModules();
    vi.doMock('../docs/schema-electronique.md?raw', () => ({ default: 'x\n```mermaid\nflowchart TB\n  A[a]\n```\n## Paramètres à respecter\n### Un\ncorps\n### Deux\nautre\n' }));
    const c = await import('@/features/schema/SchemaPanel/constants');
    expect(c.MERMAID_SRC).toBe('flowchart TB\n  A[a]');
    expect(c.SECTIONS).toEqual([{ title: 'Un', md: '### Un\ncorps' }, { title: 'Deux', md: '### Deux\nautre' }]);
  });
});

describe('buildSchema : cas limites', () => {
  const SRC = [
    'flowchart TB',
    '  subgraph Z[Zone]',
    '    CAM2["cam"]',
    '  end',
    '  A[a]',
    '  A --> B',
    '  A --> CAM2',
    '  A -->|x| IR2',
    '  C --- D',
    '  class A,CAM2 foo',
    '  class CAM2 bar',
    '  linkStyle 0 stroke:#f00,stroke-width:2px',
    '  linkStyle 1 stroke-width:2px',
    '  subgraph Dernier',
  ].join('\n');

  async function load() {
    vi.resetModules();
    const real = await vi.importActual<typeof import('@/features/schema/SchemaPanel/constants')>('@/features/schema/SchemaPanel/constants');
    vi.doMock('@/features/schema/SchemaPanel/constants', () => ({ ...real, MERMAID_SRC: SRC }));
    return import('@/features/schema/SchemaPanel/helpers');
  }

  it('sans option absente le schéma est rendu tel quel', async () => {
    const { buildSchema } = await load();
    expect(buildSchema({ cam2: true, solar: true })).toBe(SRC);
  });
  it('retire blocs, flèches (avec étiquette), classes et zones vides de la 2ᵉ caméra, et refait les couleurs des traits', async () => {
    const { buildSchema } = await load();
    expect(buildSchema({ cam2: false, solar: true }).split('\n')).toEqual([
      'flowchart TB',
      '  A[a]',
      '  A --> B',
      '  C --- D',
      '  class A foo', // CAM2 retiré de la liste ; la ligne « class CAM2 bar » disparaît
      '  subgraph Dernier', // une zone sans « end » derrière elle est gardée
      '  linkStyle 0 stroke:#f00,stroke-width:2.5px', // la couleur suit sa flèche
      '  linkStyle 1 stroke:#444,stroke-width:2.5px', // flèche sans linkStyle : gris par défaut
    ]);
  });
});
