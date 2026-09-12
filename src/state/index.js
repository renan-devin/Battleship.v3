/**
 * State layer: pure logic, no DOM, no framework.
 *
 * Orchestrates the engine across the two phases of a match: placing the fleet
 * and firing at the enemy. Every function is side-effect free and returns a
 * new state object.
 *
 * Phases: 'placement' -> 'battle' -> 'victory' | 'defeat'.
 */

import { DIFFICULTIES, chooseTarget } from '../ai/index.js';
import {
  FLEET,
  ORIENTATIONS,
  fireAt,
  placeShip,
  placeShipsRandomly,
  removeShip,
} from '../engine/index.js';

/**
 * @returns {object} A fresh placement state with no ship on the board.
 */
export function createInitialState() {
  return {
    phase: 'placement',
    difficulty: 'easy',
    orientation: ORIENTATIONS.horizontal,
    selectedShipId: FLEET[0].id,
    placements: [],
    enemyPlacements: [],
    playerShots: [],
    enemyShots: [],
    turn: null,
    lastShot: null,
  };
}

/**
 * @param {object} state
 * @returns {boolean} True while the match is being played.
 */
export function isBattleActive(state) {
  return state.phase === 'battle';
}

/**
 * @param {object} state
 * @returns {boolean} True once the match ended, either way.
 */
export function isGameOver(state) {
  return state.phase === 'victory' || state.phase === 'defeat';
}

/**
 * @param {object} state
 * @returns {string[]} Ids of the ships still waiting to be placed.
 */
export function getRemainingShipIds(state) {
  const placedIds = new Set(state.placements.map((placement) => placement.shipId));
  return FLEET.filter((ship) => !placedIds.has(ship.id)).map((ship) => ship.id);
}

/**
 * @param {object} state
 * @returns {boolean} True when the whole fleet is on the board.
 */
export function isPlacementComplete(state) {
  return getRemainingShipIds(state).length === 0;
}

/**
 * Selects the ship the next click will place. Unknown ids are ignored.
 *
 * @param {object} state
 * @param {string} shipId
 * @returns {object}
 */
export function selectShip(state, shipId) {
  if (!FLEET.some((ship) => ship.id === shipId)) {
    return state;
  }

  return { ...state, selectedShipId: shipId };
}

/**
 * @param {object} state
 * @returns {object} State with the opposite orientation.
 */
export function toggleOrientation(state) {
  const orientation =
    state.orientation === ORIENTATIONS.horizontal ? ORIENTATIONS.vertical : ORIENTATIONS.horizontal;

  return { ...state, orientation };
}

/**
 * Places the selected ship and moves the selection to the next pending ship.
 *
 * @param {object} state
 * @param {{ row: number, column: number }} origin
 * @returns {object} New state, or the same state when the move is invalid.
 */
export function placeSelectedShip(state, origin) {
  if (state.phase !== 'placement' || !state.selectedShipId) {
    return state;
  }

  const placement = {
    shipId: state.selectedShipId,
    row: origin.row,
    column: origin.column,
    orientation: state.orientation,
  };

  let placements;

  try {
    placements = placeShip(state.placements, placement);
  } catch {
    return state;
  }

  const next = { ...state, placements };

  return { ...next, selectedShipId: getRemainingShipIds(next)[0] ?? null };
}

/**
 * Takes a ship off the board and selects it again.
 *
 * @param {object} state
 * @param {string} shipId
 * @returns {object}
 */
export function removePlacedShip(state, shipId) {
  if (state.phase !== 'placement') {
    return state;
  }

  if (!state.placements.some((placement) => placement.shipId === shipId)) {
    return state;
  }

  return { ...state, placements: removeShip(state.placements, shipId), selectedShipId: shipId };
}

/**
 * @param {object} state
 * @param {() => number} [random]
 * @returns {object} State with a full random fleet and nothing left to place.
 */
export function randomizePlacements(state, random) {
  if (state.phase !== 'placement') {
    return state;
  }

  return { ...state, placements: placeShipsRandomly(random), selectedShipId: null };
}

/**
 * @param {object} state
 * @returns {object} Empty board, keeping the chosen difficulty.
 */
export function resetPlacements(state) {
  if (state.phase !== 'placement') {
    return state;
  }

  return startNewGame(state);
}

/**
 * @param {object} state
 * @param {string} difficulty
 * @returns {object} Same state for an unknown difficulty or once the battle started.
 */
export function setDifficulty(state, difficulty) {
  if (!DIFFICULTIES.includes(difficulty) || state.phase !== 'placement') {
    return state;
  }

  return { ...state, difficulty };
}

/**
 * Deploys the enemy fleet and hands the first turn to the player.
 *
 * @param {object} state
 * @param {() => number} [random]
 * @returns {object} Same state when the player fleet is not ready yet.
 */
export function startBattle(state, random) {
  if (state.phase !== 'placement' || !isPlacementComplete(state)) {
    return state;
  }

  return {
    ...state,
    phase: 'battle',
    turn: 'player',
    selectedShipId: null,
    enemyPlacements: placeShipsRandomly(random),
    playerShots: [],
    enemyShots: [],
    lastShot: null,
  };
}

/**
 * Player shot at the enemy board. Turn passes to the enemy unless the match ends.
 *
 * @param {object} state
 * @param {{ row: number, column: number }} target
 * @returns {object} Same state when it is not the player's turn or the cell was already fired at.
 */
export function fireAtEnemy(state, target) {
  if (!isBattleActive(state) || state.turn !== 'player') {
    return state;
  }

  const { shots, ...outcome } = fireAt(state.enemyPlacements, state.playerShots, target);

  if (outcome.result !== 'hit' && outcome.result !== 'miss') {
    return state;
  }

  return {
    ...state,
    playerShots: shots,
    phase: outcome.fleetDestroyed ? 'victory' : 'battle',
    turn: outcome.fleetDestroyed ? null : 'enemy',
    lastShot: { by: 'player', ...target, ...outcome },
  };
}

/**
 * Enemy shot at the player board, chosen by the AI for the current difficulty.
 *
 * @param {object} state
 * @param {() => number} [random]
 * @returns {object} Same state when it is not the enemy's turn.
 */
export function fireAtPlayer(state, random) {
  if (!isBattleActive(state) || state.turn !== 'enemy') {
    return state;
  }

  const target = chooseTarget(state.enemyShots, random, state.difficulty);

  if (!target) {
    return state;
  }

  const { shots, ...outcome } = fireAt(state.placements, state.enemyShots, target);

  return {
    ...state,
    enemyShots: shots,
    phase: outcome.fleetDestroyed ? 'defeat' : 'battle',
    turn: outcome.fleetDestroyed ? null : 'player',
    lastShot: { by: 'enemy', ...target, ...outcome },
  };
}

/**
 * @param {object} state
 * @returns {object} A brand new match, keeping the chosen difficulty.
 */
export function startNewGame(state) {
  return { ...createInitialState(), difficulty: state.difficulty };
}
