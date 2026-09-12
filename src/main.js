/**
 * Entry point: wires a full match between state, engine and DOM.
 *
 * Deployment happens on the left board, combat on the right one. The enemy
 * replies on its own after a short delay so the player can read the outcome.
 */

import {
  FLEET,
  ORIENTATIONS,
  canPlaceShip,
  getFleetStatus,
  getShipDefinition,
} from './engine/index.js';
import {
  createInitialState,
  fireAtEnemy,
  fireAtPlayer,
  isBattleActive,
  isGameOver,
  isPlacementComplete,
  placeSelectedShip,
  randomizePlacements,
  removePlacedShip,
  resetPlacements,
  selectShip,
  setDifficulty,
  startBattle,
  startNewGame,
  toggleOrientation,
} from './state/index.js';
import { clearState, loadState, saveState } from './state/persistence.js';
import {
  formatCoordinate,
  getPreviewCells,
  paintEnemyBoard,
  paintPlayerBoard,
  renderGrid,
} from './ui/board.js';
import { paintFleetRoster, renderFleetRoster } from './ui/fleet.js';

const ENEMY_TURN_DELAY_MS = 700;

const DIFFICULTY_LABELS = {
  easy: 'Easy opponent: random fire',
  hard: 'Hard opponent: hunts your fleet',
};

const RESUME_MESSAGES = {
  placement: 'Match resumed: your fleet is where you left it.',
  battle: 'Match resumed. Fire at the enemy waters.',
  victory: 'Match resumed: the enemy fleet was already destroyed.',
  defeat: 'Match resumed: your fleet was already lost.',
};

/**
 * @returns {Storage|null} The browser storage, or null when it is unavailable.
 */
function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function mount() {
  const playerBoard = document.querySelector('#player-board');
  const enemyBoard = document.querySelector('#enemy-board');
  const fleetRoster = document.querySelector('#fleet-roster');
  const enemyRoster = document.querySelector('#enemy-roster');
  const statusMessage = document.querySelector('#status-message');
  const turnIndicator = document.querySelector('#turn-indicator');
  const fleetHint = document.querySelector('#fleet-hint');
  const orientationButton = document.querySelector('#orientation');
  const randomButton = document.querySelector('#random');
  const resetButton = document.querySelector('#reset');
  const startButton = document.querySelector('#start-battle');
  const difficultySelect = document.querySelector('#difficulty');
  const difficultyBadge = document.querySelector('#difficulty-badge');
  const playerStrength = document.querySelector('#player-strength');
  const enemyStrength = document.querySelector('#enemy-strength');
  const resumeBadge = document.querySelector('#resume-badge');
  const result = document.querySelector('#result');
  const resultTitle = document.querySelector('#result-title');
  const resultDetail = document.querySelector('#result-detail');

  if (!playerBoard || !enemyBoard || !fleetRoster || !enemyRoster) {
    return;
  }

  const playerCells = renderGrid(playerBoard, 'Your waters');
  const enemyCells = renderGrid(enemyBoard, 'Enemy waters');
  const shipRows = renderFleetRoster(fleetRoster);
  const enemyShipRows = renderFleetRoster(enemyRoster, { interactive: false });

  const storage = getStorage();
  const restored = loadState(storage);

  let state = restored ?? createInitialState();
  let hoveredCell = null;
  let enemyTurnTimer = null;
  let resumed = restored !== null;

  function announce(message) {
    if (statusMessage) {
      statusMessage.textContent = message;
    }
  }

  function currentPreview() {
    if (state.phase !== 'placement' || !hoveredCell || !state.selectedShipId) {
      return undefined;
    }

    const placement = {
      shipId: state.selectedShipId,
      row: hoveredCell.row,
      column: hoveredCell.column,
      orientation: state.orientation,
    };

    return {
      cells: getPreviewCells(placement),
      valid: canPlaceShip(state.placements, placement),
    };
  }

  function renderControls() {
    const placing = state.phase === 'placement';

    if (orientationButton) {
      const horizontal = state.orientation === ORIENTATIONS.horizontal;
      orientationButton.textContent = `Orientation: ${horizontal ? 'Horizontal' : 'Vertical'}`;
      orientationButton.setAttribute('aria-pressed', String(!horizontal));
      orientationButton.disabled = !placing;
    }

    if (randomButton) {
      randomButton.disabled = !placing;
    }

    if (resetButton) {
      resetButton.disabled = !placing;
    }

    if (startButton) {
      startButton.disabled = !placing || !isPlacementComplete(state);
      startButton.hidden = !placing;
    }

    if (difficultySelect) {
      difficultySelect.disabled = !placing;
      difficultySelect.value = state.difficulty;
    }

    if (difficultyBadge) {
      difficultyBadge.dataset.difficulty = state.difficulty;
      difficultyBadge.textContent = DIFFICULTY_LABELS[state.difficulty];
    }

    if (fleetHint) {
      fleetHint.hidden = !placing;
    }

    if (resumeBadge) {
      resumeBadge.hidden = !resumed;
    }
  }

  function renderStrength() {
    const placing = state.phase === 'placement';

    if (playerStrength) {
      const status = getFleetStatus(state.placements, state.enemyShots);
      playerStrength.textContent = placing
        ? `${state.placements.length}/${FLEET.length} deployed`
        : `${status.afloat}/${status.total} afloat`;
      playerStrength.dataset.critical = String(!placing && status.afloat <= 1);
    }

    if (enemyStrength) {
      const status = getFleetStatus(state.enemyPlacements, state.playerShots);
      enemyStrength.textContent = placing
        ? 'Awaiting deployment'
        : `${status.afloat}/${status.total} afloat`;
      enemyStrength.dataset.critical = String(!placing && status.afloat <= 1);
    }
  }

  function renderTurn() {
    if (!turnIndicator) {
      return;
    }

    const labels = {
      placement: 'Deployment',
      battle: state.turn === 'player' ? 'Your turn' : 'Enemy turn',
      victory: 'Victory',
      defeat: 'Defeat',
    };

    turnIndicator.textContent = labels[state.phase];
    turnIndicator.dataset.phase = state.phase;
    turnIndicator.dataset.turn = state.turn ?? '';
  }

  /** Highlights the board that is under fire so the turn is readable at a glance. */
  function renderPanelFocus() {
    const active = isBattleActive(state) ? state.turn : null;

    playerBoard.closest('.panel')?.toggleAttribute('data-engaged', active === 'enemy');
    enemyBoard.closest('.panel')?.toggleAttribute('data-engaged', active === 'player');
  }

  function renderResult() {
    if (!result) {
      return;
    }

    const wasHidden = result.hidden;
    result.hidden = !isGameOver(state);

    if (!isGameOver(state)) {
      return;
    }

    if (wasHidden) {
      document.querySelector('#result-restart')?.focus();
    }

    const victory = state.phase === 'victory';
    result.dataset.outcome = victory ? 'victory' : 'defeat';
    resultTitle.textContent = victory ? 'Enemy fleet destroyed' : 'Your fleet is lost';
    resultDetail.textContent = victory
      ? `You sank every enemy ship in ${state.playerShots.length} shots.`
      : `The enemy sank your fleet in ${state.enemyShots.length} shots.`;
  }

  function render() {
    const placing = state.phase === 'placement';

    paintPlayerBoard(playerCells, state.placements, {
      preview: currentPreview(),
      shots: state.enemyShots,
      lastShot: state.lastShot,
    });
    paintEnemyBoard(
      enemyCells,
      state.enemyPlacements,
      state.playerShots,
      isBattleActive(state),
      state.lastShot,
    );
    paintFleetRoster(shipRows, {
      placements: state.placements,
      shots: state.enemyShots,
      selectedShipId: state.selectedShipId,
      showPlacement: placing,
    });
    paintFleetRoster(enemyShipRows, {
      placements: state.enemyPlacements,
      shots: state.playerShots,
      conceal: state.difficulty === 'hard',
    });

    renderControls();
    renderStrength();
    renderTurn();
    renderPanelFocus();
    renderResult();
  }

  function update(nextState, message, { keepResumeBadge = false, persist = true } = {}) {
    state = nextState;
    resumed = resumed && keepResumeBadge;

    if (persist) {
      saveState(storage, state);
    }

    render();

    if (message) {
      announce(message);
    }
  }

  function describeShot(shot) {
    const coordinate = formatCoordinate(shot.row, shot.column);
    const attacker = shot.by === 'player' ? 'You' : 'The enemy';

    if (shot.sunkShipId) {
      const owner = shot.by === 'player' ? 'the enemy' : 'your';
      return `${attacker} sank ${owner} ${getShipDefinition(shot.sunkShipId).name} at ${coordinate}.`;
    }

    return `${attacker} ${shot.result === 'hit' ? 'hit' : 'missed'} at ${coordinate}.`;
  }

  function scheduleEnemyTurn() {
    clearTimeout(enemyTurnTimer);
    enemyTurnTimer = setTimeout(() => {
      const nextState = fireAtPlayer(state);

      if (nextState === state) {
        return;
      }

      update(nextState, describeShot(nextState.lastShot), { keepResumeBadge: true });
    }, ENEMY_TURN_DELAY_MS);
  }

  function handlePlacementClick(row, column, shipId) {
    if (shipId) {
      const definition = getShipDefinition(shipId);
      update(removePlacedShip(state, shipId), `${definition.name} removed. Place it again.`);
      return;
    }

    if (!state.selectedShipId) {
      announce('All ships are placed. Click a ship on the board to move it, or start the battle.');
      return;
    }

    const definition = getShipDefinition(state.selectedShipId);
    const nextState = placeSelectedShip(state, { row, column });

    if (nextState === state) {
      announce(`${definition.name} does not fit at ${formatCoordinate(row, column)}.`);
      return;
    }

    const message = isPlacementComplete(nextState)
      ? 'Fleet ready. Start the battle when you are.'
      : `${definition.name} placed at ${formatCoordinate(row, column)}.`;

    update(nextState, message);
  }

  playerBoard.addEventListener('click', (event) => {
    const cell = event.target.closest('.cell');

    if (!cell || state.phase !== 'placement') {
      return;
    }

    handlePlacementClick(
      Number(cell.dataset.row),
      Number(cell.dataset.column),
      cell.dataset.shipId,
    );
  });

  enemyBoard.addEventListener('click', (event) => {
    const cell = event.target.closest('.cell');

    if (!cell || !isBattleActive(state)) {
      return;
    }

    if (state.turn !== 'player') {
      announce('Hold fire: the enemy is taking its turn.');
      return;
    }

    const target = { row: Number(cell.dataset.row), column: Number(cell.dataset.column) };
    const nextState = fireAtEnemy(state, target);

    if (nextState === state) {
      announce(`You already fired at ${formatCoordinate(target.row, target.column)}.`);
      return;
    }

    update(nextState, describeShot(nextState.lastShot));

    if (isBattleActive(nextState)) {
      scheduleEnemyTurn();
    }
  });

  function trackHover(event) {
    const cell = event.target.closest('.cell');

    if (cell) {
      hoveredCell = { row: Number(cell.dataset.row), column: Number(cell.dataset.column) };
      render();
    }
  }

  playerBoard.addEventListener('pointerover', trackHover);
  playerBoard.addEventListener('focusin', trackHover);

  playerBoard.addEventListener('pointerleave', () => {
    hoveredCell = null;
    render();
  });

  fleetRoster.addEventListener('click', (event) => {
    const button = event.target.closest('.ship');

    if (!button || state.phase !== 'placement') {
      return;
    }

    const shipId = button.dataset.shipId;
    const definition = getShipDefinition(shipId);
    const placed = state.placements.some((placement) => placement.shipId === shipId);
    const nextState = placed ? removePlacedShip(state, shipId) : selectShip(state, shipId);

    update(
      nextState,
      placed
        ? `${definition.name} removed. Place it again.`
        : `${definition.name} selected. Choose a cell on your board.`,
    );
  });

  function rotate() {
    if (state.phase !== 'placement') {
      return;
    }

    const nextState = toggleOrientation(state);
    const horizontal = nextState.orientation === ORIENTATIONS.horizontal;
    update(nextState, `Orientation set to ${horizontal ? 'horizontal' : 'vertical'}.`);
  }

  orientationButton?.addEventListener('click', rotate);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'r' && event.key !== 'R') {
      return;
    }

    const target = event.target;

    if (target instanceof HTMLSelectElement || target instanceof HTMLInputElement) {
      return;
    }

    rotate();
  });

  randomButton?.addEventListener('click', () => {
    update(randomizePlacements(state), 'Fleet placed randomly. Start the battle when you are.');
  });

  resetButton?.addEventListener('click', () => {
    update(resetPlacements(state), 'Board cleared. Place your fleet.');
  });

  startButton?.addEventListener('click', () => {
    const nextState = startBattle(state);

    if (nextState === state) {
      announce('Place your whole fleet before starting the battle.');
      return;
    }

    update(nextState, 'Battle stations. Fire at the enemy waters.');
  });

  function newGame() {
    clearTimeout(enemyTurnTimer);
    clearState(storage);
    update(startNewGame(state), 'New game. Place your fleet.', { persist: false });
  }

  document.querySelector('#new-game')?.addEventListener('click', newGame);
  document.querySelector('#result-restart')?.addEventListener('click', newGame);

  difficultySelect?.addEventListener('change', (event) => {
    const nextState = setDifficulty(state, event.target.value);

    if (nextState === state) {
      render();
      return;
    }

    update(nextState, `${DIFFICULTY_LABELS[nextState.difficulty]}.`);
  });

  render();

  if (resumed) {
    announce(RESUME_MESSAGES[state.phase]);

    if (isBattleActive(state) && state.turn === 'enemy') {
      scheduleEnemyTurn();
    }
  } else {
    announce('Place your fleet: select a ship, press R to rotate and click a cell.');
  }
}

mount();
