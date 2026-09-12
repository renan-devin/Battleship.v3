/**
 * UI layer: original top-down ship silhouettes drawn as inline SVG.
 *
 * Every shape is built here from the ship length, so a hull always spans
 * exactly the cells it occupies and no external asset is needed. Shapes are
 * authored bow-to-the-right and rotated for vertical placements, which keeps
 * the aspect ratio intact in both orientations.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const UNIT = 24;
const MID = UNIT / 2;

/**
 * @param {string} shipId
 * @param {number} size - Ship length in cells.
 * @param {{ orientation?: string, className?: string }} [options]
 * @returns {SVGElement} A decorative silhouette, hidden from assistive tech.
 */
export function createShipSilhouette(shipId, size, options = {}) {
  const { orientation = 'horizontal', className = 'ship-shape' } = options;
  const length = size * UNIT;
  const vertical = orientation === 'vertical';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', vertical ? `0 0 ${UNIT} ${length}` : `0 0 ${length} ${UNIT}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.setProperty('--ship-length', String(size));

  const group = element('g', vertical ? { transform: `translate(${UNIT} 0) rotate(90)` } : {});
  group.append(...(SHAPES[shipId] ?? SHAPES.destroyer)(length), damage(length));
  svg.append(group);

  return svg;
}

const SHAPES = {
  carrier: buildCarrier,
  battleship: buildBattleship,
  cruiser: buildCruiser,
  submarine: buildSubmarine,
  destroyer: buildDestroyer,
};

/** Carrier: full flight deck, deck markings, aircraft and a starboard island. */
function buildCarrier(length) {
  const beam = 10.8;
  const bow = length * 0.12;

  return [
    hullPath('hull', 1.2, length - 1.2, beam, bow, bow * 0.8),
    hullPath('flightdeck', 2.6, length - 2.6, beam - 1.6, bow * 0.8, bow * 0.7),
    line(`M ${bow} ${MID} H ${length - bow}`, 'line--dashed'),
    line(`M ${bow * 0.8} ${MID - 7.8} H ${length - bow}`),
    line(`M ${bow * 0.8} ${MID + 7.8} H ${length - bow}`),
    ...plane(length * 0.22, MID - 4.6),
    ...plane(length * 0.4, MID + 4.6),
    ...plane(length * 0.55, MID - 4.6),
    ...plane(length * 0.8, MID + 4.6),
    rect('tower', length * 0.58, MID + 5, length * 0.11, 5.8, 1.2),
    rect('funnel', length * 0.62, MID + 6.2, length * 0.035, 3.4, 0.8),
    line(`M ${length * 0.67} ${MID + 5.2} V ${MID + 10.4}`),
    rect('detail', length * 0.12, MID + 8.6, length * 0.05, 2.4, 0.8),
    rect('detail', length * 0.88, MID - 11, length * 0.05, 2.4, 0.8),
  ];
}

/** Battleship: heavy hull, three twin turrets, bridge tower and two funnels. */
function buildBattleship(length) {
  const beam = 9.4;

  return [
    ...warshipHull(length, beam),
    ...mainTurret(length * 0.2, 3.4, 1),
    ...mainTurret(length * 0.33, 3.4, 1),
    ...mainTurret(length * 0.83, 3.2, -1),
    rect('tower', length * 0.41, MID - 5.4, length * 0.09, 10.8, 1.6),
    rect('tower', length * 0.43, MID - 3.4, length * 0.05, 6.8, 1.2),
    ...mast(length * 0.46),
    ...funnel(length * 0.55, 3.3),
    ...funnel(length * 0.65, 3),
    rect('detail', length * 0.72, MID - 4.4, length * 0.05, 8.8, 1.4),
    ...secondaries(length, [0.5, 0.6, 0.71], beam - 3.4),
    ...boats(length, [0.62, 0.68], beam - 2.2),
  ];
}

/** Cruiser: leaner hull, two turrets, single funnel and a slim bridge. */
function buildCruiser(length) {
  const beam = 8.2;

  return [
    ...warshipHull(length, beam),
    ...mainTurret(length * 0.24, 3, 1),
    ...mainTurret(length * 0.81, 2.8, -1),
    rect('tower', length * 0.41, MID - 4.6, length * 0.11, 9.2, 1.6),
    rect('tower', length * 0.44, MID - 2.8, length * 0.06, 5.6, 1.2),
    ...mast(length * 0.48),
    ...funnel(length * 0.61, 3),
    rect('detail', length * 0.69, MID - 3.6, length * 0.06, 7.2, 1.2),
    ...secondaries(length, [0.55, 0.7], beam - 3),
    ...boats(length, [0.66], beam - 2),
  ];
}

/** Submarine: pressure hull, conning tower with periscopes, planes and screw. */
function buildSubmarine(length) {
  const beam = 6.6;
  const nose = length * 0.12;

  return [
    path(
      'hull',
      `M ${length - 1.5} ${MID}
       C ${length - 1.5} ${MID - beam * 0.8} ${length - nose} ${MID - beam} ${length - nose * 1.5} ${MID - beam}
       L ${length * 0.34} ${MID - beam}
       C ${length * 0.17} ${MID - beam * 0.85} ${length * 0.05} ${MID - beam * 0.3} 2.2 ${MID}
       C ${length * 0.05} ${MID + beam * 0.3} ${length * 0.17} ${MID + beam * 0.85} ${length * 0.34} ${MID + beam}
       L ${length - nose * 1.5} ${MID + beam}
       C ${length - nose} ${MID + beam} ${length - 1.5} ${MID + beam * 0.8} ${length - 1.5} ${MID} Z`,
    ),
    rect('fin', length * 0.6, MID - 8.4, length * 0.06, 2.8, 0.8),
    rect('fin', length * 0.6, MID + 5.6, length * 0.06, 2.8, 0.8),
    rect('fin', length * 0.07, MID - 7.6, length * 0.06, 2.6, 0.8),
    rect('fin', length * 0.07, MID + 5, length * 0.06, 2.6, 0.8),
    line(`M ${length * 0.05} ${MID - 5.4} V ${MID + 5.4}`),
    dot(2.6, MID, 1.1),
    rect('tower', length * 0.42, MID - 3.2, length * 0.14, 6.4, 2.4),
    rect('detail', length * 0.46, MID - 1.6, length * 0.05, 3.2, 1),
    line(`M ${length * 0.5} ${MID - 5} V ${MID + 5}`),
    line(`M ${length * 0.14} ${MID} H ${length - nose * 1.2}`, 'line--dashed'),
    dot(length * 0.68, MID, 1),
    dot(length * 0.3, MID, 1),
  ];
}

/** Destroyer: compact hull, one forward turret, funnel and stern racks. */
function buildDestroyer(length) {
  const beam = 7;

  return [
    ...warshipHull(length, beam),
    ...mainTurret(length * 0.28, 2.8, 1),
    rect('tower', length * 0.44, MID - 4, length * 0.14, 8, 1.6),
    ...mast(length * 0.52),
    ...funnel(length * 0.64, 2.8),
    rect('detail', length * 0.76, MID - 3, length * 0.08, 6, 1.2),
    ...secondaries(length, [0.72], beam - 2.8),
    rect('detail', length * 0.06, MID - 3.4, length * 0.05, 2.6, 0.8),
    rect('detail', length * 0.06, MID + 0.8, length * 0.05, 2.6, 0.8),
  ];
}

/** Surface warship body: hull, planked deck and deck edge lines. */
function warshipHull(length, beam) {
  const bow = Math.min(22, length * 0.3);
  const stern = Math.min(12, length * 0.2);

  return [
    hullPath('hull', 1.4, length - 1, beam, bow, stern),
    hullPath('deck', 3.4, length - 4.5, beam - 1.9, bow * 0.85, stern * 0.8),
    line(`M ${stern} ${MID - beam + 3.6} H ${length - bow * 0.9}`),
    line(`M ${stern} ${MID + beam - 3.6} H ${length - bow * 0.9}`),
  ];
}

/**
 * Hull outline with a raked bow to the right and a tapered stern to the left.
 *
 * @param {string} part - Class suffix, so hull and deck share the geometry.
 */
function hullPath(part, x0, x1, beam, bow, stern) {
  return path(
    part,
    `M ${x1} ${MID}
     C ${x1 - bow * 0.35} ${MID - beam * 0.6} ${x1 - bow * 0.8} ${MID - beam} ${x1 - bow} ${MID - beam}
     L ${x0 + stern} ${MID - beam}
     C ${x0 + stern * 0.35} ${MID - beam} ${x0} ${MID - beam * 0.6} ${x0} ${MID}
     C ${x0} ${MID + beam * 0.6} ${x0 + stern * 0.35} ${MID + beam} ${x0 + stern} ${MID + beam}
     L ${x1 - bow} ${MID + beam}
     C ${x1 - bow * 0.8} ${MID + beam} ${x1 - bow * 0.35} ${MID + beam * 0.6} ${x1} ${MID} Z`,
  );
}

/** Twin main turret: barbette, gunhouse and two barrels facing `direction`. */
function mainTurret(x, radius, direction) {
  const barrel = radius * 2.2;
  const root = direction > 0 ? x + radius * 0.4 : x - radius * 0.4 - barrel;

  return [
    element('circle', {
      class: 'ship-shape__turret',
      cx: String(x),
      cy: String(MID),
      r: String(radius),
    }),
    rect('barrel', root, MID - radius * 0.62, barrel, 1.1, 0.5),
    rect('barrel', root, MID + radius * 0.62 - 1.1, barrel, 1.1, 0.5),
    rect('gunhouse', x - radius * 0.7, MID - radius * 0.62, radius * 1.4, radius * 1.24, 0.8),
  ];
}

/** Funnel with its cap band. */
function funnel(x, radius) {
  return [
    rect('funnel', x - radius * 0.6, MID - radius, radius * 1.2, radius * 2, radius * 0.5),
    rect('detail', x - radius * 0.3, MID - radius * 0.5, radius * 0.6, radius, radius * 0.3),
  ];
}

/** Lattice mast: pole plus yardarm. */
function mast(x) {
  return [line(`M ${x} ${MID - 6.4} V ${MID + 6.4}`), line(`M ${x - 1.6} ${MID} H ${x + 1.6}`)];
}

/** Secondary mounts mirrored along both sides of the deck. */
function secondaries(length, positions, offset) {
  return positions.flatMap((ratio) => [
    dot(length * ratio, MID - offset, 1.3),
    dot(length * ratio, MID + offset, 1.3),
  ]);
}

/** Ship's boats stowed amidships on both sides. */
function boats(length, positions, offset) {
  return positions.flatMap((ratio) => [
    rect('detail', length * ratio, MID - offset - 1, length * 0.035, 2, 0.9),
    rect('detail', length * ratio, MID + offset - 1, length * 0.035, 2, 0.9),
  ]);
}

/**
 * Battle damage revealed only once the ship is sunk: soot smudges along the
 * hull plus two fires. Kept in one group so CSS can toggle the whole layer.
 */
function damage(length) {
  const group = element('g', { class: 'ship-shape__damage' });

  group.append(
    scorch(length * 0.22, MID - 1.6, 4.6, 3.4),
    scorch(length * 0.52, MID + 1.8, 5.4, 3.8),
    scorch(length * 0.82, MID - 1, 4.2, 3.2),
    ...flame(length * 0.34, MID, 3.4),
    ...flame(length * 0.68, MID, 2.8),
  );

  return group;
}

function scorch(x, y, rx, ry) {
  return element('ellipse', {
    class: 'ship-shape__scorch',
    cx: String(x),
    cy: String(y),
    rx: String(rx),
    ry: String(ry),
  });
}

/** Burning breach: radial so it reads the same in both orientations. */
function flame(x, y, size) {
  return [
    element('circle', {
      class: 'ship-shape__fire',
      cx: String(x),
      cy: String(y),
      r: String(size),
    }),
    element('circle', {
      class: 'ship-shape__fire-core',
      cx: String(x),
      cy: String(y),
      r: String(size * 0.5),
    }),
  ];
}

/** Parked aircraft: fuselage, wings and tailplane. */
function plane(x, y) {
  return [
    rect('plane', x - 3, y - 0.8, 6.4, 1.6, 0.7),
    rect('plane', x - 0.7, y - 3.4, 1.5, 6.8, 0.6),
    rect('plane', x - 2.8, y - 1.9, 1.2, 3.8, 0.5),
  ];
}

function dot(x, y, radius) {
  return element('circle', {
    class: 'ship-shape__mount',
    cx: String(x),
    cy: String(y),
    r: String(radius),
  });
}

function rect(part, x, y, width, height, radius) {
  return element('rect', {
    class: `ship-shape__${part}`,
    x: String(x),
    y: String(y),
    width: String(width),
    height: String(height),
    rx: String(radius),
  });
}

function line(d, modifier = '') {
  const node = path('line', d);

  if (modifier) {
    node.setAttribute('class', `ship-shape__line ship-shape__${modifier}`);
  }

  return node;
}

function path(part, d) {
  return element('path', { class: `ship-shape__${part}`, d: d.replace(/\s+/g, ' ') });
}

function element(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);

  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }

  return node;
}
