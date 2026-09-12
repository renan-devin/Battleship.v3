import { describe, expect, it } from 'vitest';

import { FLEET, ORIENTATIONS } from '../src/engine/index.js';
import {
  createInitialState,
  getRemainingShipIds,
  isPlacementComplete,
  placeSelectedShip,
  randomizePlacements,
  removePlacedShip,
  resetPlacements,
  selectShip,
  setDifficulty,
  toggleOrientation,
} from '../src/state/index.js';

describe('createInitialState', () => {
  it('starts empty with the largest ship selected', () => {
    const state = createInitialState();

    expect(state.placements).toEqual([]);
    expect(state.selectedShipId).toBe(FLEET[0].id);
    expect(state.orientation).toBe(ORIENTATIONS.horizontal);
    expect(isPlacementComplete(state)).toBe(false);
  });
});

describe('selectShip', () => {
  it('selects a known ship', () => {
    expect(selectShip(createInitialState(), 'destroyer').selectedShipId).toBe('destroyer');
  });

  it('ignores unknown ships', () => {
    const state = createInitialState();

    expect(selectShip(state, 'canoe')).toBe(state);
  });
});

describe('toggleOrientation', () => {
  it('switches between horizontal and vertical', () => {
    const horizontal = createInitialState();
    const vertical = toggleOrientation(horizontal);

    expect(vertical.orientation).toBe(ORIENTATIONS.vertical);
    expect(toggleOrientation(vertical).orientation).toBe(ORIENTATIONS.horizontal);
  });
});

describe('placeSelectedShip', () => {
  it('places the selected ship and selects the next pending one', () => {
    const state = placeSelectedShip(createInitialState(), { row: 0, column: 0 });

    expect(state.placements).toEqual([
      { shipId: FLEET[0].id, row: 0, column: 0, orientation: ORIENTATIONS.horizontal },
    ]);
    expect(state.selectedShipId).toBe(FLEET[1].id);
  });

  it('returns the same state when the ship does not fit', () => {
    const state = createInitialState();

    expect(placeSelectedShip(state, { row: 0, column: 9 })).toBe(state);
  });

  it('clears the selection once the fleet is complete', () => {
    let state = createInitialState();

    FLEET.forEach((ship, index) => {
      state = placeSelectedShip(state, { row: index, column: 0 });
    });

    expect(isPlacementComplete(state)).toBe(true);
    expect(state.selectedShipId).toBeNull();
    expect(getRemainingShipIds(state)).toEqual([]);
  });
});

describe('removePlacedShip', () => {
  it('takes the ship back and selects it again', () => {
    const placed = placeSelectedShip(createInitialState(), { row: 0, column: 0 });
    const state = removePlacedShip(placed, FLEET[0].id);

    expect(state.placements).toEqual([]);
    expect(state.selectedShipId).toBe(FLEET[0].id);
  });

  it('ignores ships that are not on the board', () => {
    const state = createInitialState();

    expect(removePlacedShip(state, FLEET[0].id)).toBe(state);
  });
});

describe('randomizePlacements', () => {
  it('fills the board and leaves nothing selected', () => {
    const state = randomizePlacements(createInitialState());

    expect(isPlacementComplete(state)).toBe(true);
    expect(state.selectedShipId).toBeNull();
  });
});

describe('resetPlacements', () => {
  it('clears the board but keeps the difficulty', () => {
    const state = resetPlacements(randomizePlacements(setDifficulty(createInitialState(), 'hard')));

    expect(state.placements).toEqual([]);
    expect(state.difficulty).toBe('hard');
    expect(state.selectedShipId).toBe(FLEET[0].id);
  });
});
