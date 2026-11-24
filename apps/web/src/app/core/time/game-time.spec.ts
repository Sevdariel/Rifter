import { describe, expect, it } from 'vitest';

import { formatGameTime } from './game-time';

describe('formatGameTime', () => {
  it('formats sub-hour times as m:ss', () => {
    expect(formatGameTime(0)).toBe('0:00');
    expect(formatGameTime(59_999)).toBe('0:59');
    expect(formatGameTime(600_000)).toBe('10:00');
    expect(formatGameTime(1_234_567)).toBe('20:34');
  });

  it('formats hour-plus times as h:mm:ss', () => {
    expect(formatGameTime(3_600_000)).toBe('1:00:00');
    expect(formatGameTime(3_661_000)).toBe('1:01:01');
  });
});
