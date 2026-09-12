/**
 * Engine constants: pure logic, no DOM, no framework.
 */

export const BOARD_SIZE = 10;

export const ORIENTATIONS = Object.freeze({
  horizontal: 'horizontal',
  vertical: 'vertical',
});

/**
 * Classic Battleship fleet, from largest to smallest.
 */
export const FLEET = Object.freeze([
  Object.freeze({ id: 'carrier', name: 'Carrier', size: 5 }),
  Object.freeze({ id: 'battleship', name: 'Battleship', size: 4 }),
  Object.freeze({ id: 'cruiser', name: 'Cruiser', size: 3 }),
  Object.freeze({ id: 'submarine', name: 'Submarine', size: 3 }),
  Object.freeze({ id: 'destroyer', name: 'Destroyer', size: 2 }),
]);

/**
 * @param {string} shipId
 * @returns {{ id: string, name: string, size: number } | undefined}
 */
export function getShipDefinition(shipId) {
  return FLEET.find((ship) => ship.id === shipId);
}
