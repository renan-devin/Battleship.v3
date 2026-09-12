/**
 * Game engine layer: pure logic, no DOM, no framework.
 *
 * Public entry point of the engine. Modules in this layer must stay free of
 * browser APIs so they can be unit tested in isolation.
 */

export { BOARD_SIZE, ORIENTATIONS, FLEET, getShipDefinition } from './constants.js';
export {
  buildOccupancyGrid,
  canPlaceShip,
  createEmptyBoard,
  getShipCells,
  isWithinBounds,
  placeShip,
  placeShipsRandomly,
  removeShip,
} from './placement.js';
export {
  fireAt,
  getFleetStatus,
  getShipHitCount,
  getSunkShipIds,
  hasBeenShot,
  isFleetDestroyed,
  isShipSunk,
} from './combat.js';
