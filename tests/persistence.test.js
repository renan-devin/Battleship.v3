import { beforeEach, describe, expect, it } from 'vitest';

import { FLEET, ORIENTATIONS, getShipCells } from '../src/engine/index.js';
import {
  createInitialState,
  fireAtEnemy,
  fireAtPlayer,
  randomizePlacements,
  startBattle,
  startNewGame,
} from '../src/state/index.js';
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  clearState,
  loadState,
  parseSavedState,
  saveState,
  serializeState,
} from '../src/state/persistence.js';

/** Fleet laid out in fixed rows, one ship per row, starting at column 0. */
const fixedFleet = FLEET.map((ship, index) => ({
  shipId: ship.id,
  row: index,
  column: 0,
  orientation: ORIENTATIONS.horizontal,
}));

/** Same fleet moved to the bottom half of the board, for the enemy side. */
const enemyFleet = FLEET.map((ship, index) => ({
  shipId: ship.id,
  row: index + 5,
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
    enemyPlacements: enemyFleet,
    ...overrides,
  };
}

function shotAt(placements, row, column) {
  const shipId =
    placements.find((placement) =>
      getShipCells(placement).some((cell) => cell.row === row && cell.column === column),
    )?.shipId ?? null;

  return { row, column, hit: shipId !== null, shipId };
}

/** Misses on the player's board, used to keep both histories in step. */
function waterShots(count) {
  return Array.from({ length: count }, (_unused, index) =>
    shotAt(fixedFleet, 5 + Math.floor(index / 10), index % 10),
  );
}

/** Minimal in-memory `Storage`, enough for the calls this module makes. */
function createStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    get size() {
      return entries.size;
    },
  };
}

describe('saveState and loadState', () => {
  let storage;

  beforeEach(() => {
    storage = createStorage();
  });

  it('round trips a match in progress without changing it', () => {
    const state = battleState({
      difficulty: 'hard',
      turn: 'player',
      playerShots: [shotAt(enemyFleet, 5, 0), shotAt(enemyFleet, 9, 9)],
      enemyShots: [shotAt(fixedFleet, 0, 0), ...waterShots(1)],
    });

    expect(saveState(storage, state)).toBe(true);
    expect(loadState(storage)).toEqual({ ...state, lastShot: null });
  });

  it('restores the last shot with the ship it belongs to', () => {
    const state = fireAtEnemy(battleState(), { row: 5, column: 0 });

    saveState(storage, state);

    expect(state.lastShot.result).toBe('hit');
    expect(loadState(storage).lastShot).toEqual(state.lastShot);
  });

  it('round trips a full deployment, difficulty and orientation', () => {
    const state = {
      ...randomizePlacements(createInitialState()),
      difficulty: 'hard',
      orientation: ORIENTATIONS.vertical,
    };

    saveState(storage, state);

    expect(loadState(storage)).toEqual(state);
  });

  it('keeps the winner when the match is already over', () => {
    const shots = enemyFleet.flatMap((placement) =>
      getShipCells(placement).map(({ row, column }) => shotAt(enemyFleet, row, column)),
    );
    const state = battleState({
      phase: 'victory',
      turn: null,
      playerShots: shots,
      enemyShots: waterShots(shots.length - 1),
    });

    saveState(storage, state);

    expect(loadState(storage).phase).toBe('victory');
    expect(loadState(storage).playerShots).toHaveLength(shots.length);
  });

  it('returns null when nothing was saved', () => {
    expect(loadState(storage)).toBeNull();
  });

  it('tolerates a missing storage', () => {
    expect(saveState(null, createInitialState())).toBe(false);
    expect(loadState(null)).toBeNull();
    expect(() => clearState(null)).not.toThrow();
  });

  it('reports a storage that refuses to write', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => {},
    };

    expect(saveState(failing, createInitialState())).toBe(false);
  });
});

describe('clearState', () => {
  it('drops the saved match, so a new game starts clean', () => {
    const storage = createStorage();
    const finished = battleState({ turn: 'enemy', playerShots: [shotAt(enemyFleet, 5, 0)] });

    saveState(storage, finished);
    clearState(storage);

    expect(loadState(storage)).toBeNull();

    saveState(storage, startNewGame(finished));

    expect(loadState(storage)).toEqual(createInitialState());
  });
});

describe('corrupted saves', () => {
  it.each([
    ['unparsable JSON', '{not json'],
    ['a payload that is not an object', '"battleship"'],
    ['a save from another version', JSON.stringify({ version: 0, state: createInitialState() })],
    ['a missing state', JSON.stringify({ version: STORAGE_VERSION })],
    ['an unknown phase', serializeState({ ...createInitialState(), phase: 'intermission' })],
    ['an unknown difficulty', serializeState({ ...createInitialState(), difficulty: 'nightmare' })],
    [
      'an unknown orientation',
      serializeState({ ...createInitialState(), orientation: 'diagonal' }),
    ],
    [
      'an unknown selected ship',
      serializeState({ ...createInitialState(), selectedShipId: 'raft' }),
    ],
    [
      'a ship off the board',
      serializeState({
        ...createInitialState(),
        placements: [
          { shipId: 'carrier', row: 0, column: 8, orientation: ORIENTATIONS.horizontal },
        ],
      }),
    ],
    [
      'overlapping ships',
      serializeState({
        ...createInitialState(),
        placements: [
          { shipId: 'carrier', row: 0, column: 0, orientation: ORIENTATIONS.horizontal },
          { shipId: 'cruiser', row: 0, column: 0, orientation: ORIENTATIONS.horizontal },
        ],
      }),
    ],
    [
      'the same ship placed twice',
      serializeState({
        ...createInitialState(),
        placements: [
          { shipId: 'carrier', row: 0, column: 0, orientation: ORIENTATIONS.horizontal },
          { shipId: 'carrier', row: 2, column: 0, orientation: ORIENTATIONS.horizontal },
        ],
      }),
    ],
    [
      'a shot outside the board',
      serializeState(
        battleState({ playerShots: [{ row: 10, column: 0, hit: false, shipId: null }] }),
      ),
    ],
    [
      'the same cell fired at twice',
      serializeState(
        battleState({ playerShots: [shotAt(enemyFleet, 0, 0), shotAt(enemyFleet, 0, 0)] }),
      ),
    ],
    [
      'a hit that does not match the board',
      serializeState({
        ...battleState(),
        playerShots: [{ row: 0, column: 0, hit: true, shipId: 'carrier' }],
      }),
    ],
    ['a battle without an enemy fleet', serializeState({ ...battleState(), enemyPlacements: [] })],
    ['a battle without a turn', serializeState(battleState({ turn: null }))],
    [
      'a player shot the enemy never answered',
      serializeState(battleState({ turn: 'player', playerShots: [shotAt(enemyFleet, 5, 0)] })),
    ],
    [
      'an enemy shot the player never earned',
      serializeState(battleState({ turn: 'enemy', enemyShots: waterShots(1) })),
    ],
    ['a victory nobody won', serializeState(battleState({ phase: 'victory', turn: null }))],
    [
      'shots fired during deployment',
      serializeState({
        ...createInitialState(),
        placements: fixedFleet,
        enemyShots: [shotAt(fixedFleet, 0, 0)],
      }),
    ],
  ])('discards %s', (_label, raw) => {
    const storage = createStorage({ [STORAGE_KEY]: raw });

    expect(loadState(storage)).toBeNull();
    expect(storage.size).toBe(0);
  });

  it('discards a save written by an earlier version and starts clean', () => {
    const legacy = JSON.stringify({ version: 1, state: battleState() });
    const storage = createStorage({ [STORAGE_KEY]: legacy });

    expect(loadState(storage)).toBeNull();
    expect(storage.size).toBe(0);

    saveState(storage, createInitialState());

    expect(loadState(storage)).toEqual(createInitialState());
  });

  it('drops a malformed last shot but keeps the match', () => {
    const storage = createStorage();

    saveState(storage, battleState({ lastShot: { by: 'ghost', row: 99 } }));

    expect(loadState(storage).lastShot).toBeNull();
    expect(loadState(storage).phase).toBe('battle');
  });
});

describe('resuming during the enemy turn', () => {
  it('restores the pending enemy turn without firing it twice', () => {
    const storage = createStorage();
    const beforeReply = fireAtEnemy(battleState(), { row: 0, column: 0 });

    expect(beforeReply.turn).toBe('enemy');
    saveState(storage, beforeReply);

    const restored = loadState(storage);

    expect(restored.turn).toBe('enemy');
    expect(restored.enemyShots).toEqual([]);
    expect(restored.playerShots).toEqual(beforeReply.playerShots);

    const afterReply = fireAtPlayer(restored, () => 0);

    expect(afterReply.enemyShots).toHaveLength(1);
    expect(afterReply.turn).toBe('player');
  });

  it('keeps the enemy history when the reply landed before the reload', () => {
    const storage = createStorage();
    const afterReply = fireAtPlayer(fireAtEnemy(battleState(), { row: 9, column: 9 }), () => 0);

    saveState(storage, afterReply);

    const restored = loadState(storage);

    expect(restored.enemyShots).toEqual(afterReply.enemyShots);
    expect(restored.turn).toBe('player');
  });
});

describe('parseSavedState', () => {
  it('rejects anything that is not a versioned envelope', () => {
    expect(parseSavedState(null)).toBeNull();
    expect(parseSavedState([])).toBeNull();
    expect(parseSavedState({ state: createInitialState() })).toBeNull();
  });

  it('accepts a state produced by the game itself', () => {
    const state = startBattle(randomizePlacements(createInitialState()));

    expect(parseSavedState(JSON.parse(serializeState(state)))).toEqual(state);
  });
});
