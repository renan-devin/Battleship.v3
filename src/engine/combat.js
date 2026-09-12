/**
 * Combat rules: pure logic, no DOM, no framework.
 *
 * A shot is `{ row, column, hit, shipId }` and a board's shot history is simply
 * the list of shots fired at it. Firing never mutates its inputs.
 */

import { buildOccupancyGrid, getShipCells, isWithinBounds } from './placement.js';

/**
 * @param {Array<object>} shots
 * @param {{ row: number, column: number }} target
 * @returns {boolean} True when that cell was already fired at.
 */
export function hasBeenShot(shots, target) {
  return shots.some((shot) => shot.row === target.row && shot.column === target.column);
}

/**
 * @param {Array<object>} placements
 * @param {Array<object>} shots
 * @param {string} shipId
 * @returns {number} How many cells of the ship were hit.
 */
export function getShipHitCount(placements, shots, shipId) {
  const placement = placements.find((candidate) => candidate.shipId === shipId);

  if (!placement) {
    return 0;
  }

  const hits = new Set(
    shots.filter((shot) => shot.hit).map((shot) => `${shot.row}:${shot.column}`),
  );

  return getShipCells(placement).filter(({ row, column }) => hits.has(`${row}:${column}`)).length;
}

/**
 * @param {Array<object>} placements
 * @param {Array<object>} shots
 * @param {string} shipId
 * @returns {boolean} True when every cell of the ship was hit.
 */
export function isShipSunk(placements, shots, shipId) {
  const placement = placements.find((candidate) => candidate.shipId === shipId);

  if (!placement) {
    return false;
  }

  return getShipHitCount(placements, shots, shipId) === getShipCells(placement).length;
}

/**
 * @param {Array<object>} placements
 * @param {Array<object>} shots
 * @returns {string[]} Ids of the ships already sunk.
 */
export function getSunkShipIds(placements, shots) {
  return placements
    .filter((placement) => isShipSunk(placements, shots, placement.shipId))
    .map((placement) => placement.shipId);
}

/**
 * @param {Array<object>} placements
 * @param {Array<object>} shots
 * @returns {boolean} True when a non-empty fleet has been completely sunk.
 */
export function isFleetDestroyed(placements, shots) {
  return placements.length > 0 && getSunkShipIds(placements, shots).length === placements.length;
}

/**
 * Summarises how a fleet is holding up.
 *
 * @param {Array<object>} placements
 * @param {Array<object>} shots
 * @returns {{ total: number, afloat: number, sunk: number, damaged: number }}
 */
export function getFleetStatus(placements, shots) {
  const sunkIds = new Set(getSunkShipIds(placements, shots));
  const damaged = placements.filter(
    (placement) =>
      !sunkIds.has(placement.shipId) && getShipHitCount(placements, shots, placement.shipId) > 0,
  ).length;

  return {
    total: placements.length,
    afloat: placements.length - sunkIds.size,
    sunk: sunkIds.size,
    damaged,
  };
}

/**
 * Fires at a board.
 *
 * @param {Array<object>} placements - Ships on the board being fired at.
 * @param {Array<object>} shots - Shots already fired at that board.
 * @param {{ row: number, column: number }} target
 * @returns {{
 *   shots: Array<object>,
 *   result: 'hit' | 'miss' | 'repeat' | 'invalid',
 *   shipId: string | null,
 *   sunkShipId: string | null,
 *   fleetDestroyed: boolean,
 * }}
 */
export function fireAt(placements, shots, target) {
  if (!isWithinBounds([target])) {
    return { shots, result: 'invalid', shipId: null, sunkShipId: null, fleetDestroyed: false };
  }

  if (hasBeenShot(shots, target)) {
    return { shots, result: 'repeat', shipId: null, sunkShipId: null, fleetDestroyed: false };
  }

  const shipId = buildOccupancyGrid(placements)[target.row][target.column];
  const shot = { row: target.row, column: target.column, hit: Boolean(shipId), shipId };
  const nextShots = [...shots, shot];
  const sunkShipId = shipId && isShipSunk(placements, nextShots, shipId) ? shipId : null;

  return {
    shots: nextShots,
    result: shipId ? 'hit' : 'miss',
    shipId,
    sunkShipId,
    fleetDestroyed: isFleetDestroyed(placements, nextShots),
  };
}
