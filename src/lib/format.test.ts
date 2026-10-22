import { describe, expect, it } from 'vitest';
import { formatDecimal } from './format';

describe('formatDecimal', () => {
  it('komma als decimaalteken, vast aantal cijfers', () => {
    expect(formatDecimal(54.3)).toBe('54,30');
    expect(formatDecimal(167)).toBe('167,00');
    expect(formatDecimal(3.14159, 1)).toBe('3,1');
    expect(formatDecimal(null)).toBe('–');
    expect(formatDecimal(Number.NaN)).toBe('–');
  });
});
