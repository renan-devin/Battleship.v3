/**
 * Match persistence: pure logic, no DOM, no framework.
 *
 * The saved match is a versioned JSON envelope. Reading it never trusts the
 * payload: every field is validated against the engine rules, and a save that
 * does not describe a state the game itself could have produced is discarded.
 * The browser `Storage` is injected so this module stays testable.
 */

import { DIFFICULTIES } from '../ai/index.js';
import {
  BOARD_SIZE,
  FLEET,
  ORIENTATIONS,
  buildOccupancyGrid,
  canPlaceShip,
  isFleetDestroyed,
  isShipSunk,
} from '../engine/index.js';

export const STORAGE_KEY = 'battleship.v2.match';
export const STORAGE_VERSION = 2;

const PHASES = ['placement', 'battle', 'victory', 'defeat'];
const SHIP_IDS = FLEET.map((ship) => ship.id);
const ORIENTATION_VALUES = Object.values(ORIENTATIONS);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCoordinate(value) {
  return Number.isInteger(value) && value >= 0 && value < BOARD_SIZE;
}

function parsePlacements(value) {
  if (!Array.isArray(value) || value.length > FLEET.length) {
    return null;
  }

  const placements = [];

  for (const entry of value) {
    if (!isRecord(entry) || !SHIP_IDS.includes(entry.shipId)) {
      return null;
    }

    if (placements.some((placement) => placement.shipId === entry.shipId)) {
      return null;
    }

    const placement = {
      shipId: entry.shipId,
      row: entry.row,
      column: entry.column,
      orientation: entry.orientation,
    };

    if (!ORIENTATION_VALUES.includes(placement.orientation)) {
      return null;
    }

    if (!Number.isInteger(placement.row) || !Number.isInteger(placement.column)) {
      return null;
    }

    if (!canPlaceShip(placements, placement)) {
      return null;
    }

    placements.push(placement);
  }

  return placements;
}

function parseShots(value, placements) {
  if (!Array.isArray(value) || value.length > BOARD_SIZE * BOARD_SIZE) {
    return null;
  }

  const grid = buildOccupancyGrid(placements);
  const seen = new Set();
  const shots = [];

  for (const entry of value) {
    if (!isRecord(entry) || !isCoordinate(entry.row) || !isCoordinate(entry.column)) {
      return null;
    }

    const key = `${entry.row}:${entry.column}`;

    if (seen.has(key)) {
      return null;
    }

    const occupant = grid[entry.row][entry.column];

    if (entry.hit !== (occupant !== null)) {
      return null;
    }

    if ((entry.shipId ?? null) !== occupant) {
      return null;
    }

    seen.add(key);
    shots.push({ row: entry.row, column: entry.column, hit: entry.hit, shipId: occupant });
  }

  return shots;
}

/**
 * Rebuilds the last shot from the shot history it belongs to, so the restored
 * outcome is the one the boards actually describe rather than the one the save
 * claims. Only the attacker and the coordinate are read from the payload.
 */
function parseLastShot(value, { shots, board }) {
  if (!isRecord(value) || (value.by !== 'player' && value.by !== 'enemy')) {
    return null;
  }

  const shot = shots[shots.length - 1];

  if (!shot || shot.row !== value.row || shot.column !== value.column) {
    return null;
  }

  return {
    by: value.by,
    row: shot.row,
    column: shot.column,
    result: shot.hit ? 'hit' : 'miss',
    shipId: shot.shipId,
    sunkShipId: shot.shipId && isShipSunk(board, shots, shot.shipId) ? shot.shipId : null,
    fleetDestroyed: isFleetDestroyed(board, shots),
  };
}

/**
 * Rebuilds a state object from an untrusted payload.
 *
 * @param {unknown} payload
 * @returns {object|null} A valid state, or null when the payload is unusable.
 */
export function parseSavedState(payload) {
  if (!isRecord(payload) || payload.version !== STORAGE_VERSION || !isRecord(payload.state)) {
    return null;
  }

  const saved = payload.state;

  if (!PHASES.includes(saved.phase) || !DIFFICULTIES.includes(saved.difficulty)) {
    return null;
  }

  if (!ORIENTATION_VALUES.includes(saved.orientation)) {
    return null;
  }

  if (saved.selectedShipId !== null && !SHIP_IDS.includes(saved.selectedShipId)) {
    return null;
  }

  const placements = parsePlacements(saved.placements);
  const enemyPlacements = parsePlacements(saved.enemyPlacements);

  if (!placements || !enemyPlacements) {
    return null;
  }

  const playerShots = parseShots(saved.playerShots, enemyPlacements);
  const enemyShots = parseShots(saved.enemyShots, placements);

  if (!playerShots || !enemyShots) {
    return null;
  }

  const placing = saved.phase === 'placement';
  const fleetsReady = placements.length === FLEET.length && enemyPlacements.length === FLEET.length;

  if (placing) {
    if (enemyPlacements.length > 0 || playerShots.length > 0 || enemyShots.length > 0) {
      return null;
    }
  } else if (!fleetsReady) {
    return null;
  }

  const enemyFleetDestroyed = fleetsReady && isFleetDestroyed(enemyPlacements, playerShots);
  const playerFleetDestroyed = fleetsReady && isFleetDestroyed(placements, enemyShots);
  const expectedPhase = enemyFleetDestroyed
    ? 'victory'
    : playerFleetDestroyed
      ? 'defeat'
      : 'battle';

  if (!placing && saved.phase !== expectedPhase) {
    return null;
  }

  const turn = saved.phase === 'battle' ? saved.turn : null;

  if (saved.phase === 'battle' && turn !== 'player' && turn !== 'enemy') {
    return null;
  }

  // The player opens and the sides alternate, so the histories can only be even
  // (the player is up, or the enemy just won) or one player shot ahead (the
  // enemy is up, or the player just won).
  const pending = playerShots.length - enemyShots.length;
  const expectedPending = turn === 'enemy' || saved.phase === 'victory' ? 1 : 0;

  if (!placing && pending !== expectedPending) {
    return null;
  }

  const lastAttacker = saved.lastShot?.by;
  const lastShot = placing
    ? null
    : parseLastShot(saved.lastShot, {
        shots: lastAttacker === 'enemy' ? enemyShots : playerShots,
        board: lastAttacker === 'enemy' ? placements : enemyPlacements,
      });

  return {
    phase: saved.phase,
    difficulty: saved.difficulty,
    orientation: saved.orientation,
    selectedShipId: placing ? saved.selectedShipId : null,
    placements,
    enemyPlacements,
    playerShots,
    enemyShots,
    turn,
    lastShot,
  };
}

/**
 * @param {object} state
 * @returns {string} The versioned JSON envelope written to storage.
 */
export function serializeState(state) {
  return JSON.stringify({ version: STORAGE_VERSION, state });
}

/**
 * @param {Storage} [storage]
 * @param {object} state
 * @returns {boolean} False when the state could not be written.
 */
export function saveState(storage, state) {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(STORAGE_KEY, serializeState(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the saved match, dropping anything unreadable or inconsistent.
 *
 * @param {Storage} [storage]
 * @returns {object|null} A valid state, or null when there is nothing to resume.
 */
export function loadState(storage) {
  if (!storage) {
    return null;
  }

  let payload;

  try {
    const raw = storage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    payload = JSON.parse(raw);
  } catch {
    clearState(storage);
    return null;
  }

  const state = parseSavedState(payload);

  if (!state) {
    clearState(storage);
    return null;
  }

  return state;
}

/**
 * @param {Storage} [storage]
 * @returns {void}
 */
export function clearState(storage) {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // A storage that refuses writes leaves nothing to clean up.
  }
}
