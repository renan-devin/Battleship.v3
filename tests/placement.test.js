import { describe, expect, it } from 'vitest';

import { BOARD_SIZE, FLEET, ORIENTATIONS } from '../src/engine/constants.js';
import {
  buildOccupancyGrid,
  canPlaceShip,
  createEmptyBoard,
  getShipCells,
  isWithinBounds,
  placeShip,
  placeShipsRandomly,
  removeShip,
} from '../src/engine/placement.js';

const carrierAt = (row, column, orientation = ORIENTATIONS.horizontal) => ({
  shipId: 'carrier',
  row,
  column,
  orientation,
});

describe('createEmptyBoard', () => {
  it('creates an empty square board', () => {
    const board = createEmptyBoard();

    expect(board).toHaveLength(BOARD_SIZE);
    expect(board.every((row) => row.length === BOARD_SIZE)).toBe(true);
    expect(board.flat().every((cell) => cell === null)).toBe(true);
  });
});

describe('getShipCells', () => {
  it('expands a horizontal placement along the row', () => {
    expect(
      getShipCells({ shipId: 'destroyer', row: 2, column: 3, orientation: 'horizontal' }),
    ).toEqual([
      { row: 2, column: 3 },
      { row: 2, column: 4 },
    ]);
  });

  it('expands a vertical placement along the column', () => {
    expect(
      getShipCells({ shipId: 'destroyer', row: 2, column: 3, orientation: 'vertical' }),
    ).toEqual([
      { row: 2, column: 3 },
      { row: 3, column: 3 },
    ]);
  });

  it('rejects unknown ships', () => {
    expect(() =>
      getShipCells({ shipId: 'canoe', row: 0, column: 0, orientation: 'horizontal' }),
    ).toThrow(/Unknown ship/);
  });
});

describe('canPlaceShip', () => {
  it('accepts a ship fully inside the board', () => {
    expect(canPlaceShip([], carrierAt(0, 0))).toBe(true);
  });

  it('rejects a ship crossing the right edge', () => {
    expect(canPlaceShip([], carrierAt(0, 6))).toBe(false);
  });

  it('rejects a ship crossing the bottom edge', () => {
    expect(canPlaceShip([], carrierAt(6, 0, ORIENTATIONS.vertical))).toBe(false);
  });

  it('rejects negative coordinates', () => {
    expect(canPlaceShip([], carrierAt(-1, 0))).toBe(false);
  });

  it('rejects overlapping ships', () => {
    const placements = [carrierAt(0, 0)];

    expect(
      canPlaceShip(placements, {
        shipId: 'destroyer',
        row: 0,
        column: 4,
        orientation: ORIENTATIONS.horizontal,
      }),
    ).toBe(false);
  });

  it('allows ships touching side by side', () => {
    const placements = [carrierAt(0, 0)];

    expect(
      canPlaceShip(placements, {
        shipId: 'destroyer',
        row: 1,
        column: 0,
        orientation: ORIENTATIONS.horizontal,
      }),
    ).toBe(true);
  });

  it('allows ships touching diagonally', () => {
    const placements = [carrierAt(0, 0)];

    expect(
      canPlaceShip(placements, {
        shipId: 'destroyer',
        row: 1,
        column: 5,
        orientation: ORIENTATIONS.horizontal,
      }),
    ).toBe(true);
  });

  it('ignores the ship being moved when checking overlap', () => {
    const placements = [carrierAt(0, 0)];

    expect(canPlaceShip(placements, carrierAt(0, 1))).toBe(true);
  });

  it('rejects fractional coordinates', () => {
    expect(canPlaceShip([], carrierAt(0.5, 0))).toBe(false);
  });

  it('rejects unknown orientations', () => {
    expect(canPlaceShip([], carrierAt(0, 0, 'diagonal'))).toBe(false);
  });
});

describe('placeShip', () => {
  it('adds the placement without mutating the input', () => {
    const placements = [];
    const next = placeShip(placements, carrierAt(0, 0));

    expect(placements).toHaveLength(0);
    expect(next).toEqual([carrierAt(0, 0)]);
  });

  it('replaces an existing placement of the same ship', () => {
    const next = placeShip([carrierAt(0, 0)], carrierAt(3, 3));

    expect(next).toEqual([carrierAt(3, 3)]);
  });

  it('throws on invalid placements', () => {
    expect(() => placeShip([], carrierAt(0, 9))).toThrow(/Invalid placement/);
  });
});

describe('removeShip', () => {
  it('drops only the given ship', () => {
    const placements = [
      carrierAt(0, 0),
      { shipId: 'destroyer', row: 5, column: 5, orientation: ORIENTATIONS.horizontal },
    ];

    expect(removeShip(placements, 'carrier')).toEqual([placements[1]]);
  });
});

describe('buildOccupancyGrid', () => {
  it('marks every occupied cell with the ship id', () => {
    const grid = buildOccupancyGrid([carrierAt(0, 0)]);

    expect(grid[0].slice(0, 5)).toEqual(Array(5).fill('carrier'));
    expect(grid[1][0]).toBeNull();
  });
});

describe('placeShipsRandomly', () => {
  it('places the whole fleet without overlaps', () => {
    for (let run = 0; run < 50; run += 1) {
      const placements = placeShipsRandomly();
      const cells = placements.flatMap(getShipCells);
      const unique = new Set(cells.map(({ row, column }) => `${row}:${column}`));
      const expectedCells = FLEET.reduce((total, ship) => total + ship.size, 0);

      expect(placements).toHaveLength(FLEET.length);
      expect(cells).toHaveLength(expectedCells);
      expect(unique.size).toBe(expectedCells);
      expect(isWithinBounds(cells)).toBe(true);
    }
  });

  it('gives up instead of looping forever on a degenerate random source', () => {
    expect(() => placeShipsRandomly(() => 0.99)).toThrow(/Could not place the fleet/);
  });
});
