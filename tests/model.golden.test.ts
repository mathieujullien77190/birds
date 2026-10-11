import { describe, it } from 'vitest';
import { VARIANTS, buildNestFull, expectGolden, normalizeIds } from './helpers';

describe('makeNest : scène complète (golden)', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    it(name, () => { expectGolden(`nest-${name}`, normalizeIds(buildNestFull(over))); });
  }
});
