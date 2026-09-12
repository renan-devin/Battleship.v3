import { describe, expect, it } from 'vitest';

import {
  DIFFICULTIES,
  chooseTarget,
  getAvailableTargets,
  getTargetCandidates,
  getUnresolvedHits,
} from '../src/ai/index.js';
import { BOARD_SIZE } from '../src/engine/constants.js';
import { fireAt } from '../src/engine/combat.js';
import { placeShipsRandomly } from '../src/engine/placement.js';

const CRUISER_ON_COLUMN_A = [{ shipId: 'cruiser', row: 7, column: 0, orientation: 'vertical' }];

const DESTROYER_ON_ROW_5 = [{ shipId: 'destroyer', row: 4, column: 4, orientation: 'horizontal' }];

function fireAll(placements, targets) {
  return targets.reduce((shots, target) => fireAt(placements, shots, target).shots, []);
}

function mulberry32(seed) {
  let state = seed;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe('DIFFICULTIES', () => {
  it('lists the planned difficulties', () => {
    expect(DIFFICULTIES).toEqual(['easy', 'hard']);
  });
});

describe('getAvailableTargets', () => {
  it('starts with the whole board', () => {
    expect(getAvailableTargets([])).toHaveLength(BOARD_SIZE * BOARD_SIZE);
  });

  it('drops cells already fired at', () => {
    const shots = fireAt([], [], { row: 4, column: 7 }).shots;
    const targets = getAvailableTargets(shots);

    expect(targets).toHaveLength(BOARD_SIZE * BOARD_SIZE - 1);
    expect(targets).not.toContainEqual({ row: 4, column: 7 });
  });
});

describe('chooseTarget', () => {
  it('picks a cell from the untouched ones', () => {
    expect(chooseTarget([], () => 0)).toEqual({ row: 0, column: 0 });
    expect(chooseTarget([], () => 0.999)).toEqual({ row: 9, column: 9 });
  });

  it('never repeats a shot until the board is exhausted', () => {
    let shots = [];

    for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
      const target = chooseTarget(shots);

      expect(target).not.toBeNull();
      shots = fireAt([], shots, target).shots;
      expect(shots).toHaveLength(index + 1);
    }

    expect(chooseTarget(shots)).toBeNull();
  });
});

describe('getUnresolvedHits', () => {
  it('ignores misses and ships already sunk', () => {
    const shots = fireAll(DESTROYER_ON_ROW_5, [
      { row: 0, column: 0 },
      { row: 4, column: 4 },
    ]);

    expect(getUnresolvedHits(shots)).toEqual([{ row: 4, column: 4, shipId: 'destroyer' }]);

    const sunk = fireAt(DESTROYER_ON_ROW_5, shots, { row: 4, column: 5 }).shots;

    expect(getUnresolvedHits(sunk)).toEqual([]);
  });
});

describe('getTargetCandidates', () => {
  it('is empty while nothing is damaged', () => {
    const shots = fireAll(DESTROYER_ON_ROW_5, [{ row: 0, column: 0 }]);

    expect(getTargetCandidates(shots)).toEqual([]);
  });

  it('offers the orthogonal neighbours of a lone hit', () => {
    const shots = fireAll(CRUISER_ON_COLUMN_A, [{ row: 8, column: 0 }]);

    expect(getTargetCandidates(shots)).toEqual([
      { row: 9, column: 0 },
      { row: 7, column: 0 },
      { row: 8, column: 1 },
    ]);
  });

  it('prefers the gap between two aligned hits', () => {
    const shots = fireAll(CRUISER_ON_COLUMN_A, [
      { row: 7, column: 0 },
      { row: 9, column: 0 },
    ]);

    expect(getTargetCandidates(shots)).toEqual([{ row: 8, column: 0 }]);
  });

  it('does not read a gap between two different damaged ships', () => {
    const placements = [
      { shipId: 'destroyer', row: 6, column: 0, orientation: 'vertical' },
      { shipId: 'cruiser', row: 9, column: 0, orientation: 'horizontal' },
    ];
    const shots = fireAll(placements, [
      { row: 6, column: 0 },
      { row: 9, column: 0 },
    ]);
    // The cells between the two contacts stay plain neighbours: without the
    // per-ship match they would outrank the neighbours of both hits.
    expect(getTargetCandidates(shots)).toEqual([
      { row: 7, column: 0 },
      { row: 5, column: 0 },
      { row: 6, column: 1 },
      { row: 8, column: 0 },
      { row: 9, column: 1 },
    ]);
  });

  it('follows the ends of an inferred line', () => {
    const placements = [{ shipId: 'carrier', row: 2, column: 3, orientation: 'horizontal' }];
    const shots = fireAll(placements, [
      { row: 2, column: 4 },
      { row: 2, column: 5 },
    ]);

    expect(getTargetCandidates(shots)).toEqual([
      { row: 2, column: 3 },
      { row: 2, column: 6 },
    ]);
  });
});

describe('chooseTarget on hard', () => {
  const hard = (shots, random = () => 0) => chooseTarget(shots, random, 'hard');

  it('fires at the gap between A8 and A10 before anything unrelated', () => {
    const shots = fireAll(CRUISER_ON_COLUMN_A, [
      { row: 7, column: 0 },
      { row: 9, column: 0 },
    ]);

    for (const random of [() => 0, () => 0.5, () => 0.999]) {
      expect(hard(shots, random)).toEqual({ row: 8, column: 0 });
    }
  });

  it('stays on a damaged ship instead of hunting', () => {
    const shots = fireAll(CRUISER_ON_COLUMN_A, [{ row: 8, column: 0 }]);

    for (const random of [() => 0, () => 0.5, () => 0.999]) {
      const target = hard(shots, random);

      expect(getTargetCandidates(shots)).toContainEqual(target);
    }
  });

  it('goes back to hunting once the ship is sunk', () => {
    const shots = fireAll(DESTROYER_ON_ROW_5, [
      { row: 4, column: 4 },
      { row: 4, column: 5 },
    ]);

    expect(getTargetCandidates(shots)).toEqual([]);
    expect(hard(shots)).toEqual({ row: 0, column: 0 });
  });

  it('sinks a whole fleet without repeating or leaving the board', () => {
    const placements = placeShipsRandomly(mulberry32(7));
    let shots = [];

    for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
      const target = hard(shots, mulberry32(index + 1));

      expect(target).not.toBeNull();
      expect(target.row).toBeGreaterThanOrEqual(0);
      expect(target.row).toBeLessThan(BOARD_SIZE);
      expect(target.column).toBeGreaterThanOrEqual(0);
      expect(target.column).toBeLessThan(BOARD_SIZE);

      const outcome = fireAt(placements, shots, target);

      expect(outcome.result).not.toBe('repeat');
      expect(outcome.result).not.toBe('invalid');
      shots = outcome.shots;

      if (outcome.fleetDestroyed) {
        break;
      }
    }

    expect(shots.filter((shot) => shot.hit)).toHaveLength(17);
  });
});
