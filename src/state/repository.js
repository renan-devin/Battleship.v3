/**
 * Data-source boundary for the profile and the statistics: pure logic, no DOM.
 *
 * The game only talks to the repository interfaces below. Today they are
 * backed by the browser `Storage` (see `createLocalProfileRepository` and
 * `createLocalStatsRepository`); a future `RemoteProfileRepository` /
 * `RemoteStatsRepository` talking to an HTTP API only needs to honour the same
 * method names and return shapes, and `src/main.js` will not change.
 *
 * Every method is asynchronous on purpose: the local implementation resolves
 * immediately, a remote one will actually wait for the network.
 *
 * ProfileRepository:
 *   getProfile():            Promise<object|null>
 *   saveProfile(profile):    Promise<boolean>
 *   clearProfile():          Promise<void>
 *
 * StatsRepository:
 *   getStats():              Promise<object[]>
 *   saveStats(stats):        Promise<boolean>
 *   clearStats():            Promise<void>
 *
 * MatchRepository (the match in progress, resumed after a reload):
 *   getMatch():              Promise<object|null>
 *   saveMatch(state):        Promise<boolean>
 *   clearMatch():            Promise<void>
 */

import { clearState, loadState, saveState } from './persistence.js';
import { clearProfile, loadProfile, saveProfile } from './profile.js';
import { clearStats, loadStats, saveStats } from './stats.js';

/**
 * @param {Storage|null} storage
 * @returns {object} A ProfileRepository backed by the given storage.
 */
export function createLocalProfileRepository(storage) {
  return {
    getProfile: async () => loadProfile(storage),
    saveProfile: async (profile) => saveProfile(storage, profile),
    clearProfile: async () => clearProfile(storage),
  };
}

/**
 * @param {Storage|null} storage
 * @returns {object} A StatsRepository backed by the given storage.
 */
export function createLocalStatsRepository(storage) {
  return {
    getStats: async () => loadStats(storage),
    saveStats: async (stats) => saveStats(storage, stats),
    clearStats: async () => clearStats(storage),
  };
}

/**
 * @param {Storage|null} storage
 * @returns {object} A MatchRepository backed by the given storage.
 */
export function createLocalMatchRepository(storage) {
  return {
    getMatch: async () => loadState(storage),
    saveMatch: async (state) => saveState(storage, state),
    clearMatch: async () => clearState(storage),
  };
}

/**
 * Placeholder for the online evolution. Wire an HTTP client here (for example
 * `fetch('/api/profile')`) and keep the interface above; nothing else changes.
 *
 * @param {{ baseUrl: string }} options
 * @returns {never}
 */
export function createRemoteRepositories() {
  throw new Error('Remote repositories are not implemented yet.');
}
