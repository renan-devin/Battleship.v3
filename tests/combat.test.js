import { describe, expect, it } from 'vitest';

import { ORIENTATIONS } from '../src/engine/constants.js';
import {
  fireAt,
  getFleetStatus,
  getShipHitCount,
  getSunkShipIds,
  hasBeenShot,
  isFleetDestroyed,
  isShipSunk,
} from '../src/engine/combat.js';

const destroyer = { shipId: 'destroyer', row: 0, column: 0, orientation: ORIENTATIONS.horizontal };
const cruiser = { shipId: 'cruiser', row: 5, column: 5, orientation: ORIENTATIONS.vertical };
const placements = [destroyer, cruiser];

function fireAll(targets) {
  return targets.reduce((shots, target) => fireAt(placements, shots, target).shots, []);
}

describe('fireAt', () => {
  it('reports a miss on empty water', () => {
    const outcome = fireAt(placements, [], { row: 9, column: 9 });

    expect(outcome.result).toBe('miss');
    expect(outcome.shipId).toBeNull();
    expect(outcome.sunkShipId).toBeNull();
    expect(outcome.shots).toEqual([{ row: 9, column: 9, hit: false, shipId: null }]);
  });

  it('reports a hit and names the ship', () => {
    const outcome = fireAt(placements, [], { row: 0, column: 0 });

    expect(outcome.result).toBe('hit');
    expect(outcome.shipId).toBe('destroyer');
    expect(outcome.sunkShipId).toBeNull();
  });

  it('reports the ship as sunk on its last cell', () => {
    const shots = fireAll([{ row: 0, column: 0 }]);
    const outcome = fireAt(placements, shots, { row: 0, column: 1 });

    expect(outcome.sunkShipId).toBe('destroyer');
    expect(outcome.fleetDestroyed).toBe(false);
  });

  it('reports the fleet as destroyed on the very last cell', () => {
    const shots = fireAll([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 5, column: 5 },
      { row: 6, column: 5 },
    ]);
    const outcome = fireAt(placements, shots, { row: 7, column: 5 });

    expect(outcome.sunkShipId).toBe('cruiser');
    expect(outcome.fleetDestroyed).toBe(true);
  });

  it('ignores a repeated shot without changing the history', () => {
    const shots = fireAll([{ row: 9, column: 9 }]);
    const outcome = fireAt(placements, shots, { row: 9, column: 9 });

    expect(outcome.result).toBe('repeat');
    expect(outcome.shots).toBe(shots);
  });

  it('rejects targets outside the board instead of crashing', () => {
    for (const target of [
      { row: -1, column: 0 },
      { row: 0, column: 10 },
      { row: 1.5, column: 0 },
    ]) {
      const outcome = fireAt(placements, [], target);

      expect(outcome.result).toBe('invalid');
      expect(outcome.shots).toEqual([]);
    }
  });

  it('does not mutate the shots it receives', () => {
    const shots = [];
    fireAt(placements, shots, { row: 0, column: 0 });

    expect(shots).toHaveLength(0);
  });
});

describe('shot history helpers', () => {
  it('knows which cells were already fired at', () => {
    const shots = fireAll([{ row: 3, column: 3 }]);

    expect(hasBeenShot(shots, { row: 3, column: 3 })).toBe(true);
    expect(hasBeenShot(shots, { row: 3, column: 4 })).toBe(false);
  });

  it('counts hits per ship', () => {
    const shots = fireAll([
      { row: 5, column: 5 },
      { row: 9, column: 0 },
    ]);

    expect(getShipHitCount(placements, shots, 'cruiser')).toBe(1);
    expect(getShipHitCount(placements, shots, 'destroyer')).toBe(0);
    expect(getShipHitCount(placements, shots, 'carrier')).toBe(0);
  });

  it('tracks sunk ships and fleet destruction', () => {
    const shots = fireAll([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
    ]);

    expect(isShipSunk(placements, shots, 'destroyer')).toBe(true);
    expect(isShipSunk(placements, shots, 'cruiser')).toBe(false);
    expect(getSunkShipIds(placements, shots)).toEqual(['destroyer']);
    expect(isFleetDestroyed(placements, shots)).toBe(false);
  });

  it('does not consider an empty fleet destroyed', () => {
    expect(isFleetDestroyed([], [])).toBe(false);
  });
});

describe('getFleetStatus', () => {
  it('reports an untouched fleet as fully afloat', () => {
    expect(getFleetStatus(placements, [])).toEqual({
      total: 2,
      afloat: 2,
      sunk: 0,
      damaged: 0,
    });
  });

  it('separates damaged ships from sunk ones', () => {
    const shots = fireAll([
      { row: 0, column: 0 },
      { row: 0, column: 1 },
      { row: 5, column: 5 },
    ]);

    expect(getFleetStatus(placements, shots)).toEqual({
      total: 2,
      afloat: 1,
      sunk: 1,
      damaged: 1,
    });
  });

  it('reports an empty fleet without ships afloat', () => {
    expect(getFleetStatus([], [])).toEqual({ total: 0, afloat: 0, sunk: 0, damaged: 0 });
  });
});
