import { describe, expect, it } from 'vitest';

import { BOARD_SIZE, FLEET } from '../src/engine/index.js';
import { DIFFICULTIES } from '../src/ai/index.js';
import { createInitialState } from '../src/state/index.js';

describe('project smoke test', () => {
  it('exposes a 10x10 board size', () => {
    expect(BOARD_SIZE).toBe(10);
  });

  it('exposes the classic five ship fleet', () => {
    expect(FLEET.map((ship) => ship.size)).toEqual([5, 4, 3, 3, 2]);
  });

  it('exposes the planned difficulties', () => {
    expect(DIFFICULTIES).toEqual(['easy', 'hard']);
  });

  it('starts in the placement phase on easy', () => {
    expect(createInitialState()).toMatchObject({ phase: 'placement', difficulty: 'easy' });
  });
});
