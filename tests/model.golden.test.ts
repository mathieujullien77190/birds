import { describe, it } from 'vitest';
import { VARIANTS, buildNest, expectGolden, normalizeIds } from './helpers';

describe('makeNest : scène complète (golden)', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    it(name, () => { expectGolden(`nest-${name}`, normalizeIds(buildNest(over))); });
  }
});
