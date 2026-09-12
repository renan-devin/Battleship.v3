/**
 * AI layer: pure logic, no DOM, no framework.
 *
 * Easy opponent: uniform random targeting over the cells it has not tried yet.
 * Hard opponent: hunt/target. While a hit is unresolved it works that contact
 * out - gaps between aligned hits first, then the ends of an inferred line,
 * then the orthogonal neighbours of a lone hit - and only goes back to hunting
 * once every damaged ship has been sunk. Hunting itself walks a parity mask,
 * since no ship can hide between two cells of the same colour.
 */

import { BOARD_SIZE, FLEET, getShipDefinition, hasBeenShot } from '../engine/index.js';

export const DIFFICULTIES = ['easy', 'hard'];

const AXES = [
  { rowStep: 1, columnStep: 0 },
  { rowStep: 0, columnStep: 1 },
];

function toKey(row, column) {
  return `${row}:${column}`;
}

function isOnBoard(row, column) {
  return row >= 0 && row < BOARD_SIZE && column >= 0 && column < BOARD_SIZE;
}

/**
 * @param {Array<object>} shots - Shots the opponent already fired.
 * @returns {Array<{ row: number, column: number }>} Cells still untouched.
 */
export function getAvailableTargets(shots) {
  const targets = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      if (!hasBeenShot(shots, { row, column })) {
        targets.push({ row, column });
      }
    }
  }

  return targets;
}

/**
 * @param {Array<object>} shots
 * @returns {Set<string>} Ids of the ships whose every cell was hit.
 */
export function getSunkShipIdsFromShots(shots) {
  const hitCounts = new Map();

  for (const shot of shots) {
    if (shot.hit && shot.shipId) {
      hitCounts.set(shot.shipId, (hitCounts.get(shot.shipId) ?? 0) + 1);
    }
  }

  const sunk = new Set();

  for (const [shipId, count] of hitCounts) {
    if (count >= (getShipDefinition(shipId)?.size ?? Number.POSITIVE_INFINITY)) {
      sunk.add(shipId);
    }
  }

  return sunk;
}

/**
 * Hits that belong to a ship still afloat, oldest first.
 *
 * @param {Array<object>} shots
 * @returns {Array<{ row: number, column: number, shipId: string }>}
 */
export function getUnresolvedHits(shots) {
  const sunk = getSunkShipIdsFromShots(shots);

  return shots
    .filter((shot) => shot.hit && !sunk.has(shot.shipId))
    .map((shot) => ({ row: shot.row, column: shot.column, shipId: shot.shipId }));
}

/**
 * Cells worth firing at while a damaged ship is still afloat: the gap between
 * two aligned hits when there is one, otherwise the ends of the inferred line,
 * otherwise the orthogonal neighbours of a lone hit. Only the best tier is
 * returned, so a lower-priority cell never competes with a gap. Hits are
 * matched per ship, so two damaged ships never fake a line between them.
 *
 * @param {Array<object>} shots
 * @returns {Array<{ row: number, column: number }>} Empty when nothing is damaged.
 */
export function getTargetCandidates(shots) {
  const unresolved = getUnresolvedHits(shots);

  if (unresolved.length === 0) {
    return [];
  }

  const damagedShipByKey = new Map(
    unresolved.map(({ row, column, shipId }) => [toKey(row, column), shipId]),
  );
  const firedKeys = new Set(shots.map(({ row, column }) => toKey(row, column)));

  const gaps = new Map();
  const lineEnds = new Map();
  const neighbours = new Map();

  const walk = (hit, axis, direction) => {
    const openCells = [];
    let row = hit.row + axis.rowStep * direction;
    let column = hit.column + axis.columnStep * direction;

    while (isOnBoard(row, column)) {
      const key = toKey(row, column);

      if (damagedShipByKey.get(key) === hit.shipId) {
        return { openCells, closedByHit: true };
      }

      if (firedKeys.has(key)) {
        return { openCells, closedByHit: false };
      }

      openCells.push({ row, column, key });
      row += axis.rowStep * direction;
      column += axis.columnStep * direction;
    }

    return { openCells, closedByHit: false };
  };

  for (const hit of unresolved) {
    for (const axis of AXES) {
      const forward = walk(hit, axis, 1);
      const backward = walk(hit, axis, -1);
      const aligned = forward.closedByHit || backward.closedByHit;

      for (const branch of [forward, backward]) {
        if (branch.openCells.length === 0) {
          continue;
        }

        const [nearest] = branch.openCells;

        if (branch.closedByHit) {
          for (const cell of branch.openCells) {
            gaps.set(cell.key, cell);
          }
        } else if (aligned) {
          lineEnds.set(nearest.key, nearest);
        } else {
          neighbours.set(nearest.key, nearest);
        }
      }
    }
  }

  const tier = [gaps, lineEnds, neighbours].find((group) => group.size > 0) ?? new Map();

  return [...tier.values()].map(({ row, column }) => ({ row, column }));
}

/**
 * Untouched cells on the parity mask that no surviving ship can straddle.
 *
 * @param {Array<object>} shots
 * @returns {Array<{ row: number, column: number }>} All free cells when the mask is empty.
 */
export function getHuntTargets(shots) {
  const available = getAvailableTargets(shots);
  const sunk = getSunkShipIdsFromShots(shots);
  const smallest = Math.min(...FLEET.filter((ship) => !sunk.has(ship.id)).map((ship) => ship.size));

  if (!Number.isFinite(smallest) || smallest < 2) {
    return available;
  }

  const onMask = available.filter(({ row, column }) => (row + column) % smallest === 0);

  return onMask.length > 0 ? onMask : available;
}

/**
 * @param {Array<object>} shots
 * @param {() => number} [random]
 * @param {'easy' | 'hard'} [difficulty]
 * @returns {{ row: number, column: number } | null} Null when the board is exhausted.
 */
export function chooseTarget(shots, random = Math.random, difficulty = 'easy') {
  const available = getAvailableTargets(shots);

  if (available.length === 0) {
    return null;
  }

  if (difficulty !== 'hard') {
    return available[Math.floor(random() * available.length)];
  }

  const candidates = getTargetCandidates(shots);
  const pool = candidates.length > 0 ? candidates : getHuntTargets(shots);

  return pool[Math.floor(random() * pool.length)];
}
