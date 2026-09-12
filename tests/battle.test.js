import { describe, expect, it } from 'vitest';

import { FLEET, ORIENTATIONS, getShipCells } from '../src/engine/index.js';
import {
  createInitialState,
  fireAtEnemy,
  fireAtPlayer,
  isBattleActive,
  isGameOver,
  randomizePlacements,
  resetPlacements,
  setDifficulty,
  startBattle,
  startNewGame,
} from '../src/state/index.js';

/** Fleet laid out in fixed rows, one ship per row, starting at column 0. */
const fixedFleet = FLEET.map((ship, index) => ({
  shipId: ship.id,
  row: index,
  column: 0,
  orientation: ORIENTATIONS.horizontal,
}));

function battleState(overrides = {}) {
  return {
    ...createInitialState(),
    phase: 'battle',
    turn: 'player',
    selectedShipId: null,
    placements: fixedFleet,
    enemyPlacements: fixedFleet,
    ...overrides,
  };
}

describe('startBattle', () => {
  it('refuses to start before the fleet is placed', () => {
    const state = createInitialState();

    expect(startBattle(state)).toBe(state);
  });

  it('deploys the enemy fleet and gives the first turn to the player', () => {
    const state = startBattle(randomizePlacements(createInitialState()));

    expect(state.phase).toBe('battle');
    expect(state.turn).toBe('player');
    expect(state.enemyPlacements).toHaveLength(FLEET.length);
    expect(state.playerShots).toEqual([]);
    expect(isBattleActive(state)).toBe(true);
  });
});

describe('fireAtEnemy', () => {
  it('records the shot and passes the turn to the enemy', () => {
    const state = fireAtEnemy(battleState(), { row: 0, column: 0 });

    expect(state.playerShots).toHaveLength(1);
    expect(state.lastShot).toMatchObject({ by: 'player', result: 'hit', shipId: 'carrier' });
    expect(state.turn).toBe('enemy');
  });

  it('ignores a repeated shot and keeps the turn', () => {
    const first = fireAtEnemy(battleState(), { row: 9, column: 9 });
    const again = fireAtEnemy({ ...first, turn: 'player' }, { row: 9, column: 9 });

    expect(again.playerShots).toBe(first.playerShots);
  });

  it('ignores targets outside the board', () => {
    const state = battleState();

    expect(fireAtEnemy(state, { row: 10, column: 0 })).toBe(state);
  });

  it('ignores shots outside the player turn', () => {
    const state = battleState({ turn: 'enemy' });

    expect(fireAtEnemy(state, { row: 0, column: 0 })).toBe(state);
  });

  it('ends the match in victory when the last enemy ship sinks', () => {
    let state = battleState();

    for (const placement of fixedFleet) {
      for (const cell of getShipCells(placement)) {
        state = fireAtEnemy({ ...state, turn: 'player' }, cell);
      }
    }

    expect(state.phase).toBe('victory');
    expect(state.turn).toBeNull();
    expect(isGameOver(state)).toBe(true);
    expect(fireAtEnemy(state, { row: 9, column: 9 })).toBe(state);
  });
});

describe('fireAtPlayer', () => {
  it('fires at the player board and hands the turn back', () => {
    const state = fireAtPlayer(battleState({ turn: 'enemy' }), () => 0);

    expect(state.enemyShots).toEqual([{ row: 0, column: 0, hit: true, shipId: 'carrier' }]);
    expect(state.lastShot).toMatchObject({ by: 'enemy', result: 'hit' });
    expect(state.turn).toBe('player');
  });

  it('ignores shots outside the enemy turn', () => {
    const state = battleState();

    expect(fireAtPlayer(state, () => 0)).toBe(state);
  });

  it('follows up on a hit when the difficulty is hard', () => {
    const damaged = battleState({
      turn: 'enemy',
      difficulty: 'hard',
      enemyShots: [{ row: 0, column: 2, hit: true, shipId: 'carrier' }],
    });

    const state = fireAtPlayer(damaged, () => 0.999);

    const { row, column } = state.lastShot;

    expect([
      { row: 1, column: 2 },
      { row: 0, column: 1 },
      { row: 0, column: 3 },
    ]).toContainEqual({ row, column });
  });

  it('keeps firing at random on easy', () => {
    const damaged = battleState({
      turn: 'enemy',
      enemyShots: [{ row: 0, column: 2, hit: true, shipId: 'carrier' }],
    });

    const state = fireAtPlayer(damaged, () => 0.999);

    expect(state.lastShot).toMatchObject({ row: 9, column: 9 });
  });

  it('ends the match in defeat when the player fleet is destroyed', () => {
    let state = battleState({ turn: 'enemy' });

    while (isBattleActive(state)) {
      state = fireAtPlayer({ ...state, turn: 'enemy' });
    }

    expect(state.phase).toBe('defeat');
    expect(state.turn).toBeNull();
    expect(isGameOver(state)).toBe(true);
  });
});

describe('setDifficulty', () => {
  it('switches the opponent while placing the fleet', () => {
    expect(setDifficulty(createInitialState(), 'hard').difficulty).toBe('hard');
  });

  it('ignores unknown values and changes made mid battle', () => {
    const state = createInitialState();
    const running = battleState({ difficulty: 'easy' });

    expect(setDifficulty(state, 'nightmare')).toBe(state);
    expect(setDifficulty(running, 'hard')).toBe(running);
  });
});

describe('startNewGame', () => {
  it('clears the match but keeps the difficulty', () => {
    const finished = battleState({ phase: 'victory', difficulty: 'hard', turn: null });
    const state = startNewGame(finished);

    expect(state).toMatchObject({
      phase: 'placement',
      difficulty: 'hard',
      placements: [],
      enemyPlacements: [],
      playerShots: [],
      enemyShots: [],
      turn: null,
      lastShot: null,
    });
  });
});

describe('placement actions during the battle', () => {
  it('are ignored', () => {
    const state = battleState();

    expect(randomizePlacements(state)).toBe(state);
    expect(resetPlacements(state)).toBe(state);
  });
});
