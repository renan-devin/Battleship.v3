# Debugging report

Running log of real bugs found while building the game, how they were detected and
how they were fixed. One section per phase.

## Phase 2 - placement engine and UI

### 1. `placeShipsRandomly` could recurse forever

- **Symptom:** the first implementation restarted itself with a recursive call after 500
  failed attempts for a single ship. With a deterministic random source (for example a test
  stub always returning the same value) no ship ever fits, so the function called itself
  endlessly and would blow the stack or hang the browser tab.
- **Detection:** review of the retry path while writing the unit test that injects a fixed
  random source.
- **Fix:** replaced the recursion with a bounded outer loop (`MAX_FLEET_ATTEMPTS`) that
  throws `Could not place the fleet randomly` when the random source cannot produce a valid
  fleet. Covered by `placeShipsRandomly > gives up instead of looping forever on a
degenerate random source`.

### 2. Moving an already placed ship reported a false overlap

- **Symptom:** re-placing a ship one cell to the side was rejected, because the ship
  collided with its own previous position.
- **Detection:** unit test `canPlaceShip > ignores the ship being moved when checking
overlap`.
- **Fix:** `canPlaceShip` filters out any existing placement with the same `shipId` before
  building the occupancy grid, so a ship never collides with itself.

### 3. Test suite imported constants from the wrong module

- **Symptom:** `TypeError: Cannot read properties of undefined (reading 'reduce')` in 15
  tests.
- **Detection:** `npm test`.
- **Fix:** `tests/placement.test.js` imported `BOARD_SIZE`, `FLEET` and `ORIENTATIONS` from
  `src/engine/placement.js`, which does not re-export them; the imports now come from
  `src/engine/constants.js`.

### 4. Invalid CSS custom property value

- **Symptom:** `--color-water-hover` was written as `#1f5float`, which is not a color, so
  the cell hover state silently fell back to the previous value.
- **Detection:** re-reading the design tokens after adding them.
- **Fix:** corrected the token to `#1f5b82` and used it in the `.cell:hover` rule.

## Phase 3 - combat

### 1. `fireAt` crashed on targets outside the board

- **Symptom:** `fireAt` indexed the occupancy grid directly, so a target such as
  `{ row: 10, column: 0 }` or `{ row: 1.5, column: 0 }` threw a `TypeError` instead of being
  rejected. Reachable from any caller that does not pre-validate coordinates.
- **Detection:** code review of the new engine module before wiring it to the UI.
- **Fix:** `fireAt` validates the target with `isWithinBounds` and returns
  `result: 'invalid'` with the shot history untouched; `fireAtEnemy` only accepts `hit` and
  `miss` outcomes. Covered by `fireAt > rejects targets outside the board instead of
crashing` and `fireAtEnemy > ignores targets outside the board`.

### 2. Disabling cells during the enemy turn dropped keyboard focus

- **Symptom:** the first wiring disabled the whole enemy board while the AI was firing and
  the player board during the battle. A disabled button loses focus, so a keyboard player was
  thrown back to the top of the document every turn and could not review their own board.
- **Detection:** keyboard walkthrough of the combat loop.
- **Fix:** cells stay focusable; only the enemy board outside the battle is disabled.
  Out-of-turn clicks are ignored and announced in the `aria-live` region instead.

### 3. Firing with the keyboard dropped focus on the fired cell

- **Symptom:** the cell that had just been fired at was re-rendered with the `disabled`
  attribute, so after every `Enter`/`Space` shot the browser moved focus to `<body>` and a
  keyboard player had to tab in from the top of the page again.
- **Detection:** end-to-end keyboard run of a full match (`document.activeElement` was `BODY`
  right after firing).
- **Fix:** already fired cells now use `aria-disabled="true"` instead of `disabled`, so they
  keep focus; repeated shots are rejected by the state layer and announced as `You already
fired at C4.`

### 4. Damage pips stayed green for placed ships

- **Symptom:** `.ship--placed .ship__pip` outranked `.ship__pip--hit`, so both rosters kept
  every pip green and the damage taken by a ship was invisible.
- **Detection:** code review of the roster styles.
- **Fix:** the hit rule is scoped to `.ship .ship__pip--hit` so it wins the specificity tie.

### 5. `resetPlacements` erased an active match

- **Symptom:** `resetPlacements` delegated to `startNewGame` unconditionally, so calling it
  during a battle silently discarded the match instead of being ignored like the other
  placement-only actions.
- **Detection:** code review of the placement guards added for the battle phase.
- **Fix:** `resetPlacements` returns the state untouched outside the `placement` phase.
  Covered by `placement actions during the battle > are ignored`.

### 6. Board layers painted over the end-of-match overlay

- **Symptom:** on victory or defeat the battle report card was cut into stripes: wherever a
  board overlapped it, the cells, hull layers and shot markers were drawn on top of the card,
  hiding its background and part of its title.
- **Detection:** browser check of the victory screen at 1440px during the phase 7 polish.
- **Fix:** the board layers use `z-index` values (hulls, markers, focus) inside a `.panel`
  that was not a stacking context, so they competed with the overlay in the root stacking
  context. `.panel` now sets `isolation: isolate` and `.result` sits at `z-index: 20`.
