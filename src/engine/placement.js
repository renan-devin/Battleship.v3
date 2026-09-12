/**
 * Ship placement rules: pure logic, no DOM, no framework.
 *
 * A placement is described by `{ shipId, row, column, orientation }` and a
 * board is simply the list of placements. Ships must stay inside the board and
 * must not overlap; touching ships, side by side or diagonally, are allowed.
 */

import { BOARD_SIZE, FLEET, ORIENTATIONS, getShipDefinition } from './constants.js';

/**
 * @returns {Array<Array<string|null>>} A BOARD_SIZE x BOARD_SIZE grid of nulls.
 */
export function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null));
}

/**
 * Cells a placement would occupy, regardless of whether they are valid.
 *
 * @param {{ shipId: string, row: number, column: number, orientation: string }} placement
 * @returns {Array<{ row: number, column: number }>}
 */
export function getShipCells(placement) {
  const definition = getShipDefinition(placement.shipId);

  if (!definition) {
    throw new Error(`Unknown ship: ${placement.shipId}`);
  }

  const horizontal = placement.orientation === ORIENTATIONS.horizontal;

  return Array.from({ length: definition.size }, (_, offset) => ({
    row: placement.row + (horizontal ? 0 : offset),
    column: placement.column + (horizontal ? offset : 0),
  }));
}

/**
 * @param {Array<{ row: number, column: number }>} cells
 * @returns {boolean} True when every cell is inside the board.
 */
export function isWithinBounds(cells) {
  return cells.every(
    ({ row, column }) =>
      Number.isInteger(row) &&
      Number.isInteger(column) &&
      row >= 0 &&
      row < BOARD_SIZE &&
      column >= 0 &&
      column < BOARD_SIZE,
  );
}

/**
 * Grid where each cell holds the id of the ship occupying it, or null.
 *
 * @param {Array<object>} placements
 * @returns {Array<Array<string|null>>}
 */
export function buildOccupancyGrid(placements) {
  const grid = createEmptyBoard();

  for (const placement of placements) {
    for (const { row, column } of getShipCells(placement)) {
      grid[row][column] = placement.shipId;
    }
  }

  return grid;
}

/**
 * Checks bounds, orientation and overlap. A ship never collides with itself,
 * so an already placed ship can be moved without removing it first.
 *
 * @param {Array<object>} placements - Placements already on the board.
 * @param {{ shipId: string, row: number, column: number, orientation: string }} placement
 * @returns {boolean}
 */
export function canPlaceShip(placements, placement) {
  if (!getShipDefinition(placement.shipId)) {
    return false;
  }

  if (!Object.values(ORIENTATIONS).includes(placement.orientation)) {
    return false;
  }

  const cells = getShipCells(placement);

  if (!isWithinBounds(cells)) {
    return false;
  }

  const others = placements.filter((existing) => existing.shipId !== placement.shipId);
  const grid = buildOccupancyGrid(others);

  return cells.every(({ row, column }) => grid[row][column] === null);
}

/**
 * @param {Array<object>} placements
 * @param {{ shipId: string, row: number, column: number, orientation: string }} placement
 * @returns {Array<object>} New list with the placement applied.
 * @throws {Error} When the placement breaks a rule.
 */
export function placeShip(placements, placement) {
  if (!canPlaceShip(placements, placement)) {
    throw new Error(`Invalid placement for ship: ${placement.shipId}`);
  }

  return [...removeShip(placements, placement.shipId), { ...placement }];
}

/**
 * @param {Array<object>} placements
 * @param {string} shipId
 * @returns {Array<object>} New list without the given ship.
 */
export function removeShip(placements, shipId) {
  return placements.filter((placement) => placement.shipId !== shipId);
}

const MAX_ATTEMPTS_PER_SHIP = 500;
const MAX_FLEET_ATTEMPTS = 50;

/**
 * Places the whole fleet at random, retrying until every ship fits.
 *
 * @param {() => number} [random] - Injectable random source, for tests.
 * @returns {Array<object>} A complete, valid fleet placement.
 * @throws {Error} When no valid fleet could be produced by the random source.
 */
export function placeShipsRandomly(random = Math.random) {
  const orientations = Object.values(ORIENTATIONS);

  for (let fleetAttempt = 0; fleetAttempt < MAX_FLEET_ATTEMPTS; fleetAttempt += 1) {
    let placements = [];

    for (const ship of FLEET) {
      let attempts = 0;

      while (attempts < MAX_ATTEMPTS_PER_SHIP) {
        attempts += 1;

        const candidate = {
          shipId: ship.id,
          row: Math.floor(random() * BOARD_SIZE),
          column: Math.floor(random() * BOARD_SIZE),
          orientation: orientations[Math.floor(random() * orientations.length)],
        };

        if (canPlaceShip(placements, candidate)) {
          placements = placeShip(placements, candidate);
          break;
        }
      }

      if (placements.length < FLEET.indexOf(ship) + 1) {
        placements = null;
        break;
      }
    }

    if (placements) {
      return placements;
    }
  }

  throw new Error('Could not place the fleet randomly');
}
