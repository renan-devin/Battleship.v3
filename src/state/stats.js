/**
 * Match statistics against the AI: pure logic, no DOM, no framework.
 *
 * The history is a list of entries, one per finished match, each tied to the
 * profile that played it. It is stored as a versioned JSON envelope and read
 * defensively; entries that do not describe a match the game could have
 * produced are dropped one by one, so a single bad record never wipes the rest.
 */

import { DIFFICULTIES } from '../ai/index.js';
import { BOARD_SIZE, FLEET } from '../engine/index.js';
import { isGameOver } from './index.js';

export const STATS_STORAGE_KEY = 'battleship.v3.stats';
export const STATS_VERSION = 1;

const OUTCOMES = ['victory', 'defeat'];
const MIN_WINNING_SHOTS = FLEET.reduce((total, ship) => total + ship.size, 0);
const MAX_SHOTS = BOARD_SIZE * BOARD_SIZE;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @returns {object[]} An empty history.
 */
export function createEmptyStats() {
  return [];
}

/**
 * Builds the entry describing a finished match.
 *
 * @param {object} state A state in the 'victory' or 'defeat' phase.
 * @param {{ profileId: string, profileName?: string, playedAt?: number }} options
 * @returns {object|null} The entry, or null when the match is not over.
 */
export function createMatchRecord(state, { profileId, profileName, playedAt = Date.now() }) {
  if (!isGameOver(state) || typeof profileId !== 'string' || profileId.length === 0) {
    return null;
  }

  return {
    profileId,
    ...(typeof profileName === 'string' && profileName.length > 0 ? { profileName } : {}),
    outcome: state.phase,
    difficulty: state.difficulty,
    shots: state.playerShots.length,
    playedAt,
  };
}

/**
 * @param {object[]} stats
 * @param {object|null} record
 * @returns {object[]} A new history with the record appended, or the input when it is null.
 */
export function recordMatch(stats, record) {
  return record ? [...stats, record] : stats;
}

/**
 * @param {unknown} value
 * @returns {object|null} A valid entry, or null.
 */
export function parseMatchRecord(value) {
  if (!isRecord(value)) {
    return null;
  }

  const { profileId, profileName, outcome, difficulty, shots, playedAt } = value;

  if (typeof profileId !== 'string' || profileId.length === 0) {
    return null;
  }

  if (profileName !== undefined && (typeof profileName !== 'string' || profileName.length === 0)) {
    return null;
  }

  if (!OUTCOMES.includes(outcome) || !DIFFICULTIES.includes(difficulty)) {
    return null;
  }

  if (!Number.isInteger(shots) || shots < 0 || shots > MAX_SHOTS) {
    return null;
  }

  if (outcome === 'victory' && shots < MIN_WINNING_SHOTS) {
    return null;
  }

  if (!Number.isFinite(playedAt) || playedAt < 0) {
    return null;
  }

  return {
    profileId,
    ...(profileName !== undefined ? { profileName } : {}),
    outcome,
    difficulty,
    shots,
    playedAt,
  };
}

/**
 * @param {unknown} payload
 * @returns {object[]|null} The valid entries, or null when the envelope is unusable.
 */
export function parseSavedStats(payload) {
  if (!isRecord(payload) || payload.version !== STATS_VERSION || !Array.isArray(payload.matches)) {
    return null;
  }

  return payload.matches.map(parseMatchRecord).filter((record) => record !== null);
}

/**
 * @param {object[]} stats
 * @returns {string} The versioned JSON envelope written to storage.
 */
export function serializeStats(stats) {
  return JSON.stringify({ version: STATS_VERSION, matches: stats });
}

/**
 * @param {Storage} [storage]
 * @param {object[]} stats
 * @returns {boolean} False when the history could not be written.
 */
export function saveStats(storage, stats) {
  if (!storage || !Array.isArray(stats)) {
    return false;
  }

  try {
    storage.setItem(STATS_STORAGE_KEY, serializeStats(stats));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Storage} [storage]
 * @returns {object[]} The saved history, empty when there is none or it is unreadable.
 */
export function loadStats(storage) {
  if (!storage) {
    return createEmptyStats();
  }

  let payload;

  try {
    const raw = storage.getItem(STATS_STORAGE_KEY);

    if (!raw) {
      return createEmptyStats();
    }

    payload = JSON.parse(raw);
  } catch {
    clearStats(storage);
    return createEmptyStats();
  }

  const stats = parseSavedStats(payload);

  if (!stats) {
    clearStats(storage);
    return createEmptyStats();
  }

  return stats;
}

/**
 * @param {Storage} [storage]
 * @returns {void}
 */
export function clearStats(storage) {
  try {
    storage?.removeItem(STATS_STORAGE_KEY);
  } catch {
    // A storage that refuses writes leaves nothing to clean up.
  }
}

/**
 * Aggregates the history of one profile.
 *
 * @param {object[]} stats
 * @param {string} profileId
 * @param {{ difficulty?: string }} [filter]
 * @returns {{ profileId: string, played: number, victories: number, defeats: number,
 *   bestShots: number|null, averageShots: number|null }}
 */
export function summarizeProfile(stats, profileId, { difficulty } = {}) {
  const matches = stats.filter(
    (record) =>
      record.profileId === profileId &&
      (difficulty === undefined || record.difficulty === difficulty),
  );
  const victories = matches.filter((record) => record.outcome === 'victory');
  const totalShots = victories.reduce((total, record) => total + record.shots, 0);

  return {
    profileId,
    played: matches.length,
    victories: victories.length,
    defeats: matches.length - victories.length,
    bestShots: victories.length ? Math.min(...victories.map((record) => record.shots)) : null,
    averageShots: victories.length ? totalShots / victories.length : null,
  };
}

/**
 * Ranks every profile in the history: most victories first, then the lowest
 * average number of shots per victory, then the fewest shots in a single
 * victory, then the fewest defeats.
 *
 * @param {object[]} stats
 * Names come from `names` first, then from the most recent record that carries one.
 *
 * @param {{ difficulty?: string, names?: Record<string, string> }} [options]
 * @returns {object[]} Summaries ordered from best to worst, with a 1-based `rank`.
 */
export function rankProfiles(stats, { difficulty, names = {} } = {}) {
  const profileIds = [...new Set(stats.map((record) => record.profileId))];
  const recordedNames = new Map();

  for (const record of stats) {
    if (record.profileName) {
      recordedNames.set(record.profileId, record.profileName);
    }
  }

  return profileIds
    .map((profileId) => ({
      ...summarizeProfile(stats, profileId, { difficulty }),
      name: names[profileId] ?? recordedNames.get(profileId) ?? null,
    }))
    .filter((summary) => summary.played > 0)
    .sort(compareSummaries)
    .map((summary, index) => ({ ...summary, rank: index + 1 }));
}

function compareSummaries(left, right) {
  if (left.victories !== right.victories) {
    return right.victories - left.victories;
  }

  const leftAverage = left.averageShots ?? Infinity;
  const rightAverage = right.averageShots ?? Infinity;

  if (leftAverage !== rightAverage) {
    return leftAverage - rightAverage;
  }

  const leftBest = left.bestShots ?? Infinity;
  const rightBest = right.bestShots ?? Infinity;

  if (leftBest !== rightBest) {
    return leftBest - rightBest;
  }

  if (left.defeats !== right.defeats) {
    return left.defeats - right.defeats;
  }

  return left.profileId.localeCompare(right.profileId);
}
